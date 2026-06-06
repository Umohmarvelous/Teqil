import React from 'react';
import { View, Text, StyleSheet, Share, Pressable, Image } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useAuthStore } from '@/src/store/useStore';
import { Colors } from '@/constants/colors';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSettingsStore } from '@/src/store/useSettingsStore';

export default function QRReceiveScreen() {
  const { user } = useAuthStore();
  const insets = useSafeAreaInsets();
  const { theme } = useSettingsStore();

  const isDark = theme === "dark";
  const bg = isDark ? Colors.background : Colors.border;
  const textColor = isDark ? Colors.textWhite : Colors.text;
  const subTextColor = isDark ? Colors.textSecondary : Colors.textSecondary;
  const cardBg = isDark ? Colors.overlayLight : "#FFFFFF";

  const driverIdStr = user?.driver_id || user?.id || "";

  // QR format now uses a JSON payload for instant passenger verification
  const qrPayload = {
    type: "TEQIL_DRV",
    driver_id: driverIdStr,
    name: user?.full_name || "Driver",
    vehicle: user?.vehicle_details || "Standard Vehicle",
    rating: user?.avg_rating || 5.0,
    photo: user?.profile_photo || ""
  };
  const qrValue = JSON.stringify(qrPayload);

  const handleShare = () => {
    Share.share({
      message: `Scan my TEQIL QR to start a trip: ${qrValue}`,
    });
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 15 }, { backgroundColor: bg }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', alignSelf: 'center'}}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={textColor} />
        </Pressable>

        <View style={{flexDirection: 'column', alignItems: 'center',  alignSelf:'center', flex: 1 }}>
          <Text style={[styles.heading, {color: textColor}]}>My QR Code</Text>
          <Text style={[styles.subtext, {color: subTextColor}]}>Scan to start a trip.</Text>
        </View>

        <View  style={styles.backBtn} />
      </View>

      <View style={[styles.qrContainer, {backgroundColor: cardBg}]}>
        <QRCode
          value={qrValue}
          size={240}
          color={cardBg}
          backgroundColor={textColor}
        />
      </View>


      <View style={styles.profileContainer}>
        <Image 
          source={{ uri: user?.profile_photo || 'https://via.placeholder.com/150' }} 
          style={styles.avatar} 
        />
        <Text style={[styles.driverName, {color: textColor}]}>{user?.full_name || 'Driver'}</Text>
        
        <Text style={[styles.driverId, {color: textColor}]}>{user?.driver_id || user?.id?.slice(0, 8)}</Text>
      </View>


      <Pressable style={[styles.shareButton, {backgroundColor: cardBg}]} onPress={handleShare}>
        <Ionicons name="share-outline" size={20} color={textColor} />
        <Text style={[styles.shareText, {color: textColor}]}>Share QR Code</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    alignItems: 'center', 
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  backBtn: {
    borderRadius: 20,
    justifyContent: 'center',
  },
  heading: { 
    fontSize: 18, 
    fontFamily: 'Poppins_700Bold', 
    // marginBottom: 8,
    // marginTop: 20,
  },
  subtext: { 
    fontSize: 14, 
    fontFamily: 'Poppins_400Regular',
    marginBottom: 'auto', 
    textAlign: 'center' 
  },
  qrContainer: {
    padding: 24,
    borderRadius: 24,
    marginTop: 'auto',
    marginBottom: 'auto',
  },
  profileContainer: {
    alignItems: 'center',
    // marginTop: 'auto',
    marginVertical: 30,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    borderColor: Colors.primary,
    marginBottom: 16,
  },
  driverName: {
    fontSize: 20,
    fontFamily: 'Poppins_700Bold',
    marginBottom: 4,
  },
  vehicleText: {
    fontSize: 14,
    fontFamily: 'Poppins_500Medium',
    marginBottom: 4,
  },
  driverId: { 
    fontSize: 12, 
    fontFamily: 'Poppins_600SemiBold',
    marginBottom: 20,
  },
  shareButton: {
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    justifyContent: 'center',
  },
  shareText: { 
    fontFamily: 'Poppins_600SemiBold', 
    fontSize: 16 
  },
});