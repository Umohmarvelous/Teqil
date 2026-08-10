// components/ios/index.ts
//
// iOS-native-feel component kit.
//
//   import { IOSButton, IOSSheet, IOSAlert, IOSMenu } from "@/components/ios";
//
// Every component reads its colours from `theme.ts`, so light/dark and the app
// tint are handled centrally — no per-screen `isDark ? … : …` branches.

export { IOSButton, type IOSButtonProps, type IOSButtonVariant, type IOSButtonRole } from "./IOSButton";
export { IOSSheet, type IOSSheetProps, type IOSSheetDetent } from "./IOSSheet";
export { IOSModalCard, type IOSModalCardProps } from "./IOSModalCard";
export { IOSAlert, type IOSAlertProps, type IOSAlertAction } from "./IOSAlert";
export { useIOSAlert, type UseIOSAlert } from "./useIOSAlert";
export { AlertHost, iosAlert, iosActionSheet, type IOSAlertButton } from "./AlertHost";
export { IOSMenu, type IOSMenuProps, type IOSMenuItem } from "./IOSMenu";
export { IOSSearchBar, type IOSSearchBarProps } from "./IOSSearchBar";
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
  IOSMetrics,
  type IOSPalette,
  type IOSColorScheme,
  type IOSFontStyle,
} from "./theme";
