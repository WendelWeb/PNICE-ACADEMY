/**
 * Single source of truth for whether Clerk is active. When the publishable key
 * is absent (no .env.local yet) the whole app falls back to the mock auth UI and
 * keeps running. Drop the keys in and Clerk activates automatically.
 *
 * Keep this file dependency-free: it is imported by the Edge middleware.
 */
export const clerkEnabled = Boolean(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
);
