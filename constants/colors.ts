const PRIMARY = "#009A43";
// 00A651
const PRIMARY_DARK = "#023A1E";
const PRIMARY_LIGHT = "#B9F0D4";
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
  error: "#EF4464",
  info: "#3B82F6",

  overlay: "rgba(0, 0, 0, 0.5)",
  overlayLight: "#00000026",

  overlayColored: "rgb(14 1 12)",


  tabBar: "#FFFFFF",
  tabBarActive: PRIMARY,
  tabBarInactive: "#C6CEDC",
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
