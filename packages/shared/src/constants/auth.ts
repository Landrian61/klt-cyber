/**
 * No self-service web sign up (SRS F1-02, spec 0004): the email/password sign
 * up endpoint only accepts a request that carries this header, set explicitly
 * by the mobile app. Convex's HTTP Actions layer strips the `Origin` header
 * before any function sees it, so that can't be used to tell a mobile request
 * apart from a web one — a header the platform does deliver, set deliberately
 * by an honest client, is the only signal that actually works.
 */
export const CLIENT_PLATFORM_HEADER = 'x-client-platform';
export const MOBILE_CLIENT_PLATFORM = 'mobile';
