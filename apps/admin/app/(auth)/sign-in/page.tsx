"use client";

import { useState } from "react";
import Link from "next/link";
import { loadValidators, warmValidators } from "@/lib/validators";
import { authClient } from "@/lib/auth";
import { Card } from "@/components/shadcn/card";
import { Input } from "@/components/shadcn/input";
import { Button } from "@/components/shadcn/button";
import { Field } from "@/components/shadcn/field";
import { GoogleButton } from "@/components/ui/GoogleButton";
import { Stagger } from "@/components/motion/Stagger";
import { TextReveal } from "@/components/motion/TextReveal";

export default function SignInPage() {
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

    // Held from here rather than after validation: the validator import is
    // awaited, and Button disables on `loading`, so this keeps the awaited
    // gap from leaving the submit button live for a second click.
    setLoading(true);
    const { signInInputSchema } = await loadValidators();
    const parsed = signInInputSchema.safeParse({ email, password });
    if (!parsed.success) {
      setLoading(false);
      const flat = parsed.error.flatten().fieldErrors;
      setFieldErrors({
        email: flat.email?.[0],
        password: flat.password?.[0],
      });
      return;
    }

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
    // Hard navigation on purpose: the auth state just changed, and a
    // client-side push + refresh can race the App Router cache while the
    // session/middleware view of the world flips (headCacheNode crash).
    window.location.assign("/areas-of-service");
  }

  async function handleGoogle() {
    setFormError(null);
    setGoogleLoading(true);
    const { error } = await authClient.signIn.social({
      provider: "google",
      callbackURL: "/areas-of-service",
    });
    if (error) {
      setGoogleLoading(false);
      setFormError(error.message ?? "Google sign-in is unavailable right now.");
    }
    // On success the browser is redirected to Google — no further action.
  }

  return (
    <Card className="p-8">
      <TextReveal
        as="h1"
        text="Welcome back"
        stagger={70}
        className="font-display text-2xl font-bold tracking-tight text-on-surface"
      />

      <Stagger delay={260} gap={64}>
        <p className="mt-1.5 font-body text-base text-muted-foreground">
          Sign in to continue your stewardship.
        </p>

        {/* Warm the validator chunk once the user starts filling the form, so
            the dynamic import in handleSubmit is already resolved by submit. */}
        <form
          onSubmit={handleSubmit}
          onFocusCapture={warmValidators}
          noValidate
          className="mt-8 space-y-6"
        >
          <Field
            label="Email address"
            htmlFor="email"
            error={
              fieldErrors.email && "Please enter a valid email address."
            }
          >
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={!!fieldErrors.email}
              placeholder="you@example.com"
            />
          </Field>

          <Field
            label="Password"
            htmlFor="password"
            error={fieldErrors.password && "Please enter your password."}
          >
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={!!fieldErrors.password}
              placeholder="Enter your password"
            />
          </Field>

          <Button type="submit" loading={loading} className="w-full">
            Sign in
          </Button>

          {formError && (
            <p className="text-center font-body text-sm text-destructive">
              {formError}
            </p>
          )}
        </form>

        <Divider />

        <GoogleButton onClick={handleGoogle} disabled={googleLoading}>
          {googleLoading ? "Connecting…" : "Continue with Google"}
        </GoogleButton>

        <p className="mt-7 text-center font-body text-sm text-muted-foreground">
          New here?{" "}
          <Link
            href="/sign-up"
            className="font-medium text-primary underline underline-offset-2"
          >
            Create an account
          </Link>
        </p>
      </Stagger>
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
