import HomeTab from './home';
// import React, { useState } from "react";
import {
  Dimensions,
  View,
} from "react-native";
// import SwipeableSidebar from '@/components/SwipeSidebar';
import { Colors } from '@/constants/colors';
import { useSettingsStore } from '@/src/store/useSettingsStore';



const { width: SCREEN_WIDTH } = Dimensions.get("window");

export default function MainTab() {
  const { theme } = useSettingsStore();
  // const [sidebarOpen, setSidebarOpen] = useState(false);
  const isDark = theme === "dark";
  const topTabBg = isDark ? Colors.primaryDarker : Colors.textWhite;

  return (
    <>
      {/* <SwipeableSidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      > */}
        <View style={[{ flex: 1 }, { width: SCREEN_WIDTH }, { backgroundColor: topTabBg }]}>
            <HomeTab />
        </View>
      {/* </SwipeableSidebar> */}
    </>
  )
};