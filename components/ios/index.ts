// components/ios/index.ts
//
// iOS-native-feel component kit.
//
//   import { IOSButton, IOSSheet, IOSAlert, IOSMenu } from "@/components/ios";
//
// Every component reads its colours from `theme.ts`, so light/dark and the app
// tint are handled centrally — no per-screen `isDark ? … : …` branches.

export {
  Glass,
  GlassGroup,
  GlassScrim,
  LIQUID_GLASS,
  useGlassCapability,
  useReduceTransparency,
  type GlassProps,
  type GlassGroupProps,
  type GlassScrimProps,
  type GlassCapability,
} from "./Glass";
export { IOSButton, type IOSButtonProps, type IOSButtonVariant, type IOSButtonRole } from "./IOSButton";
export { IOSToggle, type IOSToggleProps } from "./IOSToggle";
export {
  IOSSegmentedTabs,
  type IOSSegmentedTabsProps,
  type IOSSegment,
  type IOSSegmentedVariant,
} from "./IOSSegmentedTabs";
export { SwipeableTabs, type SwipeableTabsProps } from "./SwipeableTabs";
export { IOSSheet, type IOSSheetProps, type IOSSheetDetent } from "./IOSSheet";
export { IOSModalCard, type IOSModalCardProps } from "./IOSModalCard";
export { IOSAlert, type IOSAlertProps, type IOSAlertAction } from "./IOSAlert";
export { useIOSAlert, type UseIOSAlert } from "./useIOSAlert";
export { AlertHost, iosAlert, iosActionSheet, type IOSAlertButton } from "./AlertHost";
export { IOSMenu, type IOSMenuProps, type IOSMenuItem } from "./IOSMenu";
export { IOSSearchBar, type IOSSearchBarProps } from "./IOSSearchBar";
export { IOSFilterChips, type IOSFilterChipsProps, type IOSFilterChip } from "./IOSFilterChips";
export {
  IOSSearchOverlay,
  type IOSSearchOverlayProps,
  type IOSSearchResult,
} from "./IOSSearchOverlay";
export {
  NetworkStatus,
  useConnectionQuality,
  type NetworkStatusProps,
  type ConnectionQuality,
} from "./NetworkStatus";
export {
  IOSListSection,
  IOSListRow,
  type IOSListSectionProps,
  type IOSListRowProps,
  type IOSListAccessory,
} from "./IOSList";
export {
  IOSTabBar,
  useTabBarInset,
  TAB_BAR_HEIGHT,
  TAB_BAR_BOTTOM_GAP,
  type IOSTab,
  type IOSTabBarProps,
} from "./IOSTabBar";
export { IOSScreen, type IOSScreenProps } from "./IOSScreen";
export {
  CollapsibleHeader,
  useCollapsibleScroll,
  NAV_BAR_HEIGHT,
  LARGE_TITLE_HEIGHT,
  type CollapsibleHeaderProps,
  type CollapsibleScroll,
} from "./CollapsibleHeader";
export { RatingModal, type RatingModalProps } from "./RatingModal";
export { FeedbackModal, type FeedbackModalProps } from "./FeedbackModal";

export {
  useIOSTheme,
  getIOSTheme,
  useIOSTextStyle,
  IOSFont,
  IOSAppFont,
  IOSMetrics,
  type IOSPalette,
  type IOSColorScheme,
  type IOSFontStyle,
  type IOSAppFontStyle,
} from "./theme";
export {
  SwipeableRow,
  type SwipeableRowProps,
  type SwipeableRowHandle,
  type SwipeAction,
} from "./SwipeableRow";
export { IOSBadge, type IOSBadgeProps } from "./IOSBadge";
