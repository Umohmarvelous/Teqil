// components/feed/PostText.tsx
//
// Post body text with #hashtags, @mentions and bare URLs turned into taps.
//
// ── Why one regex and not three passes ──────────────────────────────────────
// Running three separate replace passes lets them collide: a URL containing a
// `#fragment` gets its fragment eaten by the hashtag pass, and an email address
// becomes a broken mention. One alternation scanned left to right cannot
// overlap, so the first match at any position wins and the rest of that token is
// consumed with it.
//
// Ordering inside the alternation is therefore load-bearing: URL first, so
// `https://x.com/a#b` is one link rather than a link plus a hashtag.

import React from "react";
import { Text, Linking, type StyleProp, type TextStyle } from "react-native";
import { useRouter } from "expo-router";

const TOKEN =
  /((?:https?:\/\/|www\.)[^\s<>"']+)|(#[\p{L}\p{N}_]{1,64})|(@[A-Za-z0-9_.]{2,32})/gu;

export interface PostTextProps {
  body: string;
  style?: StyleProp<TextStyle>;
  linkColor: string;
  numberOfLines?: number;
  /** Suppresses navigation where the whole cell is already a tap target. */
  inert?: boolean;
  onPressHashtag?: (tag: string) => void;
  onPressMention?: (handle: string) => void;
}

function PostTextInner({
  body,
  style,
  linkColor,
  numberOfLines,
  inert,
  onPressHashtag,
  onPressMention,
}: PostTextProps) {
  const router = useRouter();

  const parts = React.useMemo(() => {
    const out: { text: string; kind: "plain" | "url" | "tag" | "mention" }[] = [];
    let last = 0;
    // A fresh lastIndex matters: TOKEN is module-scoped and /g regexes are
    // stateful, so a shared one would skip matches on every other render.
    TOKEN.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = TOKEN.exec(body))) {
      if (m.index > last) out.push({ text: body.slice(last, m.index), kind: "plain" });
      out.push({
        text: m[0],
        kind: m[1] ? "url" : m[2] ? "tag" : "mention",
      });
      last = m.index + m[0].length;
    }
    if (last < body.length) out.push({ text: body.slice(last), kind: "plain" });
    return out;
  }, [body]);

  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {parts.map((p, i) => {
        if (p.kind === "plain" || inert) return <Text key={i}>{p.text}</Text>;

        const onPress = () => {
          if (p.kind === "url") {
            const url = p.text.startsWith("www.") ? `https://${p.text}` : p.text;
            Linking.openURL(url).catch(() => {});
            return;
          }
          if (p.kind === "tag") {
            const tag = p.text.slice(1);
            if (onPressHashtag) onPressHashtag(tag);
            else router.push(`/hashtag/${encodeURIComponent(tag)}` as any);
            return;
          }
          const handle = p.text.slice(1);
          if (onPressMention) onPressMention(handle);
          else router.push(`/u/${encodeURIComponent(handle)}` as any);
        };

        return (
          <Text key={i} style={{ color: linkColor }} onPress={onPress} suppressHighlighting>
            {p.text}
          </Text>
        );
      })}
    </Text>
  );
}

// Feed cells re-render on every count change; the body almost never changes.
export const PostText = React.memo(PostTextInner);
