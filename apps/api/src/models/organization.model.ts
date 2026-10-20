import { randomBytes } from "node:crypto";
import type { Db, IndexSpecification, ObjectId } from "mongodb";

export const ORGANIZATIONS_COLLECTION = "organizations";

export type OrganizationStatus = "active" | "suspended";

/** Public widget credential. It identifies a tenant. It is not a staff login. */
export const PUBLISHABLE_KEY_PATTERN = /^pk_live_[A-Za-z0-9_-]{20,128}$/;

export function createPublishableKey(): string {
  return `pk_live_${randomBytes(24).toString("base64url")}`;
}

/**
 * An organization is one tenant: one business whose data must stay
 * separate from every other business on the platform.
 * It has no members and no roles. Those live on memberships.
 */
export type Organization = {
  _id: ObjectId;
  name: string;
  slug: string;
  publishableKey: string;
  status: OrganizationStatus;
  createdAt: Date;
  updatedAt: Date;
};

export function normalizeOrganizationSlug(slug: string): string {
  return slug.trim().toLowerCase();
}

/** URL key derived from the display name. Uniqueness is enforced by the slug index. */
export function slugFromOrganizationName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug.slice(0, 80).replace(/-+$/g, "");
}

export async function ensureOrganizationIndexes(db: Db): Promise<void> {
  const organizations = db.collection<Organization>(ORGANIZATIONS_COLLECTION);
  const slug: IndexSpecification = { slug: 1 };
  const publishableKey: IndexSpecification = { publishableKey: 1 };
  await organizations.createIndex(slug, { unique: true, name: "organizations_slug_unique" });
  await organizations.createIndex(publishableKey, { unique: true, name: "organizations_publishable_key_unique" });
}
