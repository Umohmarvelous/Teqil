import React from 'react';
import { View, Text, StyleSheet, Share, Pressable, Image } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useAuthStore } from '@/src/store/useStore';
import { Colors } from '@/constants/colors';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSettingsStore } from '@/src/store/useSettingsStore';
import { StatusBar } from "expo-status-bar";

export default function QRReceiveScreen() {
  const { user } = useAuthStore();
  const insets = useSafeAreaInsets();
  const { theme } = useSettingsStore();

  const isDark = theme === "dark";
  const bg = isDark ? Colors.background : Colors.border;
  const textColor = isDark ? Colors.textWhite : Colors.text;
  const subTextColor = isDark ? Colors.textSecondary : Colors.overlay;
  const cardBg = isDark ? Colors.overlayLight : "#FFFFFF";
  const avatarBg = isDark ? Colors.text : Colors.textWhite;


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
      <StatusBar style={isDark ? 'light' : 'dark'}  />

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', alignSelf: 'center'}}>
        <Pressable style={[styles.backBtn, {backgroundColor: cardBg}]} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={textColor} />
        </Pressable>

        <View style={{flexDirection: 'column', alignItems: 'center',  alignSelf:'center', flex: 1 }}>
          <Text style={[styles.heading, {color: textColor}]}>My QR Code</Text>
          <Text style={[styles.subtext, {color: subTextColor}]}>Scan to start a trip.</Text>
        </View>

        {/* <View  style={styles.backBtn} /> */}
        <Pressable style={[styles.shareButton, {backgroundColor: cardBg}]} onPress={handleShare}>
          <Ionicons name="share-outline" size={25} color={textColor} />
        </Pressable>
      </View>

      <View style={[styles.qrBig, {backgroundColor: avatarBg}]}>

        <View style={{borderWidth:2, borderColor: avatarBg, backgroundColor: avatarBg, width: 70, height: 70, position:'absolute', top: -40, bottom: 0, borderRadius: 40, alignItems:'center', justifyContent:'center' }}>
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
            size={190}
            color={isDark ? Colors.textWhite : Colors.text}
            backgroundColor={isDark ? Colors.text : "#fff"}
          />
        </View>
      </View>


      <View style={styles.profileContainer}>
        {/* <Ionicons name="warning" size={25} color={textColor} /> */}
        <Text style={[styles.shareText, {color: subTextColor}]}>Your QR code is private. Do not share it with anyone, they can scan it with their phone camera to see your details.</Text>
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    alignItems: 'center', 
    paddingHorizontal: 14,
    paddingBottom: 40,
    justifyContent: 'space-between'
  },
  backBtn: {
    borderRadius: 50,
    justifyContent: 'center',
    padding: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
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
    padding: 24,
    borderRadius: 20,
    alignItems:'center'
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
  },
  shareText: { 
    fontFamily: 'Poppins_500Medium',
    fontSize: 13,
    marginBottom: 20,
    textAlign:'center',
  },
});