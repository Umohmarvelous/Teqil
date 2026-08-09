#!/usr/bin/env node
//
// scripts/dedupe-zod-validation-error.mjs
//
// Removes nested copies of `zod-validation-error` older than v4, so Node's
// resolver falls through to the v4 copy at the root of node_modules.
//
// Why this is needed
// ------------------
// `eslint-plugin-react-hooks` imports the `zod-validation-error/v4` subpath, but
// its own dependency range still resolves a v3.x copy into
// `node_modules/eslint-plugin-react-hooks/node_modules/`. v3 does not export
// `./v4`, so ESLint dies before it lints anything:
//
//   ERR_PACKAGE_PATH_NOT_EXPORTED: Package subpath './v4' is not defined by
//   "exports" in .../eslint-plugin-react-hooks/node_modules/zod-validation-error
//
// `overrides` / `resolutions` in package.json do not fix it — bun reports "no
// changes" and leaves the nested copy in place — so the dedupe happens here, on
// postinstall, where it survives every reinstall.
//
// Remove this script once eslint-plugin-react-hooks ships a range that resolves
// v4 on its own; the check below will simply find nothing.

import { existsSync, readFileSync, rmSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// fileURLToPath, not URL.pathname: this project's path contains spaces
// ("Emilgo Mobile App"), and .pathname would hand back a percent-encoded
// "Emilgo%20Mobile%20App" that no fs call can resolve — the script would then
// silently no-op.
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PKG = "zod-validation-error";

/** Recursively find nested node_modules copies of the package. */
function findNested(dir, found = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return found;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const full = join(dir, entry.name);

    if (entry.name === "node_modules") {
      const candidate = join(full, PKG);
      if (existsSync(candidate)) found.push(candidate);
      // Keep descending — copies can nest more than one level deep.
      findNested(full, found);
    } else if (!entry.name.startsWith(".")) {
      findNested(full, found);
    }
  }
  return found;
}

function versionOf(pkgDir) {
  try {
    return JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8")).version;
  } catch {
    return null;
  }
}

const nodeModules = join(ROOT, "node_modules");
if (!existsSync(nodeModules)) process.exit(0);

// Only look one level in — a top-level dependency's own node_modules — which is
// where the offending copy lives. A full-tree walk is needlessly slow here.
let removed = 0;
for (const entry of readdirSync(nodeModules, { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name === PKG) continue;

  const nested = join(nodeModules, entry.name, "node_modules", PKG);
  if (!existsSync(nested)) continue;

  const version = versionOf(nested);
  if (version && !version.startsWith("4.")) {
    rmSync(nested, { recursive: true, force: true });
    console.log(`[dedupe] removed ${entry.name}/node_modules/${PKG}@${version}`);
    removed++;
  }
}

if (removed === 0) {
  console.log(`[dedupe] no stale nested ${PKG} copies found`);
}
