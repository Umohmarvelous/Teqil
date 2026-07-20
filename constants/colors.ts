const PRIMARY = "#009A43";
// 00A651
const PRIMARY_DARK = "#023A1E";
const PRIMARY_DARKER = "#16221E";
const PRIMARY_LIGHT = "#B9F0D4";

const GOLD = "#F5A623";
const GOLD_LIGHT = "#FEF6E7";

export const Colors = {
  primary: PRIMARY,
  primaryDark: PRIMARY_DARK,
  primaryDarker: PRIMARY_DARKER,
  primaryLight: PRIMARY_LIGHT,
  gold: GOLD,
  goldLight: GOLD_LIGHT,

  background:  "#070707",
  // background:  "#151515",
  surface: "#FFFFFF",
  surfaceSecondary: "#F5F5F5",

  text: "#1A1A1A",
  textWhite: "#FFFFFF",
  textSecondary: "#555D59",
  textTertiary: "#9CA3AF",
  textInverse: "#FFFFFF",

  // border: "#E5E7EB",
  border: "#F5F5F5",
  borderLight: "#FFFFFF",

  success: "#00A651",
  warning: "#F5A623",
  error: "firebrick",
  info: "#3B82F6",

  overlay: "rgba(0, 0, 0, 0.3)",
  // overlayLight: "#00000026",
  overlayLight: "#B9B8B826",

  overlayColored: "#202020",


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
