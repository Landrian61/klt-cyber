"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { Megaphone, Send, Trash2 } from "lucide-react";
import { GROUP_MESSAGE_MAX_LENGTH } from "@klt-cyber/shared";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { api, type Id } from "@/lib/api";
import { errorMessage, Field } from "@/lib/content-helpers";
import { Heading } from "@/components/ui/Heading";
import { ActionButton } from "@/components/ui/ActionButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { ImageUpload } from "@/components/ui/ImageUpload";
import { SegmentedFilter } from "@/components/ui/FilterBar";
import { Textarea } from "@/components/shadcn/textarea";
import { Skeleton } from "@/components/shadcn/skeleton";
import { Reveal } from "@/components/motion/Reveal";
import { churchDateTimeLabel } from "@/lib/churchTime";
import type { DepartmentShellContext } from "./DepartmentShellProvider";
import { HodNotices } from "./HodNotices";

/**
 * Messaging the department, and the HOD-to-HOD notice board
 * (spec 0012, AC-28 to AC-32).
 *
 * Two different things on one page, because both are "word going out" and a
 * leader thinks of them together — but they are kept in separate tabs, since
 * one reaches your own roster and the other reaches other departments' heads
 * with no reply path.
 */
export function DepartmentMessages({
  departmentId,
  departmentName,
  can,
}: {
  departmentId: Id<"departments">;
  departmentName: string;
  can: DepartmentShellContext["can"];
}) {
  const [tab, setTab] = useState("department");

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Heading as="h1" size="xl">
          Messages
        </Heading>
        <p className="font-body text-sm text-on-surface-variant">
          Word to your own team, and notices between department heads.
        </p>
      </header>

      {can.sendHodNotice ? (
        <SegmentedFilter
          size="sm"
          ariaLabel="Which messages"
          value={tab}
          onChange={setTab}
          options={[
            { value: "department", label: departmentName },
            { value: "notices", label: "HOD notices" },
          ]}
        />
      ) : null}

      {tab === "department" || !can.sendHodNotice ? (
        <DepartmentThread
          departmentId={departmentId}
          departmentName={departmentName}
          can={can}
        />
      ) : (
        <HodNotices />
      )}
    </div>
  );
}

function DepartmentThread({
  departmentId,
  departmentName,
  can,
}: {
  departmentId: Id<"departments">;
  departmentName: string;
  can: DepartmentShellContext["can"];
}) {
  const [before, setBefore] = useState<number | undefined>(undefined);
  const data = useAuthQuery(api.groups.listDepartmentMessages, {
    departmentId,
    ...(before !== undefined ? { before } : {}),
  });

  const sendMessage = useMutation(api.groups.sendDepartmentMessage);
  const deleteMessage = useMutation(api.groups.deleteDepartmentMessage);

  const [body, setBody] = useState("");
  const [imageKey, setImageKey] = useState<string | undefined>(undefined);
  const [sending, setSending] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSend() {
    setError(null);
    if (!body.trim()) return setError("Write something to send.");
    setSending(true);
    try {
      await sendMessage({
        departmentId,
        body: body.trim(),
        ...(imageKey ? { imageKey } : {}),
      });
      setBody("");
      setImageKey(undefined);
    } catch (mutationError) {
      setError(errorMessage(mutationError));
    } finally {
      setSending(false);
    }
  }

  async function handleDelete(messageId: Id<"groupMessages">) {
    setError(null);
    setBusyId(messageId);
    try {
      await deleteMessage({ messageId });
    } catch (mutationError) {
      setError(errorMessage(mutationError));
    } finally {
      setBusyId(null);
    }
  }

  if (data === null) return <ErrorState />;

  return (
    <div className="space-y-8">
      {can.sendMessage && (
        <section className="space-y-4 rounded-md border border-border bg-surface-lowest p-5 shadow-e1">
          <Field
            label={`Message everyone serving in ${departmentName}`}
            htmlFor="message-body"
            hint={`The verified people on your roster get this on their phones and under "My groups". ${GROUP_MESSAGE_MAX_LENGTH - body.length} characters left.`}
          >
            <Textarea
              id="message-body"
              rows={4}
              value={body}
              maxLength={GROUP_MESSAGE_MAX_LENGTH}
              onChange={(event) => setBody(event.target.value)}
              placeholder="e.g. Rehearsal moves to 4pm on Saturday. Please be early."
            />
          </Field>

          <Field label="Picture (optional)">
            <ImageUpload value={imageKey} onChange={setImageKey} />
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
              Send
            </ActionButton>
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="font-body text-sm font-semibold uppercase tracking-[0.12em] text-on-surface-variant">
          Sent before
        </h2>

        {data === undefined ? (
          <div className="space-y-3" aria-busy="true">
            <Skeleton className="h-24 w-full rounded-md" />
            <Skeleton className="h-24 w-full rounded-md" />
          </div>
        ) : data.messages.length === 0 ? (
          <EmptyState
            title="Nothing has been sent yet"
            message={
              can.sendMessage
                ? "Your first message to this department will show up here."
                : "This department has not been messaged yet."
            }
          />
        ) : (
          <Reveal as="ul" className="space-y-3">
            {data.messages.map((message) => {
              const deletable = can.deleteAnyMessage || message.sentByMe;
              return (
                <li
                  key={message._id}
                  className="rounded-md border border-border bg-surface-lowest p-4 shadow-e1"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 flex-1 whitespace-pre-wrap font-body text-sm text-on-surface">
                      {message.body}
                    </p>
                    {deletable && (
                      <button
                        type="button"
                        aria-label="Delete this message"
                        disabled={busyId === message._id}
                        onClick={() => handleDelete(message._id)}
                        className="shrink-0 rounded-full p-1.5 text-on-surface-variant transition-colors hover:bg-crimson-light hover:text-crimson disabled:opacity-50"
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                  {message.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={message.imageUrl}
                      alt=""
                      className="mt-3 max-h-56 w-full rounded-md object-cover"
                    />
                  )}
                  <p className="mt-2 font-body text-xs text-outline">
                    {message.senderName} ·{" "}
                    <span className="font-mono">
                      {churchDateTimeLabel(message.sentAt)}
                    </span>
                  </p>
                </li>
              );
            })}
          </Reveal>
        )}

        {/* Paging replaces the list rather than extending it, so without a way
            back the newest messages would be unreachable until the page
            remounted. */}
        {(data?.nextBefore || before !== undefined) && (
          <div className="flex justify-center gap-2">
            {before !== undefined && (
              <ActionButton
                variant="neutral"
                onClick={() => setBefore(undefined)}
              >
                Back to latest
              </ActionButton>
            )}
            {data?.nextBefore && (
              <ActionButton
                variant="neutral"
                onClick={() => setBefore(data.nextBefore ?? undefined)}
              >
                Show older
              </ActionButton>
            )}
          </div>
        )}
      </section>

      {!can.sendMessage && (
        <p className="flex items-center gap-2 font-body text-xs text-outline">
          <Megaphone className="size-3.5" aria-hidden="true" />
          Only this department&apos;s head and its delegates can send messages.
        </p>
      )}
    </div>
  );
}
