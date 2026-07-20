import FindDriverScreen from "@/app/(passenger)/find-driver";
import { Colors } from "@/constants/colors";
import { useSettingsStore } from "@/src/store/useSettingsStore";
import React, { useCallback, useRef, useEffect } from "react";
import {
  // View,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  Platform,
  Animated,
  Easing,
} from "react-native";


interface FindDriverProps {
  visible: boolean;
  onClose: () => void;

}

export default function FindDriverModal({
  visible,
  onClose,
}: FindDriverProps) {

  const { theme } = useSettingsStore();
  
  const isDark = theme === "dark";

  const bg = isDark ? Colors.text : Colors.border;
  // const textColor = isDark ? Colors.textWhite : Colors.text;



   const slideAnim = useRef(new Animated.Value(500)).current;
   const backdropAnim = useRef(new Animated.Value(0)).current;


  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          damping: 22,
          stiffness: 160,
          useNativeDriver: true,
        }),
        Animated.timing(backdropAnim, {
          toValue: 1,
          duration: 280,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 500,
          duration: 250,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(backdropAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]); // slideAnim/backdropAnim are stable refs

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      {/* Backdrop */}
      <Animated.View
        style={[
          rStyles.backdrop,
          { opacity: backdropAnim },
        ]}
        pointerEvents="auto"
      >
        <Pressable style={StyleSheet.absoluteFillObject} onPress={handleClose} />
      </Animated.View>

      {/* Sheet */}
      <Animated.View
        style={[
          rStyles.sheet,
          Platform.OS === "android" && rStyles.sheetAndroid,
          { transform: [{ translateY: slideAnim }] },
          {backgroundColor: bg}
        ]}
      >
        {/* Handle */}
        {/* <View style={[rStyles.handle, {backgroundColor: textColor}]} /> */}

        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={rStyles.scrollContent}
            >

            <FindDriverScreen/>
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}





const rStyles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.68)",
    zIndex: 1,
  },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 2,
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    paddingTop: 16,
    paddingHorizontal: 0,
    paddingBottom: Platform.OS === "ios" ? 44 : 28,
    maxHeight: "100%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 24,
  },
  sheetAndroid: {
    paddingBottom: 32,
  },
  handle: {
    width: 60,
    height: 5,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 10,
  },
  scrollContent: {
    paddingBottom: 8,
    gap: 16,
  },
  
});