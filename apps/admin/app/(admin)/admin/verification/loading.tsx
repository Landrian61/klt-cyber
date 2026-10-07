import { ListPageSkeleton } from "@/components/ui/Skeletons";

// Verification queue: header and the pending-submissions table.
export default function Loading() {
  return <ListPageSkeleton columns={5} rows={5} actions={0} />;
}
