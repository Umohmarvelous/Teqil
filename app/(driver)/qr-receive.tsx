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


  // QR format specified by requirements
  const qrValue = `TEQIL:DRV-${user?.driver_id || user?.id} bank_account:"" subaccount:""`;

  const handleShare = () => {
    Share.share({
      message: `Scan my TEQIL QR to start a trip: ${qrValue}`,
    });
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 20 }, { backgroundColor: bg }]}>
      <Pressable style={styles.backBtn} onPress={() => router.back()}>
        <Ionicons name="chevron-back" size={24} color={textColor} />
      </Pressable>
      
      <Text style={[styles.heading, {color: textColor}]}>My QR Code</Text>
      <Text style={[styles.subtext, {color: subTextColor}]}>Show this to passengers to start a trip.</Text>


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
        <Text style={[styles.vehicleText, {color: subTextColor}]}>{user?.vehicle_details || 'Vehicle not specified'}</Text>
        <Text style={[styles.driverId, {color: textColor}]}>ID: {user?.driver_id || user?.id?.slice(0, 8)}</Text>
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
    position: 'absolute',
    top: 50,
    left: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  heading: { 
    fontSize: 24, 
    fontFamily: 'Poppins_700Bold', 
    marginBottom: 8,
    // marginTop: 20,
  },
  subtext: { 
    fontSize: 14, 
    fontFamily: 'Poppins_400Regular',
    marginBottom: 40, 
    textAlign: 'center' 
  },
  qrContainer: {
    padding: 24,
    borderRadius: 24,
    // marginBottom: 40,
    marginBottom: 'auto',

  },
  profileContainer: {
    alignItems: 'center',    marginBottom: 'auto',

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
    fontFamily: 'Poppins_600SemiBold' 
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