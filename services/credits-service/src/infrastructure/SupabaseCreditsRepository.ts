import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ICreditsRepository } from '../application/ICreditsRepository';
import { CreditBalance } from '../domain/CreditBalance';
import { CreditHistory } from '../domain/CreditHistory';

export class SupabaseCreditsRepository implements ICreditsRepository {
  private supabase: SupabaseClient;

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  async getBalance(userId: string): Promise<CreditBalance> {
    const { data, error } = await this.supabase
      .from('credit_balances')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // Create initial balance
        return new CreditBalance(userId, 0, new Date());
      }
      throw new Error(error.message);
    }

    return new CreditBalance(data.user_id, data.balance, new Date(data.updated_at));
  }

  async updateBalance(balance: CreditBalance): Promise<void> {
    const { error } = await this.supabase
      .from('credit_balances')
      .upsert({
        user_id: balance.userId,
        balance: balance.balance,
        updated_at: balance.updatedAt.toISOString()
      }, { onConflict: 'user_id' });

    if (error) throw new Error(error.message);
  }

  async hasActionBeenRewarded(userId: string, targetId: string, actionType: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('credit_history')
      .select('id')
      .eq('user_id', userId)
      .eq('target_id', targetId)
      .eq('action_type', actionType)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new Error(error.message);
    }
    
    return !!data;
  }

  async logHistory(history: CreditHistory): Promise<void> {
    const { error } = await this.supabase
      .from('credit_history')
      .insert({
        id: history.id,
        user_id: history.userId,
        action_type: history.actionType,
        amount: history.amount,
        target_id: history.targetId,
        created_at: history.createdAt.toISOString()
      });

    if (error) throw new Error(error.message);
  }
}
