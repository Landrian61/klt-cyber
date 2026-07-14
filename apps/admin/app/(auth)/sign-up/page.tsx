"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signUpInputSchema } from "@klt-cyber/shared";
import { authClient } from "@/lib/auth";
import { Card } from "@/components/ui/Card";
import { Heading } from "@/components/ui/Heading";
import { Label } from "@/components/ui/Label";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { GoogleButton } from "@/components/ui/GoogleButton";

export default function SignUpPage() {
  const router = useRouter();
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
  }

  return (
    <Card className="p-8">
      <Heading as="h1" size="xl">
        Create your account
      </Heading>
      <p className="mt-1.5 font-body text-base text-on-surface-variant">
        Tell us your name, then an email and password to get started.
      </p>

      <form onSubmit={handleSubmit} noValidate className="mt-8 space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="firstName">First name</Label>
            <Input
              id="firstName"
              type="text"
              autoComplete="given-name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              error={!!fieldErrors.firstName}
              placeholder="Grace"
            />
            {fieldErrors.firstName && (
              <p className="font-body text-xs text-error">
                Please enter your first name.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="lastName">Last name</Label>
            <Input
              id="lastName"
              type="text"
              autoComplete="family-name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              error={!!fieldErrors.lastName}
              placeholder="Nakato"
            />
            {fieldErrors.lastName && (
              <p className="font-body text-xs text-error">
                Please enter your last name.
              </p>
            )}
          </div>
        </div>

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
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={!!fieldErrors.password}
            placeholder="At least 8 characters"
          />
          {fieldErrors.password ? (
            <p className="font-body text-xs text-error">
              Password must be at least 8 characters.
            </p>
          ) : (
            <p className="font-body text-xs text-on-surface-variant">
              Minimum 8 characters.
            </p>
          )}
        </div>

        <Button type="submit" loading={loading} className="w-full">
          Create account
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
        Already have an account?{" "}
        <Link
          href="/sign-in"
          className="font-medium text-primary underline underline-offset-2"
        >
          Sign in
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
