"use client";

import { useRef, useState } from "react";
import { useMutation } from "convex/react";
import {
  RE_PHOTOS_MAX,
  RE_PHOTO_CONTENT_TYPES,
  RE_PHOTO_MAX_BYTES,
  isRealEstatePhotoContentType,
} from "@klt-cyber/shared";

import { api } from "@/lib/api";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { Button } from "@/components/ui/Button";

interface ImageGalleryUploadProps {
  /** Stored values, in order. `value[0]` is the cover. */
  value: string[];
  /** Emits the whole ordered list on every add, remove or move. */
  onChange: (value: string[]) => void;
  disabled?: boolean;
  /** How many photos this gallery allows. Defaults to the Real Estate cap. */
  max?: number;
}

const isHttp = (v?: string) => !!v && /^https?:\/\//i.test(v);

const MB = 1024 * 1024;

/**
 * An ordered, multi-photo R2 gallery (spec 0018, AC-11).
 *
 * Lands in `components/ui/` rather than in a Real Estate folder because the
 * next department needing a gallery should reuse this rather than copy it:
 * nothing in the portal had one before, and `ImageUpload` beside it handles
 * exactly one image and cannot grow into this without breaking its callers.
 *
 * THE ORDER IS THE DATA. `value[0]` is the cover, so choosing a cover is a
 * move rather than a separate pointer, which is what makes it impossible for a
 * cover to reference a photo that has since been removed.
 *
 * The type and size checks here are a COURTESY, not a boundary: they stop an
 * operator wasting a minute uploading a 9 MB photo that the server would
 * refuse anyway. `convex/lib/realEstateShared.ts` re-reads every object's real
 * size and content type back from R2 and refuses on that, because a check in
 * the browser is one devtools pause away from not existing.
 */
export function ImageGalleryUpload({
  value,
  onChange,
  disabled,
  max = RE_PHOTOS_MAX,
}: ImageGalleryUploadProps) {
  const generateUploadUrl = useMutation(api.uploads.generateUploadUrl);
  const syncMetadata = useMutation(api.uploads.syncMetadata);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const full = value.length >= max;
  const remaining = Math.max(0, max - value.length);

  async function handleFiles(files: File[]) {
    setBusy(true);
    setError(null);

    // Only as many as there is room for. Taking the first N rather than
    // refusing the whole drop, since an operator who selected eight photos
    // meant to add photos and would rather have six than none.
    const accepted = files.slice(0, remaining);
    const uploaded: string[] = [];

    try {
      for (const file of accepted) {
        if (!isRealEstatePhotoContentType(file.type)) {
          setError(
            `${file.name} is not a JPEG, PNG or WebP. Those are the three the app can display.`,
          );
          continue;
        }
        if (file.size > RE_PHOTO_MAX_BYTES) {
          setError(
            `${file.name} is ${(file.size / MB).toFixed(1)} MB. Each photo must be under ${Math.round(RE_PHOTO_MAX_BYTES / MB)} MB.`,
          );
          continue;
        }

        const { key, url } = await generateUploadUrl();
        const put = await fetch(url, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!put.ok) throw new Error(`Upload failed (${put.status})`);
        await syncMetadata({ key });
        uploaded.push(key);
      }

      if (uploaded.length > 0) onChange([...value, ...uploaded]);
      if (files.length > remaining) {
        setError(
          `Only ${remaining} more ${remaining === 1 ? "photo" : "photos"} would fit, so the rest were skipped.`,
        );
      }
    } catch {
      // Anything already uploaded in this batch is kept: losing four good
      // uploads because the fifth failed would be the worse outcome.
      if (uploaded.length > 0) onChange([...value, ...uploaded]);
      setError("Upload failed. Please try again.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= value.length) return;
    const next = [...value];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  }

  function remove(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept={RE_PHOTO_CONTENT_TYPES.join(",")}
        multiple
        hidden
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          if (files.length > 0) void handleFiles(files);
        }}
      />

      {value.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {value.map((key, index) => (
            <GalleryThumb
              key={key}
              objectKey={key}
              index={index}
              total={value.length}
              disabled={disabled || busy}
              onMoveEarlier={() => move(index, index - 1)}
              onMoveLater={() => move(index, index + 1)}
              onRemove={() => remove(index)}
            />
          ))}
        </ul>
      )}

      {!full && (
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => inputRef.current?.click()}
          className="flex h-24 w-full items-center justify-center rounded-lg bg-surface-lowest font-body text-sm text-on-surface-variant shadow-e1 transition hover:bg-surface-low disabled:opacity-60 disabled:shadow-none"
        >
          {busy
            ? "Uploading…"
            : value.length === 0
              ? "Upload photos"
              : `Add ${remaining === 1 ? "one more photo" : `up to ${remaining} more`}`}
        </button>
      )}

      <p className="font-body text-xs text-on-surface-variant">
        {full
          ? `All ${max} photo slots are used. Remove one to add another.`
          : `JPEG, PNG or WebP, up to ${Math.round(RE_PHOTO_MAX_BYTES / MB)} MB each. The first photo is the cover.`}
      </p>

      {error && (
        <p role="alert" className="font-body text-xs text-error">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * One thumbnail, resolving its own key to a signed preview URL.
 *
 * A component per photo rather than one query for the whole list, because
 * `api.uploads.getFileUrl` takes a single key and a hook cannot be called in a
 * loop. Each thumbnail owning its own subscription also means adding a photo
 * does not re-fetch the previews of the ones already there.
 */
function GalleryThumb({
  objectKey,
  index,
  total,
  disabled,
  onMoveEarlier,
  onMoveLater,
  onRemove,
}: {
  objectKey: string;
  index: number;
  total: number;
  disabled?: boolean;
  onMoveEarlier: () => void;
  onMoveLater: () => void;
  onRemove: () => void;
}) {
  const resolved = useAuthQuery(
    api.uploads.getFileUrl,
    isHttp(objectKey) ? "skip" : { key: objectKey },
  );
  const previewUrl = isHttp(objectKey) ? objectKey : (resolved ?? undefined);
  const pending = !isHttp(objectKey) && resolved === undefined;
  const isCover = index === 0;

  return (
    <li className="space-y-1.5">
      <div className="relative aspect-4/3 overflow-hidden rounded-lg bg-surface-low shadow-e1">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt={isCover ? "Cover photo" : `Photo ${index + 1}`}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center font-body text-xs text-outline">
            {pending ? "Loading…" : "No preview"}
          </div>
        )}
        {isCover && (
          <span className="absolute left-1.5 top-1.5 rounded-full bg-primary px-2 py-0.5 font-body text-[0.625rem] font-semibold tracking-wide text-on-primary">
            Cover
          </span>
        )}
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled || index === 0}
          onClick={onMoveEarlier}
          aria-label={
            index === 1
              ? `Make photo ${index + 1} the cover`
              : `Move photo ${index + 1} earlier`
          }
        >
          ←
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled || index === total - 1}
          onClick={onMoveLater}
          aria-label={`Move photo ${index + 1} later`}
        >
          →
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={onRemove}
          aria-label={`Remove photo ${index + 1}`}
        >
          Remove
        </Button>
      </div>
    </li>
  );
}
