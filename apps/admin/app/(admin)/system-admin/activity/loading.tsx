import { ListPageSkeleton } from "@/components/ui/Skeletons";

// Activity log: header and a 25-row page of entries.
export default function Loading() {
  return <ListPageSkeleton columns={4} rows={25} actions={0} />;
}
