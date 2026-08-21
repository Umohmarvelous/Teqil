// src/hooks/useSignedMedia.ts
//
// `message.media_url` is a PATH in the private `chat-media` bucket, not a URL.
// Anything that renders it has to sign it first, and signing is async — so a
// bubble cannot just drop the value into an <Image source>.
//
// This is that step, as a hook, with the loading and failure states a real
// image needs. `resolveMediaUrl` caches, so a list that scrolls back over the
// same photo does not sign it twice.

import { useEffect, useState } from "react";
import { resolveMediaUrl } from "@/src/services/chat";

export interface SignedMedia {
  url: string | null;
  loading: boolean;
  failed: boolean;
}

export function useSignedMedia(stored: string | null | undefined): SignedMedia {
  const [state, setState] = useState<SignedMedia>({
    url: null,
    loading: !!stored,
    failed: false,
  });

  useEffect(() => {
    if (!stored) {
      setState({ url: null, loading: false, failed: false });
      return;
    }
    let alive = true;
    setState((s) => ({ ...s, loading: true, failed: false }));
    resolveMediaUrl(stored)
      .then((url) => {
        if (!alive) return;
        setState({ url, loading: false, failed: !url });
      })
      .catch(() => alive && setState({ url: null, loading: false, failed: true }));
    return () => {
      alive = false;
    };
  }, [stored]);

  return state;
}

export default useSignedMedia;
