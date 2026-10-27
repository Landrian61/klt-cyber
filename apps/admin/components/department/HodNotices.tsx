"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { Send } from "lucide-react";
import { HOD_NOTICE_MAX_LENGTH } from "@klt-cyber/shared";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { api, type Id } from "@/lib/api";
import { errorMessage, Field } from "@/lib/content-helpers";
import { ActionButton } from "@/components/ui/ActionButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { SegmentedFilter } from "@/components/ui/FilterBar";
import { Badge } from "@/components/shadcn/badge";
import { Checkbox } from "@/components/shadcn/checkbox";
import { Textarea } from "@/components/shadcn/textarea";
import { Skeleton } from "@/components/shadcn/skeleton";
import { Reveal } from "@/components/motion/Reveal";
import { churchDateTimeLabel } from "@/lib/churchTime";

/**
 * Notices between department heads (spec 0012, AC-31, AC-32).
 *
 * One way, by design: there is no reply control here because the system offers
 * no reply path. A notice is addressed to departments rather than to people, so
 * it reaches whoever holds the head's seat when it is read — and a department
 * with no head at the moment simply has it waiting.
 */
export function HodNotices() {
  const [tab, setTab] = useState("received");
  const recipients = useAuthQuery(api.hodNotices.listNoticeRecipients);
  const received = useAuthQuery(api.hodNotices.listReceived, {});
  const sent = useAuthQuery(api.hodNotices.listSent, {});

  const sendNotice = useMutation(api.hodNotices.sendNotice);

  const [body, setBody] = useState("");
  const [toAll, setToAll] = useState(true);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function togglePick(id: string) {
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSend() {
    setError(null);
    if (!body.trim()) return setError("Write the notice first.");
    if (!toAll && picked.size === 0) {
      return setError("Choose at least one department, or send it to all.");
    }
    setSending(true);
    try {
      await sendNotice({
        body: body.trim(),
        scope: toAll ? "all" : "selected",
        recipientDepartmentIds: toAll
          ? []
          : ([...picked] as Id<"departments">[]),
      });
      setBody("");
      setPicked(new Set());
      setToAll(true);
      setTab("sent");
    } catch (mutationError) {
      setError(errorMessage(mutationError));
    } finally {
      setSending(false);
    }
  }

  if (received === null && sent === null) return <ErrorState />;

  const list = tab === "received" ? received : sent;

  return (
    <div className="space-y-8">
      <section className="space-y-4 rounded-md border border-border bg-surface-lowest p-5 shadow-e1">
        <Field
          label="Send a notice"
          htmlFor="notice-body"
          hint={`One way — there is no reply. ${HOD_NOTICE_MAX_LENGTH - body.length} characters left.`}
        >
          <Textarea
            id="notice-body"
            rows={4}
            value={body}
            maxLength={HOD_NOTICE_MAX_LENGTH}
            onChange={(event) => setBody(event.target.value)}
            placeholder="e.g. The sound desk is out for repair until Friday. Please plan around it."
          />
        </Field>

        <Field label="Who it goes to">
          <div className="space-y-3">
            <label className="flex items-center gap-2 font-body text-sm text-on-surface">
              <Checkbox
                checked={toAll}
                onCheckedChange={(checked) => setToAll(checked === true)}
              />
              Every department
            </label>

            {!toAll && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {recipients === undefined ? (
                  <Skeleton className="h-10 w-full" />
                ) : recipients === null || recipients.length === 0 ? (
                  <p className="font-body text-sm text-outline">
                    There is nobody else to send to.
                  </p>
                ) : (
                  recipients.map((department) => (
                    <label
                      key={department._id}
                      className="flex items-center gap-2 font-body text-sm text-on-surface"
                    >
                      <Checkbox
                        checked={picked.has(department._id)}
                        onCheckedChange={() => togglePick(department._id)}
                      />
                      {department.name}
                    </label>
                  ))
                )}
              </div>
            )}
          </div>
        </Field>

        {error && (
          <p role="alert" className="font-body text-sm text-error">
            {error}
          </p>
        )}

        <div className="flex justify-end">
          <ActionButton
            variant="gold"
            loading={sending}
            disabled={!body.trim()}
            onClick={handleSend}
          >
            <Send className="size-4" aria-hidden="true" />
            Send notice
          </ActionButton>
        </div>
      </section>

      <section className="space-y-3">
        <SegmentedFilter
          size="sm"
          ariaLabel="Which notices"
          value={tab}
          onChange={setTab}
          options={[
            { value: "received", label: "Received" },
            { value: "sent", label: "Sent" },
          ]}
        />

        {list === undefined ? (
          <div className="space-y-3" aria-busy="true">
            <Skeleton className="h-20 w-full rounded-md" />
            <Skeleton className="h-20 w-full rounded-md" />
          </div>
        ) : list === null ? (
          <ErrorState />
        ) : list.notices.length === 0 ? (
          <EmptyState
            title={
              tab === "received"
                ? "No notices for you yet"
                : "You have not sent a notice yet"
            }
            message={
              tab === "received"
                ? "Notices from other department heads will appear here."
                : "Anything you send will be kept here, however long ago."
            }
          />
        ) : (
          <Reveal as="ul" className="space-y-3">
            {list.notices.map((notice) => (
              <li
                key={notice._id}
                className="rounded-md border border-border bg-surface-lowest p-4 shadow-e1"
              >
                <p className="whitespace-pre-wrap font-body text-sm text-on-surface">
                  {notice.body}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge variant="role">
                    {tab === "received"
                      ? notice.senderDepartment ?? "Church office"
                      : notice.recipientNames.join(", ")}
                  </Badge>
                  <span className="font-body text-xs text-outline">
                    {notice.senderName} ·{" "}
                    <span className="font-mono">
                      {churchDateTimeLabel(notice.sentAt)}
                    </span>
                  </span>
                </div>
              </li>
            ))}
          </Reveal>
        )}
      </section>
    </div>
  );
}
