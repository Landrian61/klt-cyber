import { ListPageSkeleton } from "@/components/ui/Skeletons";

// Weekly program: header, New program action, table.
export default function Loading() {
  return <ListPageSkeleton columns={5} rows={5} actions={1} />;
}
