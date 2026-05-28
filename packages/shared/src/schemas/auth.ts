import { z } from 'zod';
import { USER_ROLES, USER_STATUSES } from '../enums/user';

export const signUpInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});
export type SignUpInput = z.infer<typeof signUpInputSchema>;

export const signInInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type SignInInput = z.infer<typeof signInInputSchema>;

export const accountSchema = z.object({
  authId: z.string(),
  email: z.string().email(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  profilePictureUrl: z.string().url().optional(),
  role: z.enum(USER_ROLES),
  status: z.enum(USER_STATUSES),
  profileCompleted: z.boolean(),
});
export type Account = z.infer<typeof accountSchema>;
