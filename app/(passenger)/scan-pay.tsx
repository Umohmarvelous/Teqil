import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Alert, TouchableOpacity } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';

const QR_PREFIX = 'TEQIL:DRV-';

export default function ScanPayScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  // Prevent duplicate scans while navigating
  const scannedRef = useRef(false);

  useEffect(() => {
    if (!permission?.granted) requestPermission();
  }, []);

  const handleBarCodeScanned = ({ data }: { data: string }) => {
    // Guard: ignore if already handled
    if (scannedRef.current) return;

    // Validate format: TEQIL:DRV-{driver_id}:{subaccount_code}
    if (!data.startsWith(QR_PREFIX)) {
      Alert.alert('Invalid QR', 'This QR code is not a valid TEQIL driver code.', [
        { text: 'Try Again', onPress: () => { scannedRef.current = false; setScanned(false); } },
      ]);
      scannedRef.current = true;
      setScanned(true);
      return;
    }

    // Parse: strip prefix, split on ':'
    const payload = data.slice(QR_PREFIX.length); // "{driver_id}:{subaccount_code}"
    const colonIdx = payload.indexOf(':');
    if (colonIdx === -1) {
      Alert.alert('Malformed QR', 'Could not parse driver data.');
      return;
    }

    const driver_id = payload.slice(0, colonIdx);
    const subaccount_code = payload.slice(colonIdx + 1);

    scannedRef.current = true;
    setScanned(true);

    router.push({
      pathname: '/(passenger)/payment',
      params: { driver_id, subaccount_code, trip_type: 'short' },
    });
  };

  if (!permission) return <View style={styles.container} />;

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.message}>Camera access is required to scan QR codes.</Text>
        <TouchableOpacity style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
      />

      {/* Overlay UI */}
      <View style={styles.overlay}>
        <Text style={styles.overlayTitle}>Scan Driver QR Code</Text>
        <View style={styles.scanFrame} />
        <Text style={styles.overlayHint}>{`Point camera at the driver's QR code`}</Text>
      </View>

      <TouchableOpacity style={styles.closeButton} onPress={() => router.back()}>
        <Text style={styles.closeText}>✕ Cancel</Text>
      </TouchableOpacity>
    </View>
  );
}

const FRAME = 240;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  message: { color: '#fff', textAlign: 'center', marginBottom: 20, fontSize: 15 },
  button: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  buttonText: { color: '#fff', fontWeight: '600' },
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 32,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 4,
    textShadowOffset: { width: 0, height: 1 },
  },
  scanFrame: {
    width: FRAME,
    height: FRAME,
    borderWidth: 3,
    borderColor: '#007AFF',
    borderRadius: 16,
    backgroundColor: 'transparent',
  },
  overlayHint: {
    color: '#ccc',
    marginTop: 24,
    fontSize: 13,
  },
  closeButton: {
    position: 'absolute',
    top: 56,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  closeText: { color: '#fff', fontWeight: '600' },
});