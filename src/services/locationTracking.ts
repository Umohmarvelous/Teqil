import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTripStore } from '../store/useStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { supabase } from './supabase';
import type { LiveLocation } from '../models/types';

// Haversine formula to calculate distance in km
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // Radius of the earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2); 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  const d = R * c; // Distance in km
  return d;
}

const FARE_PER_KM = 30; // ₦30 per km
const OFFLINE_POINTS_KEY = 'teqil_offline_locations';

let locationSubscription: Location.LocationSubscription | null = null;
let lastLocation: {latitude: number, longitude: number} | null = null;

export async function startLocationTracking(tripId: string) {
  // Respect the user's "Share location during trips" setting.
  if (!useSettingsStore.getState().shareLocation) {
    throw new Error(
      'Location sharing is turned off. Enable it in Settings to start a live trip.'
    );
  }

  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Permission to access location was denied');
  }

  useTripStore.getState().setIsTracking(true);

  locationSubscription = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 5000,
      distanceInterval: 10,
    },
    async (location) => {
      const { latitude, longitude, speed, heading } = location.coords;
      const newLoc = { latitude, longitude, speed: speed || 0, heading: heading || 0, timestamp: location.timestamp };
      
      const store = useTripStore.getState();
      store.setCurrentLocation(newLoc);
      store.setSpeed(speed || 0);
      store.addRouteCoordinate({ latitude, longitude });

      if (lastLocation) {
        const dist = calculateDistance(lastLocation.latitude, lastLocation.longitude, latitude, longitude);
        if (dist > 0) {
          const newDist = store.tripDistanceKm + dist;
          store.setTripDistanceKm(newDist);
          // Accumulate fare
          store.setFare(store.fare + (dist * FARE_PER_KM));
        }
      }
      
      lastLocation = { latitude, longitude };

      // Broadcast to Supabase Realtime
      try {
        const channel = supabase.channel(`trip_${tripId}`);
        await channel.send({
          type: 'broadcast',
          event: 'location_update',
          payload: { location: newLoc, distance: store.tripDistanceKm, fare: store.fare }
        });
      } catch (err) {
        // Store offline if broadcast fails
        await queueOfflinePoint(newLoc);
      }
    }
  );
}

export async function stopLocationTracking() {
  if (locationSubscription) {
    locationSubscription.remove();
    locationSubscription = null;
  }
  useTripStore.getState().setIsTracking(false);
  lastLocation = null;
}

async function queueOfflinePoint(point: LiveLocation) {
  try {
    const raw = await AsyncStorage.getItem(OFFLINE_POINTS_KEY);
    const points = raw ? JSON.parse(raw) : [];
    points.push(point);
    await AsyncStorage.setItem(OFFLINE_POINTS_KEY, JSON.stringify(points));
  } catch (e) {
    console.warn("Failed to queue offline point", e);
  }
}

export async function syncOfflinePoints() {
  // To be implemented: send all offline points to Supabase and clear storage
}
