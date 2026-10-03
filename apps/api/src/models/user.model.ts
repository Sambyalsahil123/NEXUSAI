import type { Db, IndexSpecification, ObjectId } from "mongodb";

export const USERS_COLLECTION = "users";

export type UserStatus = "active" | "disabled";

/**
 * A user is a login identity, not a member of one organization.
 * Which organizations they belong to, and what role they have in each,
 * will live on memberships. A user document has no tenantId and no role.
 */
export type User = {
  _id: ObjectId;
  email: string;
  passwordHash: string;
  emailVerifiedAt: Date | null;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
};

export function normalizeUserEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function ensureUserIndexes(db: Db): Promise<void> {
  const users = db.collection<User>(USERS_COLLECTION);
  const email: IndexSpecification = { email: 1 };
  await users.createIndex(email, { unique: true, name: "users_email_unique" });
}
