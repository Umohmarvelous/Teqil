import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Alert, TouchableOpacity } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { parseDriverQR, toDriverPayload } from '@/src/utils/qr';
import { usePaymentMethodsStore } from '@/src/store/usePaymentMethodsStore';

export default function ScanPayScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  // Prevent duplicate scans while navigating
  const scannedRef = useRef(false);

  // Gate: a passenger must have a saved payment method (direct debit) before
  // they can scan & pay for a ride.
  const hasMethod = usePaymentMethodsStore((s) => s.methods.length > 0);

  useEffect(() => {
    if (!permission?.granted) requestPermission();
  }, []);

  const handleBarCodeScanned = ({ data }: { data: string }) => {
    // Guard: ignore if already handled
    if (scannedRef.current) return;

    const parsed = parseDriverQR(data);
    if (!parsed) {
      Alert.alert('Invalid QR', 'This QR code is not a valid Emilgo driver code.', [
        { text: 'Try Again', onPress: () => { scannedRef.current = false; setScanned(false); } },
      ]);
      scannedRef.current = true;
      setScanned(true);
      return;
    }

    scannedRef.current = true;
    setScanned(true);

    router.push({
      pathname: '/(passenger)/payment',
      params: {
        driver_id: parsed.driver_id,
        subaccount_code: parsed.subaccount_code ?? '',
        driver_payload: toDriverPayload(parsed),
        trip_type: 'short',
      },
    });
  };

  if (!hasMethod) {
    return (
      <View style={styles.container}>
        <Text style={styles.message}>
          Add a payment method before you can scan & pay for rides.
        </Text>
        <TouchableOpacity
          style={styles.button}
          onPress={() =>
            router.push({
              pathname: "/checkout",
              params: { item: "Add a payment method for rides", amount: "0", kind: "setup" },
            } as any)
          }
        >
          <Text style={styles.buttonText}>Add payment method</Text>
        </TouchableOpacity>
      </View>
    );
  }

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
        style={StyleSheet.absoluteFill}
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