## Learned User Preferences

- When fixing errors, patch the files named in the request first, then only closely related files in the same navigation/sidebar flow—not unrelated repo-wide TypeScript errors unless asked to continue.
- Remote testers in other locations should use Expo Go with a shareable QR workflow rather than LAN-only dev URLs.
- The Discover tab should show skeleton placeholders while loading via `FeedSkeletonList` from `ShimmerSkeleton.tsx`.

## Learned Workspace Facts

- Product name is Teqil; GitHub remote is `https://github.com/Umohmarvelous/Teqil.git`.
- Expo SDK ~54 with expo-router; Express API dev server on port 5000, Metro on 8081.
- `npm run expo:remote` tunnels Metro and the API via Cloudflare; use it when `expo start --tunnel` (ngrok) fails on this machine.
- Main tab UI lives under `app/(main)/` (`_layout.tsx`, `discover.tsx`, `messages.tsx`, `index.tsx`, `home-navigator.tsx`).
- Sidebar UI is in `components/Sidedbar.tsx` (typo filename) and is wired through `SwipeSidebar`.
- `EXPO_PUBLIC_DOMAIN` must point to a host remote testers can reach; LAN-only values work only on the local network.
