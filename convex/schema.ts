import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// The reusable approval-state shape (DATA_MODEL.md, Increment 2). Attached to any
// record needing authority verification; in this increment it backs
// `memberProfiles.clanApproval`.
const approvalState = v.object({
  status: v.union(
    v.literal("pending"),
    v.literal("verified"),
    v.literal("rejected")
  ),
  verifiedBy: v.optional(v.id("users")),
  verifiedAt: v.optional(v.number()),
  note: v.optional(v.string()),
});

export default defineSchema({
  users: defineTable({
    authId: v.string(),
    email: v.string(),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    profilePictureUrl: v.optional(v.string()),
    // Base consumer-lifecycle role only. Administrative authority (system_admin,
    // clan_elder, ...) lives in `roleAssignments` — see DATA_MODEL.md Increment 2.
    role: v.union(v.literal("visitor"), v.literal("member")),
    status: v.union(v.literal("active"), v.literal("suspended")),
    profileCompleted: v.boolean(),
  })
    .index("by_authId", ["authId"])
    .index("by_email", ["email"])
    .index("by_role", ["role"]),

  activityLogs: defineTable({
    actorUserId: v.id("users"),
    action: v.string(),
    targetType: v.optional(v.string()),
    targetId: v.optional(v.string()),
    metadata: v.optional(v.any()),
  })
    .index("by_actor", ["actorUserId"])
    .index("by_action", ["action"]),

  // The church-domain bio. 1:1 with `users`; its presence marks a member.
  memberProfiles: defineTable({
    userId: v.id("users"),
    sex: v.union(v.literal("male"), v.literal("female")),
    dateOfBirth: v.optional(v.string()),
    maritalStatus: v.union(
      v.literal("single"),
      v.literal("married"),
      v.literal("widowed"),
      v.literal("divorced")
    ),
    phone: v.optional(v.string()),
    profession: v.optional(v.string()),
    clanId: v.optional(v.id("clans")),
    // Present iff `clanId` is set; defaults to { status: "pending" }.
    clanApproval: v.optional(approvalState),
  })
    .index("by_userId", ["userId"])
    .index("by_clanId", ["clanId"]),

  // Children of members — data records, not user accounts.
  children: defineTable({
    parentUserId: v.id("users"),
    name: v.string(),
    dateOfBirth: v.optional(v.string()),
    ageBracket: v.union(
      v.literal("0-12"),
      v.literal("13-19"),
      v.literal("20-35"),
      v.literal("36+")
    ),
    guardianContact: v.optional(v.string()),
  }).index("by_parentUserId", ["parentUserId"]),

  // The 12 fixed clans — seeded reference data (seed:clans).
  clans: defineTable({
    name: v.string(),
    order: v.number(),
  }).index("by_order", ["order"]),

  // Scoped administrative role grants. A user may hold any number of these.
  roleAssignments: defineTable({
    userId: v.id("users"),
    roleType: v.union(v.literal("system_admin"), v.literal("clan_elder")),
    // Set only for clan-scoped roles (currently clan_elder). Enforced by the
    // mutation layer, not the schema.
    clanId: v.optional(v.id("clans")),
    assignedBy: v.id("users"),
    status: v.union(v.literal("active"), v.literal("revoked")),
    revokedBy: v.optional(v.id("users")),
    revokedAt: v.optional(v.number()),
    note: v.optional(v.string()),
  })
    .index("by_userId", ["userId"])
    .index("by_roleType", ["roleType"])
    .index("by_clanId", ["clanId"]),
});
