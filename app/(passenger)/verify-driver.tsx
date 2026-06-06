import React, { useEffect, useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  Image, 
  Pressable, 
  ActivityIndicator, 
  Alert,
  useColorScheme
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/src/services/supabase';
import { useTripStore, useAuthStore } from '@/src/store/useStore';
import { startLocationTracking } from '@/src/services/locationTracking';

// You can keep your brand's primary color, but we'll define dynamic colors for the UI
const BrandColors = {
  primary: '#4F46E5', // A professional Indigo/Blue. Replace with your Colors.primary if preferred.
  gold: '#F59E0B',
};

export default function VerifyDriverScreen() {
  const { driver_id, driver_payload } = useLocalSearchParams<{ driver_id?: string, driver_payload?: string }>();
  const { user } = useAuthStore();
  const { setActiveTrip, setActiveTripPassengers } = useTripStore();
  
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  // Dynamic Theme Colors
  const theme = {
    overlay: 'rgba(0, 0, 0, 0.9)',
    surface: isDark ? '#1E1E1E' : '#FFFFFF',
    textPrimary: isDark ? '#F9FAFB' : '#111827',
    textSecondary: isDark ? '#9CA3AF' : '#6B7280',
    border: isDark ? '#374151' : '#E5E7EB',
    rowBackground: isDark ? '#2D2D2D' : '#F3F4F6',
  };

  const [loading, setLoading] = useState(!driver_payload);
  const [driver, setDriver] = useState<any>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (driver_payload) {
      try {
        const parsed = JSON.parse(driver_payload);
        setDriver({
          id: parsed.driver_id,
          driver_id: parsed.driver_id,
          full_name: parsed.name,
          vehicle_details: parsed.vehicle,
          avg_rating: parsed.rating,
          profile_photo: parsed.photo,
        });
      } catch (e) {
        console.warn("Failed to parse driver payload", e);
      }
    }

    const fetchDriver = async () => {
      try {
        const targetId = driver_id || (driver_payload ? JSON.parse(driver_payload).driver_id : null);
        if (!targetId) return;

        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(targetId);
        
        let query = supabase.from('users').select('*');
        if (isUUID) {
          query = query.eq('id', targetId);
        } else {
          query = query.eq('driver_id', targetId);
        }
        
        const { data, error } = await query.single();
          
        if (error || !data) {
          if (!driver_payload) {
            Alert.alert('Driver Not Found', 'We could not find a driver with this QR code.');
            router.back();
          }
        } else {
          setDriver(data);
        }
      } catch (err) {
        console.warn(err);
        if (!driver_payload) {
          Alert.alert('Error', 'An error occurred while verifying the driver.');
          router.back();
        }
      } finally {
        setLoading(false);
      }
    };

    fetchDriver();
  }, [driver_id, driver_payload]);

  const handleStartTrip = async () => {
    if (!driver || !user) return;
    setStarting(true);
    try {
      const tripId = `direct_${Math.random().toString(36).substring(7)}`; 
      const newTrip = {
        id: tripId,
        driver_id: driver.id,
        passenger_id: user.id,
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

      const driverChannel = supabase.channel(`driver_${driver.driver_id || driver.id}`);
      await driverChannel.send({
        type: 'broadcast',
        event: 'trip_started',
        payload: { trip: newTrip, passenger: user }
      });

      try {
        const webhookUrl = process.env.EXPO_PUBLIC_WEBHOOK_URL || 'http://localhost:5000/api/webhooks/scan-success';
        await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            driverPushToken: driver.push_token,
            passengerPushToken: user.push_token,
            driverName: driver.full_name,
            passengerName: user.full_name,
            tripId: tripId,
          }),
        });
      } catch (webhookErr) {
        console.warn("Failed to hit webhook:", webhookErr);
      }

      router.replace('/(passenger)/live-trip');
    } catch (e) {
      console.warn("Failed to start trip:", e);
      Alert.alert("Error", "Could not start the trip.");
      setStarting(false);
    }
  };

  return (
    <View style={[styles.overlay, { backgroundColor: theme.overlay }]}>
      <View style={[styles.modalCard, { backgroundColor: theme.surface }]}>
        
        {/* Loading State */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={BrandColors.primary} />
            <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Verifying Driver...</Text>
          </View>
        ) : driver ? (
          <>
            {/* Header & Avatar */}
            <View style={styles.headerContainer}>
              <View style={[styles.avatarContainer, { borderColor: theme.surface }]}>
                <Image 
                  source={{ uri: driver.profile_photo || 'https://via.placeholder.com/150' }} 
                  style={styles.avatar} 
                />
              </View>
              <Text style={[styles.driverName, { color: theme.textPrimary }]}>
                {driver.full_name || 'Driver'}
              </Text>
              <View style={styles.ratingBadge}>
                <Ionicons name="star" size={14} color={BrandColors.gold} />
                <Text style={styles.ratingText}>{driver.avg_rating?.toFixed(1) || 'New'}</Text>
              </View>
            </View>

            {/* Driver Details */}
            <View style={styles.detailsContainer}>
              <View style={[styles.infoRow, { backgroundColor: theme.rowBackground }]}>
                <View style={styles.iconBox}>
                  <Ionicons name="car-outline" size={20} color={theme.textPrimary} />
                </View>
                <View>
                  <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Vehicle</Text>
                  <Text style={[styles.infoValue, { color: theme.textPrimary }]}>
                    {driver.vehicle_details || 'Standard Vehicle'}
                  </Text>
                </View>
              </View>

              <View style={[styles.infoRow, { backgroundColor: theme.rowBackground }]}>
                <View style={styles.iconBox}>
                  <Ionicons name="id-card-outline" size={20} color={theme.textPrimary} />
                </View>
                <View>
                  <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Driver ID</Text>
                  <Text style={[styles.infoValue, { color: theme.textPrimary }]}>
                    {driver.driver_id || driver.id.slice(0, 8)}
                  </Text>
                </View>
              </View>
            </View>

            {/* Disclaimer & Actions */}
            <Text style={[styles.disclaimer, { color: theme.textSecondary }]}>
              By confirming, your location and fare will be actively tracked during this trip.
            </Text>

            <View style={styles.actionButtons}>
              <Pressable 
                style={[styles.cancelBtn, { borderColor: theme.border }]} 
                onPress={() => router.back()}
                disabled={starting}
              >
                <Text style={[styles.cancelBtnText, { color: theme.textPrimary }]}>Cancel</Text>
              </Pressable>

              <Pressable 
                style={[styles.startBtn, starting && styles.startBtnDisabled]} 
                onPress={handleStartTrip}
                disabled={starting}
              >
                {starting ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.startBtnText}>Start Trip</Text>
                )}
              </Pressable>
            </View>
          </>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalCard: {
    width: '100%',
    borderRadius: 24,
    paddingTop: 40,
    paddingBottom: 24,
    paddingHorizontal: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  loadingContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontFamily: 'Poppins_500Medium',
    fontSize: 16,
  },
  headerContainer: {
    alignItems: 'center',
    marginBottom: 24,
    marginTop: -80, // Pulls the avatar up out of the card
  },
  avatarContainer: {
    borderWidth: 6,
    borderRadius: 60,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  avatar: {
    width: 90,
    height: 90,
    borderRadius: 45,
  },
  driverName: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 22,
    marginBottom: 6,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7', // Soft gold background
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  ratingText: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 13,
    color: '#B45309', // Dark amber text
  },
  detailsContainer: {
    width: '100%',
    gap: 12,
    marginBottom: 24,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    gap: 16,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoLabel: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 12,
    marginBottom: 2,
  },
  infoValue: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 15,
  },
  disclaimer: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 18,
    paddingHorizontal: 10,
  },
  actionButtons: {
    flexDirection: 'row',
    width: '100%',
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 16,
  },
  startBtn: {
    flex: 1,
    backgroundColor: BrandColors.primary,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: BrandColors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  startBtnDisabled: {
    opacity: 0.7,
  },
  startBtnText: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 16,
    color: '#FFFFFF',
  },
});