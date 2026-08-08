// src/utils/maps.ts
//
// Which map provider react-native-maps should use.
//
// iOS deliberately gets `undefined` (Apple Maps): PROVIDER_GOOGLE on iOS needs a
// Google Maps API key in `ios.config.googleMapsApiKey` plus a native rebuild, and
// this project ships neither — forcing it there renders a blank grey map.
// Android and web use Google. Mirrors the conditional in live-trip-code/[code].tsx.

import { Platform } from "react-native";
import { PROVIDER_GOOGLE } from "react-native-maps";

export const MAP_PROVIDER =
  Platform.OS === "android" || Platform.OS === "web" ? PROVIDER_GOOGLE : undefined;
