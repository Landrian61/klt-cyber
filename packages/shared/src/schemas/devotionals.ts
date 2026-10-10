import { z } from "zod";
import { dateKeySchema } from "./dateKey";

export const DEVOTIONAL_TITLE_MAX = 120;
export const DEVOTIONAL_SCRIPTURE_MAX = 120;
export const DEVOTIONAL_BODY_MAX = 20000;

export const devotionalInputSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Title is required")
    .max(
      DEVOTIONAL_TITLE_MAX,
      `Title must be ${DEVOTIONAL_TITLE_MAX} characters or fewer`,
    ),
  scriptureReference: z
    .string()
    .trim()
    .min(1, "Scripture reference is required")
    .max(
      DEVOTIONAL_SCRIPTURE_MAX,
      `Scripture reference must be ${DEVOTIONAL_SCRIPTURE_MAX} characters or fewer`,
    ),
  body: z
    .string()
    .trim()
    .min(1, "Devotional text is required")
    .max(
      DEVOTIONAL_BODY_MAX,
      `Devotional text must be ${DEVOTIONAL_BODY_MAX} characters or fewer`,
    ),
  date: dateKeySchema,
});

export type DevotionalInput = z.infer<typeof devotionalInputSchema>;
