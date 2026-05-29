"use client";

import { authClient } from "@/lib/auth";
import { Card } from "@/components/ui/Card";
import { Heading } from "@/components/ui/Heading";

// Protected placeholder served at "/". Shows the signed-in identity and notes
// that profile completion (visitor → member) is the next planned feature.
export default function AdminHomePage() {
  const { data: session, isPending } = authClient.useSession();
  const email = session?.user?.email;

  return (
    <div className="max-w-2xl">
      <Card className="p-8">
        <Heading as="h1" size="xl">
          Welcome to KLT Cyber admin.
        </Heading>

        <dl className="mt-6 space-y-4">
          <div>
            <dt className="font-body text-xs font-semibold uppercase tracking-wide text-outline">
              Signed in as
            </dt>
            <dd className="mt-1 font-body text-base font-medium text-on-surface">
              {isPending ? "Loading…" : (email ?? "—")}
            </dd>
          </div>
          <div>
            <dt className="font-body text-xs font-semibold uppercase tracking-wide text-outline">
              Role
            </dt>
            <dd className="mt-1">
              <span className="rounded-full bg-royal-light px-2.5 py-0.5 font-body text-xs font-semibold text-royal">
                Visitor
              </span>
            </dd>
          </div>
        </dl>

        <div className="mt-8 rounded-lg bg-surface-low p-4">
          <p className="font-body text-sm text-on-surface-variant">
            You&apos;re signed in as a <strong className="text-on-surface">visitor</strong>.
            Completing your member profile — which promotes a visitor to a
            member — is the next planned feature.
          </p>
        </div>
      </Card>
    </div>
  );
}
