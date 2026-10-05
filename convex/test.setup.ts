/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import schema from "./schema";

// Shared by every `*.test.ts` file: the glob lets convex-test resolve
// function references (internal.*, api.*) against the real bundle.
const modules = import.meta.glob("./**/*.*s");

export function testConvex() {
  return convexTest(schema, modules);
}

export const SEED_ADMIN_EMAIL = "admin@seed.kltcyberchurch.org";
