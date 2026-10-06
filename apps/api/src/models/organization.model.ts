import type { Db, IndexSpecification, ObjectId } from "mongodb";

export const ORGANIZATIONS_COLLECTION = "organizations";

export type OrganizationStatus = "active" | "suspended";

/**
 * An organization is one tenant: one business whose data must stay
 * separate from every other business on the platform.
 * It has no members and no roles. Those live on memberships.
 */
export type Organization = {
  _id: ObjectId;
  name: string;
  slug: string;
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
  await organizations.createIndex(slug, { unique: true, name: "organizations_slug_unique" });
}
