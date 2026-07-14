import { UserDetailClient } from "./UserDetailClient";

// Server shell for /system-admin/users/[userId]. Auth is enforced by the
// system-admin layout (server) and again by every Convex function; the page
// itself just unwraps the route param (a Promise in Next 16) and hands off to
// the reactive client view.
export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  return <UserDetailClient userId={userId} />;
}
