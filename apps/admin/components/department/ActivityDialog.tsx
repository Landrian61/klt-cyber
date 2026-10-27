"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import {
  ACTIVITY_DESCRIPTION_MAX_LENGTH,
  ACTIVITY_LOCATION_MAX_LENGTH,
  ACTIVITY_TITLE_MAX_LENGTH,
  CANCELLATION_REASON_MAX_LENGTH,
} from "@klt-cyber/shared";
import { api, type Id } from "@/lib/api";
import { errorMessage, Field } from "@/lib/content-helpers";
import { ActionButton } from "@/components/ui/ActionButton";
import { ImageUpload } from "@/components/ui/ImageUpload";
import { TimeRangeField } from "@/components/ui/TimePicker";
import { Input } from "@/components/shadcn/input";
import { Textarea } from "@/components/shadcn/textarea";
import { Dialog, DialogHeader, DialogTitle } from "@/components/shadcn/dialog";
import { AnimatedDialogContent } from "@/components/motion/AnimatedDialogContent";
import { churchDateInput, churchTimeInput } from "@/lib/churchTime";

/**
 * Schedule, edit or cancel one department activity (spec 0012, AC-22, AC-25).
 *
 * The date and the two times are sent as the HOD typed them, and the server
 * reads them as church local time (Africa/Kampala). That is the whole reason
 * this form does not hand over an instant: a browser left on another timezone
 * would compute a different one, and a service would quietly move.
 *
 * Which edits notify the roster is the server's call, not this form's: changing
 * the date, time, place or cancelling tells the verified roster; fixing a title
 * or a picture tells nobody (AC-23).
 */

type Activity = {
  _id: Id<"groupActivities">;
  title: string;
  description: string | null;
  startDateTime: number;
  endDateTime: number;
  location: string | null;
  imageKey: string | null;
  cancelled: boolean;
};

export function ActivityDialog({
  departmentId,
  activity,
  canCancel,
  onClose,
}: {
  departmentId: Id<"departments">;
  activity: Activity | null;
  canCancel: boolean;
  onClose: () => void;
}) {
  const createActivity = useMutation(api.departmentActivities.createActivity);
  const updateActivity = useMutation(api.departmentActivities.updateActivity);
  const cancelActivity = useMutation(api.departmentActivities.cancelActivity);

  const [title, setTitle] = useState(activity?.title ?? "");
  const [date, setDate] = useState(
    activity ? churchDateInput(activity.startDateTime) : "",
  );
  const [startTime, setStartTime] = useState(
    activity ? churchTimeInput(activity.startDateTime) : "",
  );
  const [endTime, setEndTime] = useState(
    activity ? churchTimeInput(activity.endDateTime) : "",
  );
  const [location, setLocation] = useState(activity?.location ?? "");
  const [description, setDescription] = useState(activity?.description ?? "");
  const [imageKey, setImageKey] = useState<string | undefined>(
    activity?.imageKey ?? undefined,
  );

  const [cancelMode, setCancelMode] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const editing = activity !== null;

  async function handleSave() {
    setError(null);
    if (!title.trim()) return setError("Give the activity a title.");
    if (!date) return setError("Pick a date.");
    if (!startTime || !endTime) return setError("Set a start and an end time.");

    setSaving(true);
    try {
      if (editing) {
        await updateActivity({
          activityId: activity._id,
          title: title.trim(),
          date,
          startTime,
          endTime,
          location,
          description,
          imageKey: imageKey ?? "",
        });
      } else {
        await createActivity({
          departmentId,
          title: title.trim(),
          date,
          startTime,
          endTime,
          ...(location.trim() ? { location: location.trim() } : {}),
          ...(description.trim() ? { description: description.trim() } : {}),
          ...(imageKey ? { imageKey } : {}),
        });
      }
      onClose();
    } catch (mutationError) {
      setError(errorMessage(mutationError));
    } finally {
      setSaving(false);
    }
  }

  async function handleCancel() {
    if (!activity) return;
    setError(null);
    setSaving(true);
    try {
      await cancelActivity({
        activityId: activity._id,
        ...(cancelReason.trim() ? { reason: cancelReason.trim() } : {}),
      });
      onClose();
    } catch (mutationError) {
      setError(errorMessage(mutationError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <AnimatedDialogContent open className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Edit this activity" : "Schedule an activity"}
          </DialogTitle>
        </DialogHeader>

        <div className="max-h-[70vh] space-y-5 overflow-y-auto px-1">
          {activity?.cancelled ? (
            <p className="rounded-md bg-crimson-light p-3 font-body text-sm text-crimson">
              This activity is cancelled. It stays on the list, marked, until its
              end time passes.
            </p>
          ) : null}

          <Field label="Title" htmlFor="activity-title">
            <Input
              id="activity-title"
              value={title}
              maxLength={ACTIVITY_TITLE_MAX_LENGTH}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="e.g. Saturday rehearsal"
              disabled={activity?.cancelled}
            />
          </Field>

          <Field
            label="Date"
            htmlFor="activity-date"
            hint="Read as Kampala time, whatever your own clock says."
          >
            <Input
              id="activity-date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              disabled={activity?.cancelled}
            />
          </Field>

          <Field label="Time" hint="Start and end, in Kampala time.">
            <TimeRangeField
              startValue={startTime}
              endValue={endTime}
              onStartChange={setStartTime}
              onEndChange={setEndTime}
              disabled={activity?.cancelled}
            />
          </Field>

          <Field
            label="Place (optional)"
            htmlFor="activity-location"
            hint="Changing this tells the verified people on your roster."
          >
            <Input
              id="activity-location"
              value={location}
              maxLength={ACTIVITY_LOCATION_MAX_LENGTH}
              onChange={(event) => setLocation(event.target.value)}
              placeholder="e.g. Fellowship Hall"
              disabled={activity?.cancelled}
            />
          </Field>

          <Field
            label="Details (optional)"
            htmlFor="activity-description"
            hint="Editing only this notifies nobody."
          >
            <Textarea
              id="activity-description"
              rows={4}
              value={description}
              maxLength={ACTIVITY_DESCRIPTION_MAX_LENGTH}
              onChange={(event) => setDescription(event.target.value)}
              disabled={activity?.cancelled}
            />
          </Field>

          <Field label="Picture (optional)">
            <ImageUpload
              value={imageKey}
              onChange={setImageKey}
              disabled={activity?.cancelled}
            />
          </Field>

          {error && (
            <p role="alert" className="font-body text-sm text-error">
              {error}
            </p>
          )}

          {editing && canCancel && !activity.cancelled && (
            <div className="space-y-2 border-t border-border pt-4">
              <p className="font-body text-sm font-semibold text-on-surface">
                Call it off
              </p>
              {cancelMode ? (
                <div className="space-y-2">
                  <Field
                    label="Why (optional)"
                    htmlFor="activity-cancel-reason"
                    hint="The verified people on your roster are told, with this reason."
                  >
                    <Input
                      id="activity-cancel-reason"
                      value={cancelReason}
                      maxLength={CANCELLATION_REASON_MAX_LENGTH}
                      onChange={(event) => setCancelReason(event.target.value)}
                      placeholder="e.g. The hall is unavailable"
                    />
                  </Field>
                  <div className="flex items-center gap-2">
                    <ActionButton
                      variant="danger"
                      loading={saving}
                      onClick={handleCancel}
                    >
                      Cancel this activity
                    </ActionButton>
                    <ActionButton
                      variant="neutral"
                      onClick={() => setCancelMode(false)}
                    >
                      Keep it
                    </ActionButton>
                  </div>
                </div>
              ) : (
                <ActionButton
                  variant="danger"
                  onClick={() => setCancelMode(true)}
                >
                  Cancel this activity
                </ActionButton>
              )}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
            <ActionButton variant="neutral" onClick={onClose}>
              Close
            </ActionButton>
            {!activity?.cancelled && (
              <ActionButton
                variant="gold"
                loading={saving}
                onClick={handleSave}
              >
                {editing ? "Save changes" : "Schedule it"}
              </ActionButton>
            )}
          </div>
        </div>
      </AnimatedDialogContent>
    </Dialog>
  );
}
