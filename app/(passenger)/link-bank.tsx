import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router } from 'expo-router';


// Common Nigerian bank codes (BVN-linked)
const BANKS = [
  { name: 'Access Bank', code: '044' },
  { name: 'First Bank', code: '011' },
  { name: 'GTBank', code: '058' },
  { name: 'UBA', code: '033' },
  { name: 'Zenith Bank', code: '057' },
  { name: 'Opay', code: '100004' },
  { name: 'Kuda', code: '50211' },
  { name: 'Moniepoint', code: '50515' },
];

export default function LinkBankScreen() {
  const { user } = useAuthStore();
  const [accountNumber, setAccountNumber] = useState('');
  const [selectedBank, setSelectedBank] = useState(BANKS[0]);
  const [showBankPicker, setShowBankPicker] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleInitiateMandate = async () => {
    if (accountNumber.length !== 10) {
      Alert.alert('Invalid Account', 'Enter a valid 10-digit account number.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/payments/mandate/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account_number: accountNumber,
          bank_code: selectedBank.code,
          passenger_id: user?.id,
          email: user?.email,
        }),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.message || 'Failed to initiate mandate');

      // Store mandate token in Supabase
      const { error: dbError } = await supabase
        .from('passenger_mandates')
        .upsert({
          passenger_id: user?.id,
          mandate_code: data.mandate_code,
          account_number: accountNumber,
          bank_code: selectedBank.code,
          bank_name: selectedBank.name,
          status: 'active',
        });

      if (dbError) throw dbError;

      Alert.alert('Success', 'Bank account linked. ₦100 authorization charge will be reversed.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.heading}>Link Bank Account</Text>
        <Text style={styles.subtext}>
          A one-time ₦100 authorization debit will be used to set up your payment mandate.
        </Text>

        {/* Bank selector */}
        <Text style={styles.label}>Bank</Text>
        <TouchableOpacity
          style={styles.input}
          onPress={() => setShowBankPicker(!showBankPicker)}
        >
          <Text>{selectedBank.name}</Text>
        </TouchableOpacity>

        {showBankPicker && (
          <View style={styles.picker}>
            {BANKS.map((bank) => (
              <TouchableOpacity
                key={bank.code}
                style={styles.pickerItem}
                onPress={() => {
                  setSelectedBank(bank);
                  setShowBankPicker(false);
                }}
              >
                <Text style={selectedBank.code === bank.code ? styles.pickerItemActive : undefined}>
                  {bank.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Account number */}
        <Text style={styles.label}>Account Number</Text>
        <TextInput
          style={styles.input}
          value={accountNumber}
          onChangeText={setAccountNumber}
          keyboardType="numeric"
          maxLength={10}
          placeholder="0000000000"
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleInitiateMandate}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Link Account</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingTop: 48 },
  heading: { fontSize: 22, fontWeight: '700', marginBottom: 8 },
  subtext: { fontSize: 14, color: '#666', marginBottom: 28, lineHeight: 20 },
  label: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 6, marginTop: 16 },
  input: {
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
    backgroundColor: '#FAFAFA',
  },
  picker: {
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 10,
    marginTop: 4,
    backgroundColor: '#FFF',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  pickerItem: { padding: 14, borderBottomWidth: 1, borderColor: '#F0F0F0' },
  pickerItemActive: { fontWeight: '700', color: '#007AFF' },
  button: {
    marginTop: 32,
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});