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
  /** Completing a tracked ride → awards free fuel (reward mode). Returns ₦ awarded. */
  completeRide: (claim: {
    id: string;
    driver_id: string;
    mode: FreeRideMode;
    trip_id: string;
  }) => Promise<number>;
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

      completeRide: async (claim) => {
        let fuel = 0;
        // Reward mode: draw the driver's free fuel from the shared pool (capped).
        if (claim.mode === "reward") {
          const target = computeFuelReward();
          fuel = await useFuelPoolStore.getState().redeemFuel(claim.driver_id, target, claim.trip_id);
        }
        try {
          await supabase
            .from("free_ride_claims")
            .update({
              status: "completed",
              trip_id: claim.trip_id,
              fuel_awarded: fuel,
              completed_at: new Date().toISOString(),
            })
            .eq("id", claim.id);
        } catch (e) {
          console.warn("[FreeRides] completeRide update failed", e);
        }
        return fuel;
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
