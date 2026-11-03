#!/usr/bin/env node
/**
 * Stage pdf.js's runtime assets under this app's own `public/`, and refuse to
 * build when more than one copy of `pdfjs-dist` is installed (spec 0016,
 * AC-11, AC-13).
 *
 * Two jobs, deliberately in ONE script that every build path runs, because
 * either one skipped is a silent failure rather than a loud one:
 *
 *  1. The dependency check. The render call this app uses,
 *     `page.render({ canvas, viewport })`, belongs to pdf.js version 6. A
 *     quietly hoisted version 4 copy satisfies `import "pdfjs-dist"` and then
 *     throws at render time, in the operator's browser, on a feature nobody
 *     tests on every deploy. `nodeLinker: hoisted` (see `pnpm-workspace.yaml`)
 *     makes a second copy possible, so the version is pinned exactly and this
 *     check proves there is one of it.
 *
 *  2. The assets. Character maps (`cmaps`) and standard font data are what let
 *     pdf.js draw a page whose fonts are not embedded, or which uses CJK text.
 *     Without them such a page renders blank, and a blank cover adopted in
 *     good faith is worse than no offer at all. pdf.js fetches them by URL at
 *     render time, so they have to be SERVED: they are copied here rather than
 *     read from a public CDN, which matches how this app self-hosts its fonts
 *     through `next/font` instead of fetching them from Google at run time.
 *
 * The worker rides along for the same reason, so there is one mechanism for
 * every pdf.js asset instead of one for the worker and another for the rest.
 *
 * Wired INLINE into `dev` and `build` in `package.json`, not as a `prebuild`
 * hook: pnpm only runs pre/post hooks when `enable-pre-post-scripts` is on,
 * and `opennextjs-cloudflare build` (what Cloudflare Workers Builds actually
 * runs, per `spec/DEPLOYMENT.md` §6) shells out to `pnpm build`. Prefixing the
 * `build` script itself is the one place every path goes through.
 *
 * Output is generated, versioned by the stamp file, and git-ignored.
 */

import { createRequire } from "node:module";
import { cp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE = "pdfjs-dist";
const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(appDir, "..", "..");
const publicDir = path.join(appDir, "public", "pdfjs");
const stampFile = path.join(publicDir, ".version");

/** What gets copied, as `<source inside pdfjs-dist>` → `<name under public/pdfjs>`. */
const ASSETS = [
  ["build/pdf.worker.min.mjs", "pdf.worker.min.mjs"],
  ["cmaps", "cmaps"],
  ["standard_fonts", "standard_fonts"],
];

function fail(message) {
  console.error(`\n[pdfjs-assets] ${message}\n`);
  process.exit(1);
}

/** The version this app asks for, which must be exact rather than a range. */
async function pinnedVersion() {
  const manifest = JSON.parse(
    await readFile(path.join(appDir, "package.json"), "utf8"),
  );
  const range = manifest.dependencies?.[PACKAGE];
  if (!range) fail(`${PACKAGE} is not a dependency of this app.`);
  if (!/^\d+\.\d+\.\d+$/.test(range)) {
    fail(
      `${PACKAGE} is declared as "${range}". It has to be pinned to one exact ` +
        `version: the render call in components/library/pdfCoverPages.ts is ` +
        `specific to pdf.js 6, so a range lets a future install change the API ` +
        `under it. Drop the range prefix and run pnpm install.`,
    );
  }
  return range;
}

/**
 * Every installed copy, by real path, so a symlinked workspace view of the one
 * hoisted copy is not mistaken for a second one.
 */
async function installedCopies() {
  const roots = [
    path.join(repoRoot, "node_modules"),
    path.join(appDir, "node_modules"),
  ];
  // A duplicate under the hoisted linker shows up nested inside whichever
  // package asked for the other version, so look one level down as well.
  for (const root of roots.slice()) {
    if (!existsSync(root)) continue;
    const { readdirSync } = await import("node:fs");
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      if (entry.name.startsWith(".")) continue;
      if (entry.name.startsWith("@")) {
        const scope = path.join(root, entry.name);
        for (const scoped of readdirSync(scope)) {
          roots.push(path.join(scope, scoped, "node_modules"));
        }
      } else {
        roots.push(path.join(root, entry.name, "node_modules"));
      }
    }
  }

  const found = new Map();
  for (const root of roots) {
    const candidate = path.join(root, PACKAGE);
    if (!existsSync(path.join(candidate, "package.json"))) continue;
    const resolved = await realpath(candidate);
    if (found.has(resolved)) continue;
    const { version } = JSON.parse(
      await readFile(path.join(resolved, "package.json"), "utf8"),
    );
    found.set(resolved, version);
  }
  return found;
}

async function main() {
  const pinned = await pinnedVersion();
  const copies = await installedCopies();

  if (copies.size === 0) {
    fail(`${PACKAGE} is not installed. Run pnpm install from the repo root.`);
  }
  if (copies.size > 1) {
    const listed = [...copies]
      .map(([where, version]) => `  ${version}  ${path.relative(repoRoot, where)}`)
      .join("\n");
    fail(
      `${copies.size} copies of ${PACKAGE} are installed:\n${listed}\n` +
        `The app must hold exactly one, because the worker and the main thread ` +
        `have to come from the same build. Find what pulled the second copy in ` +
        `(pnpm why ${PACKAGE}) and align it.`,
    );
  }

  const [[source, installed]] = [...copies];
  if (installed !== pinned) {
    fail(
      `package.json pins ${PACKAGE} ${pinned} but ${installed} is installed. ` +
        `Run pnpm install from the repo root.`,
    );
  }

  // Already staged for this exact version: nothing to do. Keeps the dev server
  // and repeat builds from recopying 185 files every time.
  const stamped = existsSync(stampFile)
    ? (await readFile(stampFile, "utf8")).trim()
    : null;
  if (stamped === installed) {
    console.log(`[pdfjs-assets] ${PACKAGE} ${installed} already staged.`);
    return;
  }

  await rm(publicDir, { recursive: true, force: true });
  await mkdir(publicDir, { recursive: true });
  for (const [from, to] of ASSETS) {
    await cp(path.join(source, from), path.join(publicDir, to), {
      recursive: true,
    });
  }
  await writeFile(stampFile, `${installed}\n`, "utf8");
  console.log(
    `[pdfjs-assets] staged ${PACKAGE} ${installed} worker, cmaps and standard fonts into public/pdfjs.`,
  );
}

await main();
