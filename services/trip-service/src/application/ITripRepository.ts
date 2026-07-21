import { Trip, Location } from '../domain/Trip';

export interface ITripRepository {
  createTrip(trip: Trip): Promise<Trip>;
  getTripById(id: string): Promise<Trip | null>;
  updateTrip(trip: Trip): Promise<Trip>;
  getActiveTripsNearLocation(location: Location, radiusKm: number): Promise<Trip[]>;
}
