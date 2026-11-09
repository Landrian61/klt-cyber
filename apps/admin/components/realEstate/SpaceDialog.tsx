"use client";

import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import {
  RE_SPACE_DESCRIPTION_MAX_LENGTH,
  RE_SPACE_PRICE_MAX_UGX,
  RE_SPACE_SIZE_MAX_SQM,
  RE_SPACE_SIZE_MIN_SQM,
  RE_SPACE_TITLE_MAX_LENGTH,
  formatSpacePrice,
  isValidSpacePrice,
  isValidSpaceSize,
  normalizeE164Phone,
} from "@klt-cyber/shared";

import { api, type Id } from "@/lib/api";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { Field } from "@/components/shadcn/field";
import { Input } from "@/components/shadcn/input";
import { Textarea } from "@/components/shadcn/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/shadcn/select";
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
import { ImageGalleryUpload } from "@/components/ui/ImageGalleryUpload";
import { realEstateError } from "./realEstateErrors";

/**
 * Create or edit one space to let (spec 0018, AC-15).
 *
 * A floor is required here, unlike on a facility: one building, so naming the
 * floor places the space completely.
 *
 * Price and size are both optional and both have a meaning when left blank.
 * No price reads "Price on enquiry" in the app rather than "free", which is
 * the whole reason the field can be empty at all — a letting desk often does
 * not want the rent on a public listing.
 *
 * The contact fields are OVERRIDES. Left blank, each falls back independently
 * to the Real Estate department's own number, which is why the hint says so
 * rather than making an operator retype the same number on every listing.
 */
export function SpaceDialog({
  open,
  onOpenChange,
  spaceId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Absent means create. */
  spaceId?: Id<"realEstateSpaces">;
}) {
  const editing = !!spaceId;

  const existing = useAuthQuery(
    api.realEstate.getSpaceForPortal,
    open && spaceId ? { spaceId } : "skip",
  );
  const floors = useAuthQuery(
    api.realEstate.listFloorOptions,
    open ? {} : "skip",
  );

  const createSpace = useMutation(api.realEstate.createSpace);
  const updateSpace = useMutation(api.realEstate.updateSpace);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [floorId, setFloorId] = useState<string>("");
  const [size, setSize] = useState("");
  const [price, setPrice] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [contactPhone, setContactPhone] = useState("");
  const [contactWhatsapp, setContactWhatsapp] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (!editing) {
      setTitle("");
      setDescription("");
      setFloorId("");
      setSize("");
      setPrice("");
      setPhotos([]);
      setContactPhone("");
      setContactWhatsapp("");
      setError(null);
      return;
    }
    if (!existing) return;
    setTitle(existing.title);
    setDescription(existing.description ?? "");
    setFloorId(existing.floorId);
    setSize(existing.sizeSqm === undefined ? "" : String(existing.sizeSqm));
    setPrice(
      existing.priceUgxPerMonth === undefined
        ? ""
        : String(existing.priceUgxPerMonth),
    );
    setPhotos(existing.photos.map((photo) => photo.key));
    setContactPhone(existing.contactPhone ?? "");
    setContactWhatsapp(existing.contactWhatsapp ?? "");
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing, existing?._id]);

  const titleProblem =
    title.trim().length === 0
      ? "Give the space a title."
      : title.trim().length > RE_SPACE_TITLE_MAX_LENGTH
        ? `At most ${RE_SPACE_TITLE_MAX_LENGTH} characters.`
        : undefined;

  const floorProblem = floorId === "" ? "Choose the floor it is on." : undefined;

  const sizeNumber = size.trim() === "" ? undefined : Number(size);
  const sizeProblem =
    sizeNumber !== undefined &&
    (Number.isNaN(sizeNumber) || !isValidSpaceSize(sizeNumber))
      ? `Between ${RE_SPACE_SIZE_MIN_SQM} and ${RE_SPACE_SIZE_MAX_SQM} square metres.`
      : undefined;

  const priceNumber = price.trim() === "" ? undefined : Number(price);
  const priceProblem =
    priceNumber !== undefined &&
    (Number.isNaN(priceNumber) || !isValidSpacePrice(priceNumber))
      ? `A whole number of shillings, up to ${RE_SPACE_PRICE_MAX_UGX}.`
      : undefined;

  const phoneProblem =
    contactPhone.trim().length > 0 && normalizeE164Phone(contactPhone) === null
      ? "Use full international form, e.g. +256700123456."
      : undefined;
  const whatsappProblem =
    contactWhatsapp.trim().length > 0 &&
    normalizeE164Phone(contactWhatsapp) === null
      ? "Use full international form, e.g. +256700123456."
      : undefined;

  const blocked =
    !!titleProblem ||
    !!floorProblem ||
    !!sizeProblem ||
    !!priceProblem ||
    !!phoneProblem ||
    !!whatsappProblem;

  async function save() {
    if (blocked) return;
    setSaving(true);
    setError(null);
    try {
      const shared = {
        description,
        floorId: floorId as Id<"realEstateFloors">,
        // A blank field CLEARS, which is what the hints below promise. The
        // server reads `undefined` as "leave this alone", so a blank has to be
        // said out loud with the same `"none"` sentinel ids use.
        sizeSqm: sizeNumber ?? "none",
        priceUgxPerMonth: priceNumber ?? "none",
        photos,
        contactPhone: normalizeE164Phone(contactPhone) ?? "",
        contactWhatsapp: normalizeE164Phone(contactWhatsapp) ?? "",
      } as const;

      if (editing && spaceId) {
        await updateSpace({ spaceId, title, ...shared });
      } else {
        await createSpace({ title, ...shared });
      }
      onOpenChange(false);
    } catch (caught) {
      setError(realEstateError(caught));
    } finally {
      setSaving(false);
    }
  }

  const loadingExisting = editing && existing === undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AnimatedDialogContent
        open={open}
        className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"
      >
        <DialogHeader>
          <DialogTitle>
            {editing ? "Edit listing" : "List a space to let"}
          </DialogTitle>
          <DialogDescription>
            Available and reserved spaces appear in the app. A let one does not.
          </DialogDescription>
        </DialogHeader>

        {loadingExisting ? (
          <p className="py-8 text-center font-body text-sm text-on-surface-variant">
            Loading…
          </p>
        ) : editing && existing === null ? (
          <p className="py-8 text-center font-body text-sm text-on-surface-variant">
            That listing is no longer available.
          </p>
        ) : (
          <div className="space-y-4">
            <Field label="Title" htmlFor="space-title" error={titleProblem}>
              <Input
                id="space-title"
                value={title}
                maxLength={RE_SPACE_TITLE_MAX_LENGTH}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Corner shop, street frontage"
              />
            </Field>

            <Field label="Floor" htmlFor="space-floor" error={floorProblem}>
              <Select value={floorId} onValueChange={setFloorId}>
                <SelectTrigger id="space-floor">
                  <SelectValue placeholder="Choose a floor" />
                </SelectTrigger>
                <SelectContent>
                  {(floors ?? []).map((floor) => (
                    <SelectItem key={floor._id} value={floor._id}>
                      {floor.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Description" htmlFor="space-description" hint="Optional.">
              <Textarea
                id="space-description"
                rows={4}
                value={description}
                maxLength={RE_SPACE_DESCRIPTION_MAX_LENGTH}
                onChange={(event) => setDescription(event.target.value)}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Size"
                htmlFor="space-size"
                error={sizeProblem}
                hint="Square metres. Optional."
              >
                <Input
                  id="space-size"
                  inputMode="decimal"
                  value={size}
                  onChange={(event) => setSize(event.target.value)}
                  placeholder="48.5"
                />
              </Field>
              <Field
                label="Monthly rent"
                htmlFor="space-price"
                error={priceProblem}
                hint={
                  priceNumber === undefined
                    ? 'Blank reads "Price on enquiry".'
                    : formatSpacePrice(priceNumber)
                }
              >
                <Input
                  id="space-price"
                  inputMode="numeric"
                  value={price}
                  onChange={(event) => setPrice(event.target.value)}
                  placeholder="1200000"
                />
              </Field>
            </div>

            <div className="space-y-1.5">
              <p className="font-body text-sm font-medium text-on-surface">
                Photos
              </p>
              <ImageGalleryUpload
                value={photos}
                onChange={setPhotos}
                disabled={saving}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Phone override"
                htmlFor="space-phone"
                error={phoneProblem}
                hint="Blank uses the department's number."
              >
                <Input
                  id="space-phone"
                  value={contactPhone}
                  onChange={(event) => setContactPhone(event.target.value)}
                  placeholder="+256700123456"
                />
              </Field>
              <Field
                label="WhatsApp override"
                htmlFor="space-whatsapp"
                error={whatsappProblem}
                hint="Blank uses the department's number."
              >
                <Input
                  id="space-whatsapp"
                  value={contactWhatsapp}
                  onChange={(event) => setContactWhatsapp(event.target.value)}
                  placeholder="+256700123456"
                />
              </Field>
            </div>

            {error && (
              <p role="alert" className="font-body text-sm text-error">
                {error}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <ActionButton
            variant="gold"
            onClick={() => void save()}
            disabled={saving || blocked || loadingExisting}
            loading={saving}
          >
            {editing ? "Save changes" : "List space"}
          </ActionButton>
        </DialogFooter>
      </AnimatedDialogContent>
    </Dialog>
  );
}
