import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { PaystackWebView } from 'react-native-paystack-webview';

const TRIP_FARES: Record<string, number> = {
  short: 300,
  medium: 500,
  long: 800,
};

export default function PaymentScreen() {
  const { driver_id, subaccount_code, trip_type } = useLocalSearchParams<{
    driver_id: string;
    subaccount_code: string;
    trip_type: 'short' | 'medium' | 'long';
  }>();

  const { user } = useAuthStore();
  const paystackRef = useRef<any>(null);
  const [loading, setLoading] = useState(false);

  const fare = TRIP_FARES[trip_type ?? 'short'] ?? 300;

  const handleConfirm = () => {
    paystackRef.current?.startTransaction();
  };

  const handleSuccess = async (response: any) => {
    setLoading(true);
    try {
      // Verify on backend and record transaction
      const res = await fetch('/api/payments/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reference: response.transactionRef?.reference,
          driver_id,
          passenger_id: user?.id,
          amount: fare,
          trip_type,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message);

      Alert.alert('Payment Successful', `₦${fare} sent to driver.`, [
        { text: 'Done', onPress: () => router.replace('/(main)/index') },
      ]);
    } catch (err: any) {
      Alert.alert('Verification Failed', err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Confirm Payment</Text>

      <View style={styles.card}>
        <Row label="Trip type" value={trip_type ?? 'short'} />
        <Row label="Amount" value={`₦${fare.toLocaleString()}`} highlight />
        <Row label="Driver ID" value={driver_id} />
      </View>

      {/* PaystackWebView renders an invisible modal — triggered by ref.startTransaction() */}
      <PaystackWebView
        paystackKey={process.env.EXPO_PUBLIC_PAYSTACK_PUBLIC_KEY!}
        amount={fare * 100} // kobo
        billingEmail={user?.email ?? ''}
        subaccount={subaccount_code}
        onCancel={() => Alert.alert('Cancelled', 'Payment was cancelled.')}
        onSuccess={handleSuccess}
        ref={paystackRef}
        channels={['card', 'bank', 'ussd', 'mobile_money']}
      />

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleConfirm}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Pay ₦{fare.toLocaleString()}</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => router.back()}>
        <Text style={styles.cancel}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );
}

const Row = ({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) => (
  <View style={rowStyles.row}>
    <Text style={rowStyles.label}>{label}</Text>
    <Text style={[rowStyles.value, highlight && rowStyles.highlight]}>{value}</Text>
  </View>
);

const rowStyles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10 },
  label: { color: '#666', fontSize: 14 },
  value: { fontWeight: '500', fontSize: 14 },
  highlight: { fontSize: 20, fontWeight: '800', color: '#007AFF' },
});

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, paddingTop: 56, backgroundColor: '#fff' },
  heading: { fontSize: 22, fontWeight: '700', marginBottom: 24 },
  card: {
    backgroundColor: '#F5F5F5',
    borderRadius: 16,
    padding: 16,
    marginBottom: 32,
  },
  button: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  cancel: {
    textAlign: 'center',
    color: '#FF3B30',
    marginTop: 16,
    fontWeight: '500',
    fontSize: 15,
  },
});