import React, { useEffect } from 'react';
import { supabase } from '@/src/services/supabase';
import { useAuthStore, useTripStore } from '@/src/store/useStore';
import * as Haptics from 'expo-haptics';

export default function TripListener() {
  const { user } = useAuthStore();
  const { setActiveTrip, setActiveTripPassengers, setTripDistanceKm, setFare, setCurrentLocation } = useTripStore();

  useEffect(() => {
    if (!user || user.role !== 'driver') return;

    // Listen to driver-specific channel for new trip requests
    const driverChannelId = `driver_${user.driver_id || user.id}`;
    const driverChannel = supabase.channel(driverChannelId);

    driverChannel
      .on('broadcast', { event: 'trip_started' }, (payload: any) => {
        const { trip, passenger } = payload.payload;
        setActiveTrip(trip);
        setActiveTripPassengers([passenger]);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        
        // After receiving a trip start, the driver needs to listen to the specific trip channel
        listenToTrip(trip.id);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(driverChannel);
    };
  }, [user]);

  const listenToTrip = (tripId: string) => {
    const tripChannel = supabase.channel(`trip_${tripId}`);
    tripChannel
      .on('broadcast', { event: 'location_update' }, (payload: any) => {
        const { location, distance, fare } = payload.payload;
        setCurrentLocation(location);
        setTripDistanceKm(distance);
        setFare(fare);
      })
      .subscribe();
      
    // Cleanup will be handled globally or when trip ends
  };

  return null; // Headless component
}
