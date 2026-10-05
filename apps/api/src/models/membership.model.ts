import type { Db, IndexSpecification, ObjectId } from "mongodb";

export const MEMBERSHIPS_COLLECTION = "memberships";

/** Role is per organization. The same user can hold a different role in each one. */
export type MembershipRole = "owner" | "admin" | "agent";

export type MembershipStatus = "active" | "disabled";

/**
 * A membership is the bridge between a global user and one organization.
 * It is the only place a role is stored.
 */
export type Membership = {
  _id: ObjectId;
  userId: ObjectId;
  organizationId: ObjectId;
  role: MembershipRole;
  status: MembershipStatus;
  createdAt: Date;
  updatedAt: Date;
};

export async function ensureMembershipIndexes(db: Db): Promise<void> {
  const memberships = db.collection<Membership>(MEMBERSHIPS_COLLECTION);
  const userAndOrganization: IndexSpecification = { userId: 1, organizationId: 1 };
  const organizationId: IndexSpecification = { organizationId: 1 };

  await memberships.createIndex(userAndOrganization, {
    unique: true,
    name: "memberships_user_organization_unique",
  });
  await memberships.createIndex(organizationId, { name: "memberships_organization_id" });
}
