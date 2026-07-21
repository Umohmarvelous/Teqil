export class Location {
  constructor(
    public readonly latitude: number,
    public readonly longitude: number,
    public readonly address?: string
  ) {}
}

export class Trip {
  constructor(
    public readonly id: string,
    public readonly driverId: string,
    public passengerId: string | null,
    public readonly startLocation: Location,
    public readonly endLocation: Location,
    public status: 'pending' | 'accepted' | 'in_progress' | 'completed' | 'cancelled',
    public fare: number,
    public readonly createdAt: Date,
    public updatedAt: Date
  ) {}

  public static create(
    id: string,
    driverId: string,
    startLocation: Location,
    endLocation: Location,
    fare: number
  ): Trip {
    return new Trip(id, driverId, null, startLocation, endLocation, 'pending', fare, new Date(), new Date());
  }

  public join(passengerId: string) {
    if (this.status !== 'pending') throw new Error('Trip is no longer available');
    this.passengerId = passengerId;
    this.status = 'accepted';
    this.updatedAt = new Date();
  }

  public start() {
    if (this.status !== 'accepted') throw new Error('Trip cannot be started');
    this.status = 'in_progress';
    this.updatedAt = new Date();
  }

  public complete() {
    if (this.status !== 'in_progress') throw new Error('Trip is not in progress');
    this.status = 'completed';
    this.updatedAt = new Date();
  }
}
