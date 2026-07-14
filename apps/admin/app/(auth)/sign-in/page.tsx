"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signInInputSchema } from "@klt-cyber/shared";
import { authClient } from "@/lib/auth";
import { Card } from "@/components/ui/Card";
import { Heading } from "@/components/ui/Heading";
import { Label } from "@/components/ui/Label";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { GoogleButton } from "@/components/ui/GoogleButton";

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{
    email?: string;
    password?: string;
  }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setFieldErrors({});

    const parsed = signInInputSchema.safeParse({ email, password });
    if (!parsed.success) {
      const flat = parsed.error.flatten().fieldErrors;
      setFieldErrors({
        email: flat.email?.[0],
        password: flat.password?.[0],
      });
      return;
    }

    setLoading(true);
    const { error } = await authClient.signIn.email({
      email: parsed.data.email,
      password: parsed.data.password,
    });
    setLoading(false);

    if (error) {
      // Single, non-leaky message — never disclose whether the email exists.
      setFormError("Invalid email or password.");
      return;
    }
    router.push("/select-role");
    router.refresh();
  }

  async function handleGoogle() {
    setFormError(null);
    setGoogleLoading(true);
    const { error } = await authClient.signIn.social({
      provider: "google",
      callbackURL: "/select-role",
    });
    if (error) {
      setGoogleLoading(false);
      setFormError(
        error.message ?? "Google sign-in is unavailable right now.",
      );
    }
    // On success the browser is redirected to Google — no further action.
  }

  return (
    <Card className="p-8">
      <Heading as="h1" size="xl">
        Welcome back
      </Heading>
      <p className="mt-1.5 font-body text-base text-on-surface-variant">
        Sign in to continue
      </p>

      <form onSubmit={handleSubmit} noValidate className="mt-8 space-y-6">
        <div className="space-y-2">
          <Label htmlFor="email">Email address</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={!!fieldErrors.email}
            placeholder="you@example.com"
          />
          {fieldErrors.email && (
            <p className="font-body text-xs text-error">
              Please enter a valid email address.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={!!fieldErrors.password}
            placeholder="Enter your password"
          />
          {fieldErrors.password && (
            <p className="font-body text-xs text-error">
              Please enter your password.
            </p>
          )}
        </div>

        <Button type="submit" loading={loading} className="w-full">
          Sign in
        </Button>

        {formError && (
          <p className="text-center font-body text-sm text-error">{formError}</p>
        )}
      </form>

      <Divider />

      <GoogleButton onClick={handleGoogle} disabled={googleLoading}>
        {googleLoading ? "Connecting…" : "Continue with Google"}
      </GoogleButton>

      <p className="mt-7 text-center font-body text-sm text-on-surface-variant">
        New here?{" "}
        <Link
          href="/sign-up"
          className="font-medium text-primary underline underline-offset-2"
        >
          Create an account
        </Link>
      </p>
    </Card>
  );
}

function Divider() {
  return (
    <div className="my-6 flex items-center gap-4" aria-hidden="true">
      <span className="h-px flex-1 bg-surface-high" />
      <span className="font-body text-xs text-outline">or</span>
      <span className="h-px flex-1 bg-surface-high" />
    </div>
  );
}
