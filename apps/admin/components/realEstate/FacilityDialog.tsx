"use client";

import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import {
  RE_FACILITY_DESCRIPTION_MAX_LENGTH,
  RE_FACILITY_NAME_MAX_LENGTH,
  RE_FACILITY_TAGLINE_MAX_LENGTH,
  RE_OPEN_STATE_LABELS,
  RE_SERVICES_MAX,
  RE_SERVICE_MAX_LENGTH,
  emptyOpeningHours,
  isFacilityOpenNow,
  normalizeE164Phone,
  openingHoursError,
  type RealEstateOpeningHoursEntry,
} from "@klt-cyber/shared";

import { api, type Id } from "@/lib/api";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { Field } from "@/components/shadcn/field";
import { Input } from "@/components/shadcn/input";
import { Textarea } from "@/components/shadcn/textarea";
import { Switch } from "@/components/shadcn/switch";
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
import { OpeningHoursEditor } from "./OpeningHoursEditor";
import { realEstateError } from "./realEstateErrors";

/** The literal the server reads as "take this off its floor" (AC-8). */
const NO_FLOOR = "none";

/**
 * Create or edit one facility (spec 0018, AC-8 to AC-11).
 *
 * Plain `useState` per field, which is this portal's form pattern: there is no
 * react-hook-form or zod here, and `LibraryItemDialog` beside it does the same.
 *
 * Three things in here are not obvious:
 *
 * - **The responsible person is one choice with two spellings.** Choosing a
 *   member and typing a name are mutually exclusive, and picking either CLEARS
 *   the other rather than refusing, so an operator switching from one to the
 *   other is never told off. Only a single save carrying both at once is
 *   refused, which the UI makes impossible anyway.
 * - **The hours have an on/off switch above them.** "Open every day except
 *   Sunday" and "nobody has told me the hours yet" are different facts, and
 *   the app says different things about them ("Closed" versus "Hours not
 *   listed"). Seven all-closed entries mean the first; no entries at all mean
 *   the second. Without this switch there would be no way to express the
 *   second once the first had been saved.
 * - **Phone numbers are normalised here, not refused.** A human types
 *   "+256 700 123 456"; `normalizeE164Phone` strips the spaces. The server
 *   refuses anything still not in E.164, so this is a courtesy, not the rule.
 */
export function FacilityDialog({
  open,
  onOpenChange,
  facilityId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Absent means create. */
  facilityId?: Id<"facilities">;
  onSaved?: () => void;
}) {
  const editing = !!facilityId;

  const existing = useAuthQuery(
    api.facilities.getForPortal,
    open && facilityId ? { facilityId } : "skip",
  );
  const floors = useAuthQuery(
    api.realEstate.listFloorOptions,
    open ? {} : "skip",
  );
  const [memberSearch, setMemberSearch] = useState("");
  const members = useAuthQuery(
    api.realEstate.searchResponsibleMembers,
    open ? { query: memberSearch } : "skip",
  );

  const createFacility = useMutation(api.facilities.createFacility);
  const updateFacility = useMutation(api.facilities.updateFacility);

  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [description, setDescription] = useState("");
  const [services, setServices] = useState("");
  const [floorId, setFloorId] = useState<string>(NO_FLOOR);
  const [photos, setPhotos] = useState<string[]>([]);
  const [contactPhone, setContactPhone] = useState("");
  const [contactWhatsapp, setContactWhatsapp] = useState("");
  const [responsibleUserId, setResponsibleUserId] = useState<string>(NO_FLOOR);
  const [contactPerson, setContactPerson] = useState("");
  const [hoursRecorded, setHoursRecorded] = useState(false);
  const [hours, setHours] = useState<RealEstateOpeningHoursEntry[]>(
    emptyOpeningHours(),
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load an existing facility into the form once it arrives, and reset to a
  // blank form for a create. Keyed on the dialog opening rather than on every
  // render, so an operator's half-typed edit is not overwritten by a live
  // query re-running underneath them.
  useEffect(() => {
    if (!open) return;
    if (!editing) {
      setName("");
      setTagline("");
      setDescription("");
      setServices("");
      setFloorId(NO_FLOOR);
      setPhotos([]);
      setContactPhone("");
      setContactWhatsapp("");
      setResponsibleUserId(NO_FLOOR);
      setContactPerson("");
      setHoursRecorded(false);
      setHours(emptyOpeningHours());
      setError(null);
      return;
    }
    if (!existing) return;
    setName(existing.name);
    setTagline(existing.tagline ?? "");
    setDescription(existing.description ?? "");
    setServices(existing.servicesOffered.join("\n"));
    setFloorId(existing.floorId ?? NO_FLOOR);
    setPhotos(existing.photos.map((photo) => photo.key));
    setContactPhone(existing.contactPhone ?? "");
    setContactWhatsapp(existing.contactWhatsapp ?? "");
    setResponsibleUserId(existing.responsibleUserId ?? NO_FLOOR);
    setContactPerson(existing.contactPerson ?? "");
    setHoursRecorded(existing.openingHours.length > 0);
    setHours(
      existing.openingHours.length === 7
        ? (existing.openingHours as RealEstateOpeningHoursEntry[])
        : emptyOpeningHours(),
    );
    setError(null);
    // `existing?._id` rather than `existing`: the object identity changes on
    // every live re-run, the id only when a different facility is opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing, existing?._id]);

  const serviceLines = services
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const hoursProblem = hoursRecorded ? openingHoursError(hours) : null;
  const tooManyServices = serviceLines.length > RE_SERVICES_MAX;
  const longService = serviceLines.some(
    (line) => line.length > RE_SERVICE_MAX_LENGTH,
  );

  const nameProblem =
    name.trim().length === 0
      ? "Give the facility a name."
      : name.trim().length > RE_FACILITY_NAME_MAX_LENGTH
        ? `At most ${RE_FACILITY_NAME_MAX_LENGTH} characters.`
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
    !!nameProblem ||
    !!phoneProblem ||
    !!whatsappProblem ||
    !!hoursProblem ||
    tooManyServices ||
    longService;

  // What the member will see, computed from the SAME shared function the
  // mobile screen uses, so this preview cannot flatter the real thing.
  const previewState = isFacilityOpenNow(hoursRecorded ? hours : undefined);

  const noContact =
    contactPhone.trim().length === 0 && contactWhatsapp.trim().length === 0;
  const unplaced = floorId === NO_FLOOR;

  async function save() {
    if (blocked) return;
    setSaving(true);
    setError(null);
    try {
      // `normalizeE164Phone` returns "" for a cleared field, which is exactly
      // the empty string the server reads as "clear this".
      const phone = normalizeE164Phone(contactPhone) ?? "";
      const whatsapp = normalizeE164Phone(contactWhatsapp) ?? "";
      const choosingMember = responsibleUserId !== NO_FLOOR;

      const shared = {
        tagline,
        description,
        servicesOffered: serviceLines,
        floorId: floorId === NO_FLOOR ? NO_FLOOR : (floorId as Id<"realEstateFloors">),
        photos,
        contactPhone: phone,
        contactWhatsapp: whatsapp,
        // Exactly one of the two carries a value; the other clears.
        responsibleUserId: choosingMember
          ? (responsibleUserId as Id<"users">)
          : NO_FLOOR,
        contactPerson: choosingMember ? "" : contactPerson,
        // An empty array is how "no hours recorded" is said, which is what
        // produces "Hours not listed" rather than "Closed" in the app.
        openingHours: hoursRecorded ? hours : [],
      } as const;

      if (editing && facilityId) {
        // `name` is passed explicitly here, exactly as on the create path.
        // Leaving it out of `shared` and relying on the spread meant
        // `updateFacility` never received it, so a rename was validated, saved
        // and silently discarded while the dialog reported success.
        await updateFacility({ facilityId, name, ...shared });
      } else {
        await createFacility({ name, ...shared });
      }
      onSaved?.();
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
          <DialogTitle>{editing ? "Edit facility" : "Add a facility"}</DialogTitle>
          <DialogDescription>
            A facility reaches the app once it is on a visible floor and has at
            least one number the congregation can tap.
          </DialogDescription>
        </DialogHeader>

        {loadingExisting ? (
          <p className="py-8 text-center font-body text-sm text-on-surface-variant">
            Loading…
          </p>
        ) : editing && existing === null ? (
          <p className="py-8 text-center font-body text-sm text-on-surface-variant">
            That facility is no longer available.
          </p>
        ) : (
          <div className="space-y-4">
            <Field label="Name" htmlFor="facility-name" error={nameProblem}>
              <Input
                id="facility-name"
                value={name}
                maxLength={RE_FACILITY_NAME_MAX_LENGTH}
                onChange={(event) => setName(event.target.value)}
                placeholder="Heritage Academy"
              />
            </Field>

            <Field
              label="Tagline"
              htmlFor="facility-tagline"
              hint="One line under the name. Optional."
            >
              <Input
                id="facility-tagline"
                value={tagline}
                maxLength={RE_FACILITY_TAGLINE_MAX_LENGTH}
                onChange={(event) => setTagline(event.target.value)}
                placeholder="Nursery to P7, day and boarding"
              />
            </Field>

            <Field
              label="Description"
              htmlFor="facility-description"
              hint="Optional."
            >
              <Textarea
                id="facility-description"
                rows={4}
                value={description}
                maxLength={RE_FACILITY_DESCRIPTION_MAX_LENGTH}
                onChange={(event) => setDescription(event.target.value)}
              />
            </Field>

            <Field
              label="Services offered"
              htmlFor="facility-services"
              error={
                tooManyServices
                  ? `At most ${RE_SERVICES_MAX} services.`
                  : longService
                    ? `Each service can be at most ${RE_SERVICE_MAX_LENGTH} characters.`
                    : undefined
              }
              hint={`One per line, up to ${RE_SERVICES_MAX}.`}
            >
              <Textarea
                id="facility-services"
                rows={3}
                value={services}
                onChange={(event) => setServices(event.target.value)}
                placeholder={"Boarding section\nDay section\nSchool bus"}
              />
            </Field>

            <Field
              label="Floor"
              htmlFor="facility-floor"
              hint={
                unplaced
                  ? "Not on a floor yet, so it stays out of the app."
                  : undefined
              }
            >
              <Select value={floorId} onValueChange={setFloorId}>
                <SelectTrigger id="facility-floor">
                  <SelectValue placeholder="Choose a floor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_FLOOR}>Not yet placed</SelectItem>
                  {(floors ?? []).map((floor) => (
                    <SelectItem key={floor._id} value={floor._id}>
                      {floor.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

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
                label="Phone"
                htmlFor="facility-phone"
                error={phoneProblem}
                hint="The facility's own desk number."
              >
                <Input
                  id="facility-phone"
                  value={contactPhone}
                  onChange={(event) => setContactPhone(event.target.value)}
                  placeholder="+256700123456"
                />
              </Field>
              <Field
                label="WhatsApp"
                htmlFor="facility-whatsapp"
                error={whatsappProblem}
                hint="Often the same number."
              >
                <Input
                  id="facility-whatsapp"
                  value={contactWhatsapp}
                  onChange={(event) => setContactWhatsapp(event.target.value)}
                  placeholder="+256700123456"
                />
              </Field>
            </div>

            {noContact && (
              <p className="rounded-lg bg-surface-low px-3 py-2 font-body text-xs text-on-surface-variant">
                With neither number set, this facility stays out of the app. You
                can still save it and come back to it.
              </p>
            )}

            <Field
              label="Find a member"
              htmlFor="facility-member-search"
              hint="Type part of a name to narrow the list below."
            >
              <Input
                id="facility-member-search"
                value={memberSearch}
                onChange={(event) => setMemberSearch(event.target.value)}
                placeholder="Nakato"
              />
            </Field>

            <Field
              label="Responsible person"
              htmlFor="facility-responsible"
              hint="Choose a member, or type a name below. Not both."
            >
              <Select
                value={responsibleUserId}
                onValueChange={(next) => {
                  setResponsibleUserId(next);
                  // Picking a member clears the typed name, so the two can
                  // never both be set (AC-9).
                  if (next !== NO_FLOOR) setContactPerson("");
                }}
              >
                <SelectTrigger id="facility-responsible">
                  <SelectValue placeholder="Nobody chosen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_FLOOR}>Nobody chosen</SelectItem>
                  {(members ?? []).map((member) => (
                    <SelectItem key={member._id} value={member._id}>
                      {member.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field
              label="Or a typed name"
              htmlFor="facility-contact-person"
              hint={
                responsibleUserId !== NO_FLOOR
                  ? "Clear the chosen member above to type a name instead."
                  : "For someone who is not a member here."
              }
            >
              <Input
                id="facility-contact-person"
                value={contactPerson}
                disabled={responsibleUserId !== NO_FLOOR}
                maxLength={RE_FACILITY_NAME_MAX_LENGTH}
                onChange={(event) => setContactPerson(event.target.value)}
                placeholder="School Bursar"
              />
            </Field>

            <div className="space-y-2">
              <label className="flex items-center gap-2">
                <Switch
                  id="facility-hours-recorded"
                  checked={hoursRecorded}
                  onCheckedChange={setHoursRecorded}
                />
                <span className="font-body text-sm font-medium text-on-surface">
                  Opening hours are known
                </span>
              </label>

              {hoursRecorded ? (
                <>
                  <OpeningHoursEditor
                    value={hours}
                    onChange={setHours}
                    disabled={saving}
                  />
                  {hoursProblem && (
                    <p role="alert" className="font-body text-xs text-error">
                      Each open day needs both a start and an end, and the two
                      cannot be the same time.
                    </p>
                  )}
                </>
              ) : (
                <p className="font-body text-xs text-on-surface-variant">
                  The app will read &ldquo;Hours not listed&rdquo; rather than
                  guessing the facility is closed.
                </p>
              )}

              <p className="font-body text-xs text-on-surface-variant">
                Right now a member would see:{" "}
                <span className="text-on-surface">
                  {RE_OPEN_STATE_LABELS[previewState]}
                </span>
              </p>
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
            {editing ? "Save changes" : "Add facility"}
          </ActionButton>
        </DialogFooter>
      </AnimatedDialogContent>
    </Dialog>
  );
}
