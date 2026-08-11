"use client";

import { useState } from "react";
import Link from "next/link";
import { signUpInputSchema } from "@klt-cyber/shared";
import { authClient } from "@/lib/auth";
import { Card } from "@/components/shadcn/card";
import { Input } from "@/components/shadcn/input";
import { Button } from "@/components/shadcn/button";
import { Field } from "@/components/shadcn/field";
import { GoogleButton } from "@/components/ui/GoogleButton";
import { Stagger } from "@/components/motion/Stagger";
import { TextReveal } from "@/components/motion/TextReveal";

export default function SignUpPage() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{
    firstName?: string;
    lastName?: string;
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

    const parsed = signUpInputSchema.safeParse({
      firstName,
      lastName,
      email,
      password,
    });
    if (!parsed.success) {
      const flat = parsed.error.flatten().fieldErrors;
      setFieldErrors({
        firstName: flat.firstName?.[0],
        lastName: flat.lastName?.[0],
        email: flat.email?.[0],
        password: flat.password?.[0],
      });
      return;
    }

    setLoading(true);
    // Sign-up (docs/DATA_MODEL.md, Increment 1): first/last name + email +
    // password. A fresh account is still a *visitor* (no church profile yet).
    // Better Auth stores a single `name`; the Convex onCreate trigger splits it
    // back into firstName/lastName — the same path Google sign-in uses.
    const { error } = await authClient.signUp.email({
      email: parsed.data.email,
      password: parsed.data.password,
      name: `${parsed.data.firstName} ${parsed.data.lastName}`,
    });
    setLoading(false);

    if (error) {
      setFormError(
        error.message ?? "We couldn't create your account. Please try again.",
      );
      return;
    }
    // Hard navigation on purpose — see the sign-in page's submit handler.
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
  }

  return (
    <Card className="p-8">
      <TextReveal
        as="h1"
        text="Create your account"
        highlight="account"
        stagger={64}
        className="font-display text-2xl font-bold tracking-tight text-on-surface"
      />

      <Stagger delay={300} gap={56}>
        <p className="mt-1.5 font-body text-base text-muted-foreground">
          Tell us your name, then an email and password to get started.
        </p>

        <form onSubmit={handleSubmit} noValidate className="mt-8 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <Field
              label="First name"
              htmlFor="firstName"
              error={fieldErrors.firstName && "Please enter your first name."}
            >
              <Input
                id="firstName"
                type="text"
                autoComplete="given-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                aria-invalid={!!fieldErrors.firstName}
                placeholder="Grace"
              />
            </Field>

            <Field
              label="Last name"
              htmlFor="lastName"
              error={fieldErrors.lastName && "Please enter your last name."}
            >
              <Input
                id="lastName"
                type="text"
                autoComplete="family-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                aria-invalid={!!fieldErrors.lastName}
                placeholder="Nakato"
              />
            </Field>
          </div>

          <Field
            label="Email address"
            htmlFor="email"
            error={fieldErrors.email && "Please enter a valid email address."}
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
            hint="Minimum 8 characters."
            error={
              fieldErrors.password && "Password must be at least 8 characters."
            }
          >
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={!!fieldErrors.password}
              placeholder="At least 8 characters"
            />
          </Field>

          <Button type="submit" loading={loading} className="w-full">
            Create account
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
          Already have an account?{" "}
          <Link
            href="/sign-in"
            className="font-medium text-primary underline underline-offset-2"
          >
            Sign in
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
