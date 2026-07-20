/**
 * EmilgoSplash.tsx — Animated splashscreen overlay for the Emilgo app (Expo / React Native)
 
 * TIMELINE (spec):
 *   0.0–0.3s  logo settles in, centered          (ease-out pop)
 *   0.3–1.2s  logo slides left, "Emilgo" reveals  (cubic ease-in-out)
 *   1.2–4.2s  hold
 *   4.2–5.2s  name fades out, logo returns center (cubic ease-in-out)
 *   5.2–5.8s  gentle zoom-in, background dims     (ease-out)
 *   5.8–6.7s  exponential zoom-through → app      (ease-in expo, X-style)
 *
 * PRODUCTION NOTE: 6.7s is long for a splash. For daily-use feel, consider the
 * FAST timings in the TIMING constant below (≈3.5s, same choreography).
 */

import React, { useEffect, useState } from 'react';
import { Dimensions, StyleSheet } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// ---- Brand assets -------------------------------------------------------------
// White logo variant (transparent PNG, 540×871) — shipped alongside this file.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const LOGO = require('../assets/images/emilgo_logo_white.png');

const LOGO_H = 90;
// const LOGO_W = 90;
const LOGO_W = LOGO_H * (540 / 871); // ≈ 93, preserves asset aspect ratio
const COVER = Math.max(SCREEN_W / LOGO_W, SCREEN_H / LOGO_H) * 1.35; // scale that fills the screen

// ---- Timing -------------------------------------------------------------------
// SPEC (as briefed, 6.7s total) — or switch to FAST (≈3.5s) for production.
const TIMING = {
  SPEC: { in: 300, reveal: 900, hold: 3000, retract: 1000, preZoom: 600, zoom: 900 },
  FAST: { in: 250, reveal: 650, hold: 1200,  retract: 550,  preZoom: 100, zoom: 200 },
} as const;
const T = TIMING.FAST;

const t0 = T.in;                          // reveal starts
const t1 = t0 + T.reveal;                 // reveal done → hold starts
const t2 = t1 + T.hold;                   // retract starts
const t3 = t2 + T.retract;                // retract done → preZoom starts
const t4 = t3 + T.preZoom;                // zoom-through starts
// const END = t4 + T.zoom;                  // total

const INOUT = Easing.inOut(Easing.cubic);

interface Props {
  onFinish?: () => void;
  backgroundColor?: string; // must match app.json splash.backgroundColor
}

export default function EmilgoSplash({ onFinish, backgroundColor = '#009A43' }: Props) {
  const [wordW, setWordW] = useState(0);

  const logoOpacity = useSharedValue(0);
  const brandScale  = useSharedValue(0.92);
  const reveal      = useSharedValue(0);   // 0 → 1 → 0 (wordmark open / close)
  const wordOpacity = useSharedValue(0);
  const wordShiftX  = useSharedValue(26);  // px, wordmark slides in from the right
  const dimOpacity  = useSharedValue(0);
  const overlayFade = useSharedValue(1);

  useEffect(() => {
    // 1a — logo settles in
    logoOpacity.value = withTiming(1, { duration: T.in, easing: Easing.out(Easing.cubic) });

    // full zoom choreography on one shared value (keeps 1a/2a/2b perfectly continuous)
    brandScale.value = withSequence(
      withTiming(1, { duration: T.in, easing: Easing.out(Easing.cubic) }),          // pop-in
      withDelay(t3 - T.in, withTiming(1.55, { duration: T.preZoom, easing: Easing.out(Easing.cubic) })), // 2a gentle zoom
      withTiming(COVER, { duration: T.zoom, easing: Easing.in(Easing.exp) })        // 2b X-style fill
    );

    // 1b / 1d — wordmark opens, holds, closes
    reveal.value = withSequence(
      withDelay(t0, withTiming(1, { duration: T.reveal, easing: INOUT })),
      withDelay(T.hold, withTiming(0, { duration: T.retract, easing: INOUT }))
    );
    wordOpacity.value = withSequence(
      withDelay(t0 + 120, withTiming(1, { duration: T.reveal * 0.65, easing: Easing.out(Easing.cubic) })),
      withDelay(T.hold + (T.reveal * 0.35 - 120), withTiming(0, { duration: T.retract * 0.72 }))
    );
    wordShiftX.value = withSequence(
      withDelay(t0 + 120, withTiming(0, { duration: T.reveal * 0.75, easing: Easing.out(Easing.cubic) })),
      withDelay(T.hold + (T.reveal * 0.25 - 120), withTiming(-26, { duration: T.retract * 0.72 }))
    );

    // 2a — background dims to focus the logo
    dimOpacity.value = withDelay(t3, withTiming(0.35, { duration: T.preZoom }));

    // 2c — splash dissolves into the app
    overlayFade.value = withDelay(
      t4 + T.zoom * 0.6,
      withTiming(0, { duration: T.zoom * 0.55 }, (finished) => {
        if (finished && onFinish) runOnJS(onFinish)();
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const logoStyle = useAnimatedStyle(() => ({ opacity: logoOpacity.value }));
  const brandStyle = useAnimatedStyle(() => ({ transform: [{ scale: brandScale.value }] }));
  const wordWrapStyle = useAnimatedStyle(() => ({ width: reveal.value * wordW }));
  const wordStyle = useAnimatedStyle(() => ({
    opacity: wordOpacity.value,
    transform: [{ translateX: wordShiftX.value }],
  }));
  const dimStyle = useAnimatedStyle(() => ({ opacity: dimOpacity.value }));
  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlayFade.value }));

  return (
    <Animated.View style={[styles.overlay, { backgroundColor }, overlayStyle]}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.dim, dimStyle]} />

      <Animated.View style={[styles.brand, brandStyle]}>
        <Animated.Image source={LOGO} style={[styles.logo, logoStyle]} resizeMode="contain" />
        <Animated.View style={[styles.wordWrap, wordWrapStyle]}>
          <Animated.Text style={[styles.word, wordStyle]} numberOfLines={1}>
            milgo
          </Animated.Text>
        </Animated.View>
      </Animated.View>

      {/* invisible twin used once to measure the wordmark's natural width */}
      <Animated.Text
        style={[styles.word, styles.measure]}
        onLayout={(e) => setWordW(e.nativeEvent.layout.width)}
      >
        milgo
      </Animated.Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  dim: { backgroundColor: '#009A43' },
  brand: { flexDirection: 'row', alignItems: 'center'},
  logo: { width: LOGO_W, height: LOGO_H },
  wordWrap: { overflow: 'hidden', justifyContent: 'center' },
  word: {
    paddingLeft: 20,
    fontSize: 25,
    fontWeight: '800', // pair with Montserrat-ExtraBold via expo-font for the exact preview look
    color: '#fff',
    letterSpacing: 0.5,
    includeFontPadding: false,
    
  },
  measure: { position: 'absolute', opacity: 0, left: -9999, top: 0 },
});
