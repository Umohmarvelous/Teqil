// components/OnboardingCarousel.tsx
import React, { useRef, useState } from "react";
import { View, Text, StyleSheet, Dimensions, FlatList, Pressable } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Colors } from "@/constants/colors";

const { width } = Dimensions.get("window");

const slides = [
  {
    id: 1,
    title: "Earn Fuel Coins",
    description: "Drive and earn coins that you can use to buy fuel.",
    icon: "⛽",
  },
  {
    id: 2,
    title: "Share Rides",
    description: "Share your journey with passengers and split costs.",
    icon: "👥",
  },
  {
    id: 3,
    title: "Stay Safe",
    description: "Emergency contacts, SOS, and live tracking.",
    icon: "🛡️",
  },
];

export default function OnboardingCarousel({ onFinish }: { onFinish: () => void }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  const renderItem = ({ item }: { item: (typeof slides)[0] }) => (
    <View style={styles.slide}>
      <Text style={styles.icon}>{item.icon}</Text>
      <Text style={styles.title}>{item.title}</Text>
      <Text style={styles.description}>{item.description}</Text>
    </View>
  );

  const handleNext = () => {
    if (currentIndex < slides.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true });
      setCurrentIndex(currentIndex + 1);
    } else {
      onFinish();
    }
  };

  return (
    <View style={styles.container}>
      <FlatList
        ref={flatListRef}
        data={slides}
        renderItem={renderItem}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.id.toString()}
        onMomentumScrollEnd={(event) => {
          const index = Math.round(event.nativeEvent.contentOffset.x / width);
          setCurrentIndex(index);
        }}
      />
      <View style={styles.pagination}>
        {slides.map((_, i) => (
          <View key={i} style={[styles.dot, i === currentIndex && styles.activeDot]} />
        ))}
      </View>
      <Pressable style={styles.button} onPress={handleNext}>
        <LinearGradient
          colors={[Colors.primary, Colors.primaryDark]}
          style={styles.gradient}
        >
          <Text style={styles.buttonText}>
            {currentIndex === slides.length - 1 ? "Get Started" : "Next"}
          </Text>
        </LinearGradient>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0A0A0A" },
  slide: { width, paddingHorizontal: 40, alignItems: "center", justifyContent: "center", flex: 1 },
  icon: { fontSize: 80, marginBottom: 20 },
  title: { fontSize: 28, fontFamily: "Poppins_700Bold", color: "#fff", marginBottom: 10 },
  description: { fontSize: 16, fontFamily: "Poppins_400Regular", color: "#aaa", textAlign: "center", lineHeight: 24 },
  pagination: { flexDirection: "row", justifyContent: "center", marginBottom: 40 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#555", marginHorizontal: 5 },
  activeDot: { backgroundColor: Colors.primary, width: 20 },
  button: { marginHorizontal: 20, marginBottom: 40, borderRadius: 16, overflow: "hidden" },
  gradient: { paddingVertical: 16, alignItems: "center" },
  buttonText: { fontSize: 18, fontFamily: "Poppins_600SemiBold", color: "#fff" },
});