// components/RouteThumbnail.tsx
//
// Lightweight preview of a recorded GPS path, drawn as an SVG polyline.
//
// Deliberately not a MapView: a history list renders dozens of these, and one
// map instance per row is far too heavy on low-end devices. The detail screen
// shows the real map.

import React, { useMemo } from "react";
import { View, StyleSheet, type ViewStyle } from "react-native";
import Svg, { Polyline, Circle, Rect } from "react-native-svg";

import { Colors } from "@/constants/colors";
import type { Coordinate } from "@/src/services/locationTracking";

interface Props {
  path:    Coordinate[];
  width?:  number;
  height?: number;
  isDark?: boolean;
  style?:  ViewStyle;
}

const PADDING = 10;

export function RouteThumbnail({
  path,
  width  = 92,
  height = 92,
  isDark = false,
  style,
}: Props) {
  const bg = isDark ? "rgba(255,255,255,0.05)" : "#F1F4F2";

  // Project lat/lng into the box, preserving aspect ratio so the shape of the
  // journey survives (a straight road stays straight, not stretched).
  const points = useMemo(() => {
    if (!path?.length) return [];

    let minLat = path[0].latitude,  maxLat = path[0].latitude;
    let minLng = path[0].longitude, maxLng = path[0].longitude;
    for (const p of path) {
      if (p.latitude  < minLat) minLat = p.latitude;
      if (p.latitude  > maxLat) maxLat = p.latitude;
      if (p.longitude < minLng) minLng = p.longitude;
      if (p.longitude > maxLng) maxLng = p.longitude;
    }

    const spanLat = Math.max(maxLat - minLat, 1e-6);
    const spanLng = Math.max(maxLng - minLng, 1e-6);
    const boxW = width  - PADDING * 2;
    const boxH = height - PADDING * 2;
    const scale = Math.min(boxW / spanLng, boxH / spanLat);

    // Centre whatever the aspect ratio leaves over.
    const offsetX = PADDING + (boxW - spanLng * scale) / 2;
    const offsetY = PADDING + (boxH - spanLat * scale) / 2;

    return path.map((p) => ({
      x: offsetX + (p.longitude - minLng) * scale,
      // SVG y grows downward; latitude grows north, so flip it.
      y: offsetY + (maxLat - p.latitude) * scale,
    }));
  }, [path, width, height]);

  const start = points[0];
  const end   = points[points.length - 1];

  return (
    <View style={[{ width, height, borderRadius: 14, overflow: "hidden" }, style]}>
      <Svg width={width} height={height}>
        <Rect x={0} y={0} width={width} height={height} fill={bg} rx={14} />

        {points.length > 1 && (
          <>
            <Polyline
              points={points.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              stroke={Colors.primary}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <Circle cx={start.x} cy={start.y} r={3.5} fill={Colors.primary} />
            <Circle
              cx={end.x}
              cy={end.y}
              r={3.5}
              fill={isDark ? Colors.background : "#FFFFFF"}
              stroke={Colors.primary}
              strokeWidth={2}
            />
          </>
        )}
      </Svg>
    </View>
  );
}

export default RouteThumbnail;

// Kept for callers that want the padding constant when laying out around one.
export const ROUTE_THUMBNAIL_PADDING = PADDING;

export const routeThumbnailStyles = StyleSheet.create({
  bordered: {
    borderWidth: 1,
    borderColor: "rgba(0,154,67,0.15)",
  },
});
