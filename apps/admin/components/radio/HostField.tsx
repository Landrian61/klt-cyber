"use client";

import { useState } from "react";
import { RADIO_HOST_GUEST_NAME_MAX_LENGTH } from "@klt-cyber/shared";

import { api, type Id } from "@/lib/api";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { Field } from "@/components/shadcn/field";
import { Input } from "@/components/shadcn/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/shadcn/select";

/** A host as the radio mutations take it (AC-22): exactly one kind. */
export type RadioHostValue =
  | { kind: "none" }
  | { kind: "member"; userId: Id<"users"> }
  | { kind: "guest"; name: string };

const NONE = "__none__";

/**
 * Choose a verified member or type a guest name, never both (AC-22). Picking
 * a member clears the typed name and the name box stays disabled until the
 * member is cleared, so the form cannot even hold both.
 */
export function HostField({
  idPrefix,
  value,
  onChange,
  currentMemberName,
  noneLabel,
  disabled,
}: {
  idPrefix: string;
  value: RadioHostValue;
  onChange: (value: RadioHostValue) => void;
  /** The chosen member's name, so it shows even when outside the search. */
  currentMemberName?: string | null;
  /** What "no member" means here: "No host listed" or "The program's host". */
  noneLabel: string;
  disabled?: boolean;
}) {
  const [search, setSearch] = useState("");
  const members = useAuthQuery(api.radioPrograms.searchHosts, { query: search });
  const selected = value.kind === "member" ? value.userId : NONE;
  const showCurrent =
    value.kind === "member" &&
    !!currentMemberName &&
    !(members ?? []).some((m) => m._id === value.userId);

  return (
    <div className="space-y-3">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Find a member"
          htmlFor={`${idPrefix}-host-search`}
          hint="Type part of a name. Only verified members are listed."
        >
          <Input
            id={`${idPrefix}-host-search`}
            value={search}
            disabled={disabled}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Nakato"
          />
        </Field>
        <Field label="Host" htmlFor={`${idPrefix}-host`}>
          <Select
            value={selected}
            disabled={disabled}
            onValueChange={(next) =>
              onChange(
                next === NONE
                  ? { kind: "none" }
                  : { kind: "member", userId: next as Id<"users"> },
              )
            }
          >
            <SelectTrigger id={`${idPrefix}-host`}>
              <SelectValue placeholder={noneLabel} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{noneLabel}</SelectItem>
              {showCurrent && value.kind === "member" && (
                <SelectItem value={value.userId}>{currentMemberName}</SelectItem>
              )}
              {(members ?? []).map((member) => (
                <SelectItem key={member._id} value={member._id}>
                  {member.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Field
        label="Or a guest name"
        htmlFor={`${idPrefix}-host-guest`}
        hint={
          value.kind === "member"
            ? "Clear the chosen member above to type a guest instead."
            : "For a guest who is not a member here."
        }
      >
        <Input
          id={`${idPrefix}-host-guest`}
          value={value.kind === "guest" ? value.name : ""}
          disabled={disabled || value.kind === "member"}
          maxLength={RADIO_HOST_GUEST_NAME_MAX_LENGTH}
          onChange={(event) =>
            onChange(
              event.target.value
                ? { kind: "guest", name: event.target.value }
                : { kind: "none" },
            )
          }
          placeholder="Pastor John (guest)"
        />
      </Field>
    </div>
  );
}

/** The form value for a stored pair of host fields. */
export function hostValueFrom(row: {
  hostUserId: Id<"users"> | null;
  hostGuestName: string | null;
}): RadioHostValue {
  if (row.hostUserId) return { kind: "member", userId: row.hostUserId };
  if (row.hostGuestName) return { kind: "guest", name: row.hostGuestName };
  return { kind: "none" };
}
