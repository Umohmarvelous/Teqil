export class Profile {
  constructor(
    public readonly id: string,
    public readonly userId: string,
    public fullName: string | null,
    public avatarUrl: string | null,
    public role: 'driver' | 'passenger' | 'admin',
    public readonly createdAt: Date,
    public updatedAt: Date
  ) {}

  public static create(
    id: string,
    userId: string,
    fullName: string | null,
    avatarUrl: string | null,
    role: 'driver' | 'passenger' | 'admin' = 'passenger'
  ): Profile {
    return new Profile(id, userId, fullName, avatarUrl, role, new Date(), new Date());
  }
}
