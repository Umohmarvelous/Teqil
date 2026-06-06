import HomeTab from './home';
import {
  Dimensions,
  View,
} from "react-native";
import { Colors } from '@/constants/colors';
import { useSettingsStore } from '@/src/store/useSettingsStore';



const { width: SCREEN_WIDTH } = Dimensions.get("window");

export default function MainTab() {
  const { theme } = useSettingsStore();
  const isDark = theme === "dark";
  const topTabBg = isDark ? Colors.primaryDarker : Colors.textWhite;

  return (
    <>
        <View style={[{ flex: 1 }, { width: SCREEN_WIDTH }, { backgroundColor: topTabBg }]}>
            <HomeTab />
        </View>
    </>
  )
};