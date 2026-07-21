export class CreditBalance {
  constructor(
    public readonly userId: string,
    public balance: number,
    public updatedAt: Date
  ) {}

  public addCredits(amount: number): void {
    if (amount <= 0) throw new Error('Earned credits must be positive.');
    this.balance += amount;
    this.updatedAt = new Date();
  }

  public deductCredits(amount: number): void {
    if (amount <= 0) throw new Error('Deducted credits must be positive.');
    if (this.balance < amount) throw new Error('Insufficient credits.');
    this.balance -= amount;
    this.updatedAt = new Date();
  }
}
