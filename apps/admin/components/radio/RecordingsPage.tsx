"use client";

import { useMemo, useRef, useState } from "react";
import { useAction, useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Disc3, Upload } from "lucide-react";
import {
  RADIO_RECORDING_EXPORT_HINT,
  RADIO_RECORDING_MAX_BYTES,
  formatKampalaDayHeading,
  formatKampalaTime,
  isRadioAudioContentType,
  kampalaDateKeyAt,
} from "@klt-cyber/shared";

import { api, type Id } from "@/lib/api";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { Reveal } from "@/components/motion/Reveal";
import { Badge } from "@/components/shadcn/badge";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/shadcn/dialog";
import { AnimatedDialogContent } from "@/components/motion/AnimatedDialogContent";
import { ActionButton } from "@/components/ui/ActionButton";
import { Button } from "@/components/ui/Button";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Heading } from "@/components/ui/Heading";
import { Pagination } from "@/components/ui/Pagination";
import { radioError } from "./radioErrors";
import {
  discardUpload,
  hasResumableUpload,
  uploadRecording,
  type RecordingUploadApi,
  type UploadProgress,
} from "./recordingUpload";

type Row = NonNullable<FunctionReturnType<typeof api.radioRecordings.listForMedia>>[number];

const PAGE_SIZE = 20;

function formatLength(seconds: number | null): string {
  if (!seconds) return "Length unknown";
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m} min`;
}

function formatSize(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Media's Recordings page (spec 0019, AC-24 to AC-26): the finished broadcasts
 * of the last sixty days, newest first. Each takes one recording, uploaded in
 * resumable parts straight to storage. Uploading over an existing recording is
 * an explicit replacement, and Super T never takes one.
 */
export function RecordingsPage() {
  const rows = useAuthQuery(api.radioRecordings.listForMedia, {});
  const [page, setPage] = useState(1);
  const [target, setTarget] = useState<Row | null>(null);
  const [removing, setRemoving] = useState<Row | null>(null);

  const pageCount = rows ? Math.max(1, Math.ceil(rows.length / PAGE_SIZE)) : 1;
  const visible = useMemo(
    () => rows?.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [rows, page],
  );

  const columns: Column<Row>[] = [
    {
      key: "broadcast",
      header: "Broadcast",
      render: (row) => (
        <div className="min-w-0">
          <p className="font-body text-sm font-semibold text-on-surface">{row.title}</p>
          <p className="font-body text-xs text-on-surface-variant">
            {formatKampalaDayHeading(kampalaDateKeyAt(row.startsAt))} ·{" "}
            <span className="font-mono">{formatKampalaTime(row.startsAt)}</span>
          </p>
        </div>
      ),
    },
    {
      key: "recording",
      header: "Recording",
      render: (row) =>
        row.recording ? (
          <div className="font-body text-sm text-on-surface">
            <p className="font-mono">{formatLength(row.recording.durationSeconds)}</p>
            <p className="text-xs text-on-surface-variant">
              <span className="font-mono">{formatSize(row.recording.sizeBytes)}</span>
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-1">
            {row.isSuperT ? (
              <Badge variant="neutral">Never recorded</Badge>
            ) : row.isRecorded ? (
              <Badge variant="pending">Awaiting upload</Badge>
            ) : (
              <Badge variant="neutral">Not marked for recording</Badge>
            )}
            {row.status === "cancelled" && <Badge variant="rejected">Cancelled</Badge>}
          </div>
        ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (row) =>
        row.isSuperT ? null : (
          <div className="flex justify-end gap-2">
            <ActionButton variant="gold" onClick={() => setTarget(row)}>
              {row.recording ? "Replace" : "Upload"}
            </ActionButton>
            {row.recording && (
              <ActionButton variant="danger" onClick={() => setRemoving(row)}>
                Remove
              </ActionButton>
            )}
          </div>
        ),
    },
  ];

  if (rows === null) {
    return (
      <div className="space-y-6">
        <Heading as="h1" size="xl">
          Recordings
        </Heading>
        <ErrorState retry={() => window.location.reload()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Heading as="h1" size="xl">
          Recordings
        </Heading>
        <p className="font-body text-sm text-on-surface-variant">
          Finished broadcasts from the last sixty days. A recording appears in the app as soon
          as it is uploaded. Super T is never recorded.
        </p>
      </div>

      <Reveal>
        <DataTable
          columns={columns}
          rows={visible}
          rowKey={(row) => row._id}
          empty={
            <EmptyState
              icon={<Disc3 className="h-8 w-8" aria-hidden />}
              title="No finished broadcasts yet"
              message="Broadcasts show here once they have ended, ready for their recording."
            />
          }
        />
      </Reveal>
      <Pagination page={page} pageCount={pageCount} onPageChange={setPage} />

      <UploadDialog target={target} onClose={() => setTarget(null)} />
      <RemoveDialog target={removing} onClose={() => setRemoving(null)} />
    </div>
  );
}

function UploadDialog({ target, onClose }: { target: Row | null; onClose: () => void }) {
  const startUpload = useAction(api.recordings.startUpload);
  const listParts = useAction(api.recordings.listParts);
  const signParts = useAction(api.recordings.signParts);
  const completeUpload = useAction(api.recordings.completeUpload);
  const abortUpload = useAction(api.recordings.abortUpload);
  const uploadApi: RecordingUploadApi = {
    startUpload,
    listParts,
    signParts,
    completeUpload,
    abortUpload,
  };

  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const replacing = !!target?.recording;
  const resumable = !!(target && file && hasResumableUpload(target._id, file));

  function reset() {
    setFile(null);
    setConfirmReplace(false);
    setProgress(null);
    setError(null);
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  function close() {
    if (busy) return;
    reset();
    onClose();
  }

  function pick(next: File | null) {
    setError(null);
    setProgress(null);
    if (!next) {
      setFile(null);
      return;
    }
    if (next.size > RADIO_RECORDING_MAX_BYTES) {
      setError("A recording can be at most 500 MB. Export it at the setting below.");
      return;
    }
    if (next.type && !isRadioAudioContentType(next.type)) {
      setError("Recordings must be audio files.");
      return;
    }
    setFile(next);
  }

  async function upload() {
    if (!target || !file) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setError(null);
    try {
      await uploadRecording({
        api: uploadApi,
        broadcastId: target._id as Id<"radioBroadcasts">,
        file,
        replace: replacing,
        signal: controller.signal,
        onProgress: setProgress,
      });
      reset();
      onClose();
    } catch (caught) {
      setBusy(false);
      if (caught instanceof DOMException && caught.name === "AbortError") {
        setError("Paused. Pick the same file again to carry on from where it stopped.");
      } else {
        setError(radioError(caught));
      }
    } finally {
      abortRef.current = null;
    }
  }

  async function startOver() {
    if (!target || !file) return;
    await discardUpload(uploadApi, target._id as Id<"radioBroadcasts">, file);
    setProgress(null);
    setError(null);
  }

  const percent = progress ? Math.floor((progress.sentBytes / progress.totalBytes) * 100) : 0;

  return (
    <Dialog open={!!target} onOpenChange={(open) => !open && close()}>
      <AnimatedDialogContent open={!!target}>
        <DialogHeader>
          <DialogTitle>{replacing ? "Replace recording" : "Upload recording"}</DialogTitle>
          <DialogDescription>
            {target?.title}
            {target ? ` · ${formatKampalaDayHeading(kampalaDateKeyAt(target.startsAt))}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <p className="rounded-lg bg-surface-low px-3 py-2 font-body text-sm text-on-surface-variant">
            {RADIO_RECORDING_EXPORT_HINT}
          </p>

          <input
            ref={inputRef}
            type="file"
            accept="audio/*"
            disabled={busy}
            aria-label="Recording file"
            className="block w-full font-body text-sm text-on-surface file:mr-3 file:rounded-md file:border-0 file:bg-primary-light file:px-4 file:py-2 file:font-semibold file:text-primary"
            onChange={(event) => pick(event.target.files?.[0] ?? null)}
          />

          {file && resumable && !busy && (
            <p className="font-body text-sm text-on-surface-variant">
              An earlier upload of this file stopped partway. Uploading carries on from the last
              part storage holds.{" "}
              <button type="button" className="font-semibold text-primary underline" onClick={startOver}>
                Start over instead
              </button>
            </p>
          )}

          {replacing && file && !busy && (
            <label className="flex items-start gap-2 font-body text-sm text-on-surface">
              <input
                type="checkbox"
                checked={confirmReplace}
                onChange={(event) => setConfirmReplace(event.target.checked)}
                className="mt-1"
              />
              Replace the current recording. The old file is deleted once this one is in.
            </label>
          )}

          {progress && (
            <div aria-live="polite" className="space-y-1">
              <div className="h-2 overflow-hidden rounded-full bg-surface-high">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-300"
                  style={{ width: `${percent}%` }}
                />
              </div>
              <p className="font-body text-xs text-on-surface-variant">
                <span className="font-mono">{percent}%</span> ·{" "}
                <span className="font-mono">{formatSize(progress.sentBytes)}</span> of{" "}
                <span className="font-mono">{formatSize(progress.totalBytes)}</span>
                {progress.resumed ? " · resumed" : ""}
              </p>
            </div>
          )}

          {error && (
            <p role="alert" className="rounded-lg bg-error-light px-3 py-2 font-body text-sm text-error">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          {busy ? (
            <Button variant="secondary" size="sm" onClick={() => abortRef.current?.abort()}>
              Pause
            </Button>
          ) : (
            <Button variant="secondary" size="sm" onClick={close}>
              Cancel
            </Button>
          )}
          <Button
            size="sm"
            loading={busy}
            disabled={!file || busy || (replacing && !confirmReplace)}
            onClick={() => void upload()}
          >
            <Upload className="h-4 w-4" aria-hidden />
            {resumable ? "Resume upload" : replacing ? "Replace" : "Upload"}
          </Button>
        </DialogFooter>
      </AnimatedDialogContent>
    </Dialog>
  );
}

function RemoveDialog({ target, onClose }: { target: Row | null; onClose: () => void }) {
  const remove = useMutation(api.radioRecordings.remove);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      await remove({ broadcastId: target._id as Id<"radioBroadcasts"> });
      onClose();
    } catch (caught) {
      setError(radioError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!target} onOpenChange={(open) => !open && !busy && onClose()}>
      <AnimatedDialogContent open={!!target}>
        <DialogHeader>
          <DialogTitle>Remove recording</DialogTitle>
          <DialogDescription>
            The recording of {target?.title} leaves the app and its file is deleted. This cannot
            be undone.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <p role="alert" className="rounded-lg bg-error-light px-3 py-2 font-body text-sm text-error">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
            Keep it
          </Button>
          <ActionButton variant="danger" onClick={() => void confirm()} disabled={busy}>
            Remove
          </ActionButton>
        </DialogFooter>
      </AnimatedDialogContent>
    </Dialog>
  );
}
