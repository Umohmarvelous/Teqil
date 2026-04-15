// import React, { useState, useCallback, useRef } from "react";
// import {
//   View,
//   Text,
//   StyleSheet,
//   TextInput,
//   Pressable,
//   FlatList,
//   Animated,
// } from "react-native";
// import { Ionicons } from "@expo/vector-icons";
// import * as Haptics from "expo-haptics";
// import { TripsStorage } from "@/src/services/storage";
// import { Colors } from "@/constants/colors";
// import { HugeiconsIcon } from "@hugeicons/react-native";
// import { CancelCircleIcon, Card, Search02Icon } from "@hugeicons/core-free-icons";

// interface SearchResult {
//   type: "trip" | "driver";
//   id: string;
//   title: string;
//   subtitle: string;
//   code?: string;
// }

// interface SearchBarProps {
//   isDark?: boolean;
//   onSelect?: (result: SearchResult) => void;
// }

// export default function SearchBar({ isDark = false, onSelect }: SearchBarProps) {
//   const [query, setQuery] = useState("");
//   const [results, setResults] = useState<SearchResult[]>([]);
//   const [focused, setFocused] = useState(false);
//   const dropdownHeight = useRef(new Animated.Value(0)).current;
//   const inputRef = useRef<TextInput>(null);

//   const placeholderColor = isDark ? Colors.background : Colors.textSecondary;
//   const dropdownBg = isDark ? "#161B22" : "#A2A1A14C";
//   const bg = isDark ? Colors.background : Colors.border;
//   const textColor = isDark ? Colors.textWhite : Colors.text;

//   const borderColor = isDark ? "rgba(255,255,255,0.08)" : "#E8ECF0";

//   const search = useCallback(async (text: string) => {
//     setQuery(text);
//     if (!text.trim() || text.length < 2) {
//       setResults([]);
//       Animated.timing(dropdownHeight, { toValue: 0, duration: 150, useNativeDriver: false }).start();
//       return;
//     }

//     const allTrips = await TripsStorage.getAll();
//     const q = text.toUpperCase();

//     const tripResults: SearchResult[] = allTrips
//       .filter(
//         (t) =>
//           t.trip_code.includes(q) ||
//           t.origin.toUpperCase().includes(q) ||
//           t.destination.toUpperCase().includes(q)
//       )
//       .slice(0, 5)
//       .map((t) => ({
//         type: "trip" as const,
//         id: t.id,
//         title: t.trip_code,
//         subtitle: `${t.origin} → ${t.destination}`,
//         code: t.trip_code,
//       }));

//     setResults(tripResults);
//     const targetHeight = Math.min(tripResults.length * 64, 240);
//     Animated.timing(dropdownHeight, {
//       toValue: targetHeight,
//       duration: 200,
//       useNativeDriver: false,
//     }).start();
//   }, []);

//   const handleSelect = (item: SearchResult) => {
//     Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
//     setQuery(item.title);
//     setResults([]);
//     setFocused(false);
//     inputRef.current?.blur();
//     Animated.timing(dropdownHeight, { toValue: 0, duration: 150, useNativeDriver: false }).start();
//     onSelect?.(item);
//   };

//   const handleClear = () => {
//     setQuery("");
//     setResults([]);
//     Animated.timing(dropdownHeight, { toValue: 0, duration: 150, useNativeDriver: false }).start();
//   };

//   return (
//     <View style={styles.wrapper}>
//       <HugeiconsIcon icon={Search02Icon} size={20} color={isDark ? '#fff' : '#7E7E7E'} />

//       <View
//         style={[
//           styles.container,
//           { backgroundColor: dropdownBg },
//         ]}
//       >
//         <TextInput
//           ref={inputRef}
//           style={[styles.input, { color: textColor },]}
//           placeholder="Search driver ID or trip code..."
//           placeholderTextColor={textColor}
//           value={query}
//           onChangeText={search}
//           onFocus={() => setFocused(true)}
//           onBlur={() => {
//             setFocused(false);
//             if (!results.length) {
//               Animated.timing(dropdownHeight, { toValue: 0, duration: 150, useNativeDriver: false }).start();
//             }
//           }}
//           autoCorrect={false}
//           returnKeyType="search"
//         />
//         {query.length > 0 && (
//           <Pressable onPress={handleClear} hitSlop={8}>
//             <HugeiconsIcon icon={CancelCircleIcon} size={22} color={ textColor } />
//           </Pressable>
//         )}
//       </View>

//       {/* Dropdown */}
//       <Animated.View
//         style={[
//           styles.dropdown,
//           {
//             height: dropdownHeight,
//             backgroundColor: dropdownBg,
//             borderColor,
//           },
//         ]}
//       >
//         <FlatList
//           data={results}
//           keyExtractor={(item) => item.id}
//           scrollEnabled={false}
//           renderItem={({ item }) => (
//             <Pressable
//               style={({ pressed }) => [
//                 styles.resultItem,
//                 pressed && { backgroundColor: Colors.primaryLight + "30" },
//               ]}
//               onPress={() => handleSelect(item)}
//             >
//               <View
//                 style={[
//                   styles.resultIconBox,
//                   {
//                     backgroundColor:
//                       item.type === "trip"
//                         ? Colors.primaryLight
//                         : Colors.gold,
//                   },
//                 ]}
//               >
//                 <Ionicons
//                   name={item.type === "trip" ? "navigate-outline" : "person-outline"}
//                   size={15}
//                   color={item.type === "trip" ? Colors.primary : "#3B82F6"}
//                 />
//               </View>
//               <View style={styles.resultText}>
//                 <Text style={[styles.resultTitle, { color: textColor }]}>
//                   {item.title}
//                 </Text>
//                 <Text style={[styles.resultSub, { color: placeholderColor }]} numberOfLines={1}>
//                   {item.subtitle}
//                 </Text>
//               </View>
//               <View
//                 style={[
//                   styles.resultBadge,
//                   {
//                     backgroundColor:
//                       item.type === "trip"
//                         ? Colors.primaryLight
//                         : "rgba(59,130,246,0.12)",
//                   },
//                 ]}
//               >
//                 <Text
//                   style={[
//                     styles.resultBadgeText,
//                     { color: item.type === "trip" ? Colors.primary : "#3B82F6" },
//                   ]}
//                 >
//                   {item.type === "trip" ? "TRIP" : "DRIVER"}
//                 </Text>
//               </View>
//             </Pressable>
//           )}
//           ListEmptyComponent={
//             query.length >= 2 ? (
//               <View style={styles.noResults}>
//                 <Text style={{ color: placeholderColor, fontFamily: "Poppins_400Regular", fontSize: 13 }}>
//                   No results for {query}
//                 </Text>
//               </View>
//             ) : null
//           }
//         />
//       </Animated.View>
//     </View>
//   );
// }

// const styles = StyleSheet.create({
//   wrapper: {
//     position: "relative",
//     flexDirection: 'row',
//     alignItems: 'center',
//     justifyContent: 'center',
//     gap: 10,
//     flex: 1,
//     paddingHorizontal: 20,

//   },
//   container: {
//     flexDirection: "row",
//     alignItems: "center",
//     borderRadius: 66,
//     paddingHorizontal: 14,
//   },
//   input: {
//     flex: 1,
//     fontFamily: "Poppins_400Regular",
//     fontSize: 14,
//     padding: 10,
//     paddingVertical: 10,
//   },
//   dropdown: {
//     position: "absolute",
//     top: "100%",
//     left: 0,
//     right: 0,
//     marginTop: 4,
//     borderRadius: 26,
//     overflow: "hidden",
//     shadowColor: "#000",
//     shadowOffset: { width: 0, height: 8 },
//     shadowOpacity: 0.12,
//     shadowRadius: 16,
//     elevation: 12,
//     zIndex: 200,
//   },
//   resultItem: {
//     flexDirection: "row",
//     alignItems: "center",
//     paddingHorizontal: 14,
//     paddingVertical: 12,
//     gap: 10,
//   },
//   resultIconBox: {
//     width: 34,
//     height: 34,
//     borderRadius: 10,
//     alignItems: "center",
//     justifyContent: "center",
//   },
//   resultText: { flex: 1 },
//   resultTitle: {
//     fontFamily: "Poppins_600SemiBold",
//     fontSize: 14,
//     letterSpacing: 0.5,
//   },
//   resultSub: {
//     fontFamily: "Poppins_400Regular",
//     fontSize: 12,
//     marginTop: 1,
//   },
//   resultBadge: {
//     borderRadius: 8,
//     paddingHorizontal: 8,
//     paddingVertical: 3,
//   },
//   resultBadgeText: {
//     fontFamily: "Poppins_700Bold",
//     fontSize: 9,
//     letterSpacing: 1,
//   },
//   noResults: {
//     paddingHorizontal: 16,
//     paddingVertical: 14,
//     alignItems: "center",
//   },
// });




// components/SearchBar.tsx
import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  FlatList,
  Animated,
} from "react-native";
import * as Haptics from "expo-haptics";
import { TripsStorage } from "@/src/services/storage";
import { Colors } from "@/constants/colors";
import { HugeiconsIcon } from "@hugeicons/react-native";
import {
  CancelCircleIcon,
  Search02Icon,
  Navigation01Icon,
  UserIcon,
} from "@hugeicons/core-free-icons";

interface SearchResult {
  type: "trip" | "driver";
  id: string;
  title: string;
  subtitle: string;
  code?: string;
}

interface SearchBarProps {
  isDark?: boolean;
  onSelect?: (result: SearchResult) => void;
}

export default function SearchBar({ isDark = false, onSelect }: SearchBarProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [focused, setFocused] = useState(false);
  const dropdownHeight = useRef(new Animated.Value(0)).current;
  const inputRef = useRef<TextInput>(null);

  const placeholderColor = isDark ? Colors.background : Colors.textSecondary;
  const dropdownBg = isDark ? "#161B22" : "#FFFFFF";
  const textColor = isDark ? Colors.textWhite : Colors.text;
  const borderColor = isDark ? "rgba(255,255,255,0.08)" : "#E8ECF0";

  const search = useCallback(async (text: string) => {
    setQuery(text);
    if (!text.trim() || text.length < 2) {
      setResults([]);
      Animated.timing(dropdownHeight, { toValue: 0, duration: 150, useNativeDriver: false }).start();
      return;
    }

    const q = text.toUpperCase();
    const allTrips = await TripsStorage.getAll();

    // Search trips
    const tripResults: SearchResult[] = allTrips
      .filter(
        (t) =>
          t.trip_code.includes(q) ||
          t.origin.toUpperCase().includes(q) ||
          t.destination.toUpperCase().includes(q)
      )
      .slice(0, 5)
      .map((t) => ({
        type: "trip" as const,
        id: t.id,
        title: t.trip_code,
        subtitle: `${t.origin} → ${t.destination}`,
        code: t.trip_code,
      }));

    // Search drivers (unique driver IDs from trips)
    const driverMap = new Map<string, string>();
    allTrips.forEach((t) => {
      if (t.driver_id && t.driver_id.includes(q)) {
        driverMap.set(t.driver_id, t.driver_id);
      }
    });
    const driverResults: SearchResult[] = Array.from(driverMap.values())
      .slice(0, 3)
      .map((driverId) => ({
        type: "driver",
        id: driverId,
        title: driverId,
        subtitle: "Driver",
      }));

    const combined = [...tripResults, ...driverResults];
    setResults(combined);

    const targetHeight = Math.min(combined.length * 64, 240);
    Animated.timing(dropdownHeight, {
      toValue: targetHeight,
      duration: 200,
      useNativeDriver: false,
    }).start();
  }, []);

  const handleSelect = (item: SearchResult) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setQuery(item.title);
    setResults([]);
    setFocused(false);
    inputRef.current?.blur();
    Animated.timing(dropdownHeight, { toValue: 0, duration: 150, useNativeDriver: false }).start();
    onSelect?.(item);
  };

  const handleClear = () => {
    setQuery("");
    setResults([]);
    Animated.timing(dropdownHeight, { toValue: 0, duration: 150, useNativeDriver: false }).start();
  };

  return (
    <View style={styles.wrapper}>
      <HugeiconsIcon icon={Search02Icon} size={20} color={isDark ? "#fff" : "#7E7E7E"} />
      <View style={[styles.container, { backgroundColor: dropdownBg }]}>
        <TextInput
          ref={inputRef}
          style={[styles.input, { color: textColor }]}
          placeholder="Search driver ID or trip code..."
          placeholderTextColor={placeholderColor}
          value={query}
          onChangeText={search}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            if (!results.length) {
              Animated.timing(dropdownHeight, { toValue: 0, duration: 150, useNativeDriver: false }).start();
            }
          }}
          autoCorrect={false}
          returnKeyType="search"
        />
        {query.length > 0 && (
          <Pressable onPress={handleClear} hitSlop={8}>
            <HugeiconsIcon icon={CancelCircleIcon} size={22} color={textColor} />
          </Pressable>
        )}
      </View>

      {/* Dropdown */}
      <Animated.View
        style={[
          styles.dropdown,
          {
            height: dropdownHeight,
            backgroundColor: dropdownBg,
            borderColor,
          },
        ]}
      >
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          scrollEnabled={false}
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [
                styles.resultItem,
                pressed && { backgroundColor: Colors.primaryLight + "30" },
              ]}
              onPress={() => handleSelect(item)}
            >
              <View
                style={[
                  styles.resultIconBox,
                  {
                    backgroundColor:
                      item.type === "trip"
                        ? Colors.primaryLight
                        : Colors.goldLight,
                  },
                ]}
              >
                <HugeiconsIcon
                  icon={item.type === "trip" ? Navigation01Icon : UserIcon}
                  size={15}
                  color={item.type === "trip" ? Colors.primary : Colors.gold}
                />
              </View>
              <View style={styles.resultText}>
                <Text style={[styles.resultTitle, { color: textColor }]}>
                  {item.title}
                </Text>
                <Text style={[styles.resultSub, { color: placeholderColor }]} numberOfLines={1}>
                  {item.subtitle}
                </Text>
              </View>
              <View
                style={[
                  styles.resultBadge,
                  {
                    backgroundColor:
                      item.type === "trip"
                        ? Colors.primaryLight
                        : Colors.goldLight,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.resultBadgeText,
                    { color: item.type === "trip" ? Colors.primary : Colors.gold },
                  ]}
                >
                  {item.type === "trip" ? "TRIP" : "DRIVER"}
                </Text>
              </View>
            </Pressable>
          )}
          ListEmptyComponent={
            query.length >= 2 ? (
              <View style={styles.noResults}>
                <Text style={{ color: placeholderColor, fontFamily: "Poppins_400Regular", fontSize: 13 }}>
                  No results for {query}
                </Text>
              </View>
            ) : null
          }
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    flex: 1,
    paddingHorizontal: 20,
  },
  container: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 66,
    paddingHorizontal: 14,
  },
  input: {
    flex: 1,
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    padding: 10,
    paddingVertical: 10,
  },
  dropdown: {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    marginTop: 4,
    borderRadius: 26,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 12,
    zIndex: 200,
  },
  resultItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  resultIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  resultText: { flex: 1 },
  resultTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    letterSpacing: 0.5,
  },
  resultSub: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    marginTop: 1,
  },
  resultBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  resultBadgeText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 9,
    letterSpacing: 1,
  },
  noResults: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: "center",
  },
});