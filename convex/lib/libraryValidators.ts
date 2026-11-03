import { v } from "convex/values";
import {
  LIBRARY_ITEM_FORMATS,
  LIBRARY_ITEM_TYPES,
  type LibraryItemFormat,
  type LibraryItemType,
} from "@klt-cyber/shared";

// The catalogue's unions, derived from the shared lists rather than retyped as
// literal unions here — the same reason convex/lib/notificationValidators.ts
// and convex/lib/costValidators.ts derive theirs: a format or type added in
// one place and not the other is a row the schema rejects at runtime instead
// of a mismatch the typechecker catches.

/** `physical | pdf | audio` — the physical against digital axis (spec 0015). */
export const vLibraryItemFormat = v.union(
  ...LIBRARY_ITEM_FORMATS.map((format) => v.literal<LibraryItemFormat>(format))
);

/** `book | flash_disk_package | teaching_material | manual | merchandise`. */
export const vLibraryItemType = v.union(
  ...LIBRARY_ITEM_TYPES.map((itemType) => v.literal<LibraryItemType>(itemType))
);

/** Which way a stock movement went. Not shared: nothing outside Convex needs it. */
export const vLibraryStockDirection = v.union(
  v.literal("in"),
  v.literal("out")
);
