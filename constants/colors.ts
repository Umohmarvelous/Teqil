const PRIMARY = "#00A651";
const PRIMARY_DARK = "#007A3D";
const PRIMARY_LIGHT = "#E8F8EF";
const GOLD = "#F5A623";
const GOLD_LIGHT = "#FEF6E7";

export const Colors = {
  primary: PRIMARY,
  primaryDark: PRIMARY_DARK,
  primaryLight: PRIMARY_LIGHT,
  gold: GOLD,
  goldLight: GOLD_LIGHT,

  background: "#FAFAFA",
  surface: "#FFFFFF",
  surfaceSecondary: "#F5F5F5",

  text: "#1A1A1A",
  textSecondary: "#6B7280",
  textTertiary: "#9CA3AF",
  textInverse: "#FFFFFF",

  border: "#E5E7EB",
  borderLight: "#F3F4F6",

  success: "#00A651",
  warning: "#F5A623",
  error: "#EF4444",
  info: "#3B82F6",

  overlay: "rgba(0, 0, 0, 0.5)",
  overlayLight: "rgba(0, 0, 0, 0.15)",

  overlayColored: "rgb(14 1 12)",


  tabBar: "#FFFFFF",
  tabBarActive: PRIMARY,
  tabBarInactive: "#9CA3AF",
};

export default {
  light: {
    text: Colors.text,
    background: Colors.background,
    tint: Colors.primary,
    tabIconDefault: Colors.tabBarInactive,
    tabIconSelected: Colors.tabBarActive,
  },
};
