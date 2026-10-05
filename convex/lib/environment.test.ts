import { describe, expect, it } from "vitest";
import { isProductionDeployment, assertSampleSeedAllowed } from "./environment";

describe("isProductionDeployment", () => {
  it("is true when the URL matches the production URL exactly", () => {
    expect(
      isProductionDeployment("https://foo.convex.cloud", "https://foo.convex.cloud")
    ).toBe(true);
  });

  it("is true when the URLs match except for a trailing slash", () => {
    expect(
      isProductionDeployment("https://foo.convex.cloud/", "https://foo.convex.cloud")
    ).toBe(true);
    expect(
      isProductionDeployment("https://foo.convex.cloud", "https://foo.convex.cloud/")
    ).toBe(true);
  });

  it("is false when the production URL is unset (today's real state)", () => {
    expect(isProductionDeployment("https://foo.convex.cloud", "")).toBe(false);
  });

  it("is false when the deployment URL is unset (e.g. under the test runner)", () => {
    expect(isProductionDeployment(undefined, "https://foo.convex.cloud")).toBe(false);
  });

  it("is false when the URLs simply differ", () => {
    expect(
      isProductionDeployment("https://staging.convex.cloud", "https://foo.convex.cloud")
    ).toBe(false);
  });
});

describe("assertSampleSeedAllowed", () => {
  it("throws when allowSampleData is false", () => {
    expect(() => assertSampleSeedAllowed(false)).toThrow(/allowSampleData/);
  });

  it("throws when allowSampleData is omitted (undefined)", () => {
    expect(() => assertSampleSeedAllowed(undefined)).toThrow(/allowSampleData/);
  });

  it("does not throw when allowSampleData is true and not production", () => {
    expect(() => assertSampleSeedAllowed(true)).not.toThrow();
  });

  it("throws when allowSampleData is true but the deployment is production — defense in depth", () => {
    expect(() =>
      assertSampleSeedAllowed(
        true,
        "https://foo.convex.cloud",
        "https://foo.convex.cloud"
      )
    ).toThrow(/production/);
  });
});
