import { ContentClient } from "./ContentClient";

// Content management (DATA_MODEL.md, Increment 3). Lives inside the system_admin
// shell; writes are gated server-side by `canManageContent` (env allowlist) and
// the UI additionally checks `getMyContentAccess` before rendering the managers.
export default function ContentPage() {
  return <ContentClient />;
}
