import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Trip, Passenger, Rating, Broadcast } from "../models/types";

const KEYS = {
  TRIPS: "teqil_trips",
  PASSENGERS: "teqil_passengers",
  RATINGS: "teqil_ratings",
  BROADCASTS: "teqil_broadcasts",
  ACTIVE_TRIP_CODE: "teqil_active_trip_code",
};

// ─── Generic helpers ──────────────────────────────────────────────────────────

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

function now(): string {
  return new Date().toISOString();
}

// ─── TripsStorage ─────────────────────────────────────────────────────────────

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
    const stamped: Trip = { ...trip, updated_at: now(), synced: false };
    const idx = trips.findIndex((t) => t.id === trip.id);
    if (idx >= 0) {
      trips[idx] = stamped;
    } else {
      trips.push(stamped);
    }
    await setAll(KEYS.TRIPS, trips);
  },

  async update(id: string, updates: Partial<Trip>): Promise<void> {
    const trips = await getAll<Trip>(KEYS.TRIPS);
    const idx = trips.findIndex((t) => t.id === id);
    if (idx >= 0) {
      trips[idx] = {
        ...trips[idx],
        ...updates,
        updated_at: now(),
        synced: false,
      };
      await setAll(KEYS.TRIPS, trips);
    }
  },

  async markAsSynced(id: string): Promise<void> {
    const trips = await getAll<Trip>(KEYS.TRIPS);
    const idx = trips.findIndex((t) => t.id === id);
    if (idx >= 0) {
      trips[idx] = { ...trips[idx], synced: true };
      await setAll(KEYS.TRIPS, trips);
    }
  },

  async mergeRemote(remote: Trip): Promise<void> {
    const trips = await getAll<Trip>(KEYS.TRIPS);
    const idx = trips.findIndex((t) => t.id === remote.id);
    const incoming: Trip = {
      ...remote,
      synced: true,
      updated_at: remote.updated_at ?? now(),
    };
    if (idx >= 0) {
      const localTs = new Date(trips[idx].updated_at ?? 0).getTime();
      const remoteTs = new Date(incoming.updated_at).getTime();
      if (remoteTs >= localTs) trips[idx] = incoming;
    } else {
      trips.push(incoming);
    }
    await setAll(KEYS.TRIPS, trips);
  },

  async getUnsynced(): Promise<Trip[]> {
    const trips = await getAll<Trip>(KEYS.TRIPS);
    return trips.filter((t) => !t.synced);
  },
};

// ─── PassengersStorage ────────────────────────────────────────────────────────

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
    const stamped: Passenger = {
      ...passenger,
      updated_at: now(),
      synced: false,
    };
    const idx = all.findIndex((p) => p.id === passenger.id);
    if (idx >= 0) {
      all[idx] = stamped;
    } else {
      all.push(stamped);
    }
    await setAll(KEYS.PASSENGERS, all);
  },

  async update(id: string, updates: Partial<Passenger>): Promise<void> {
    const all = await getAll<Passenger>(KEYS.PASSENGERS);
    const idx = all.findIndex((p) => p.id === id);
    if (idx >= 0) {
      all[idx] = {
        ...all[idx],
        ...updates,
        updated_at: now(),
        synced: false,
      };
      await setAll(KEYS.PASSENGERS, all);
    }
  },

  async markAsSynced(id: string): Promise<void> {
    const all = await getAll<Passenger>(KEYS.PASSENGERS);
    const idx = all.findIndex((p) => p.id === id);
    if (idx >= 0) {
      all[idx] = { ...all[idx], synced: true };
      await setAll(KEYS.PASSENGERS, all);
    }
  },

  async mergeRemote(remote: Passenger): Promise<void> {
    const all = await getAll<Passenger>(KEYS.PASSENGERS);
    const idx = all.findIndex((p) => p.id === remote.id);
    const incoming: Passenger = {
      ...remote,
      synced: true,
      updated_at: remote.updated_at ?? now(),
    };
    if (idx >= 0) {
      const localTs = new Date(all[idx].updated_at ?? 0).getTime();
      const remoteTs = new Date(incoming.updated_at).getTime();
      if (remoteTs >= localTs) all[idx] = incoming;
    } else {
      all.push(incoming);
    }
    await setAll(KEYS.PASSENGERS, all);
  },

  async getUnsynced(): Promise<Passenger[]> {
    const all = await getAll<Passenger>(KEYS.PASSENGERS);
    return all.filter((p) => !p.synced);
  },
};

// ─── RatingsStorage ───────────────────────────────────────────────────────────

export const RatingsStorage = {
  async getByTripId(tripId: string): Promise<Rating[]> {
    return (await getAll<Rating>(KEYS.RATINGS)).filter(
      (r) => r.trip_id === tripId
    );
  },

  /** Returns all ratings where this user was the one being rated.
   *  Used to recalculate avg_rating after a new rating is saved. */
  async getByRatedUser(ratedUserId: string): Promise<Rating[]> {
    return (await getAll<Rating>(KEYS.RATINGS)).filter(
      (r) => r.rated_id === ratedUserId
    );
  },

  async save(rating: Rating): Promise<void> {
    const all = await getAll<Rating>(KEYS.RATINGS);
    const exists = all.some((r) => r.id === rating.id);
    if (!exists) {
      all.push({ ...rating, updated_at: now(), synced: false });
      await setAll(KEYS.RATINGS, all);
    }
  },

  async markAsSynced(id: string): Promise<void> {
    const all = await getAll<Rating>(KEYS.RATINGS);
    const idx = all.findIndex((r) => r.id === id);
    if (idx >= 0) {
      all[idx] = { ...all[idx], synced: true };
      await setAll(KEYS.RATINGS, all);
    }
  },

  async mergeRemote(remote: Rating): Promise<void> {
    const all = await getAll<Rating>(KEYS.RATINGS);
    const exists = all.some((r) => r.id === remote.id);
    if (!exists) {
      all.push({
        ...remote,
        synced: true,
        updated_at: remote.updated_at ?? now(),
      });
      await setAll(KEYS.RATINGS, all);
    }
  },

  async getUnsynced(): Promise<Rating[]> {
    const all = await getAll<Rating>(KEYS.RATINGS);
    return all.filter((r) => !r.synced);
  },
};

// ─── BroadcastsStorage ────────────────────────────────────────────────────────

export const BroadcastsStorage = {
  async getAll(): Promise<Broadcast[]> {
    return getAll<Broadcast>(KEYS.BROADCASTS);
  },

  async save(broadcast: Broadcast): Promise<void> {
    const all = await getAll<Broadcast>(KEYS.BROADCASTS);
    const exists = all.some((b) => b.id === broadcast.id);
    if (!exists) {
      all.unshift({ ...broadcast, updated_at: now(), synced: false });
      if (all.length > 50) all.length = 50;
      await setAll(KEYS.BROADCASTS, all);
    }
  },

  async markAsSynced(id: string): Promise<void> {
    const all = await getAll<Broadcast>(KEYS.BROADCASTS);
    const idx = all.findIndex((b) => b.id === id);
    if (idx >= 0) {
      all[idx] = { ...all[idx], synced: true };
      await setAll(KEYS.BROADCASTS, all);
    }
  },

  async mergeRemote(broadcast: Broadcast): Promise<void> {
    const all = await getAll<Broadcast>(KEYS.BROADCASTS);
    const exists = all.some((b) => b.id === broadcast.id);
    if (!exists) {
      all.unshift({
        ...broadcast,
        synced: true,
        updated_at: broadcast.updated_at ?? now(),
      });
      if (all.length > 50) all.length = 50;
      await setAll(KEYS.BROADCASTS, all);
    }
  },

  async getUnsynced(): Promise<Broadcast[]> {
    const all = await getAll<Broadcast>(KEYS.BROADCASTS);
    return all.filter((b) => !b.synced);
  },
};

// ─── ActiveTripStorage ────────────────────────────────────────────────────────

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