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
  Image,
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
  SearchIcon,
} from "@hugeicons/core-free-icons";
import FindDriverModal from "./FindDriverModal";

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

  const [finderVisible, setFinderVisible] = useState(false);


  const toggleMenu = () => {
    const toValue = menuOpen ? 0 : 2;
    Animated.timing(menuAnim, {
      toValue,
      duration: 200,
      useNativeDriver: true,
    }).start(() => setMenuOpen(!menuOpen));
  };

  const toggleSearch = () => {
    setFinderVisible(true)
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
  const borderColor = isDark ? "rgba(255,255,255,0.08)" : "#E8ECF0";


  return (
    <View style={[styles.drawerTop, styles.containerTop, { backgroundColor: bg, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.drawer}>
        
        {/* <View style={{marginHorizontal: 12, width: 290, height: 0, borderWidth: .4, borderColor: subTextColor}} /> */}
        <View>
          <Image
            source={
              isDark
                ? require("@/assets/images/Logo_with_transparent_background.png") // Ensure this is the white version
                : require("@/assets/images/Black_logo_with_white_background.png") // Ensure this is the black version
            }
            style={styles.photoImg}
            resizeMode="cover" // Changed to contain to avoid cropping
            width={120}
          />
        </View>

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
              <Pressable style={[styles.signInContainer, {backgroundColor: cardBg, borderColor }]} onPress={() => router.push("/(auth)/login")}>
                <HugeiconsIcon icon={Alert01Icon} size={45} color={Colors.gold} />
                <Text style={[styles.signInText, { color: subTextColor }]}>You are not Signed In !!</Text>
                <Text style={[styles.signInsubText, { color: Colors.gold }]}>Sign In</Text>
              </Pressable>
            )}
        </ScrollView>
      </View>

      {/* <Text style={[styles.version, { color: subTextColor }]}>Teqil v1.0.0</Text> */}

      <View style={[styles.drawerHeader, { backgroundColor: bg }]}>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Avatar name={user?.full_name || "User"} photoUri={user?.profile_photo} size={54} />
            <View style={{ flexDirection: "column", justifyContent: "flex-start" }}>
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
              <HugeiconsIcon icon={MoreHorizontalCircleIcon} fill={textColor} size={25} color={textColor} />
            </Pressable>
            
            <Pressable onPress={toggleSearch} style={[styles.searchList, {backgroundColor: isDark ? Colors.overlayLight : Colors.border, borderColor}]}>
              <HugeiconsIcon icon={SearchIcon} size={22} color={textColor} />
            </Pressable>
            
            {menuOpen && (
              <Animated.View style={[styles.dropdown, { opacity: menuAnim, backgroundColor: cardBg}]}>
                <Pressable style={styles.dropdownItem} onPress={() => { toggleMenu(); router.push("/(auth)/register"); }}>
                  <HugeiconsIcon icon={Plus} size={25} color={textColor} />

                  <Text style={[{fontSize: 15, fontWeight:'500'}, { color: textColor }]}>Create New Account</Text>
              </Pressable>
              <View style= {{height: .2, width: 'auto', borderColor: Colors.overlay, borderWidth: .3, marginVertical: 10}} />
                <Pressable style={styles.dropdownItem} onPress={() => { toggleMenu(); router.push("/(auth)/login"); }}>
                  <HugeiconsIcon icon={Contact} size={24} color={textColor} />

                  <Text style={[{fontSize: 15, fontWeight:'500'}, { color: textColor }]}>Add an Existing Account Account</Text>
                </Pressable>
              </Animated.View>
            )}
          </View>
      </View>
      <Text style={[styles.version, { color: subTextColor }]}>Teqil v1.0.0</Text>

      <FindDriverModal
        visible={finderVisible}
        onClose={() => setFinderVisible(false)}
        // onClose={handleFindDriverClose}
      />
    </View>
  );
}

const styles = StyleSheet.create({

  drawerTop: { position: "absolute", top: 0, bottom: 0, left: 0, height: SCREEN_HEIGHT, width: SIDEBAR_WIDTH, zIndex: 2, },
  containerTop: { flex: 1, flexDirection: 'column', justifyContent: 'space-between' },
  drawer: { flex: 1 , flexDirection: 'column' },
  drawerHeader: { paddingHorizontal: 20, paddingVertical: 30, paddingBottom: 20, flexDirection: "row", justifyContent: "space-between", zIndex: 10, borderTopWidth: 1, borderTopColor: "#6B6B6B3B" },
  dropdown: { position: "absolute", bottom: 65, right: 0, width: 260, borderRadius: 30, padding: 20, shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 5, elevation: 5 },
  dropdownItem: {
    paddingVertical: 15, flexDirection: 'row', gap: 15, alignItems: 'center', justifyContent: 'flex-start'
  },
  roleContainer: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4
  },
  userName: { fontFamily: "Poppins_700Bold", fontSize: 19 },
  userRole: { fontFamily: "Poppins_400Regular", fontSize: 13, },
  drawerRightIcon: { justifyContent: "space-between", alignItems:'flex-start', flexDirection: 'row', gap: 16 },
  menuList: { alignItems: 'center', },
  searchList: {
    borderRadius: 30,
    padding: 6, 
    alignItems: 'center', 
    justifyContent:'center',
    borderWidth: 1,
  },
  logoBtn: {
    width: 25,
    height: 25,
  },
  photoImg: { width: 50, height: 50, alignSelf: "center", marginTop: 20 },
  navListcontainer: { borderRadius: 30, padding: 10, },
  navList: { paddingHorizontal: 10, marginVertical: 20, },
  navItem: { flexDirection: "row", alignItems: "center", borderRadius: 14, paddingHorizontal: 12, paddingVertical: 12, gap: 12, marginRight: 20 },
  navIconBox: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  navLabel: { flex: 1, fontFamily: "Poppins_500Medium", fontSize: 14 },
  signInContainer: {
    alignItems: "center", 
    // borderRadius: 30, 
    marginTop: 100, 
    marginHorizontal: 10, 
    paddingVertical: 60, 
    borderWidth: 1, 
  },
  signInText: { fontFamily: "Poppins_600Semi", fontSize: 18, marginVertical: 15 },
  signInsubText: { fontFamily: "Poppins_600SemiBold", fontSize: 16 },
  version: { textAlign: "center", padding: 30, paddingVertical: 12, fontSize: 11 },
});

