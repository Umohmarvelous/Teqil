import React from 'react';
import { View, Text, StyleSheet, Share, Pressable, Image, Dimensions } from 'react-native';
import { Glass, IOSButton } from '@/components/ios';
import QRCode from 'react-native-qrcode-svg';
import { useAuthStore } from '@/src/store/useStore';
import { Colors } from '@/constants/colors';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSettingsStore } from '@/src/store/useSettingsStore';
import { StatusBar } from "expo-status-bar";
import { buildDriverQRValue } from '@/src/utils/qr';
import { Pen, Tick01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from "@hugeicons/react-native";

const { width: SCREEN_WIDTH } = Dimensions.get("window");


export default function QRReceiveScreen() {
  const { user } = useAuthStore();
  const insets = useSafeAreaInsets();
  const { theme } = useSettingsStore();

  const isDark = theme === "dark";
  const bg = isDark ? Colors.background : Colors.textWhite;
  const textColor = isDark ? Colors.textWhite : Colors.text;
  const subTextColor = isDark ? Colors.textSecondary : Colors.overlay;
  const cardBg = isDark ? Colors.overlayLight : "#FFFFFF";
  const avatarBg = isDark ? Colors.textWhite : Colors.textWhite;
  const borderColor = isDark ? "rgba(255,255,255,0.08)" : "#E8ECF0";

  // QR format is centralized in src/utils/qr.ts so the generator and every
  // scanner agree. It encodes a JSON payload so a passenger sees the driver
  // instantly on scan — no users-table read, which RLS blocks across accounts.
  const qrValue = buildDriverQRValue(user);

  const handleShare = () => {
    Share.share({
      message: `Scan my TEQIL QR to start a trip: ${qrValue}`,
    });
  };

  // Gate: a driver must have a verified payout account before they can show a QR
  // to receive fare payments.
  if (!user?.payout_account_number) {
    return (
      <View
        style={[
          styles.container,
          { flex: 1,  backgroundColor: bg, alignItems: "center", justifyContent: "center", gap: 190, paddingHorizontal: 28, },
        ]}
      >
        <View style={[styles.container, {gap: 10}]}>
          <StatusBar style={isDark ? "light" : "dark"} animated />
          <Ionicons name="wallet-outline" size={60} color={textColor} />
          <Text style={[styles.heading, { color: textColor, textAlign: "center" }]}>Add your payout account</Text>
          <Text style={[styles.subtext, { color: subTextColor, textAlign: "center" }]}>
            You need a verified bank account to receive fare payments before you can show your QR code.
          </Text>
        </View>

        <View style={[styles.container, {gap: 20}]}>
          <IOSButton
            title="Add payout account"
            variant = "filled"
            size="small"
            style={{ backgroundColor: 'transparent' }}
            onPress={() => router.push("/(driver)/payout-bank" as any)}
          />
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <Text style={{ color: subTextColor, fontFamily: "Poppins_700Bold", fontSize: 13 }}>Not now</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + -80 }, { backgroundColor: bg }]}>
      <StatusBar style={isDark ? 'light' : 'dark' } animated  />

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', alignSelf: 'center'}}>
        <Pressable
          style={styles.backBtn}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Glass
            variant="regular"
            interactive
            radius={50}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
            fallbackIntensity={40}
            fallbackTint={cardBg}
          />
          <Ionicons name="chevron-back" size={24} color={textColor} />
        </Pressable>

        <View style={{flexDirection: 'column', alignItems: 'center',  alignSelf:'center', flex: 1 }}>
          <Text style={[styles.heading, {color: textColor}]}>My QR Code</Text>
          <Text style={[styles.subtext, {color: subTextColor}]}>Scan to start a trip.</Text>
        </View>

        {/* <View  style={styles.backBtn} /> */}
        <Pressable
          style={styles.shareButton}
          onPress={handleShare}
          accessibilityRole="button"
          accessibilityLabel="Share QR code"
        >
          <Glass
            variant="regular"
            interactive
            radius={50}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
            fallbackIntensity={40}
            fallbackTint={cardBg}
          />
          <Ionicons name="share-outline" size={25} color={textColor} />
        </Pressable>
      </View>

      <View style={[styles.qrBig, {backgroundColor: avatarBg}]}>

        <View style={{borderWidth: 2, borderColor: isDark ? Colors.background : Colors.textWhite, backgroundColor: avatarBg, width: 70, height: 70, position:'absolute', top: -40, bottom: 0, borderRadius: 40, alignItems:'center', justifyContent:'center' }}>
          {user?.profile_photo ?
              <Image 
              source={{ uri: user?.profile_photo || 'https://via.placeholder.com/150' }} 
              style={[styles.avatar]} 
              />
              :
              (<>
                <Image 
                  source={require ("../../assets/images/pic1.jpg")}
                  style={[styles.avatar]} 
                />

            </>)
          }
        </View>

        <Text style={[styles.driverName, {color: Colors.primary}]}>{user?.full_name || 'Unknown ID'}</Text>  
        <Text style={[styles.driverId, {color: subTextColor}]}>{user?.driver_id || user?.id?.slice(0, 8) || '-  -'}</Text>

        <View style={[styles.qrContainer, {backgroundColor: isDark ? Colors.textWhite : Colors.text}]}>
          <QRCode
            value={qrValue}
            size={210}
            color={isDark ? Colors.textWhite : Colors.text}
            backgroundColor={isDark ? Colors.text : "#fff"}
          />
        </View>
      </View>


      <View style={styles.profileContainer}>
        {/* <Ionicons name="warning" size={25} color={textColor} /> */}
        <Text style={[styles.shareText, {color: subTextColor}]}>Your QR code is private. Do not share it with anyone, they can scan it with their phone camera to see your details.</Text>
      </View>

        
      
      {user?.payout_account_number ? (
          <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20}}>
            {/* <Text style={[styles.payoutBtnText, { color: textColor }]}>Bank details saved 
            </Text> */}
            <Pressable
                style={{ borderRadius: 50, padding: 11, flexDirection: 'row',  alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}
                onPress={() => router.push("/(driver)/payout-bank")}
                accessibilityRole="button"
                accessibilityLabel="Update payout account"
            >
            
              <Text style={[styles.payoutBtnText, {color: Colors.primary}]}>Update bank details</Text>
            </Pressable>
          </View>
        )
      : (
          <View style={{flexDirection: 'row', gap: 7, padding: 5}}>
            <Ionicons name="card-outline" size={18} color={textColor} />

            <Text style={[styles.payoutBtnText, { color: textColor }]}>Set up payout account</Text>
            <HugeiconsIcon icon={Pen} size={14} color={ textColor } /> 
          </View>
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingBottom: 40,
    justifyContent: 'center',  
  },
  payoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
  },
  payoutBtnText: { fontFamily: 'Poppins_600SemiBold', fontSize: 14,  },
  backBtn: {
    borderRadius: 50,
    justifyContent: 'center',
    padding: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
      overflow: 'hidden',
  },
  heading: { 
    fontSize: 15, 
    fontFamily: 'Poppins_700Bold', 
  },
  subtext: { 
    fontSize: 13, 
    fontFamily: 'Poppins_400Regular',
    marginBottom: 'auto', 
    textAlign: 'center' 
  },
  qrBig:{
    padding: 50,
    paddingBottom: 30,
    paddingTop: 40,
    marginTop: 50,
    borderRadius: 30,
    alignItems:'center',
  },
  qrContainer: {
    padding: 10,
    borderRadius: 20,
    alignItems:'center',
  },
  profileContainer: {
    alignItems: 'center',
    // marginVertical: 30,
    flexDirection: 'column',
    gap:20,
    padding: 30
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 40,
  },
  driverName: {
    fontSize: 18,
    fontFamily: 'Poppins_700Bold',
    // marginBottom: 4,
  },
  vehicleText: {
    fontSize: 14,
    fontFamily: 'Poppins_500Medium',
    marginBottom: 4,
  },
  driverId: { 
    fontSize: 14, 
    fontFamily: 'Poppins_500Medium',
    marginBottom: 20,
    textAlign:'center',
  },
  shareButton: {
    borderRadius: 54,
    padding: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
      overflow: 'hidden',
  },
  shareText: { 
    fontFamily: 'Poppins_500Medium',
    fontSize: 13,
    marginBottom: 20,
    textAlign:'center',
  },
});