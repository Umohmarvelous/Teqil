// // components/ActionTile.tsx
// import React, { useRef } from "react";
// import { View, Text, StyleSheet, Pressable, Animated } from "react-native";
// import { HugeiconsIcon } from "@hugeicons/react-native";


// export default function ActionTile({
//   icon,
//   label,
//   color,
//   onPress,
// }: {
//   icon: any;
//   label: string;
//   color: string;
//   onPress?: () => void;
//   }) {

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
//           <HugeiconsIcon icon={icon} size={20} color={color} />
//         </View>
//         <Text style={[styles.actionLabel, { color: color }]}>{label}</Text>
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
//     width: 55,
//     height: 55,
//     borderRadius: 56,
//     alignItems: "center",
//     justifyContent: "center",
//   },
//   actionLabel: {
//     fontFamily: "Poppins_500Medium",
//     fontSize: 11,
//     textAlign: "center",
//     lineHeight: 16,
//   },
// });





import React, { useRef } from "react";
import { View, Text, StyleSheet, Pressable, Animated,Dimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";

const { width: W } = Dimensions.get("window");

interface ActionTileProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
  onPress: () => void;
}

export default function ActionTile({ icon, label, color, onPress }: ActionTileProps) {
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
          <Ionicons name={icon} size={26} color={color} />
        </View>
        <Text style={[styles.actionLabel, { color: color }]}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  actionTile: {
    // width: (W - 32 - 36 - 24) / 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionTileInner: {
    alignItems: "center",
    gap: 0
  },
  actionIconWrap: {
    width: 55,
    height: 55,
    borderRadius: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: {
    fontFamily: "Poppins_500Medium",
    fontSize: 11,
    textAlign: "center",
    lineHeight: 16,
  },
});