import { DashboardClient } from "./DashboardClient";

// The dashboard is live Convex data (stats + activity feed), so the page
// itself is a thin server shell around the client composition. Role
// verification happens in the segment layout.
export default function SystemAdminDashboardPage() {
  return <DashboardClient />;
}
