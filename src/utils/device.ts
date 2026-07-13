import * as Device from 'expo-device';
import * as Application from 'expo-application';
import { Platform } from 'react-native';

export async function getDeviceFingerprint(): Promise<string> {
  if (Platform.OS === 'web') {
    return 'web-' + navigator.userAgent;
  }

  const base = `${Device.brand}-${Device.modelName}-${Device.osName}-${Device.osVersion}`;
  let uniqueId = '';
  
  if (Platform.OS === 'ios') {
    uniqueId = await Application.getIosIdForVendorAsync() ?? '';
  } else if (Platform.OS === 'android') {
    uniqueId = Application.getAndroidId();
  }

  return `${base}-${uniqueId}`;
}
