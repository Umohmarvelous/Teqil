import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { KycStatus, ProgramStatus, ProgramApplication, User } from "../models/types";
import { supabase } from "../services/supabase";
import { KycService, hashIdentity } from "../services/kyc";
import { resolveBankAccount } from "../services/paystack";
import { useAuthStore } from "./useStore";

/**
 * src/store/useProgramStore.ts
 *
 * Drives the loyalty-program application on the Program Page. The flow, in order:
 *   1. Verify the phone OTP.
 *   2. Verify identity (NIN/BVN) via KYC → get the legal name.
 *   3. Resolve the payout bank account → get its name.
 *   4. Payout safety: the bank account name MUST match the KYC name.
 *   5. Anti-fraud: device cap (one rewards-eligible account per device).
 *   6. Persist: write the application row + stamp the user's row (kyc/program
 *      status, payout details, id hash). The id-hash UNIQUE index is what actually
 *      enforces "one identity per account" — a duplicate makes the update fail.
 *
 * Only a HASH of the NIN/BVN is ever stored; the raw number is discarded.
 */

// Max rewards-eligible accounts allowed to share one device fingerprint.
export const MAX_ELIGIBLE_PER_DEVICE = 1;

export interface ProgramForm {
  idType: "nin" | "bvn";
  idNumber: string;
  phone: string;
  otp: string;
  bankCode: string;
  accountNumber: string;
}

export type SubmitResult =
  | { ok: true }
  | { ok: false; error: string; message: string };

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

interface ProgramStore {
  status: KycStatus;
  programStatus: ProgramStatus;
  application: ProgramApplication | null;
  submitting: boolean;

  /** Load status from the (already-synced) user profile. */
  hydrateFromUser: (user: User | null) => void;
  /** Send the phone OTP (mock: code is DEV_OTP_CODE). */
  sendOtp: (phone: string) => Promise<void>;
  submitApplication: (user: User, form: ProgramForm) => Promise<SubmitResult>;
  sync: () => Promise<void>;
}

export const useProgramStore = create<ProgramStore>()(
  persist(
    (set, get) => ({
      status: "unverified",
      programStatus: "none",
      application: null,
      submitting: false,

      hydrateFromUser: (user) => {
        if (!user) return;
        set({
          status: user.kyc_status ?? "unverified",
          programStatus: user.program_status ?? "none",
        });
      },

      sendOtp: async (phone) => {
        await KycService.sendOtp(phone);
      },

      submitApplication: async (user, form) => {
        set({ submitting: true });
        try {
          // 1. OTP
          const otpOk = await KycService.verifyOtp(form.phone, form.otp);
          if (!otpOk) {
            return { ok: false, error: "otp", message: "The code you entered is incorrect." };
          }

          // 2. Identity
          const kyc = await KycService.verifyIdentity({
            idType: form.idType,
            idNumber: form.idNumber,
          });
          if (!kyc.verified) {
            return {
              ok: false,
              error: "identity",
              message: "We couldn't verify that ID. Check the number and try again.",
            };
          }

          // 3. Bank account
          const bank = await resolveBankAccount(form.bankCode, form.accountNumber);
          if (!bank.resolved) {
            return {
              ok: false,
              error: "bank",
              message: "That bank account couldn't be resolved. Check the details.",
            };
          }

          // 4. Payout safety — names must match
          if (normalizeName(bank.account_name) !== normalizeName(kyc.id_name)) {
            return {
              ok: false,
              error: "name_mismatch",
              message:
                "Your bank account name must match your verified ID name for payouts.",
            };
          }

          // 5. Anti-fraud — device cap (server-side count; RLS-safe RPC)
          if (user.device_fingerprint) {
            const { data: count, error: rpcErr } = await supabase.rpc(
              "eligible_accounts_on_device",
              { fp: user.device_fingerprint }
            );
            if (!rpcErr && typeof count === "number" && count >= MAX_ELIGIBLE_PER_DEVICE) {
              return {
                ok: false,
                error: "device_cap",
                message: "This device already has a rewards-eligible account.",
              };
            }
          }

          // 6. Persist — stamp the user row. The nin_hash/bvn_hash UNIQUE index
          //    rejects a duplicate identity here (Postgres error 23505).
          const idHash = hashIdentity(form.idNumber);
          const nowIso = new Date().toISOString();
          const hashField = form.idType === "nin" ? "nin_hash" : "bvn_hash";

          const { error: updErr } = await supabase
            .from("users")
            .update({
              [hashField]: idHash,
              kyc_status: "verified" as KycStatus,
              kyc_verified_at: nowIso,
              program_status: "eligible" as ProgramStatus,
              payout_bank_code: form.bankCode,
              payout_account_number: form.accountNumber,
              payout_account_name: bank.account_name,
            })
            .eq("id", user.id);

          if (updErr) {
            const dup = (updErr as any).code === "23505";
            return {
              ok: false,
              error: dup ? "identity_taken" : "server",
              message: dup
                ? "This identity is already linked to another account."
                : "Something went wrong saving your application. Try again.",
            };
          }

          const application: ProgramApplication = {
            id: Math.random().toString(36).substring(7),
            user_id: user.id,
            id_type: form.idType,
            id_hash: idHash,
            phone: form.phone,
            otp_verified: true,
            bank_code: form.bankCode,
            account_number: form.accountNumber,
            account_name: bank.account_name,
            kyc_reference: kyc.reference,
            status: "verified",
            device_fingerprint: user.device_fingerprint,
            dedupe_key: `${user.id}:program`,
            synced: false,
            updated_at: nowIso,
            created_at: nowIso,
          };

          set({ application, status: "verified", programStatus: "eligible" });

          // Reflect into the cached auth profile so the UI updates immediately.
          useAuthStore.getState().updateUser?.({
            kyc_status: "verified",
            program_status: "eligible",
            kyc_verified_at: nowIso,
            payout_bank_code: form.bankCode,
            payout_account_number: form.accountNumber,
            payout_account_name: bank.account_name,
            [hashField]: idHash,
          } as Partial<User>);

          await get().sync();
          return { ok: true };
        } catch (err) {
          console.warn("[Program] submit failed", err);
          return { ok: false, error: "unknown", message: "Unexpected error. Try again." };
        } finally {
          set({ submitting: false });
        }
      },

      // Upsert the application row (idempotent by dedupe_key), mirroring the other ledgers.
      sync: async () => {
        const app = get().application;
        if (!app || app.synced) return;
        try {
          const { error } = await supabase.from("program_applications").upsert(
            [
              {
                user_id: app.user_id,
                id_type: app.id_type,
                id_hash: app.id_hash,
                phone: app.phone,
                otp_verified: app.otp_verified,
                bank_code: app.bank_code,
                account_number: app.account_number,
                account_name: app.account_name,
                kyc_reference: app.kyc_reference,
                status: app.status,
                device_fingerprint: app.device_fingerprint,
                dedupe_key: app.dedupe_key,
                updated_at: app.updated_at,
                created_at: app.created_at,
              },
            ],
            { onConflict: "dedupe_key", ignoreDuplicates: true }
          );
          if (!error) set({ application: { ...app, synced: true } });
        } catch (err) {
          console.warn("[Program] sync failed, will retry later", err);
        }
      },
    }),
    {
      name: "teqil-program",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        status: state.status,
        programStatus: state.programStatus,
        application: state.application,
      }),
    }
  )
);
