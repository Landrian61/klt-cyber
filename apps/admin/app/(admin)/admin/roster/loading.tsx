import { ListPageSkeleton } from "@/components/ui/Skeletons";

// Administration roster: header, search + Add member, 10-row table.
export default function Loading() {
  return <ListPageSkeleton columns={5} rows={10} actions={1} />;
}
