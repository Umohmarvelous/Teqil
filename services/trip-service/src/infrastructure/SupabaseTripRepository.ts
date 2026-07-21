import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ITripRepository } from '../application/ITripRepository';
import { Trip, Location } from '../domain/Trip';

export class SupabaseTripRepository implements ITripRepository {
  private supabase: SupabaseClient;

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  private mapToDomain(row: any): Trip {
    return new Trip(
      row.id,
      row.driver_id,
      row.passenger_id,
      new Location(row.start_lat, row.start_lng, row.start_address),
      new Location(row.end_lat, row.end_lng, row.end_address),
      row.status,
      row.fare,
      new Date(row.created_at),
      new Date(row.updated_at)
    );
  }

  async createTrip(trip: Trip): Promise<Trip> {
    const { error } = await this.supabase
      .from('trips')
      .insert({
        id: trip.id,
        driver_id: trip.driverId,
        passenger_id: trip.passengerId,
        start_lat: trip.startLocation.latitude,
        start_lng: trip.startLocation.longitude,
        start_address: trip.startLocation.address,
        end_lat: trip.endLocation.latitude,
        end_lng: trip.endLocation.longitude,
        end_address: trip.endLocation.address,
        status: trip.status,
        fare: trip.fare,
        created_at: trip.createdAt.toISOString(),
        updated_at: trip.updatedAt.toISOString()
      });

    if (error) throw new Error(error.message);
    return trip;
  }

  async getTripById(id: string): Promise<Trip | null> {
    const { data, error } = await this.supabase
      .from('trips')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(error.message);
    }

    return this.mapToDomain(data);
  }

  async updateTrip(trip: Trip): Promise<Trip> {
    const { error } = await this.supabase
      .from('trips')
      .update({
        passenger_id: trip.passengerId,
        status: trip.status,
        updated_at: trip.updatedAt.toISOString()
      })
      .eq('id', trip.id);

    if (error) throw new Error(error.message);
    return trip;
  }

  async getActiveTripsNearLocation(location: Location, radiusKm: number): Promise<Trip[]> {
    // In a real app, this would use PostGIS via an RPC call.
    // Stubbed out here with a basic filter for demo purposes.
    const { data, error } = await this.supabase
      .from('trips')
      .select('*')
      .eq('status', 'pending')
      .limit(20);

    if (error) throw new Error(error.message);
    return data.map(this.mapToDomain);
  }
}
