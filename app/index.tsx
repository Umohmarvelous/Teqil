// // import React, { useEffect } from "react";
// // import { View, ActivityIndicator, StyleSheet, Text } from "react-native";
// // import { router } from "expo-router";
// // import { useAuthStore } from "@/src/store/useStore";
// // import { Colors } from "@/constants/colors";
// // import { StatusBar } from "expo-status-bar";

// // export default function IndexScreen() {
// //   const { isAuthenticated, isLoading, user } = useAuthStore();

// //   useEffect(() => {
// //     // if (isLoading) return;

// //     if (!isAuthenticated) {
// //       // router.replace("/_sitemap");
// //       router.replace("/(app)");

// //       return;
// //     }

// //     if (!user) {
// //       // router.replace("/(auth)/welcome");
// //       router.replace("/(app)");
// //       return;
// //     }

// //     if (user.role === "driver") {
// //       if (!user.profile_complete) {
// //         router.replace("/(auth)/driver-profile");
// //       } else {
// //         router.replace("/(driver)");
// //       }
// //     } else if (user.role === "passenger") {
// //       router.replace("/(passenger)");
// //     } else if (user.role === "park_owner") {
// //       router.replace("/(park-owner)");
// //     } else {
// //       router.replace("/(auth)/welcome");
// //     }
// //   }, [isAuthenticated,
// //     // isLoading,
// //     user]);

// //   return (
// //     <View style={styles.container}>
// //       <StatusBar style="light" backgroundColor="red" animated />
// //       <ActivityIndicator size="large" color={Colors.borderLight} />
// //       <Text style={styles.text}>Loading... Please wait</Text>
// //     </View>
// //   );
// // }
// // // style={styles.photoImg}
// // const styles = StyleSheet.create({
// //   container: {
// //     flex: 1,
// //     backgroundColor: Colors.primary,
// //     alignItems: "center",
// //     justifyContent: "center",
// //     gap: 33
// //   },
// //   text: {
// //     color: '#fff'
// //   },

// // });







// import React, { useEffect, useState } from "react";
// import { View, ActivityIndicator, StyleSheet } from "react-native";
// import { router } from "expo-router";
// import AsyncStorage from "@react-native-async-storage/async-storage";
// import { useAuthStore } from "@/src/store/useStore";
// import { Colors } from "@/constants/colors";
// import OnboardingCarousel from "@/components/OnboardingCarousel";


// export default function IndexScreen() {
//   const { isAuthenticated, isLoading, user } = useAuthStore();
//   const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);

//   useEffect(() => {
//     const checkOnboarding = async () => {
//       const seen = await AsyncStorage.getItem("has_seen_onboarding");
//       setShowOnboarding(!seen);
//     };
//     checkOnboarding();
//   }, []);

//   useEffect(() => {
//     if (isLoading || showOnboarding === null) return;

//     if (!isAuthenticated) {
//       if (showOnboarding) {
//         // Show carousel first
//         setShowOnboarding(true);
//       } else {
//         router.replace("/_sitemap");
//       }
//     } else {
//       router.replace("/_sitemap");
//     }
//   }, [isAuthenticated, isLoading, showOnboarding]);

//   if (showOnboarding) {
//     return <OnboardingCarousel onFinish={() => {
//       AsyncStorage.setItem("has_seen_onboarding", "true");
//       setShowOnboarding(false);
//       router.replace("/(auth)/welcome");
//     }} />;
//   }

//   return (
//     <View style={styles.container}>
//       <ActivityIndicator size="large" color={Colors.primary} />
//     </View>
//   );
// }

// const styles = StyleSheet.create({
//   container: { flex: 1, backgroundColor: Colors.primary, alignItems: "center", justifyContent: "center" },
// });





import React from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { router } from "expo-router";
import { useAuthStore } from "@/src/store/useStore";
import { Colors } from "@/constants/colors";
import OnboardingCarousel from "@/components/OnboardingCarousel";

export default function IndexScreen() {
  const { isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!isAuthenticated) {
    // Show carousel for all unauthenticated users (every time they open the app)
    return (
      <OnboardingCarousel
        onFinish={() => {
          // After carousel, go to the role selection / welcome screen
          router.replace("/(auth)/welcome");
        }}
      />
    );
  } 

  // Authenticated users go directly to the unified dashboard
  router.replace("/(app)");
  return null; // prevent flashing
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
});