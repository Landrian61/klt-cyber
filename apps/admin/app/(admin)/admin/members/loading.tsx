import { ListPageSkeleton } from "@/components/ui/Skeletons";

// Members directory: header, search + Export CSV, 10-row table.
export default function Loading() {
  return <ListPageSkeleton columns={7} rows={10} actions={1} />;
}
