// import React, { useRef, useEffect } from 'react';
// import {
//   View,
//   Text,
//   TextInput,
//   Pressable,
//   Animated,
//   Dimensions,
//   StyleSheet,
//   Keyboard,
//   Platform,
// } from 'react-native';
// import { BlurView } from 'expo-blur';
// import { HugeiconsIcon } from '@hugeicons/react-native';
// import { ArrowLeft01Icon, Search02Icon, Cancel01Icon } from '@hugeicons/core-free-icons';
// import { Colors } from '@/constants/colors';

// const { height } = Dimensions.get('window');

// export default function SearchOverlay({ visible, onClose, isDark }) {
//   const translateY = useRef(new Animated.Value(height)).current;
//   const [searchText, setSearchText] = React.useState('');

//   useEffect(() => {
//     if (visible) {
//       Animated.spring(translateY, {
//         toValue: 0,
//         useNativeDriver: true,
//         damping: 20,
//         stiffness: 90,
//       }).start();
//     } else {
//       Animated.timing(translateY, {
//         toValue: height,
//         duration: 250,
//         useNativeDriver: true,
//       }).start();
//     }
//   }, [visible]);

//   const handleClose = () => {
//     Keyboard.dismiss();
//     onClose();
//   };

//   const textColor = isDark ? Colors.textWhite : Colors.text;
//   const bgColor = isDark ? Colors.primaryDarker : '#fff';
//   const placeholderColor = isDark ? Colors.textSecondary : Colors.textTertiary;

//   return (
//     <>
//       {visible && (
//         <Pressable style={StyleSheet.absoluteFillObject} onPress={handleClose}>
//           <BlurView intensity={90} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFillObject} />
//         </Pressable>
//       )}
//       <Animated.View
//         style={[
//           styles.container,
//           {
//             transform: [{ translateY }],
//             backgroundColor: bgColor,
//           },
//         ]}
//       >
//         <View style={styles.header}>
//           <Pressable onPress={handleClose} style={styles.backButton}>
//             <HugeiconsIcon icon={ArrowLeft01Icon} size={24} color={textColor} />
//           </Pressable>
//           <View style={[styles.searchBar, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#F4F6FA' }]}>
//             <HugeiconsIcon icon={Search02Icon} size={18} color={placeholderColor} />
//             <TextInput
//               style={[styles.input, { color: textColor }]}
//               placeholder="Search trips, drivers, places..."
//               placeholderTextColor={placeholderColor}
//               value={searchText}
//               onChangeText={setSearchText}
//               autoFocus
//               returnKeyType="search"
//             />
//             {searchText.length > 0 && (
//               <Pressable onPress={() => setSearchText('')}>
//                 <HugeiconsIcon icon={Cancel01Icon} size={18} color={placeholderColor} />
//               </Pressable>
//             )}
//           </View>
//         </View>
//         <View style={styles.results}>
//           <Text style={[styles.emptyText, { color: placeholderColor }]}>
//             {searchText ? `Searching for "${searchText}"...` : 'Recent searches will appear here'}
//           </Text>
//         </View>
//       </Animated.View>
//     </>
//   );
// }

// const styles = StyleSheet.create({
//   container: {
//     position: 'absolute',
//     top: 0,
//     left: 0,
//     right: 0,
//     bottom: 0,
//     zIndex: 1000,
//   },
//   header: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     paddingHorizontal: 16,
//     paddingTop: Platform.OS === 'ios' ? 60 : 30,
//     paddingBottom: 12,
//     gap: 12,
//     borderBottomWidth: StyleSheet.hairlineWidth,
//     borderBottomColor: 'rgba(0,0,0,0.05)',
//   },
//   backButton: {
//     padding: 4,
//   },
//   searchBar: {
//     flex: 1,
//     flexDirection: 'row',
//     alignItems: 'center',
//     borderRadius: 30,
//     paddingHorizontal: 16,
//     paddingVertical: Platform.OS === 'ios' ? 10 : 6,
//     gap: 8,
//   },
//   input: {
//     flex: 1,
//     fontFamily: 'Poppins_400Regular',
//     fontSize: 16,
//     padding: 0,
//   },
//   results: {
//     flex: 1,
//     padding: 20,
//   },
//   emptyText: {
//     fontFamily: 'Poppins_400Regular',
//     fontSize: 14,
//     textAlign: 'center',
//     marginTop: 40,
//   },
// });



import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  FlatList,
  Animated,
  Keyboard,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/colors';
import { HugeiconsIcon } from '@hugeicons/react-native';
import { Search02Icon, CancelCircleIcon, UserIcon, Car01Icon } from '@hugeicons/core-free-icons';
import { supabase } from '@/src/services/supabase';
import { useAuthStore } from '@/src/store/useStore';
import { useMessagesStore } from '@/src/store/useMessagesStore';
import { router } from 'expo-router';

interface SearchResult {
  type: 'driver';
  id: string;
  driver_id: string;
  full_name: string;
  vehicle_details?: string;
  profile_photo?: string;
}

export default function SearchOverlay({ visible, onClose, isDark }: any) {
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const { startConversation } = useMessagesStore();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  const slideAnim = useRef(new Animated.Value(0)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 1,
          damping: 20,
          stiffness: 200,
          useNativeDriver: true,
        }),
        Animated.timing(backdropAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(backdropAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
      setQuery('');
      setResults([]);
      Keyboard.dismiss();
    }
  }, [visible]);

  const searchDrivers = async (text: string) => {
    setQuery(text);
    if (text.length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, driver_id, full_name, vehicle_details, profile_photo')
        .eq('role', 'driver')
        .ilike('driver_id', `%${text}%`)
        .limit(10);
      if (error) throw error;
      setResults((data || []) as SearchResult[]);
    } catch (e) {
      console.warn('Search error:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectDriver = async (driver: SearchResult) => {
    if (!user) return;
    onClose();
    // Start conversation with driver
    const conv = await startConversation(
      driver.id,
      user.id,
      {
        full_name: driver.full_name,
        driver_id: driver.driver_id,
        vehicle_details: driver.vehicle_details,
        profile_photo: driver.profile_photo,
        phone: null, // will be fetched from user record if needed
      },
      {
        full_name: user.full_name,
        phone: user.phone,
      }
    );
    if (conv) {
      // Navigate to messages tab (we need to switch tab)
      // Since we're in a nested navigator, we can use router.push to the messages screen
      router.push('/(main)/messages');
    }
  };

  const textColor = isDark ? Colors.textWhite : Colors.text;
  const subTextColor = isDark ? Colors.textSecondary : Colors.textTertiary;
  const cardBg = isDark ? Colors.primaryDarker : '#fff';
  const inputBg = isDark ? 'rgba(255,255,255,0.1)' : '#F4F6FA';

  if (!visible) return null;

  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View style={[styles.backdrop, { opacity: backdropAnim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      <Animated.View
        style={[
          styles.overlay,
          {
            backgroundColor: cardBg,
            paddingTop: insets.top + 12,
            transform: [
              {
                translateY: slideAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [300, 0],
                }),
              },
            ],
          },
        ]}
      >
        <View style={styles.searchHeader}>
          <View style={[styles.searchInputContainer, { backgroundColor: inputBg }]}>
            <HugeiconsIcon icon={Search02Icon} size={18} color={subTextColor} />
            <TextInput
              style={[styles.searchInput, { color: textColor }]}
              placeholder="Search driver ID..."
              placeholderTextColor={subTextColor}
              value={query}
              onChangeText={searchDrivers}
              autoFocus
              autoCapitalize="characters"
              returnKeyType="search"
            />
            {query.length > 0 && (
              <Pressable onPress={() => { setQuery(''); setResults([]); }}>
                <HugeiconsIcon icon={CancelCircleIcon} size={20} color={subTextColor} />
              </Pressable>
            )}
          </View>
          <Pressable onPress={onClose} style={styles.cancelBtn}>
            <Text style={{ color: Colors.primary, fontFamily: 'Poppins_500Medium' }}>Cancel</Text>
          </Pressable>
        </View>

        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.resultsList}
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [
                styles.resultItem,
                pressed && { backgroundColor: isDark ? '#2A2A2A' : '#F0F0F0' },
              ]}
              onPress={() => handleSelectDriver(item)}
            >
              <View style={[styles.avatarPlaceholder, { backgroundColor: Colors.primaryLight }]}>
                <HugeiconsIcon icon={UserIcon} size={20} color={Colors.primary} />
              </View>
              <View style={styles.resultInfo}>
                <Text style={[styles.driverName, { color: textColor }]}>{item.full_name}</Text>
                <Text style={[styles.driverId, { color: subTextColor }]}>{item.driver_id}</Text>
                {item.vehicle_details && (
                  <View style={styles.vehicleRow}>
                    <HugeiconsIcon icon={Car01Icon} size={12} color={subTextColor} />
                    <Text style={[styles.vehicleText, { color: subTextColor }]}>{item.vehicle_details}</Text>
                  </View>
                )}
              </View>
            </Pressable>
          )}
          ListEmptyComponent={
            query.length >= 2 && !loading ? (
              <View style={styles.emptyContainer}>
                <Text style={{ color: subTextColor }}>No drivers found</Text>
              </View>
            ) : null
          }
          ListFooterComponent={loading ? <ActivityIndicator style={{ marginTop: 20 }} color={Colors.primary} /> : null}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  searchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    fontFamily: 'Poppins_400Regular',
    fontSize: 16,
    marginLeft: 8,
    padding: 4,
  },
  cancelBtn: {
    paddingVertical: 8,
  },
  resultsList: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  avatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  resultInfo: {
    flex: 1,
  },
  driverName: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 16,
  },
  driverId: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 13,
    marginTop: 2,
  },
  vehicleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  vehicleText: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 12,
    marginLeft: 4,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 40,
  },
});