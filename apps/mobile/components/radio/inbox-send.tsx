import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useMutation } from 'convex/react';
import { ConvexError } from 'convex/values';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInUp, FadeOut } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import {
  RADIO_INBOX_BODY_MAX_LENGTH,
  RADIO_INBOX_OFF_AIR_MESSAGE,
  radioErrorMessage,
  type RadioDisplayStatus,
  type RadioInboxType,
} from '@klt-cyber/shared';

import { AmbientShadow, FontFamily, Radius, Spacing } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const COPY: Record<RadioInboxType, { label: string; icon: keyof typeof Ionicons.glyphMap; hint: string; field: string; sent: string }> = {
  prayer_request: {
    label: 'Prayer request',
    icon: 'heart-outline',
    hint: 'Anonymous. Nobody sees who sent it, not even the team on air.',
    field: 'What can we pray with you about?',
    sent: 'Sent. The team on air will pray with you.',
  },
  testimony: {
    label: 'Testimony',
    icon: 'sparkles-outline',
    hint: 'Sent with your name, so it can be shared on air.',
    field: 'What has God done?',
    sent: 'Sent. Thank you for sharing your testimony.',
  },
};

function messageFor(error: unknown): string {
  if (error instanceof ConvexError) {
    const code = (error.data as { code?: unknown } | null)?.code;
    if (typeof code === 'string') return radioErrorMessage(code);
  }
  return 'That did not send. Check your connection and try again.';
}

/**
 * Send a prayer request or a testimony to the people on air (spec 0019,
 * AC-28). Open to every signed in user, visitor or member. While nothing is
 * on air both buttons are disabled with a sentence saying why; the server
 * refuses off air, an empty or over long body and the hourly limit on its own,
 * so this form only explains what it already enforces.
 */
export function InboxSend({ status }: { status: RadioDisplayStatus }) {
  const Colors = useThemeColors();
  const submit = useMutation(api.radioInbox.submit);
  const [open, setOpen] = useState<RadioInboxType | null>(null);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<RadioInboxType | null>(null);

  const onAir = status !== 'off_air';
  const trimmed = body.trim();
  const tooLong = trimmed.length > RADIO_INBOX_BODY_MAX_LENGTH;

  const choose = (type: RadioInboxType) => {
    Haptics.selectionAsync().catch(() => {});
    setOpen((prev) => (prev === type ? null : type));
    setError(null);
    setSent(null);
  };

  const send = async () => {
    if (!open || !trimmed || tooLong) return;
    setSending(true);
    setError(null);
    try {
      await submit({ type: open, body: trimmed });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setSent(open);
      setOpen(null);
      setBody('');
    } catch (caught) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setError(messageFor(caught));
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={[styles.card, AmbientShadow, { backgroundColor: Colors.surfaceLowest }]}>
      <Text style={[styles.title, { color: Colors.onSurface }]}>Share with the team on air</Text>

      <View style={styles.buttons}>
        {(['prayer_request', 'testimony'] as const).map((type) => {
          const selected = open === type;
          return (
            <Pressable
              key={type}
              disabled={!onAir}
              onPress={() => choose(type)}
              accessibilityRole="button"
              accessibilityState={{ disabled: !onAir, expanded: selected }}
              accessibilityLabel={`${COPY[type].label}${onAir ? '' : ', unavailable while off air'}`}
              style={[
                styles.choice,
                {
                  backgroundColor: selected ? Colors.primary : Colors.primaryLight,
                  opacity: onAir ? 1 : 0.5,
                },
              ]}
            >
              <Ionicons
                name={COPY[type].icon}
                size={16}
                color={selected ? Colors.onPrimary : Colors.primary}
              />
              <Text
                style={[styles.choiceText, { color: selected ? Colors.onPrimary : Colors.primary }]}
              >
                {COPY[type].label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {!onAir && (
        <Text style={[styles.note, { color: Colors.outline }]}>{RADIO_INBOX_OFF_AIR_MESSAGE}</Text>
      )}

      {onAir && open && (
        <Animated.View entering={FadeInUp.duration(250)} exiting={FadeOut.duration(150)} style={styles.form}>
          <Text style={[styles.note, { color: Colors.onSurfaceVariant }]}>{COPY[open].hint}</Text>
          <Input
            label={COPY[open].field}
            value={body}
            onChangeText={setBody}
            multiline
            maxLength={RADIO_INBOX_BODY_MAX_LENGTH + 50}
            error={tooLong ? `Keep it to ${RADIO_INBOX_BODY_MAX_LENGTH} characters.` : undefined}
            helperText={`${trimmed.length} / ${RADIO_INBOX_BODY_MAX_LENGTH}`}
          />
          <Button
            label="Send"
            onPress={() => void send()}
            loading={sending}
            disabled={!trimmed || tooLong || sending}
            fullWidth
          />
        </Animated.View>
      )}

      {error && (
        <Text role="alert" style={[styles.note, { color: Colors.error }]}>
          {error}
        </Text>
      )}
      {sent && !open && (
        <Animated.View entering={FadeIn.duration(250)} style={styles.sentRow} accessibilityLiveRegion="polite">
          <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
          <Text style={[styles.note, { color: Colors.onSurfaceVariant, flex: 1 }]}>{COPY[sent].sent}</Text>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Radius.lg, padding: Spacing[4], gap: Spacing[3] },
  title: { fontFamily: FontFamily.bodySemiBold, fontSize: 15, lineHeight: 21 },
  buttons: { flexDirection: 'row', gap: Spacing[2] },
  choice: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: Radius.full,
    paddingVertical: Spacing[3],
    minHeight: 44,
  },
  choiceText: { fontFamily: FontFamily.bodySemiBold, fontSize: 13, lineHeight: 18 },
  form: { gap: Spacing[3] },
  note: { fontFamily: FontFamily.body, fontSize: 13, lineHeight: 19 },
  sentRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
});
