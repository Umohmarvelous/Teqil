export class CreditHistory {
  constructor(
    public readonly id: string,
    public readonly userId: string,
    public readonly actionType: 'like' | 'comment' | 'share' | 'ad_view' | 'fare_deduction',
    public readonly amount: number,
    public readonly targetId: string | null, // e.g. post_id or ad_id
    public readonly createdAt: Date
  ) {}

  public static create(
    id: string,
    userId: string,
    actionType: 'like' | 'comment' | 'share' | 'ad_view' | 'fare_deduction',
    amount: number,
    targetId: string | null = null
  ): CreditHistory {
    return new CreditHistory(id, userId, actionType, amount, targetId, new Date());
  }
}
