import { useState, useCallback, useMemo, useRef } from 'react';
import {
  ScrollView, View, Text, TextInput, Pressable,
  ImageBackground, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  FadeInUp, FadeInRight, useSharedValue, useAnimatedStyle, withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import {
  FontFamily, Spacing, Radius, AmbientShadow,
} from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { getOnlinePrograms, type Program } from '@/data/programs';

// When no program is live, fall back to the church theme image
const FALLBACK_IMAGE = require('@/assets/images/Church_Theme.jpg');

interface Comment {
  id: string;
  author: string;
  initials: string;
  text: string;
  time: string;
}

// Placeholder comments
const INITIAL_COMMENTS: Comment[] = [
  { id: '1', author: 'Sister Grace', initials: 'SG', text: 'Powerful word tonight! 🙏', time: '2 min ago' },
  { id: '2', author: 'Brother James', initials: 'BJ', text: 'Amen, glory to God', time: '5 min ago' },
  { id: '3', author: 'Deacon Paul', initials: 'DP', text: 'The presence of God is strong', time: '8 min ago' },
];

const LISTENER_COUNT = 47;

export default function RadioScreen() {
  const Colors = useThemeColors();
  const [notes, setNotes] = useState('');
  const [saved, setSaved] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [comments, setComments] = useState<Comment[]>(INITIAL_COMMENTS);
  const [commentText, setCommentText] = useState('');
  const commentInputRef = useRef<TextInput>(null);

  // In a real app, this would come from a live status API.
  // null = no live broadcast; a Program = currently broadcasting.
  const [currentProgram] = useState<Program | null>(null);

  const onlinePrograms = useMemo(() => getOnlinePrograms(), []);

  const heroImage = currentProgram?.image ?? FALLBACK_IMAGE;
  const heroTitle = currentProgram?.name ?? 'Reign Radio';
  const heroSubtitle = currentProgram
    ? `Live now on religradio.caster.fm`
    : 'religradio.caster.fm';

  // Play button animation
  const playScale = useSharedValue(1);
  const playAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: playScale.value }],
  }));

  const handlePlayToggle = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsPlaying((prev) => !prev);
    playScale.value = withSpring(1.15, { damping: 8, stiffness: 300 }, () => {
      playScale.value = withSpring(1);
    });
  };

  const handleSendComment = () => {
    const trimmed = commentText.trim();
    if (!trimmed) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newComment: Comment = {
      id: Date.now().toString(),
      author: 'Andrew',
      initials: 'AL',
      text: trimmed,
      time: 'Just now',
    };
    setComments((prev) => [newComment, ...prev]);
    setCommentText('');
    commentInputRef.current?.blur();
  };

  const handleNotesChange = useCallback((text: string) => {
    setNotes(text);
    setSaved(false);
    const timeout = setTimeout(() => setSaved(true), 1000);
    return () => clearTimeout(timeout);
  }, []);

  return (
    <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
      {/* Radio Player Hero */}
      <Animated.View entering={FadeInUp.duration(400).delay(80)} style={styles.heroSection}>
        <ImageBackground
          source={heroImage}
          resizeMode="cover"
          style={styles.heroImage}
          imageStyle={{ borderRadius: Radius.xl }}
        >
          <View style={styles.heroScrim}>
            {/* Live badge */}
            {currentProgram && (
              <View style={styles.liveBadge}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>LIVE</Text>
              </View>
            )}

            {/* Program info */}
            <View style={styles.heroContent}>
              <Text style={styles.heroTitle} numberOfLines={2}>{heroTitle}</Text>
              <View style={styles.heroMeta}>
                <Text style={styles.heroSubtitle}>{heroSubtitle}</Text>
                <View style={styles.listenerBadge}>
                  <Ionicons name="headset-outline" size={12} color="rgba(255,255,255,0.6)" />
                  <Text style={styles.listenerText}>{LISTENER_COUNT} listening</Text>
                </View>
              </View>
            </View>

            {/* Playback controls */}
            <View style={styles.controls}>
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                style={styles.controlButton}
                accessibilityLabel="Previous"
              >
                <Ionicons name="play-skip-back" size={22} color="rgba(255,255,255,0.6)" />
              </Pressable>

              <Animated.View style={playAnimatedStyle}>
                <Pressable
                  onPress={handlePlayToggle}
                  style={styles.playButton}
                  accessibilityRole="button"
                  accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
                >
                  <Ionicons
                    name={isPlaying ? 'pause' : 'play'}
                    size={28}
                    color="#FFFFFF"
                    style={!isPlaying ? { marginLeft: 3 } : undefined}
                  />
                </Pressable>
              </Animated.View>

              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                style={styles.controlButton}
                accessibilityLabel="Next"
              >
                <Ionicons name="play-skip-forward" size={22} color="rgba(255,255,255,0.6)" />
              </Pressable>
            </View>

            {/* Volume hint */}
            <View style={styles.volumeRow}>
              <Ionicons name="volume-low" size={16} color="rgba(255,255,255,0.4)" />
              <View style={styles.volumeTrack}>
                <View style={[styles.volumeFill, { width: '70%' }]} />
              </View>
              <Ionicons name="volume-high" size={16} color="rgba(255,255,255,0.4)" />
            </View>
          </View>
        </ImageBackground>
      </Animated.View>

      {/* Program Schedule */}
      <Animated.View entering={FadeInUp.duration(400).delay(200)} style={[styles.section, { marginTop: Spacing[6] }]}>
        <Text style={[styles.sectionLabel, { color: Colors.outline }]}>PROGRAM SCHEDULE</Text>
        {onlinePrograms.map((program, index) => (
          <Animated.View
            key={program.id}
            entering={FadeInUp.duration(300).delay(260 + index * 60)}
          >
            <ScheduleCard program={program} />
          </Animated.View>
        ))}
      </Animated.View>

      {/* Live Comments */}
      <Animated.View entering={FadeInUp.duration(400).delay(320)} style={[styles.section, { marginTop: Spacing[6] }]}>
        <Text style={[styles.sectionLabel, { color: Colors.outline }]}>LIVE COMMENTS</Text>

        {/* Comment input */}
        <View style={[styles.commentInputRow, { backgroundColor: Colors.surfaceLow }]}>
          <TextInput
            ref={commentInputRef}
            style={[styles.commentInput, { color: Colors.onSurface }]}
            value={commentText}
            onChangeText={setCommentText}
            placeholder="Say something..."
            placeholderTextColor={Colors.outline}
            returnKeyType="send"
            onSubmitEditing={handleSendComment}
          />
          <Pressable
            onPress={handleSendComment}
            hitSlop={8}
            style={[
              styles.sendButton,
              { backgroundColor: commentText.trim() ? Colors.primary : Colors.surfaceHigh },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Send comment"
          >
            <Ionicons
              name="arrow-up"
              size={18}
              color={commentText.trim() ? '#FFFFFF' : Colors.outline}
            />
          </Pressable>
        </View>

        {/* Comments list */}
        <View style={styles.commentsList}>
          {comments.map((comment, index) => (
            <Animated.View
              key={comment.id}
              entering={index === 0 && comment.time === 'Just now' ? FadeInRight.duration(250) : undefined}
              style={styles.commentRow}
            >
              <View style={[styles.commentAvatar, { backgroundColor: Colors.primaryLight }]}>
                <Text style={[styles.commentInitials, { color: Colors.primary }]}>{comment.initials}</Text>
              </View>
              <View style={styles.commentBody}>
                <View style={styles.commentHeader}>
                  <Text style={[styles.commentAuthor, { color: Colors.onSurface }]}>{comment.author}</Text>
                  <Text style={[styles.commentTime, { color: Colors.outline }]}>{comment.time}</Text>
                </View>
                <Text style={[styles.commentText, { color: Colors.onSurfaceVariant }]}>{comment.text}</Text>
              </View>
            </Animated.View>
          ))}
        </View>
      </Animated.View>

      {/* My Notes */}
      <Animated.View entering={FadeInUp.duration(400).delay(380)} style={[styles.section, { marginTop: Spacing[6] }]}>
        <View style={styles.notesHeader}>
          <Text style={[styles.notesLabel, { color: Colors.onSurface }]}>My notes</Text>
          {saved && <Text style={[styles.savedIndicator, { color: Colors.success }]}>Saved</Text>}
        </View>
        <TextInput
          style={[styles.notesInput, { backgroundColor: Colors.surfaceLow, color: Colors.onSurface }]}
          value={notes}
          onChangeText={handleNotesChange}
          placeholder="Write your notes — saved automatically."
          placeholderTextColor={Colors.outline}
          multiline
          textAlignVertical="top"
        />
      </Animated.View>

      <View style={{ height: Spacing[6] }} />
    </ScrollView>
  );
}

function ScheduleCard({ program }: { program: Program }) {
  const Colors = useThemeColors();

  const timeDisplay = [
    program.time,
    program.endTime ? `– ${program.endTime}` : null,
    program.duration ? `(${program.duration})` : null,
  ].filter(Boolean).join(' ');

  return (
    <View style={[styles.scheduleCard, AmbientShadow, { backgroundColor: Colors.surfaceLowest }]}>
      <ImageBackground
        source={program.image}
        resizeMode="cover"
        style={styles.scheduleImage}
        imageStyle={{ borderTopLeftRadius: Radius.lg, borderBottomLeftRadius: Radius.lg }}
      />
      <View style={styles.scheduleContent}>
        <Text style={[styles.scheduleTitle, { color: Colors.onSurface }]} numberOfLines={1}>
          {program.name}
        </Text>
        <Text style={[styles.scheduleDay, { color: Colors.onSurfaceVariant }]}>
          {program.day}{timeDisplay ? `, ${timeDisplay}` : ''}
        </Text>
        <View style={styles.scheduleTagRow}>
          <View style={[styles.scheduleTag, { backgroundColor: Colors.primaryLight }]}>
            <Ionicons name="radio-outline" size={11} color={Colors.primary} />
            <Text style={[styles.scheduleTagText, { color: Colors.primary }]}>
              {program.locationType === 'hybrid' ? 'In-person & Online' : 'Online'}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  section: {
    paddingHorizontal: Spacing[5],
  },
  // Hero player
  heroSection: {
    paddingHorizontal: Spacing[5],
    marginTop: Spacing[5],
  },
  heroImage: {
    width: '100%',
    minHeight: 320,
    justifyContent: 'flex-end',
  },
  heroScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(28, 28, 24, 0.55)',
    borderRadius: Radius.xl,
    justifyContent: 'flex-end',
    padding: Spacing[5],
    paddingBottom: Spacing[4],
  },
  liveBadge: {
    position: 'absolute',
    top: Spacing[4],
    left: Spacing[4],
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(171, 51, 50, 0.9)',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing[2],
    paddingVertical: 3,
    gap: 5,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
  },
  liveText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 10,
    lineHeight: 14,
    color: '#FFFFFF',
    letterSpacing: 0.8,
  },
  heroContent: {
    marginBottom: Spacing[5],
  },
  heroTitle: {
    fontFamily: FontFamily.display,
    fontSize: 26,
    lineHeight: 32,
    color: '#FFFFFF',
  },
  heroMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing[1],
  },
  heroSubtitle: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    lineHeight: 18,
    color: 'rgba(255,255,255,0.6)',
  },
  listenerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  listenerText: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 11,
    lineHeight: 15.4,
    color: 'rgba(255,255,255,0.6)',
  },
  // Playback controls
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[6],
    marginBottom: Spacing[4],
  },
  controlButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  // Volume
  volumeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
  },
  volumeTrack: {
    flex: 1,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  volumeFill: {
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  // Section label
  sectionLabel: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 11,
    lineHeight: 15.4,
    letterSpacing: 0.6,
    marginBottom: Spacing[4],
  },
  // Schedule cards
  scheduleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.lg,
    overflow: 'hidden',
    marginBottom: Spacing[3],
  },
  scheduleImage: {
    width: 72,
    alignSelf: 'stretch',
    overflow: 'hidden',
  },
  scheduleContent: {
    flex: 1,
    paddingVertical: Spacing[3],
    paddingHorizontal: Spacing[3],
    gap: 2,
  },
  scheduleTitle: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 14,
    lineHeight: 20,
  },
  scheduleDay: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    lineHeight: 18,
  },
  scheduleTagRow: {
    flexDirection: 'row',
    marginTop: 4,
  },
  scheduleTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing[2],
    paddingVertical: 2,
  },
  scheduleTagText: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 10,
    lineHeight: 14,
  },
  // Comments
  commentInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.full,
    paddingLeft: Spacing[4],
    paddingRight: Spacing[1],
    paddingVertical: Spacing[1],
    gap: Spacing[2],
  },
  commentInput: {
    flex: 1,
    fontFamily: FontFamily.body,
    fontSize: 14,
    lineHeight: 20,
    paddingVertical: Spacing[2],
  },
  sendButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentsList: {
    marginTop: Spacing[4],
    gap: Spacing[4],
  },
  commentRow: {
    flexDirection: 'row',
    gap: Spacing[3],
  },
  commentAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentInitials: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 11,
    lineHeight: 14,
  },
  commentBody: {
    flex: 1,
  },
  commentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  commentAuthor: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 13,
    lineHeight: 18,
  },
  commentTime: {
    fontFamily: FontFamily.body,
    fontSize: 10,
    lineHeight: 14,
  },
  commentText: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 1,
  },
  // Notes
  notesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing[3],
  },
  notesLabel: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 16,
    lineHeight: 24,
  },
  savedIndicator: {
    fontFamily: FontFamily.body,
    fontSize: 11,
    lineHeight: 15.4,
  },
  notesInput: {
    borderRadius: Radius.md,
    padding: Spacing[3],
    height: 120,
    fontFamily: FontFamily.body,
    fontSize: 14,
    lineHeight: 22.4,
  },
});
