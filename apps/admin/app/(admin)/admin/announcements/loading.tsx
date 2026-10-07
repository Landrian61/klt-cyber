import { ListPageSkeleton } from "@/components/ui/Skeletons";

// Announcements: header, New announcement action, table.
export default function Loading() {
  return <ListPageSkeleton columns={5} rows={5} actions={1} />;
}
