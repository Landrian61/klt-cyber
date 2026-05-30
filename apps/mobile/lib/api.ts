// Stable re-export of the Convex generated API for the mobile app.
//
// The generated client lives at the repo root (`convex/_generated`). Metro
// watches the workspace root (see metro.config.js), so this relative import
// resolves at bundle time; screens and hooks import `api` (and the id/doc
// types) from '@/lib/api' rather than reaching across the monorepo themselves.
export { api } from '../../../convex/_generated/api';
export type { Id, Doc } from '../../../convex/_generated/dataModel';
