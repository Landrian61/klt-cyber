import { Image, type ImageSourcePropType } from 'react-native';
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

/** A url the lock screen can load, for a remote or a bundled image. */
export function radioArtworkUrl(source: ImageSourcePropType): string | undefined {
  if (typeof source === 'object' && source && 'uri' in source && source.uri) {
    return source.uri;
  }
  return Image.resolveAssetSource(source as number)?.uri ?? undefined;
}
