// src/hooks/useHighlight.ts
//
// Briefly highlights the row a settings search result deep-linked to.
//
// Tapping a search result pushes the owning section screen with a `highlight`
// param. Without this, the user lands on a screen of twelve rows with no idea
// which one they asked for — so the matching row flashes, the same way iOS
// Settings does when you tap a Spotlight result.

import { useEffect, useState, useCallback } from "react";

/** How long the flash stays before fading out. */
const HIGHLIGHT_MS = 1600;

export interface HighlightProps {
  highlighted?: boolean;
}

/**
 * Returns a `flash(id)` helper to spread onto a row:
 *
 *   const flash = useHighlight(highlight);
 *   <IOSListRow label="Dark Mode" {...flash("theme")} />
 */
export function useHighlight(target?: string) {
  const [active, setActive] = useState<string | undefined>(target);

  useEffect(() => {
    setActive(target);
    if (!target) return;
    const t = setTimeout(() => setActive(undefined), HIGHLIGHT_MS);
    return () => clearTimeout(t);
  }, [target]);

  return useCallback(
    (id: string): HighlightProps => (active === id ? { highlighted: true } : {}),
    [active],
  );
}

export default useHighlight;
