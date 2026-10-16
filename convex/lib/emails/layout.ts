/**
 * The shared shell every system email is rendered into (spec 0007, AC-20).
 *
 * Two rules hold this file together:
 *
 * 1. **Nothing interpolated reaches the HTML unescaped.** Templates hand this
 *    layout plain strings only — a greeting name, a send back reason — and the
 *    layout escapes every one of them on the way in. No template ever
 *    concatenates its own HTML, so the escaping rule is structural rather than
 *    a discipline somebody has to remember.
 * 2. **Every template renders both bodies.** `renderEmailHtml` and
 *    `renderEmailText` read the same `EmailBody`, so the plain text version is
 *    never generated from the HTML and never silently drifts from it.
 *
 * Email clients are a decade behind browsers, so this is table layout with
 * inline styles and no CSS custom properties. The colours are the Kingdom
 * Radiant palette from `spec/INTERFACE_SPEC.md` §1.2, written out as literals
 * because an email cannot read the design tokens.
 */

const PALETTE = {
  parchment: "#FDF8F0",
  card: "#FFFFFF",
  ink: "#241B10",
  inkVariant: "#5C4F3D",
  gold: "#C47F08",
  goldDeep: "#7A4E04",
  blueDeep: "#12306E",
  sunken: "#F6EDDE",
} as const;

// Brand faces first, then the stacks that actually exist on a mail client.
const DISPLAY_FONT =
  "'Bricolage Grotesque', 'Georgia', 'Times New Roman', serif";
const BODY_FONT =
  "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/** Fixed identity, per spec 0007: constants here, never configuration. */
export const CHURCH_NAME = "Kingdom Life Tabernacle";
export const CHURCH_SHORT_NAME = "KLT Cyber Church";
const SIGNATURE = "The Kingdom Life Tabernacle family";
const FOOTER_LINE = `You are receiving this because you have a ${CHURCH_SHORT_NAME} account.`;

/**
 * Escapes a value for safe inclusion in an HTML email body (AC-20).
 *
 * Covers the five characters that matter in both element content and quoted
 * attribute values, so one helper serves every position the layout uses.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * The greeting every template opens with (spec 0007, RECOMMEND 1).
 *
 * Many accounts arrive with no name at all — Google may give one, email signup
 * may not — and "Hi ," reads worse than a warm neutral greeting, so a missing
 * first name falls back to "Hello there,".
 */
export function greeting(firstName?: string | null): string {
  const trimmed = firstName?.trim();
  return trimmed ? `Hello ${trimmed},` : "Hello there,";
}

export interface EmailAction {
  label: string;
  url: string;
}

export interface EmailBody {
  /** The headline inside the card. Plain text; escaped by the layout. */
  heading: string;
  /** Body paragraphs in order. Plain text; each one escaped by the layout. */
  paragraphs: string[];
  /** At most one action button. Templates with no link omit it entirely. */
  action?: EmailAction;
  /** An indented quote block, used for the send back reason. */
  quote?: string;
  /** Small print under the body, e.g. "this link expires in 1 hour". */
  footnote?: string;
}

function paragraphHtml(text: string): string {
  return `<p style="margin:0 0 16px;font-family:${BODY_FONT};font-size:16px;line-height:26px;color:${PALETTE.ink};">${escapeHtml(
    text
  )}</p>`;
}

function actionHtml(action: EmailAction): string {
  // The URL is escaped like any other interpolated value, so a token carrying
  // a quote character cannot break out of the href attribute.
  return `
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;">
            <tr>
              <td align="center" bgcolor="${PALETTE.gold}" style="border-radius:999px;">
                <a href="${escapeHtml(action.url)}" style="display:inline-block;padding:14px 32px;font-family:${BODY_FONT};font-size:16px;font-weight:700;line-height:20px;color:#FFFFFF;text-decoration:none;border-radius:999px;">${escapeHtml(
                  action.label
                )}</a>
              </td>
            </tr>
          </table>`;
}

function quoteHtml(quote: string): string {
  return `
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px;">
            <tr>
              <td style="padding:16px 20px;background-color:${PALETTE.sunken};border-radius:12px;font-family:${BODY_FONT};font-size:15px;line-height:24px;color:${PALETTE.inkVariant};">${escapeHtml(
                quote
              )}</td>
            </tr>
          </table>`;
}

/**
 * Renders the HTML body. Every interpolated value passes through
 * `escapeHtml` on its way in; templates supply plain text only.
 */
export function renderEmailHtml(body: EmailBody): string {
  const paragraphs = body.paragraphs.map(paragraphHtml).join("\n          ");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(body.heading)}</title>
  </head>
  <body style="margin:0;padding:0;background-color:${PALETTE.parchment};">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${PALETTE.parchment};">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;">
            <tr>
              <td align="center" style="padding:0 0 24px;">
                <span style="font-family:${DISPLAY_FONT};font-size:22px;font-weight:700;color:${PALETTE.gold};">${escapeHtml(
                  CHURCH_SHORT_NAME
                )}</span>
              </td>
            </tr>
            <tr>
              <td style="padding:36px 32px;background-color:${PALETTE.card};border-radius:20px;">
                <h1 style="margin:0 0 20px;font-family:${DISPLAY_FONT};font-size:26px;line-height:32px;font-weight:700;color:${PALETTE.blueDeep};">${escapeHtml(
                  body.heading
                )}</h1>
                ${paragraphs}
                ${body.quote ? quoteHtml(body.quote) : ""}
                ${body.action ? actionHtml(body.action) : ""}
                ${
                  body.footnote
                    ? `<p style="margin:0;font-family:${BODY_FONT};font-size:14px;line-height:22px;color:${PALETTE.inkVariant};">${escapeHtml(
                        body.footnote
                      )}</p>`
                    : ""
                }
                <p style="margin:28px 0 0;font-family:${BODY_FONT};font-size:16px;line-height:26px;color:${PALETTE.goldDeep};">${escapeHtml(
                  SIGNATURE
                )}</p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:24px 16px 0;">
                <p style="margin:0;font-family:${BODY_FONT};font-size:12px;line-height:20px;color:${PALETTE.inkVariant};">${escapeHtml(
                  FOOTER_LINE
                )}</p>
                <p style="margin:6px 0 0;font-family:${BODY_FONT};font-size:12px;line-height:20px;color:${PALETTE.inkVariant};">${escapeHtml(
                  CHURCH_NAME
                )}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/**
 * Renders the plain text body from the same `EmailBody` the HTML uses, so the
 * two can never say different things. No escaping here: plain text has no
 * markup to escape, and escaping it would show `&amp;` to the reader.
 */
export function renderEmailText(body: EmailBody): string {
  const lines: string[] = [CHURCH_SHORT_NAME, "", body.heading, ""];

  for (const paragraph of body.paragraphs) {
    lines.push(paragraph, "");
  }
  if (body.quote) {
    lines.push(`  "${body.quote}"`, "");
  }
  if (body.action) {
    lines.push(`${body.action.label}: ${body.action.url}`, "");
  }
  if (body.footnote) {
    lines.push(body.footnote, "");
  }

  lines.push(SIGNATURE, "", "---", FOOTER_LINE, CHURCH_NAME);

  return lines.join("\n");
}
