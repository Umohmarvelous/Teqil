import { ICreditsRepository } from './ICreditsRepository';
import { CreditBalance } from '../domain/CreditBalance';
import { CreditHistory } from '../domain/CreditHistory';

const CREDIT_REWARDS = {
  like: 5,
  comment: 10,
  share: 15,
  ad_view: 20
};

export class CreditsUseCases {
  constructor(private creditsRepo: ICreditsRepository) {}

  async getBalance(userId: string): Promise<number> {
    const balance = await this.creditsRepo.getBalance(userId);
    return balance.balance;
  }

  async earnCredits(userId: string, actionType: 'like' | 'comment' | 'share' | 'ad_view', targetId: string): Promise<void> {
    const amount = CREDIT_REWARDS[actionType];
    if (!amount) throw new Error('Invalid action type.');

    // Enforce "once per post" or "once per action target" rule
    const alreadyRewarded = await this.creditsRepo.hasActionBeenRewarded(userId, targetId, actionType);
    if (alreadyRewarded) {
      throw new Error('Credits already awarded for this action on this target.');
    }

    const balance = await this.creditsRepo.getBalance(userId);
    balance.addCredits(amount);

    const history = CreditHistory.create(
      crypto.randomUUID(),
      userId,
      actionType,
      amount,
      targetId
    );

    // Ideally wrapped in a transaction, but we execute sequentially here
    await this.creditsRepo.logHistory(history);
    await this.creditsRepo.updateBalance(balance);
  }

  async spendCredits(userId: string, amount: number, transactionId: string): Promise<void> {
    const balance = await this.creditsRepo.getBalance(userId);
    balance.deductCredits(amount);

    const history = CreditHistory.create(
      crypto.randomUUID(),
      userId,
      'fare_deduction',
      -amount,
      transactionId
    );

    await this.creditsRepo.logHistory(history);
    await this.creditsRepo.updateBalance(balance);
  }
}
