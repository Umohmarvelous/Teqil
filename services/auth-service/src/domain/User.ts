export class User {
  constructor(
    public readonly id: string,
    public readonly email: string,
    public readonly createdAt: Date
  ) {}

  public static create(id: string, email: string): User {
    return new User(id, email, new Date());
  }
}
