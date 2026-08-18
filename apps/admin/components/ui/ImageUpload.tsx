"use client";

import { useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/lib/api";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { Button } from "@/components/ui/Button";

interface ImageUploadProps {
  /** Stored value: an R2 object key, or (legacy/seeded) an absolute http(s) URL. */
  value?: string;
  /** Emits the R2 key on upload, or undefined on remove. */
  onChange: (value: string | undefined) => void;
  disabled?: boolean;
}

const isHttp = (v?: string) => !!v && /^https?:\/\//i.test(v);

/**
 * Uploads an image directly to Cloudflare R2 (via convex/uploads.ts) and stores
 * its object KEY — the same round trip the mobile app uses. Admins upload files;
 * they never paste URLs. Existing absolute-URL values (seeded content) still
 * preview and can be replaced. The stored key is resolved to a signed URL for
 * display in both apps by the content queries (convex/lib/media.ts).
 */
export function ImageUpload({ value, onChange, disabled }: ImageUploadProps) {
  const generateUploadUrl = useMutation(api.uploads.generateUploadUrl);
  const syncMetadata = useMutation(api.uploads.syncMetadata);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Resolve an R2 key to a signed preview URL; absolute URLs display directly.
  const resolved = useAuthQuery(
    api.uploads.getFileUrl,
    value && !isHttp(value) ? { key: value } : "skip"
  );
  const previewUrl = isHttp(value) ? value : resolved ?? undefined;
  const previewPending = !!value && !isHttp(value) && resolved === undefined;

  async function handleFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      const { key, url } = await generateUploadUrl();
      const put = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!put.ok) throw new Error(`Upload failed (${put.status})`);
      await syncMetadata({ key });
      onChange(key);
    } catch {
      setError("Upload failed. Please try again.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />

      {value ? (
        <div className="flex items-start gap-3">
          <div className="h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-surface-low">
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt="Cover preview" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center font-body text-xs text-outline">
                {previewPending ? "Loading…" : "No preview"}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              disabled={disabled || busy}
              loading={busy}
              onClick={() => inputRef.current?.click()}
            >
              Replace
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={disabled || busy}
              onClick={() => onChange(undefined)}
            >
              Remove
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => inputRef.current?.click()}
          className="flex h-24 w-full items-center justify-center rounded-lg bg-surface-lowest font-body text-sm text-on-surface-variant shadow-e1 transition hover:bg-surface-low disabled:opacity-60 disabled:shadow-none"
        >
          {busy ? "Uploading…" : "Upload an image"}
        </button>
      )}

      {error && <p className="font-body text-xs text-error">{error}</p>}
    </div>
  );
}
