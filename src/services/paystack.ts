/**
 * src/services/paystack.ts
 * 
 * Mock Paystack service for handling Split Payments via Subaccounts.
 */

export interface SplitPaymentParams {
  email: string;
  amount: number;
  pool_duplicate_amount: number;
  bonus_amount: number;
  company_cut: number;
}

export const PaystackService = {
  /**
   * Simulates processing a split payment.
   * In a real implementation, this would:
   * 1. Create a transaction using Paystack's Transaction Split API.
   * 2. Direct passenger payment to the Driver subaccount.
   * 3. Process an internal transfer from the Pool account to Driver (Duplicate + Bonus) and Company.
   */
  processTripPayment: async (params: SplitPaymentParams): Promise<boolean> => {
    return new Promise((resolve) => {
      console.log("[Paystack Mock] Processing split payment...", params);
      
      // Simulate network request
      setTimeout(() => {
        console.log("[Paystack Mock] Split payment successful.");
        console.log(`- Passenger pays: ₦${params.amount}`);
        console.log(`- Pool Account deduction: ₦${params.pool_duplicate_amount + params.bonus_amount + params.company_cut}`);
        console.log(`  └-> To Driver: ₦${params.pool_duplicate_amount + params.bonus_amount}`);
        console.log(`  └-> To Company: ₦${params.company_cut}`);
        resolve(true);
      }, 1500);
    });
  }
};
