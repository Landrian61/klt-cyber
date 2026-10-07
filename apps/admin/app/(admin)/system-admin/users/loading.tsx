import { ListPageSkeleton } from "@/components/ui/Skeletons";

// User directory: header, search + filters, 25-row page.
export default function Loading() {
  return <ListPageSkeleton columns={5} rows={25} actions={1} />;
}
