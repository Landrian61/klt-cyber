// Production-deployment guard. See docs/specs/_root/0001-production-readiness-safe-seeding.md.
//
// Convex has no environment concept beyond a project's dev/prod deployment
// slots, and today's `prod` slot is used as staging (spec/DEPLOYMENT.md), so
// checking Convex's own dev/prod label would misidentify staging as
// production. Instead this compares the deployment's own injected
// CONVEX_CLOUD_URL against a hardcoded production URL constant.

/**
 * The real production deployment's `*.convex.cloud` URL. Starts empty —
 * deliberately inert (AC-6) until the production Convex project exists. Not a
 * secret: Convex deployment URLs are public by design. Fill this in as the
 * first step of the spec's Follow-up once production is created.
 */
export const PRODUCTION_CONVEX_URL = "";

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

/**
 * True only when `url` is the real production deployment. Pure and
 * unit-testable: both arguments default to the live values but can be passed
 * explicitly in tests. Always false while `PRODUCTION_CONVEX_URL` is empty.
 */
export function isProductionDeployment(
  url: string | undefined = process.env.CONVEX_CLOUD_URL,
  prodUrl: string = PRODUCTION_CONVEX_URL
): boolean {
  if (!url || !prodUrl) return false;
  return trimTrailingSlash(url) === trimTrailingSlash(prodUrl);
}

/**
 * Guard shared by every sample-data seed mutation (AC-2): throws before any
 * write unless the caller opted in AND the guard confirms this isn't
 * production — two independent conditions, so a typo'd/stale
 * `PRODUCTION_CONVEX_URL` can't fail open on its own. `url`/`prodUrl` default
 * to the live values (mirroring `isProductionDeployment`) but can be passed
 * explicitly in tests, without touching real env vars or the constant.
 */
export function assertSampleSeedAllowed(
  allowSampleData: boolean | undefined,
  url: string | undefined = process.env.CONVEX_CLOUD_URL,
  prodUrl: string = PRODUCTION_CONVEX_URL
): void {
  if (allowSampleData !== true) {
    throw new Error(
      "Refusing to seed sample data: pass allowSampleData: true to confirm."
    );
  }
  if (isProductionDeployment(url, prodUrl)) {
    throw new Error(
      "Refusing to seed sample data: this deployment is production."
    );
  }
}
