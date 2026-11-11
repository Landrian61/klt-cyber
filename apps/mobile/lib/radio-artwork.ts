import type { ImageSourcePropType } from 'react-native';
import type { RadioSeedKey } from '@klt-cyber/shared';

/**
 * Program artwork (spec 0019, Value sourcing): an uploaded image on the
 * program first, else the bundled photo matched by the program's `seedKey`,
 * else the church theme. The bundled photos stay in the repo as this
 * fallback even though the old bundled schedule (`data/programs.ts`) is gone.
 */
const BUNDLED: Partial<Record<RadioSeedKey, ImageSourcePropType>> = {
  'morning-glory': require('@/assets/images/Morning-Glory.jpg'),
  'super-t': require('@/assets/images/Super-T.jpg'),
  'midweek-service': require('@/assets/images/Mid-Week-Service.jpg'),
  'tongues-of-fire': require('@/assets/images/Tongues-of-fire.jpg'),
  'holy-ghost-night': require('@/assets/images/Holy-Ghost-Night.jpg'),
};

export const RADIO_FALLBACK_ARTWORK: ImageSourcePropType = require('@/assets/images/Church_Theme.jpg');

export function radioArtwork(b: {
  imageUrl: string | null;
  seedKey: string | null;
} | null): ImageSourcePropType {
  if (b?.imageUrl) return { uri: b.imageUrl };
  const bundled = b?.seedKey ? BUNDLED[b.seedKey as RadioSeedKey] : undefined;
  return bundled ?? RADIO_FALLBACK_ARTWORK;
}

/**
 * The artwork the notification and lock screen card load (spec 0020). Always a
 * web address: Android's media notification downloads `artworkUrl` as a Java
 * `URL`, and a bundled image resolves to a resource name in a release build,
 * so it can never reach the card. The program's uploaded image first, else the
 * portal's hosted copy of its bundled photo, else the portal's default; with
 * no portal address configured, no artwork rather than a broken one.
 */
export function radioRemoteArtworkUrl(
  b: { imageUrl: string | null; seedKey: string | null } | null,
  artworkBaseUrl: string | undefined,
): string | undefined {
  if (b?.imageUrl) return b.imageUrl;
  if (!artworkBaseUrl) return undefined;
  const hosted = b?.seedKey && b.seedKey in BUNDLED ? b.seedKey : 'default';
  return `${artworkBaseUrl}${hosted}.jpg`;
}
