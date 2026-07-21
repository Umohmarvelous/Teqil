import { ITripRepository } from './ITripRepository';
import { Trip, Location } from '../domain/Trip';

export class TripUseCases {
  constructor(private tripRepo: ITripRepository) {}

  async createTrip(driverId: string, start: Location, end: Location, baseFare: number): Promise<Trip> {
    // Basic fare calculation logic based on distance could be placed here
    // For now, we trust the provided baseFare or compute a simple multiplier
    const id = crypto.randomUUID();
    const trip = Trip.create(id, driverId, start, end, baseFare);
    
    return this.tripRepo.createTrip(trip);
  }

  async joinTrip(tripId: string, passengerId: string): Promise<Trip> {
    const trip = await this.tripRepo.getTripById(tripId);
    if (!trip) throw new Error('Trip not found');

    trip.join(passengerId);
    return this.tripRepo.updateTrip(trip);
  }

  async startTrip(tripId: string, driverId: string): Promise<Trip> {
    const trip = await this.tripRepo.getTripById(tripId);
    if (!trip) throw new Error('Trip not found');
    if (trip.driverId !== driverId) throw new Error('Unauthorized');

    trip.start();
    return this.tripRepo.updateTrip(trip);
  }

  async completeTrip(tripId: string, driverId: string): Promise<Trip> {
    const trip = await this.tripRepo.getTripById(tripId);
    if (!trip) throw new Error('Trip not found');
    if (trip.driverId !== driverId) throw new Error('Unauthorized');

    trip.complete();
    const updatedTrip = await this.tripRepo.updateTrip(trip);
    
    // In a real microservices event-driven system, we'd publish an event here:
    // EventPublisher.publish('TripCompleted', updatedTrip);
    // So that payment-service can process the fare.

    return updatedTrip;
  }
}
