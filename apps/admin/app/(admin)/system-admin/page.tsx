import { Card } from "@/components/ui/Card";
import { Heading } from "@/components/ui/Heading";

// Stub: proves the role picker navigates correctly. Replaced in PR 11.
export default function SystemAdminDashboardPage() {
  return (
    <Card className="p-8">
      <Heading as="h1" size="xl">
        System Admin Dashboard
      </Heading>
      <p className="mt-4 font-body text-base text-on-surface-variant">
        Dashboard content coming in PR 11.
      </p>
    </Card>
  );
}
