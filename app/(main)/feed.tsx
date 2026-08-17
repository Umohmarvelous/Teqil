// app/(main)/feed.tsx
//
// Kept as a route, but no longer a screen.
//
// This file used to render a list of news articles fetched from `/api/feed` on
// the Express server. That route does not exist in server/routes.ts and never
// did, so the screen has been silently catching its own 404 and rendering
// "No articles yet" for its entire life.
//
// The social feed that replaced it lives in `app/(main)/discover.tsx`, which is
// mounted as the "For You" pane of the home shell. Nothing in the app links
// here, but the path is left resolvable so an old deep link or a stale
// notification route lands somewhere sensible instead of on +not-found.

import { Redirect } from "expo-router";

export default function FeedRedirect() {
  return <Redirect href="/(main)" />;
}
