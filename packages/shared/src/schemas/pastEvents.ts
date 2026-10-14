import { z } from "zod";
import { dateKeySchema } from "./dateKey";

// Regex-based on purpose: this module is also loaded by the mobile app, and
// React Native's URL / searchParams support is incomplete.
const VIDEO_ID = "([A-Za-z0-9_-]{11})";
const HOST =
  "(?:https?:\\/\\/)?(?:www\\.|m\\.|music\\.)?youtube(?:-nocookie)?\\.com";

const YOUTUBE_PATTERNS: RegExp[] = [
  // youtube.com/watch?v=ID, with v= anywhere in the query string
  new RegExp(`^${HOST}\\/watch\\?(?:[^#]*&)?v=${VIDEO_ID}(?:[&#]|$)`, "i"),
  // youtube.com/embed/ID, /shorts/ID, /live/ID, /v/ID
  new RegExp(
    `^${HOST}\\/(?:embed|shorts|live|v)\\/${VIDEO_ID}(?:[/?#]|$)`,
    "i",
  ),
  // youtu.be/ID
  new RegExp(`^(?:https?:\\/\\/)?youtu\\.be\\/${VIDEO_ID}(?:[/?#]|$)`, "i"),
];

/** The 11-character video ID in a YouTube link, or null if it isn't a single-video link. */
export function parseYouTubeVideoId(input: string): string | null {
  const trimmed = input.trim();
  for (const pattern of YOUTUBE_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

export function youtubeThumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

export function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export const PAST_EVENT_TITLE_MAX = 120;

export const pastEventInputSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Title is required")
    .max(
      PAST_EVENT_TITLE_MAX,
      `Title must be ${PAST_EVENT_TITLE_MAX} characters or fewer`,
    ),
  date: dateKeySchema,
  youtubeUrl: z
    .string()
    .trim()
    .refine((value) => parseYouTubeVideoId(value) !== null, {
      message: "Enter a link to a single YouTube video",
    }),
});

export type PastEventInput = z.infer<typeof pastEventInputSchema>;
