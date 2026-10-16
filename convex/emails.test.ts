// @vitest-environment node
//
// A source scan, not a behaviour test, so it needs `node:fs` rather than the
// edge runtime the rest of the Convex suite uses.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EMAIL_TEMPLATES } from "@klt-cyber/shared";
import { TEMPLATES } from "./lib/emails/templates";
import { escapeHtml, greeting, renderEmailHtml, renderEmailText } from "./lib/emails/layout";

const convexDir = fileURLToPath(new URL(".", import.meta.url));

/** Every `.ts` file in `convex/`, minus generated code and this test itself. */
function backendSourceFiles(dir = convexDir, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "_generated" || entry === "node_modules") continue;

    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      backendSourceFiles(path, found);
      continue;
    }
    if (!entry.endsWith(".ts")) continue;
    if (path === fileURLToPath(import.meta.url)) continue;

    found.push(path);
  }
  return found;
}

describe("the one send helper (AC-14)", () => {
  // The rule this guards: "exactly five emails" is only enforceable if every
  // send goes through `convex/emails.ts`, which knows the closed registry and
  // writes the activity log. A send from anywhere else bypasses both, so it
  // fails here rather than in review.
  it("calls the Resend component's sendEmail only from convex/emails.ts", () => {
    const offenders = backendSourceFiles()
      .filter((path) => readFileSync(path, "utf8").includes("sendEmail"))
      .map((path) => path.slice(convexDir.length).replace(/\\/g, "/"))
      .filter((relative) => relative !== "emails.ts");

    expect(offenders).toEqual([]);
  });

  it("renders exactly the five templates the shared registry declares", () => {
    expect(Object.keys(TEMPLATES).sort()).toEqual([...EMAIL_TEMPLATES].sort());
  });
});

describe("template rendering (AC-20)", () => {
  const data: Record<string, unknown> = {
    firstName: "Esther",
    url: "https://portal.example.org/reset-password?token=abc123",
    reason: "Please add your date of birth.",
  };

  it("gives every template a subject and both bodies", () => {
    for (const template of EMAIL_TEMPLATES) {
      const rendered = TEMPLATES[template](data);

      expect(rendered.subject, `${template} subject`).toBeTruthy();
      expect(rendered.html, `${template} html`).toContain("<html");
      expect(rendered.text, `${template} text`).toBeTruthy();
      expect(rendered.text, `${template} text`).not.toContain("<");
    }
  });

  it("greets by first name when there is one, neutrally when there is not", () => {
    expect(greeting("Esther")).toBe("Hello Esther,");
    expect(greeting(undefined)).toBe("Hello there,");
    expect(greeting("  ")).toBe("Hello there,");
  });

  it("escapes every interpolated value, including a name and a free text reason", () => {
    const hostile = '<script>alert("x")</script>';

    const sentBack = TEMPLATES.profile_sent_back({
      firstName: hostile,
      reason: hostile,
    });

    expect(sentBack.html).not.toContain("<script>");
    expect(sentBack.html).toContain("&lt;script&gt;");
    // The plain text body carries the raw characters on purpose: there is no
    // markup to escape there, and escaping would show "&amp;" to the reader.
    expect(sentBack.text).toContain(hostile);
  });

  it("escapes a reset URL so a token cannot break out of the href", () => {
    const rendered = TEMPLATES.password_reset({
      firstName: "Esther",
      url: 'https://example.org/reset?token=a"onmouseover="alert(1)',
    });

    expect(rendered.html).not.toContain('token=a"onmouseover');
    expect(rendered.html).toContain("&quot;");
  });

  it("states the configured expiry in the reset email, not a hardcoded number", () => {
    const rendered = TEMPLATES.password_reset(data);
    expect(rendered.text).toContain("1 hour");
  });

  it("keeps the profile verified email free of links and of membership claims", () => {
    const rendered = TEMPLATES.profile_verified(data);

    expect(rendered.html).not.toContain("<a ");
    expect(rendered.text.toLowerCase()).not.toContain("http");
    expect(rendered.text.toLowerCase()).not.toContain("mentorship");
    expect(rendered.text).toContain("verified");
  });

  it("carries exactly one action button in the reset email", () => {
    const rendered = TEMPLATES.password_reset(data);
    expect(rendered.html.match(/<a /g)?.length).toBe(1);
  });

  it("renders without a first name on every template", () => {
    for (const template of EMAIL_TEMPLATES) {
      const rendered = TEMPLATES[template]({ ...data, firstName: undefined });
      expect(rendered.html, `${template}`).toContain("Hello there,");
    }
  });
});

describe("escapeHtml", () => {
  it("covers the five characters that matter in content and attributes", () => {
    expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
  });

  it("escapes ampersands first, so an entity is not double escaped wrongly", () => {
    expect(escapeHtml("&lt;")).toBe("&amp;lt;");
  });
});

describe("the shared layout", () => {
  const body = { heading: "Heading", paragraphs: ["One", "Two"] };

  it("omits the action block entirely when a template has no link", () => {
    expect(renderEmailHtml(body)).not.toContain("<a ");
  });

  it("renders the same content in both bodies", () => {
    const text = renderEmailText(body);
    expect(text).toContain("Heading");
    expect(text).toContain("One");
    expect(text).toContain("Two");
  });
});
