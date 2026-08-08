import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { supabase } from "../services/supabase";
import { useFuelPoolStore } from "./useFuelPoolStore";
import { computeFuelReward } from "../utils/fuel";

/**
 * src/store/useFreeRidesStore.ts  (Phase B + C)
 *
 * Free-ride OFFERS (a driver "taking an offer": accept-only, earns free fuel) and
 * BARTER offers (a driver "open for an offer": bargainable free-will exchange).
 * Claims are made through the claim_free_ride RPC so an offer can never be
 * over-claimed past its passenger limit. Completing a 'reward' ride draws the
 * driver's free fuel from the shared pool (capped at the realized balance).
 */
export type FreeRideMode = "reward" | "barter";

export interface FreeRideOffer {
  id: string;
  driver_id: string;
  mode: FreeRideMode;
  duration_minutes: number;
  max_passengers: number;
  claimed_count: number;
  requirements?: string | null;
  barter_terms?: string | null;
  origin?: string | null;
  destination?: string | null;
  status: "open" | "full" | "closed";
  created_at: string;
  expires_at?: string | null;
}

export interface FreeRideClaim {
  id: string;
  offer_id: string;
  driver_id: string;
  passenger_id: string;
  status: "accepted" | "in_progress" | "completed" | "cancelled" | "violated";
  trip_id?: string | null;
  fuel_awarded?: number;
  accepted_at: string;
  completed_at?: string | null;
}

/** Why a completed ride paid what it paid — surfaced verbatim to the user. */
export type FreeRideCompletionReason =
  | "paid"
  | "not_gps_validated"
  | "pool_empty"
  | "barter_no_fuel"
  | "already_completed"
  | "route_mismatch"
  | "claim_not_found"
  | "forbidden"
  | "cancelled"
  | "violated"
  | "error";

export interface FreeRideCompletion {
  ok: boolean;
  reason: FreeRideCompletionReason;
  mode?: FreeRideMode;
  gpsValidated: boolean;
  fuelAwarded: number;
  /** True when the claim had already been completed by the other party. */
  already: boolean;
}

/** Plain-English explanation of a completion outcome, for receipts and alerts. */
export function describeCompletion(r: FreeRideCompletion): string {
  switch (r.reason) {
    case "paid":
      return "GPS verified — the driver's free fuel has been credited.";
    case "not_gps_validated":
      return "The ride was recorded but the GPS track was too short to verify, so no fuel was drawn.";
    case "pool_empty":
      return "The fuel pool can't cover this reward right now, so no fuel was drawn. The ride is still recorded.";
    case "barter_no_fuel":
      return "Barter rides are a free-will exchange — Emilgo funds no fuel for them.";
    case "already_completed":
      return "This ride was already completed.";
    case "route_mismatch":
      return "No GPS track was found for this ride, so it can't be verified.";
    case "forbidden":
      return "Only the driver or passenger on this ride can complete it.";
    case "cancelled":
      return "This ride was cancelled.";
    case "violated":
      return "This ride was flagged for violating its terms.";
    case "claim_not_found":
      return "This ride no longer exists.";
    default:
      return "Couldn't complete the ride. Check your connection and try again.";
  }
}

interface FreeRidesStore {
  openOffers: FreeRideOffer[];
  myClaims: FreeRideClaim[];

  createOffer: (
    driverId: string,
    input: Partial<FreeRideOffer> & { mode: FreeRideMode }
  ) => Promise<FreeRideOffer | null>;
  fetchOpenOffers: (opts?: { mode?: FreeRideMode }) => Promise<void>;
  closeOffer: (offerId: string) => Promise<void>;
  /** Passenger accepts an offer → returns the new claim id (null if full/closed/duplicate). */
  acceptOffer: (offerId: string, passengerId: string) => Promise<string | null>;
  /**
   * Complete a tracked ride. The server decides the payout from the recorded
   * GPS track — see the complete_free_ride RPC.
   */
  completeRide: (params: {
    claimId: string;
    /** route_history.id for the track recorded during this ride. */
    routeId: string;
    distanceKm?: number;
  }) => Promise<FreeRideCompletion>;
  fetchMyClaims: (userId: string) => Promise<void>;
}

export const useFreeRidesStore = create<FreeRidesStore>()(
  persist(
    (set, get) => ({
      openOffers: [],
      myClaims: [],

      createOffer: async (driverId, input) => {
        const row = {
          driver_id: driverId,
          mode: input.mode,
          duration_minutes: input.duration_minutes ?? 30,
          max_passengers: input.max_passengers ?? 1,
          requirements: input.requirements ?? null,
          barter_terms: input.barter_terms ?? null,
          origin: input.origin ?? null,
          destination: input.destination ?? null,
          status: "open",
        };
        try {
          const { data, error } = await supabase.from("free_ride_offers").insert([row]).select().single();
          if (error || !data) return null;
          set((s) => ({ openOffers: [data as FreeRideOffer, ...s.openOffers] }));
          return data as FreeRideOffer;
        } catch (e) {
          console.warn("[FreeRides] createOffer failed", e);
          return null;
        }
      },

      fetchOpenOffers: async (opts) => {
        try {
          let q = supabase
            .from("free_ride_offers")
            .select("*")
            .eq("status", "open")
            .order("created_at", { ascending: false });
          if (opts?.mode) q = q.eq("mode", opts.mode);
          const { data, error } = await q;
          if (!error && data) set({ openOffers: data as FreeRideOffer[] });
        } catch (e) {
          console.warn("[FreeRides] fetchOpenOffers failed", e);
        }
      },

      closeOffer: async (offerId) => {
        try {
          await supabase.from("free_ride_offers").update({ status: "closed" }).eq("id", offerId);
        } catch {
          /* best-effort */
        }
        set((s) => ({ openOffers: s.openOffers.filter((o) => o.id !== offerId) }));
      },

      acceptOffer: async (offerId, passengerId) => {
        try {
          const { data, error } = await supabase.rpc("claim_free_ride", {
            p_offer_id: offerId,
            p_passenger_id: passengerId,
          });
          if (error) return null;
          return (data as string) ?? null;
        } catch (e) {
          console.warn("[FreeRides] acceptOffer failed", e);
          return null;
        }
      },

      completeRide: async ({ claimId, routeId, distanceKm }) => {
        const failure = (reason: FreeRideCompletionReason): FreeRideCompletion => ({
          ok: false,
          reason,
          gpsValidated: false,
          fuelAwarded: 0,
          already: false,
        });

        // The server owns this decision: it re-checks that the GPS track belongs
        // to the claim and was validated by the DB trigger, then draws from the
        // pool under the same advisory lock as every other redemption. The
        // client can't shortcut any of it.
        try {
          const { data, error } = await supabase.rpc("complete_free_ride", {
            p_claim_id: claimId,
            p_route_id: routeId,
            p_amount: computeFuelReward({ distanceKm }),
          });

          if (error || !data) {
            console.warn("[FreeRides] complete_free_ride failed", error);
            return failure("error");
          }

          const row = data as {
            ok: boolean;
            reason: FreeRideCompletionReason;
            mode?: FreeRideMode;
            gps_validated?: boolean;
            fuel_awarded?: number;
            already?: boolean;
          };

          const result: FreeRideCompletion = {
            ok: !!row.ok,
            reason: row.reason ?? "error",
            mode: row.mode,
            gpsValidated: !!row.gps_validated,
            fuelAwarded: Number(row.fuel_awarded ?? 0),
            already: !!row.already,
          };

          if (result.ok) {
            // Reflect the debit locally; refresh() re-syncs the true balance.
            if (result.fuelAwarded > 0) {
              await useFuelPoolStore.getState().refresh();
            }
            set((s) => ({
              myClaims: s.myClaims.map((c) =>
                c.id === claimId
                  ? {
                      ...c,
                      status: "completed",
                      trip_id: routeId,
                      fuel_awarded: result.fuelAwarded,
                      completed_at: new Date().toISOString(),
                    }
                  : c
              ),
            }));
          }

          return result;
        } catch (e) {
          console.warn("[FreeRides] completeRide failed", e);
          return failure("error");
        }
      },

      fetchMyClaims: async (userId) => {
        try {
          const { data, error } = await supabase
            .from("free_ride_claims")
            .select("*")
            .or(`passenger_id.eq.${userId},driver_id.eq.${userId}`)
            .order("accepted_at", { ascending: false });
          if (!error && data) set({ myClaims: data as FreeRideClaim[] });
        } catch (e) {
          console.warn("[FreeRides] fetchMyClaims failed", e);
        }
      },
    }),
    {
      name: "teqil-free-rides",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ myClaims: s.myClaims }),
    }
  )
);
