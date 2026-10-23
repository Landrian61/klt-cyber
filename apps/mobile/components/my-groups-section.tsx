import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import Animated, { FadeInUp } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { FontFamily, Spacing, Radius } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { Badge } from '@/components/ui/badge';
import { formatRelativeTime } from '@/lib/content-format';

// The "My groups" section of the Updates tab (spec 0010, AC-2): the messages
// addressed to the member's own departments and clan, grouped under each
// group's name.
//
// Lives in its own file rather than inside updates.tsx because the tab was
// already long, and because this section has its own loading and empty rules:
// it renders NOTHING at all — no heading, no empty box — when the member has no
// eligible groups or no messages inside the window. A visitor should not learn
// that group content exists by being shown an empty version of it.

/** Longer than this gets a Read more toggle rather than a wall of text. */
const EXPAND_THRESHOLD = 240;

export interface GroupMessage {
  _id: string;
  body: string;
  imageUrl: string | undefined;
  senderName: string;
  _creationTime: number;
}

export interface GroupSection {
  groupId: string;
  ownerType: 'department' | 'clan';
  groupName: string;
  messages: GroupMessage[];
}

function MessageCard({ message, index }: { message: GroupMessage; index: number }) {
  const Colors = useThemeColors();
  const [expanded, setExpanded] = useState(false);
  // A department notice can run to 2000 characters. Collapsed by default so a
  // long one does not push every other group off the screen.
  const isLong = message.body.length > EXPAND_THRESHOLD;

  return (
    <Animated.View
      entering={FadeInUp.duration(300).delay(60 + index * 40)}
      style={[styles.messageCard, { backgroundColor: Colors.surfaceLowest }]}
    >
      {message.imageUrl && (
        <Image source={{ uri: message.imageUrl }} style={styles.messageImage} contentFit="cover" />
      )}
      <Text
        style={[styles.messageBody, { color: Colors.onSurface }]}
        numberOfLines={isLong && !expanded ? 4 : undefined}
      >
        {message.body}
      </Text>
      {isLong && (
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setExpanded((previous) => !previous);
          }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={expanded ? 'Show less of this message' : 'Read the whole message'}
        >
          <Text style={[styles.readMore, { color: Colors.primaryDeep }]}>
            {expanded ? 'Show less' : 'Read more'}
          </Text>
        </Pressable>
      )}
      <Text style={[styles.messageMeta, { color: Colors.outline }]}>
        {message.senderName} · {formatRelativeTime(message._creationTime)}
      </Text>
    </Animated.View>
  );
}

export function MyGroupsSection({ sections }: { sections: GroupSection[] | null | undefined }) {
  const Colors = useThemeColors();

  // `undefined` is still loading and `null` is a signed-out subscription that
  // has outlasted the session. Both render nothing: this section sits below
  // announcements, so there is no layout to hold open for it.
  if (!sections || sections.length === 0) return null;

  return (
    <View style={styles.section}>
      <Animated.View entering={FadeInUp.duration(400).delay(40)}>
        <Text style={[styles.sectionLabel, { color: Colors.onSurface }]}>My groups</Text>
        <Text style={[styles.sectionHint, { color: Colors.outline }]}>
          Messages sent to the departments and clan you belong to.
        </Text>
      </Animated.View>

      {sections.map((group) => (
        <View key={group.groupId} style={styles.group}>
          <View style={styles.groupHeader}>
            <Text style={[styles.groupName, { color: Colors.onSurface }]} numberOfLines={1}>
              {group.groupName}
            </Text>
            <Badge
              label={group.ownerType === 'department' ? 'Department' : 'Clan'}
              variant={group.ownerType === 'department' ? 'minister' : 'elder'}
            />
          </View>
          {group.messages.map((message, index) => (
            <MessageCard key={message._id} message={message} index={index} />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    paddingHorizontal: Spacing[5],
    marginTop: Spacing[6],
  },
  sectionLabel: {
    fontFamily: FontFamily.displaySemi,
    fontSize: 18,
    lineHeight: 24,
  },
  sectionHint: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 2,
    marginBottom: Spacing[3],
  },
  group: {
    marginBottom: Spacing[4],
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing[2],
  },
  groupName: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 14,
    lineHeight: 22.4,
    flex: 1,
    marginRight: Spacing[2],
  },
  // No border: depth comes from the lifted surface against the cream page,
  // per the No-Line Rule.
  messageCard: {
    borderRadius: Radius.lg,
    padding: Spacing[4],
    marginBottom: Spacing[2],
    gap: 2,
  },
  messageImage: {
    width: '100%',
    height: 140,
    borderRadius: Radius.md,
    marginBottom: Spacing[3],
  },
  messageBody: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    lineHeight: 22.4,
  },
  readMore: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 12,
    lineHeight: 18,
    marginTop: Spacing[1],
  },
  messageMeta: {
    fontFamily: FontFamily.body,
    fontSize: 11,
    lineHeight: 15.4,
    marginTop: Spacing[2],
  },
});
