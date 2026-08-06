import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { supabase } from "../services/supabase";

/**
 * src/store/usePaymentMethodsStore.ts
 *
 * The user's saved payment methods. COMPLIANCE-CRITICAL: this NEVER holds a raw
 * card number, CVV, or BVN. It stores only what's safe to display + a Paystack
 * token (authorization_code / mandate reference) that is what we actually charge
 * against. Raw details go straight to Paystack (via the server) at tokenization
 * time and are discarded — see src/services/paystack.ts.
 *
 * Mirrors the offline-first ledger pattern: persisted locally, best-effort synced
 * to the `payment_methods` table, RLS own-row.
 */
export type PaymentMethodType = "card" | "google_pay" | "apple_pay" | "paypal" | "bank";

export interface PaymentMethod {
  id: string;
  user_id: string;
  type: PaymentMethodType;
  brand?: string; // "visa" | "mastercard" | "verve" | "paypal" …
  last4?: string; // display only
  exp_month?: number;
  exp_year?: number;
  holder_name?: string;
  bank_name?: string;
  token: string; // Paystack authorization_code / mandate token — the only thing we charge
  is_default?: boolean;
  is_mandate?: boolean; // true = authorized for direct debit (a passenger can scan-and-pay)
  created_at: string;
}

interface PaymentMethodsStore {
  methods: PaymentMethod[];
  add: (m: Omit<PaymentMethod, "id" | "created_at">) => Promise<PaymentMethod>;
  remove: (id: string) => Promise<void>;
  setDefault: (id: string) => Promise<void>;
  getDefault: () => PaymentMethod | undefined;
  /** True if the user has at least one method usable for direct debit. */
  hasMandate: () => boolean;
  pull: (userId: string) => Promise<void>;
}

// Rows we mirror to Supabase — token + display metadata only, never raw PAN/CVV.
function toRow(m: PaymentMethod) {
  return {
    id: m.id,
    user_id: m.user_id,
    type: m.type,
    brand: m.brand,
    last4: m.last4,
    exp_month: m.exp_month,
    exp_year: m.exp_year,
    holder_name: m.holder_name,
    bank_name: m.bank_name,
    token: m.token,
    is_default: m.is_default ?? false,
    is_mandate: m.is_mandate ?? false,
    created_at: m.created_at,
  };
}

export const usePaymentMethodsStore = create<PaymentMethodsStore>()(
  persist(
    (set, get) => ({
      methods: [],

      add: async (input) => {
        const method: PaymentMethod = {
          ...input,
          id: `pm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          created_at: new Date().toISOString(),
        };
        set((s) => {
          // First method (or an explicit default) becomes the default.
          const makeDefault = method.is_default || s.methods.length === 0;
          const methods = (makeDefault ? s.methods.map((m) => ({ ...m, is_default: false })) : s.methods).concat({
            ...method,
            is_default: makeDefault,
          });
          return { methods };
        });
        try {
          await supabase.from("payment_methods").upsert([toRow(get().methods[get().methods.length - 1])], {
            onConflict: "id",
            ignoreDuplicates: false,
          });
        } catch (e) {
          console.warn("[PaymentMethods] sync add failed", e);
        }
        return method;
      },

      remove: async (id) => {
        set((s) => ({ methods: s.methods.filter((m) => m.id !== id) }));
        try {
          await supabase.from("payment_methods").delete().eq("id", id);
        } catch (e) {
          console.warn("[PaymentMethods] sync remove failed", e);
        }
      },

      setDefault: async (id) => {
        set((s) => ({ methods: s.methods.map((m) => ({ ...m, is_default: m.id === id })) }));
        const m = get().methods.find((x) => x.id === id);
        if (m) {
          try {
            await supabase.from("payment_methods").upsert(
              get().methods.map(toRow),
              { onConflict: "id" }
            );
          } catch (e) {
            console.warn("[PaymentMethods] sync default failed", e);
          }
        }
      },

      getDefault: () => {
        const ms = get().methods;
        return ms.find((m) => m.is_default) ?? ms[0];
      },

      hasMandate: () => get().methods.some((m) => m.is_mandate || m.type === "card" || m.type === "bank"),

      pull: async (userId) => {
        try {
          const { data, error } = await supabase
            .from("payment_methods")
            .select("*")
            .eq("user_id", userId)
            .order("created_at", { ascending: false });
          if (error || !data) return;
          set({ methods: data as PaymentMethod[] });
        } catch (e) {
          console.warn("[PaymentMethods] pull failed", e);
        }
      },
    }),
    {
      name: "teqil-payment-methods",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ methods: s.methods }),
    }
  )
);
