import React from 'react';
import { View, Text, StyleSheet, Share, TouchableOpacity } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

export default function QRReceiveScreen() {
  const { user } = useAuthStore();

  // Both driver_id and subaccount_code must exist on the user profile
  // subaccount_code is set when the driver onboards via Paystack
  const qrValue = `TEQIL:DRV-${user?.id}:${user?.subaccount_code ?? 'UNKNOWN'}`;

  const handleShare = () => {
    Share.share({
      message: `Scan my TEQIL QR to pay me: ${qrValue}`,
    });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Your Payment QR</Text>
      <Text style={styles.subtext}>Show this to passengers to receive payment.</Text>

      <View style={styles.qrContainer}>
        <QRCode
          value={qrValue}
          size={220}
          color="#1A1A1A"
          backgroundColor="#FFFFFF"
          // Optionally add a logo: logo={require('@/assets/logo.png')} logoSize={40}
        />
      </View>

      <Text style={styles.driverId}>Driver ID: {user?.id?.slice(0, 8)}…</Text>

      {user?.subaccount_code ? (
        <Text style={styles.subaccount}>Subaccount: {user.subaccount_code}</Text>
      ) : (
        <Text style={styles.warning}>⚠️ No subaccount linked. Contact support.</Text>
      )}

      <TouchableOpacity style={styles.shareButton} onPress={handleShare}>
        <Text style={styles.shareText}>Share QR Code</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', paddingTop: 64, backgroundColor: '#fff', padding: 24 },
  heading: { fontSize: 22, fontWeight: '700', marginBottom: 8 },
  subtext: { color: '#666', fontSize: 14, marginBottom: 36, textAlign: 'center' },
  qrContainer: {
    padding: 20,
    backgroundColor: '#fff',
    borderRadius: 20,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    marginBottom: 24,
  },
  driverId: { color: '#444', fontSize: 13, marginBottom: 4 },
  subaccount: { color: '#888', fontSize: 12, marginBottom: 32 },
  warning: { color: '#FF3B30', fontSize: 13, marginBottom: 32 },
  shareButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
  },
  shareText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});