import React, { useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Alert,
  Dimensions,
  Animated,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useAuthStore } from "@/src/store/useStore";
import { useSettingsStore } from "@/src/store/useSettingsStore";
import Avatar from "@/components/Avatar";
import { Colors } from "@/constants/colors";
import { HugeiconsIcon } from "@hugeicons/react-native";
import {
  MoreHorizontalCircleIcon,
  Alert01Icon,
  Home01Icon,
  UserIcon,
  Message02Icon,
  Navigation01Icon,
  Settings01Icon,
  GiftIcon,
  HelpCircleIcon,
  Logout01Icon,
  ChevronRight,
  Plus,
  Contact,
  IdentityCardFreeIcons,
} from "@hugeicons/core-free-icons";

const SIDEBAR_WIDTH = 330;
const { height: SCREEN_HEIGHT } = Dimensions.get("window");

interface SidebarItem {
  id: string;
  icon: React.ComponentType<any>;
  label: string;
  badge?: number;
  onPress: () => void;
  danger?: boolean;
}

export default function SidedBar() {
  const { isAuthenticated, user, logout } = useAuthStore();
  const insets = useSafeAreaInsets();
  const { theme } = useSettingsStore();
  
  const [menuOpen, setMenuOpen] = useState(false);
  const menuAnim = useRef(new Animated.Value(0)).current;

  const toggleMenu = () => {
    const toValue = menuOpen ? 0 : 2;
    Animated.timing(menuAnim, {
      toValue,
      duration: 200,
      useNativeDriver: true,
    }).start(() => setMenuOpen(!menuOpen));
  };

  const handleLogout = () => {
    Alert.alert("Sign Out", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          const { signOut } = await import("@/src/services/supabase");
          await signOut();
          logout();
          router.replace("/(auth)/login");
        },
      },
    ]);
  };

  const navItems: SidebarItem[] = [
    { id: "home", icon: Home01Icon as any, label: "Home", onPress: () => router.push("/(main)") },
    { id: "profile", icon: UserIcon as any, label: "My Profile", onPress: () => router.push("/(main)/profile") },
    { id: "messages", icon: Message02Icon as any, label: "Messages", onPress: () => router.push("/(main)/messages") },
    {
      id: "trips",
      icon: Navigation01Icon as any,
      label: "Trip History",
      onPress: () => {
        const role = user?.role;
        if (role === "driver") router.push("/(driver)/history");
        else router.push("/(passenger)/history");
      },
    },
    { id: "settings", icon: Settings01Icon as any, label: "Settings", onPress: () => router.push("/(main)/settings") },
    { id: "referral", icon: GiftIcon as any, label: "Refer a Friend", onPress: () => Alert.alert("Refer", "Coming soon!") },
    { id: "help", icon: HelpCircleIcon as any, label: "Help Centre", onPress: () => Alert.alert("Help", "Support coming soon.") },
    { id: "logout", icon: Logout01Icon as any, label: "Sign Out", danger: true, onPress: handleLogout },
  ];

  const filteredNavItems = !isAuthenticated ? navItems.filter((i) => i.id !== "logout") : navItems;

  const isDark = theme === "dark";
  const textColor = isDark ? Colors.textWhite : Colors.text;
  const subTextColor = isDark ? Colors.textSecondary : Colors.textTertiary;
  const cardBg = isDark ? Colors.primaryDarker : "#FFFFFF";
  const bg = isDark ? Colors.background : Colors.border;

  return (
    <View style={[styles.drawerTop, { backgroundColor: bg, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.drawer}>
        <View style={[styles.drawerHeader, { backgroundColor: bg }]}>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Avatar name={user?.full_name || "User"} photoUri={user?.profile_photo} size={54} />
            <View style={{ flexDirection: "column", justifyContent: "flex-end" }}>
              <Text style={[styles.userName, { color: textColor }]}>{user?.full_name || "No user"}</Text>
              <View style={styles.roleContainer}>
                <HugeiconsIcon icon={IdentityCardFreeIcons} size={16} color={Colors.primary} />
                <Text style={[styles.userRole, { color: Colors.primary }]}>
                  {user?.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : "no role"}
                </Text>
              </View>
            </View>
          </View>
          
          <View style={styles.drawerRightIcon}>
            <Pressable onPress={toggleMenu} style={styles.menuList}>
              <HugeiconsIcon icon={MoreHorizontalCircleIcon} fill={'black'} size={27} color={textColor} />
            </Pressable>

            {menuOpen && (
              <Animated.View style={[styles.dropdown, { opacity: menuAnim, backgroundColor: cardBg}]}>
                <Pressable style={styles.dropdownItem} onPress={() => { toggleMenu(); router.push("/(auth)/register"); }}>
                  <HugeiconsIcon icon={Plus} size={25} color={textColor} />

                  <Text style={[{fontSize: 15, fontWeight:'500'}, { color: textColor }]}>Create New Account</Text>
                </Pressable>
                <Pressable style={styles.dropdownItem} onPress={() => { toggleMenu(); router.push("/(auth)/login"); }}>
                  <HugeiconsIcon icon={Contact} size={24} color={textColor} />

                  <Text style={[{fontSize: 15, fontWeight:'500'}, { color: textColor }]}>Add an Existing Account Account</Text>
                </Pressable>
              </Animated.View>
            )}
          </View>
        </View>

        {/* <View style={{marginHorizontal: 12, width: 290, height: 0, borderWidth: .4, borderColor: subTextColor}} /> */}

        <ScrollView style={{ flex: 1 }}>
          {isAuthenticated ? (
            <View style={[styles.navList, styles.navListcontainer]}>
              {filteredNavItems.map((item) => (
                <Pressable key={item.id} style={styles.navItem} onPress={() => { Haptics.impactAsync(); item.onPress(); }}>
                  <View style={styles.navIconBox}>
                    <HugeiconsIcon icon={item.icon as any} size={18} color={item.danger ? "#EF4444" : textColor} />
                  </View>
                  <Text style={[styles.navLabel, { color: item.danger ? "#EF4444" : textColor }]}>{item.label}</Text>
                  {!item.danger && <HugeiconsIcon icon={ChevronRight} size={14} color={subTextColor} />}
                </Pressable>
              ))}
            </View>
          ) : (
            <Pressable style={styles.signInContainer} onPress={() => router.push("/(auth)/login")}>
              <HugeiconsIcon icon={Alert01Icon} size={45} color={Colors.gold} />
              <Text style={[styles.signInText, { color: subTextColor }]}>You are not Signed In !!</Text>
              <Text style={[styles.signInsubText, { color: Colors.gold }]}>Sign In</Text>
            </Pressable>
          )}
        </ScrollView>
      </View>
      <Text style={[styles.version, { color: subTextColor }]}>Teqil v1.0.0</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  drawerTop: { position: "absolute", top: 0, bottom: 0, left: 0, height: SCREEN_HEIGHT, width: SIDEBAR_WIDTH, zIndex: 2 },
  drawer: { flex: 1 },
  drawerHeader: { paddingHorizontal: 20, paddingVertical: 50, flexDirection: "row", justifyContent: "space-between", zIndex: 10, borderBottomWidth: 1, borderBottomColor: "#6B6B6B3B" },
  dropdown: { position: "absolute", top: 40, right: 0, width: 260, borderRadius: 30, padding: 20, shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 5, elevation: 5 },
  dropdownItem: { paddingVertical: 15, flexDirection: 'row', gap: 15, alignItems: 'center', justifyContent: 'flex-start' },
  roleContainer: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4
  },
  userName: { fontFamily: "Poppins_700Bold", fontSize: 19 },
  userRole: { fontFamily: "Poppins_400Regular", fontSize: 13, },
  drawerRightIcon: { justifyContent: "center" },
  menuList: { padding: 5 },
  navListcontainer: { borderRadius: 30, padding: 10 },
  navList: { paddingHorizontal: 10 },
  navItem: { flexDirection: "row", alignItems: "center", borderRadius: 14, paddingHorizontal: 12, paddingVertical: 12, gap: 12, marginRight: 20 },
  navIconBox: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  navLabel: { flex: 1, fontFamily: "Poppins_500Medium", fontSize: 14 },
  version: { textAlign: "center", padding: 30, fontSize: 11 },
  signInContainer: { alignItems: "center", borderWidth: 1, borderColor: Colors.gold, borderRadius: 30, marginTop: 90, marginHorizontal: 20, paddingVertical: 60, flex: 1 },
  signInText: { fontFamily: "Poppins_600Semi", fontSize: 18, marginTop: 15, marginBottom: 15 },
  signInsubText: { fontFamily: "Poppins_600SemiBold", fontSize: 16 },
});

