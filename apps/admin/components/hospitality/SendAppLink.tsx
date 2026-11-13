"use client";

import { useState } from "react";
import { MessageCircle, MessageSquareText, Smartphone } from "lucide-react";
import {
  fillHospitalityTemplate,
  hospitalityContactLinks,
} from "@klt-cyber/shared";

import type { Id } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/shadcn/dialog";
import { Button } from "@/components/ui/Button";
import { LogContactDialog } from "./FollowUpActions";

/**
 * The app download link the `app_invite` template sends (spec 0024 value
 * sourcing). Unset means the invite is off, with a plain reason shown.
 */
const APP_LINK = process.env.NEXT_PUBLIC_APP_DOWNLOAD_URL ?? "";

/**
 * "Send app link" for a walk in with no account (AC-29, H1-02, H4-02).
 *
 * Opens WhatsApp or SMS on the operator's own phone, pre filled from the
 * `app_invite` wording; nothing is sent by the server. After the tap the
 * contact is logged like any other one tap action (AC-18). Shown only when
 * the row carries `invitePhone`, which the server sets only for a walk in
 * with no account and a phone kept with consent.
 */
export function SendAppLinkButton({
  visitorId,
  firstName,
  phone,
}: {
  visitorId: Id<"visitors">;
  firstName: string;
  phone: string;
}) {
  const [open, setOpen] = useState(false);
  const [logging, setLogging] = useState<"whatsapp" | "sms" | null>(null);

  const message = fillHospitalityTemplate("app_invite", {
    firstName,
    appLink: APP_LINK,
  });
  const links = hospitalityContactLinks(phone, message);
  const linkClass =
    "inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-md border border-border px-4 font-body text-sm font-semibold text-primary transition-colors hover:bg-primary-light";

  const tapped = (channel: "whatsapp" | "sms") => {
    setOpen(false);
    setLogging(channel);
  };

  return (
    <span onClick={(event) => event.stopPropagation()} className="inline-flex">
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Smartphone className="h-4 w-4" aria-hidden />
        Send app link
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send {firstName} the app link</DialogTitle>
            <DialogDescription>
              Your own phone sends it, by WhatsApp or SMS. Then record how it
              went.
            </DialogDescription>
          </DialogHeader>
          {APP_LINK ? (
            <>
              <p className="whitespace-pre-line rounded-md bg-surface-low p-3 font-body text-sm text-on-surface">
                {message}
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <a
                  href={links.whatsapp}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={linkClass}
                  onClick={() => tapped("whatsapp")}
                >
                  <MessageCircle className="h-4 w-4" aria-hidden />
                  WhatsApp
                </a>
                <a
                  href={links.sms}
                  className={linkClass}
                  onClick={() => tapped("sms")}
                >
                  <MessageSquareText className="h-4 w-4" aria-hidden />
                  SMS
                </a>
              </div>
            </>
          ) : (
            <p className="font-body text-sm text-on-surface-variant">
              App link not set up yet. Ask a System Admin to set the app
              download link for the portal.
            </p>
          )}
        </DialogContent>
      </Dialog>

      <LogContactDialog
        open={logging !== null}
        onOpenChange={(next) => !next && setLogging(null)}
        target={{ visitorId, firstName, phone, hasAccount: false }}
        initialChannel={logging ?? undefined}
      />
    </span>
  );
}
