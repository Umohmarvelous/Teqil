import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Trip, Passenger, Rating, Broadcast } from "../models/types";

const KEYS = {
  TRIPS: "teqil_trips",
  PASSENGERS: "teqil_passengers",
  RATINGS: "teqil_ratings",
  BROADCASTS: "teqil_broadcasts",
  ACTIVE_TRIP_CODE: "teqil_active_trip_code",
};

async function getAll<T>(key: string): Promise<T[]> {
  try {
    const json = await AsyncStorage.getItem(key);
    return json ? JSON.parse(json) : [];
  } catch {
    return [];
  }
}

async function setAll<T>(key: string, items: T[]): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(items));
}

export const TripsStorage = {
  async getAll(): Promise<Trip[]> {
    return getAll<Trip>(KEYS.TRIPS);
  },
  async getByDriverId(driverId: string): Promise<Trip[]> {
    const trips = await getAll<Trip>(KEYS.TRIPS);
    return trips.filter((t) => t.driver_id === driverId);
  },
  async getByCode(code: string): Promise<Trip | null> {
    const trips = await getAll<Trip>(KEYS.TRIPS);
    return trips.find((t) => t.trip_code === code) || null;
  },
  async save(trip: Trip): Promise<void> {
    const trips = await getAll<Trip>(KEYS.TRIPS);
    const idx = trips.findIndex((t) => t.id === trip.id);
    if (idx >= 0) {
      trips[idx] = trip;
    } else {
      trips.push(trip);
    }
    await setAll(KEYS.TRIPS, trips);
  },
  async update(id: string, updates: Partial<Trip>): Promise<void> {
    const trips = await getAll<Trip>(KEYS.TRIPS);
    const idx = trips.findIndex((t) => t.id === id);
    if (idx >= 0) {
      trips[idx] = { ...trips[idx], ...updates };
      await setAll(KEYS.TRIPS, trips);
    }
  },
};

export const PassengersStorage = {
  async getByTripId(tripId: string): Promise<Passenger[]> {
    const all = await getAll<Passenger>(KEYS.PASSENGERS);
    return all.filter((p) => p.trip_id === tripId);
  },
  async getByUserId(userId: string): Promise<Passenger[]> {
    const all = await getAll<Passenger>(KEYS.PASSENGERS);
    return all.filter((p) => p.user_id === userId);
  },
  async save(passenger: Passenger): Promise<void> {
    const all = await getAll<Passenger>(KEYS.PASSENGERS);
    const idx = all.findIndex((p) => p.id === passenger.id);
    if (idx >= 0) {
      all[idx] = passenger;
    } else {
      all.push(passenger);
    }
    await setAll(KEYS.PASSENGERS, all);
  },
  async update(id: string, updates: Partial<Passenger>): Promise<void> {
    const all = await getAll<Passenger>(KEYS.PASSENGERS);
    const idx = all.findIndex((p) => p.id === id);
    if (idx >= 0) {
      all[idx] = { ...all[idx], ...updates };
      await setAll(KEYS.PASSENGERS, all);
    }
  },
};

export const RatingsStorage = {
  async getByTripId(tripId: string): Promise<Rating[]> {
    return (await getAll<Rating>(KEYS.RATINGS)).filter(
      (r) => r.trip_id === tripId
    );
  },
  async save(rating: Rating): Promise<void> {
    const all = await getAll<Rating>(KEYS.RATINGS);
    all.push(rating);
    await setAll(KEYS.RATINGS, all);
  },
};

export const BroadcastsStorage = {
  async getAll(): Promise<Broadcast[]> {
    return getAll<Broadcast>(KEYS.BROADCASTS);
  },
  async save(broadcast: Broadcast): Promise<void> {
    const all = await getAll<Broadcast>(KEYS.BROADCASTS);
    all.unshift(broadcast);
    if (all.length > 50) all.length = 50;
    await setAll(KEYS.BROADCASTS, all);
  },
};

export const ActiveTripStorage = {
  async setCode(code: string): Promise<void> {
    await AsyncStorage.setItem(KEYS.ACTIVE_TRIP_CODE, code);
  },
  async getCode(): Promise<string | null> {
    return AsyncStorage.getItem(KEYS.ACTIVE_TRIP_CODE);
  },
  async clear(): Promise<void> {
    await AsyncStorage.removeItem(KEYS.ACTIVE_TRIP_CODE);
  },
};
