"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth";
import { Card } from "@/components/ui/Card";
import { Heading } from "@/components/ui/Heading";
import { Button } from "@/components/ui/Button";

// Public: reached either after middleware kicks out a 0-role signed-in user,
// or by direct/signed-out navigation. Handles both — the sign-out action only
// renders when there's an active session.
export default function UnauthorizedPage() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    await authClient.signOut();
    router.push("/sign-in");
    router.refresh();
  }

  return (
    <Card className="p-8">
      <Heading as="h1" size="xl">
        This portal is for administrative roles
      </Heading>
      <p className="mt-4 font-body text-base text-on-surface-variant">
        You&apos;ve signed in successfully, but you don&apos;t have any
        administrative roles assigned yet. If you&apos;re a member of the
        church community, please use the mobile app to access member
        features.
      </p>

      {!isPending && session?.user && (
        <Button
          onClick={handleSignOut}
          loading={signingOut}
          className="mt-8 w-full"
        >
          Sign out
        </Button>
      )}

      <p className="mt-7 text-center font-body text-sm text-on-surface-variant">
        Contact your system administrator.
      </p>
    </Card>
  );
}
