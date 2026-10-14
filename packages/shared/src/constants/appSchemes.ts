import appSchemes from './appSchemes.json';

/**
 * The mobile app's three URL schemes, one per Expo build variant
 * (`APP_VARIANT` in apps/mobile/app.config.ts). Backed by a JSON file,
 * not a plain object literal, because apps/mobile/app.config.ts runs
 * under plain Node (no Metro bundler) and can only import this package's
 * raw TypeScript barrel via a bundler; a leaf .json file is the one
 * sub-path Node resolves natively regardless of version, so it is the
 * single place these three strings are written — convex/auth.ts and
 * apps/mobile/app.config.ts both read from it instead of redeclaring it.
 */
export const APP_SCHEMES: Readonly<{
  production: string;
  development: string;
  preview: string;
}> = appSchemes;

export const APP_URL_SCHEMES: readonly string[] = Object.values(APP_SCHEMES).map(
  (scheme) => `${scheme}://`,
);
