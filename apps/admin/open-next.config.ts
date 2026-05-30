import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// OpenNext Cloudflare adapter config. Defaults are sufficient for this app:
// no incremental cache / ISR is configured yet (the admin renders per-request
// with a server-read session token). Add `incrementalCache` (e.g. an R2
// binding) here if ISR/cached routes are introduced later.
export default defineCloudflareConfig({});
