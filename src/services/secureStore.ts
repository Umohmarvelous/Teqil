/**
 * src/services/secureStore.ts
 *
 * Infrastructure adapter for ENCRYPTED key-value storage, backed by the device
 * Keychain (iOS) / Keystore (Android) via expo-secure-store. On web — where
 * SecureStore is unavailable — it transparently falls back to AsyncStorage.
 *
 * Use this ONLY for sensitive values (passwords, password hashes, tokens).
 * SecureStore caps each value at ~2KB, so keep large/non-secret data (profiles,
 * history) in the regular AsyncStorage-backed stores.
 *
 * Keys must match [A-Za-z0-9._-]. The existing "teqil_*" keys already comply.
 */
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

const isWeb = Platform.OS === "web";

export async function secureSet(key: string, value: string): Promise<void> {
  if (isWeb) {
    await AsyncStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

export async function secureGet(key: string): Promise<string | null> {
  if (isWeb) return AsyncStorage.getItem(key);
  return SecureStore.getItemAsync(key);
}

export async function secureDelete(key: string): Promise<void> {
  if (isWeb) {
    await AsyncStorage.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

/**
 * One-time migration helper: if a sensitive value still lives in the legacy
 * (plaintext) AsyncStorage location, move it into secure storage and remove the
 * legacy copy. Returns the value (from secure storage or the migrated legacy one).
 */
export async function secureGetWithLegacyMigration(key: string): Promise<string | null> {
  const secure = await secureGet(key);
  if (secure != null) return secure;

  if (isWeb) return null; // web already uses AsyncStorage as the secure backend
  const legacy = await AsyncStorage.getItem(key);
  if (legacy != null) {
    await secureSet(key, legacy);
    await AsyncStorage.removeItem(key);
    return legacy;
  }
  return null;
}
