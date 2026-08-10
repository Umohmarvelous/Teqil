// app/settings/about.tsx
//
// Referrals, feedback, the rating prompt, and build info.

import React, { useCallback, useState } from "react";
import { Share, Platform } from "react-native";
import Constants from "expo-constants";
import { useLocalSearchParams } from "expo-router";

import {
  IOSScreen,
  IOSListSection,
  IOSListRow,
  RatingModal,
  FeedbackModal,
} from "@/components/ios";
import { useSettingsStore } from "@/src/store/useSettingsStore";
import { haptics } from "@/src/utils/haptics";
import { useHighlight } from "@/src/hooks/useHighlight";

export default function AboutSettings() {
  const { highlight } = useLocalSearchParams<{ highlight?: string }>();
  const flash = useHighlight(highlight);

  const referralCode = useSettingsStore((s) => s.referralCode);

  const [rateOpen, setRateOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  const version = Constants.expoConfig?.version ?? "—";
  const build =
    Platform.OS === "ios"
      ? Constants.expoConfig?.ios?.buildNumber
      : String(Constants.expoConfig?.android?.versionCode ?? "");

  const share = useCallback(() => {
    haptics.tap();
    Share.share({
      message: `Join me on Emilgo — Nigeria's ride network. Use my code ${referralCode} to get started: https://teqil.app`,
    });
  }, [referralCode]);

  return (
    <IOSScreen title="About & Support" back>
      <IOSListSection
        header="Referrals"
        footer="Share your code and you both earn credits when they take their first trip."
      >
        <IOSListRow
          symbol="person.2.fill"
          label="My Referral Code"
          accessory={{ type: "detail", text: referralCode }}
          onPress={share}
          {...flash("referral")}
        />
      </IOSListSection>

      <IOSListSection header="Support">
        <IOSListRow
          symbol="star.fill"
          label="Rate Emilgo"
          detail="Leave a review on the App Store"
          accessory={{ type: "disclosure" }}
          onPress={() => {
            haptics.tap();
            setRateOpen(true);
          }}
          {...flash("rate")}
        />
        <IOSListRow
          symbol="bubble.left.and.bubble.right.fill"
          label="Send Feedback"
          detail="Tell us what's working and what isn't"
          accessory={{ type: "disclosure" }}
          onPress={() => {
            haptics.tap();
            setFeedbackOpen(true);
          }}
          {...flash("feedback")}
        />
      </IOSListSection>

      <IOSListSection header="About">
        <IOSListRow
          symbol="info.circle.fill"
          label="Version"
          accessory={{ type: "detail", text: build ? `${version} (${build})` : version }}
          {...flash("version")}
        />
      </IOSListSection>

      <RatingModal visible={rateOpen} onClose={() => setRateOpen(false)} />
      <FeedbackModal
        visible={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
        kind="general"
      />
    </IOSScreen>
  );
}
