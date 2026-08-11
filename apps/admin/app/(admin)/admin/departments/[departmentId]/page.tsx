import { DepartmentMembersClient } from "./DepartmentMembersClient";

export default async function DepartmentMembersPage({
  params,
}: {
  params: Promise<{ departmentId: string }>;
}) {
  const { departmentId } = await params;
  return <DepartmentMembersClient departmentId={departmentId} />;
}
