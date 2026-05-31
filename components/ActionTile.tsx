// import React, { useRef } from "react";
// import { View, Text, StyleSheet, Pressable, Animated } from "react-native";
// import { Ionicons } from "@expo/vector-icons";


// interface ActionTileProps {
//   icon: keyof typeof Ionicons.glyphMap;
//   label: string;
//   color: string;
//   onPress: () => void;
// }

// export default function ActionTile({ icon, label, color, onPress }: ActionTileProps) {
//   const scale = useRef(new Animated.Value(1)).current;

//   const animateIn = () => {
//     Animated.spring(scale, {
//       toValue: 0.92,
//       damping: 12,
//       stiffness: 200,
//       useNativeDriver: true,
//     }).start();
//   };

//   const animateOut = () => {
//     Animated.spring(scale, {
//       toValue: 1,
//       damping: 10,
//       stiffness: 180,
//       useNativeDriver: true,
//     }).start();
//   };

//   return (
//     <Animated.View style={styles.actionTile}>
//       <Pressable
//         onPress={onPress}
//         onPressIn={animateIn}
//         onPressOut={animateOut}
//         style={styles.actionTileInner}
//       >
//         <View style={[styles.actionIconWrap]}>
//           <Ionicons name={icon} size={25} color={color} />
//           <Text style={[styles.actionLabel, { color: color }]}>{label}</Text>
//         </View>
//       </Pressable>
//     </Animated.View>
//   );
// }

// const styles = StyleSheet.create({
//   actionTile: {
//     // width: (W - 32 - 36 - 24) / 3,
//     alignItems: 'center',
//     justifyContent: 'center',
//   },
//   actionTileInner: {
//     alignItems: "center",
//     gap: 0
//   },
//   actionIconWrap: {
//     width: 60,
//     height: 60,
//     // padding: 6,
//     gap: 5,
//     borderRadius: 56,
//     alignItems: "center",
//     justifyContent: "center",
//   },
//   actionLabel: {
//     fontFamily: "Poppins_500Medium",
//     fontSize: 10,
//     textAlign: "center",
//     color: "#000",
//     // lineHeight: 10,
//   },
// });



// components/ActionTile.tsx
import React, { useRef } from "react";
import { View, Text, StyleSheet, Pressable, Animated } from "react-native";
import { HugeiconsIcon } from "@hugeicons/react-native";
import { Colors } from "@/constants/colors";
import { useSettingsStore } from "@/src/store/useSettingsStore";

// We'll pass the icon component directly instead of name string
interface ActionTileProps {
  icon: React.ComponentType<any>; // Hugeicons icon component
  label: string;
  color: string;
  onPress: () => void;
}

export default function ActionTile({ icon: IconComponent, label, color, onPress }: ActionTileProps) {
  const { theme } = useSettingsStore();

  const isDark = theme === "dark";
  const ActionTileIcon = isDark ? Colors.primaryDarker : Colors.overlayLight;

  const scale = useRef(new Animated.Value(1)).current;

  const animateIn = () => {
    Animated.spring(scale, {
      toValue: 0.92,
      damping: 12,
      stiffness: 200,
      useNativeDriver: true,
    }).start();
  };

  const animateOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      damping: 10,
      stiffness: 180,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Animated.View style={styles.actionTile}>
      <Pressable
        onPress={onPress}
        onPressIn={animateIn}
        onPressOut={animateOut}
        style={styles.actionTileInner}
      >
        <View style={[styles.actionIconWrap]}>
          <View style={{ backgroundColor: ActionTileIcon, padding: 12, borderRadius: 50, opacity:isDark ? .8 : 1  }} >
            <HugeiconsIcon icon={IconComponent as any} fill={color} fillOpacity={.1} size={24} color={color}/>
          </View>
          <Text style={[styles.actionLabel, { color }]}>{label}</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  actionTile: {
    alignItems: "center",
    justifyContent: "center",
  },
  actionTileInner: {
    alignItems: "center",
    gap: 0,
  },
  actionIconWrap: {
    width: 60,
    height: 60,
    gap: 5,
    borderRadius: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: {
    fontFamily: "Poppins_500Medium",
    fontSize: 10,
    textAlign: "center",
  },
});