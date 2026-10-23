import { Redirect, useLocalSearchParams, type Href } from 'expo-router';

// Kept as a redirect, not deleted (spec 0010, AC-7).
//
// One screen now serves both a church event and a group activity
// (`/item-detail?kind=…&id=…`), but notifications sent before that change are
// still sitting in people's trays carrying this route. Tapping one has to land
// on the right item rather than on a dead screen, so this forwards it.
//
// Safe to remove once no notification old enough to carry this path is
// plausibly still being tapped.
export default function EventDetailRedirect() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  // Cast as in lib/notification-links.ts: `/item-detail` is new in this
  // change, so Expo's generated route map does not know it until the dev
  // server regenerates.
  const target = (id ? `/item-detail?kind=event&id=${id}` : '/events') as Href;
  return <Redirect href={target} />;
}
