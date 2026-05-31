// app/find-driver.tsx
// Standalone screen: passenger types a driver badge ID, searches, previews
// the driver card, then navigates to direct-chat/[conversationId].

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
  Platform,
  Animated,
  Easing,
  Alert,
  KeyboardAvoidingView,
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useAuthStore } from '@/src/store/useStore';
import { useMessagesStore } from '@/src/store/useMessagesStore';
import { useSettingsStore } from '@/src/store/useSettingsStore';
import { Colors } from '@/constants/colors';
import Avatar from '@/components/Avatar';
import { HugeiconsIcon } from '@hugeicons/react-native';
import {
  ArrowLeft01Icon,
  Search01Icon,
  IdentityCardIcon,
  Car01Icon,
  Building04Icon,
  UserIcon,
} from '@hugeicons/core-free-icons';

// ── tiny entrance hook ────────────────────────────────────────────────────────
function useFadeSlide(delay = 0) {
  const opacity    = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(16)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity,    { toValue: 1, duration: 380, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 380, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, []);
  return { opacity, transform: [{ translateY }] };
}

interface DriverPreview {
  id:               string;
  full_name:        string | null;
  driver_id:        string | null;
  vehicle_details?: string | null;
  park_name?:       string | null;
  profile_photo?:   string | null;
  conversationId:   string;
}

export default function FindDriverScreen() {
  const insets  = useSafeAreaInsets();
  const { user }                    = useAuthStore();
  const { fetchConversationByDriverId } = useMessagesStore();
  const { theme }                   = useSettingsStore();

  const [query,    setQuery]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [preview,  setPreview]  = useState<DriverPreview | null>(null);
  const [hasError, setHasError] = useState('');

  const isDark      = theme === 'dark';
  const bg          = isDark ? Colors.background   : Colors.border;
  const cardBg      = isDark ? Colors.primaryDarker : '#FFFFFF';
  const textColor   = isDark ? Colors.textWhite     : Colors.text;
  const subColor    = isDark ? Colors.textSecondary : Colors.textTertiary;
  const borderColor = isDark ? 'rgba(255,255,255,0.10)' : '#E5E8EC';
  const topPad      = Platform.OS === 'web' ? 67 : insets.top;

  const heroAnim   = useFadeSlide(60);
  const inputAnim  = useFadeSlide(140);
  const previewAnim = useFadeSlide(0); // re-triggered manually via key

  const handleSearch = async () => {
    const q = query.trim();
    if (!q) return;
    if (!user?.id) {
      Alert.alert('Not logged in', 'Please sign in first.');
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLoading(true);
    setPreview(null);
    setHasError('');

    try {
      const { driverUser, conversation } = await fetchConversationByDriverId(q, user.id);
      setPreview({
        id:             driverUser.id,
        full_name:      driverUser.full_name,
        driver_id:      driverUser.driver_id,
        vehicle_details:(driverUser as any).vehicle_details,
        park_name:      (driverUser as any).park_name,
        profile_photo:  (driverUser as any).profile_photo,
        conversationId: conversation.id,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      setHasError(err?.message ?? 'Driver not found. Check the ID and try again.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChat = () => {
    if (!preview) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push({
      pathname: '/direct-chat/[conversationId]',
      params: {
        conversationId: preview.conversationId,
        driverName:     preview.full_name ?? 'Driver',
        driverId:       preview.driver_id ?? '',
      },
    });
  };

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 12, backgroundColor: cardBg, borderBottomColor: borderColor }]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()} hitSlop={8}>
          <HugeiconsIcon icon={ArrowLeft01Icon} size={22} color={textColor} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: textColor }]}>Find Driver</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <Animated.View style={[styles.heroBlock, heroAnim]}>
          <View style={[styles.heroIconBg, { backgroundColor: Colors.primaryLight }]}>
            <HugeiconsIcon icon={IdentityCardIcon} size={32} color={Colors.primary} />
          </View>
          <Text style={[styles.heroTitle, { color: textColor }]}>Chat with a Driver</Text>
          <Text style={[styles.heroSub, { color: subColor }]}>
          {`  Enter the driver's badge ID (e.g. DRV-A1B2C3) to start a private conversation`}
          </Text>
        </Animated.View>

        {/* Search input */}
        <Animated.View style={inputAnim}>
          <View style={[styles.inputCard, { backgroundColor: cardBg, borderColor: borderColor }]}>
            <Text style={[styles.inputLabel, { color: subColor }]}>DRIVER ID</Text>
            <View style={[
              styles.inputRow,
              { borderColor: hasError ? Colors.error : query.length > 0 ? Colors.primary : borderColor },
            ]}>
              <HugeiconsIcon icon={Search01Icon} size={18} color={hasError ? Colors.error : subColor} />
              <TextInput
                style={[styles.textInput, { color: textColor }]}
                placeholder="DRV-A1B2C3"
                placeholderTextColor={subColor}
                value={query}
                onChangeText={(v) => {
                  setQuery(v.toUpperCase());
                  setHasError('');
                  setPreview(null);
                }}
                autoCapitalize="characters"
                autoCorrect={false}
                returnKeyType="search"
                onSubmitEditing={handleSearch}
              />
              {query.length > 0 && (
                <Pressable hitSlop={8} onPress={() => { setQuery(''); setPreview(null); setHasError(''); }}>
                  <Text style={[styles.clearBtn, { color: subColor }]}>✕</Text>
                </Pressable>
              )}
            </View>

            {hasError ? (
              <View style={styles.errorRow}>
                <Text style={styles.errorText}>{hasError}</Text>
              </View>
            ) : null}

            <Pressable
              style={[
                styles.searchBtn,
                { backgroundColor: query.trim() ? Colors.primary : isDark ? '#2A2A2A' : '#E5E7EB', opacity: loading ? 0.65 : 1 },
              ]}
              onPress={handleSearch}
              disabled={!query.trim() || loading}
            >
              {loading
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={[styles.searchBtnText, { color: query.trim() ? '#fff' : subColor }]}>Search Driver</Text>
              }
            </Pressable>
          </View>
        </Animated.View>

        {/* Driver preview card */}
        {preview && (
          <Animated.View key={preview.id} style={[styles.previewCard, { backgroundColor: cardBg, borderColor: Colors.primary + '55' }, previewAnim]}>
            <View style={styles.previewTop}>
              <Avatar name={preview.full_name || 'Driver'} photoUri={preview.profile_photo ?? undefined} size={56} />
              <View style={styles.previewInfo}>
                <Text style={[styles.previewName, { color: textColor }]} numberOfLines={1}>
                  {preview.full_name || 'Driver'}
                </Text>
                <View style={styles.previewBadge}>
                  <HugeiconsIcon icon={IdentityCardIcon} size={11} color={Colors.primary} />
                  <Text style={styles.previewBadgeText}>{preview.driver_id}</Text>
                </View>
              </View>
              <View style={[styles.verifiedPill, { backgroundColor: Colors.primaryLight }]}>
                <Text style={[styles.verifiedText, { color: Colors.primaryDark }]}>Verified</Text>
              </View>
            </View>

            <View style={[styles.previewMeta, { borderTopColor: borderColor }]}>
              {preview.vehicle_details ? (
                <View style={styles.metaRow}>
                  <HugeiconsIcon icon={Car01Icon} size={14} color={subColor} />
                  <Text style={[styles.metaText, { color: subColor }]} numberOfLines={1}>{preview.vehicle_details}</Text>
                </View>
              ) : null}
              {preview.park_name ? (
                <View style={styles.metaRow}>
                  <HugeiconsIcon icon={Building04Icon} size={14} color={subColor} />
                  <Text style={[styles.metaText, { color: subColor }]} numberOfLines={1}>{preview.park_name}</Text>
                </View>
              ) : null}
            </View>

            <Pressable
              style={[styles.chatBtn, { backgroundColor: Colors.primary }]}
              onPress={handleOpenChat}
            >
              <HugeiconsIcon icon={UserIcon} size={18} color="#fff" />
              <Text style={styles.chatBtnText}>Start Chat</Text>
            </Pressable>
          </Animated.View>
        )}

        {/* Hint when empty */}
        {!preview && !loading && !hasError && (
          <View style={styles.hint}>
            <Text style={[styles.hintText, { color: subColor }]}>
              {`You can find the driver's badge ID on their profile or trip details card.`}
            </Text>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  header: {
    flexDirection:    'row',
    alignItems:       'center',
    justifyContent:   'space-between',
    paddingHorizontal: 16,
    paddingBottom:    14,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontFamily: 'Poppins_600SemiBold', fontSize: 16 },

  scroll: { padding: 20, gap: 20 },

  heroBlock: { alignItems: 'center', paddingVertical: 8, gap: 10 },
  heroIconBg: {
    width: 64, height: 64, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  heroTitle:  { fontFamily: 'Poppins_700Bold',    fontSize: 20, textAlign: 'center' },
  heroSub:    { fontFamily: 'Poppins_400Regular', fontSize: 13, textAlign: 'center', lineHeight: 20 },

  inputCard: {
    borderRadius: 24, padding: 20, borderWidth: 1, gap: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07, shadowRadius: 12, elevation: 3,
  },
  inputLabel: {
    fontFamily: 'Poppins_600SemiBold', fontSize: 10,
    letterSpacing: 2, textTransform: 'uppercase',
  },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1.5, borderRadius: 16,
    paddingHorizontal: 14, paddingVertical: 13,
  },
  textInput: {
    flex: 1, fontFamily: 'Poppins_600SemiBold',
    fontSize: 18, letterSpacing: 3, padding: 0,
  },
  clearBtn: { fontSize: 18, lineHeight: 22 },

  errorRow: { marginTop: -4 },
  errorText: { fontFamily: 'Poppins_400Regular', fontSize: 12, color: Colors.error, lineHeight: 18 },

  searchBtn: {
    borderRadius: 14, height: 52,
    alignItems: 'center', justifyContent: 'center',
  },
  searchBtnText: { fontFamily: 'Poppins_600SemiBold', fontSize: 15 },

  previewCard: {
    borderRadius: 24, borderWidth: 1.5, padding: 20, gap: 0,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12, shadowRadius: 16, elevation: 4,
  },
  previewTop: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 },
  previewInfo: { flex: 1, gap: 4 },
  previewName: { fontFamily: 'Poppins_700Bold', fontSize: 16 },
  previewBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.primaryLight, borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start',
  },
  previewBadgeText: { fontFamily: 'Poppins_700Bold', fontSize: 11, color: Colors.primary, letterSpacing: 1 },
  verifiedPill: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  verifiedText: { fontFamily: 'Poppins_600SemiBold', fontSize: 11 },

  previewMeta: { borderTopWidth: 1, paddingTop: 14, gap: 8, marginBottom: 16 },
  metaRow:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metaText:    { fontFamily: 'Poppins_400Regular', fontSize: 13 },

  chatBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: 14, height: 52,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35, shadowRadius: 12, elevation: 8,
  },
  chatBtnText: { fontFamily: 'Poppins_700Bold', fontSize: 15, color: '#fff' },

  hint: { alignItems: 'center', paddingHorizontal: 24, paddingTop: 8 },
  hintText: { fontFamily: 'Poppins_400Regular', fontSize: 13, textAlign: 'center', lineHeight: 20 },
});