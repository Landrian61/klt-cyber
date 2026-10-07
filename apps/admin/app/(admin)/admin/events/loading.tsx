import { ListPageSkeleton } from "@/components/ui/Skeletons";

// Events: header, New event action, events table.
export default function Loading() {
  return <ListPageSkeleton columns={5} rows={5} actions={1} />;
}
