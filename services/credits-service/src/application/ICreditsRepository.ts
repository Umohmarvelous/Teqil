import { CreditBalance } from '../domain/CreditBalance';
import { CreditHistory } from '../domain/CreditHistory';

export interface ICreditsRepository {
  getBalance(userId: string): Promise<CreditBalance>;
  updateBalance(balance: CreditBalance): Promise<void>;
  
  hasActionBeenRewarded(userId: string, targetId: string, actionType: string): Promise<boolean>;
  logHistory(history: CreditHistory): Promise<void>;
}
