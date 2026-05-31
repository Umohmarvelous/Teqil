import React, { useEffect, useState } from 'react';
import { Modal, View, Text, StyleSheet, Pressable, AppState } from 'react-native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';

export default function LocationPromptModal() {
  const [visible, setVisible] = useState(false);
  const [appState, setAppState] = useState(AppState.currentState);

  const checkLocation = async () => {
    let enabled = await Location.hasServicesEnabledAsync();
    let { status } = await Location.getForegroundPermissionsAsync();
    
    if (!enabled || status !== 'granted') {
      setVisible(true);
    } else {
      setVisible(false);
    }
  };

  useEffect(() => {
    checkLocation();
    
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (appState.match(/inactive|background/) && nextAppState === 'active') {
        checkLocation();
      }
      setAppState(nextAppState);
    });

    return () => {
      subscription.remove();
    };
  }, [appState]);

  const requestPermission = async () => {
    let { status } = await Location.requestForegroundPermissionsAsync();
    if (status === 'granted') {
      let enabled = await Location.hasServicesEnabledAsync();
      if (enabled) setVisible(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <View style={styles.container}>
        <Ionicons name="location" size={80} color={Colors.primary} />
        <Text style={styles.title}>Location Required</Text>
        <Text style={styles.description}>
          Teqil needs your location to track trips, ensure safety, and calculate accurate fares. 
          Please enable location services in your device settings to continue.
        </Text>
        <Pressable style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Enable Location</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
  },
  title: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 24,
    color: Colors.textWhite,
    marginTop: 20,
    marginBottom: 10,
    textAlign: 'center',
  },
  description: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 40,
    lineHeight: 22,
  },
  button: {
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderRadius: 30,
    width: '100%',
    alignItems: 'center',
  },
  buttonText: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 16,
    color: Colors.textWhite,
  },
});
