import { ImageBackground } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

// Warm gold/crimson/blue gradients — the tonal fallback behind any content
// card that has no cover image (keeps the parchment page from showing a bare
// dark scrim). Picked deterministically per card index so a list reads varied.
const COVER_GRADIENTS: [string, string][] = [
  ['#12306E', '#2C63D9'], // heaven blue
  ['#C10810', '#7A4E04'], // red → gold
  ['#7A4E04', '#C47F08'], // gold
  ['#0C2154', '#12306E'], // deep blue
  ['#C10810', '#7A0509'], // deep red
];

export function gradientFor(index: number): [string, string] {
  return COVER_GRADIENTS[index % COVER_GRADIENTS.length];
}

/**
 * A cover surface: the remote image when `uri` is present, else a tonal
 * gradient. Content from the admin portal (programs, events, announcements)
 * has an optional `coverImageUrl` — this is the shared fallback so a card
 * without one still reads as intentional, not broken.
 */
export function Cover({
  uri, index, style, imageRadius, children,
}: {
  uri?: string;
  index: number;
  style: object;
  imageRadius: number;
  children?: React.ReactNode;
}) {
  if (uri) {
    return (
      <ImageBackground
        source={{ uri }}
        resizeMode="cover"
        style={style}
        imageStyle={{ borderRadius: imageRadius, backgroundColor: '#2B2A25' }}
      >
        {children}
      </ImageBackground>
    );
  }
  const [from, to] = gradientFor(index);
  return (
    <LinearGradient colors={[from, to]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[style, { borderRadius: imageRadius }]}>
      {children}
    </LinearGradient>
  );
}
