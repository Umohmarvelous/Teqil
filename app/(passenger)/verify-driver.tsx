import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Image, Pressable, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/src/services/supabase';
import { useTripStore, useAuthStore } from '@/src/store/useStore';
import { startLocationTracking } from '@/src/services/locationTracking';
import { Colors } from '@/constants/colors';

export default function VerifyDriverScreen() {
  const { driver_id } = useLocalSearchParams<{ driver_id: string }>();
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const { setActiveTrip, setActiveTripPassengers } = useTripStore();
  
  const [loading, setLoading] = useState(true);
  const [driver, setDriver] = useState<any>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (driver_id) fetchDriver();
  }, [driver_id]);

  const fetchDriver = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .or(`driver_id.eq.${driver_id},id.eq.${driver_id}`)
        .single();
        
      if (error || !data) {
        Alert.alert('Driver Not Found', 'We could not find a driver with this QR code.');
        router.back();
      } else {
        setDriver(data);
      }
    } catch (err) {
      console.warn(err);
      Alert.alert('Error', 'An error occurred while verifying the driver.');
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const handleStartTrip = async () => {
    if (!driver || !user) return;
    setStarting(true);
    try {
      // Create a trip record in Supabase or set active trip locally
      const tripId = `direct_${Math.random().toString(36).substring(7)}`; // Temporary ID until we save it to DB
      const newTrip = {
        id: tripId,
        driver_id: driver.id,
        trip_code: 'DIRECT',
        origin: 'Current Location',
        destination: 'Tracking...',
        start_time: new Date().toISOString(),
        capacity: 1,
        status: 'active' as const,
        created_at: new Date().toISOString(),
        synced: false,
        updated_at: new Date().toISOString(),
        driver: driver,
      };

      setActiveTrip(newTrip);
      setActiveTripPassengers([user as any]);

      await startLocationTracking(tripId);

      // Broadcast to driver that trip has started
      const driverChannel = supabase.channel(`driver_${driver.driver_id || driver.id}`);
      await driverChannel.send({
        type: 'broadcast',
        event: 'trip_started',
        payload: { trip: newTrip, passenger: user }
      });

      router.replace('/(passenger)/live-trip');
    } catch (e) {
      console.warn("Failed to start trip:", e);
      Alert.alert("Error", "Could not start the trip.");
      setStarting(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Verifying Driver...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}>
      <Pressable style={styles.backBtn} onPress={() => router.back()}>
        <Ionicons name="chevron-back" size={24} color={Colors.textWhite} />
      </Pressable>

      <Text style={styles.title}>Confirm Driver</Text>

      {driver && (
        <View style={styles.card}>
          <Image 
            source={{ uri: driver.profile_photo || 'https://via.placeholder.com/150' }} 
            style={styles.avatar} 
          />
          <Text style={styles.driverName}>{driver.full_name || 'Driver'}</Text>
          
          <View style={styles.infoRow}>
            <Ionicons name="car" size={20} color={Colors.primary} />
            <Text style={styles.infoText}>{driver.vehicle_details || 'Standard Vehicle'}</Text>
          </View>
          
          <View style={styles.infoRow}>
            <Ionicons name="id-card" size={20} color={Colors.primary} />
            <Text style={styles.infoText}>{driver.driver_id || driver.id.slice(0, 8)}</Text>
          </View>

          <View style={styles.infoRow}>
            <Ionicons name="star" size={20} color={Colors.gold} />
            <Text style={styles.infoText}>{driver.avg_rating?.toFixed(1) || 'New Driver'}</Text>
          </View>
        </View>
      )}

      <View style={styles.footer}>
        <Text style={styles.disclaimer}>
          By starting this trip, your location and fare will be actively tracked.
        </Text>
        <Pressable 
          style={[styles.startBtn, starting && styles.startBtnDisabled]} 
          onPress={handleStartTrip}
          disabled={starting}
        >
          {starting ? (
            <ActivityIndicator color={Colors.textWhite} />
          ) : (
            <Text style={styles.startBtnText}>Confirm & Start Trip</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingHorizontal: 20,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    color: Colors.textSecondary,
    fontFamily: 'Poppins_500Medium',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 28,
    color: Colors.textWhite,
    marginBottom: 40,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 24,
    padding: 30,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: Colors.primary,
    marginBottom: 20,
  },
  driverName: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 24,
    color: Colors.textWhite,
    marginBottom: 20,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.surfaceSecondary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 16,
    marginBottom: 12,
    width: '100%',
  },
  infoText: {
    fontFamily: 'Poppins_500Medium',
    fontSize: 16,
    color: Colors.textSecondary,
  },
  footer: {
    marginTop: 'auto',
  },
  disclaimer: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 16,
  },
  startBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: 18,
    borderRadius: 30,
    alignItems: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  startBtnDisabled: {
    opacity: 0.7,
  },
  startBtnText: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 18,
    color: Colors.textWhite,
  },
});
