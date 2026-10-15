import type { Db, IndexSpecification, ObjectId } from "mongodb";

export const KNOWLEDGE_COLLECTION = "knowledge_documents";

/** A curated fact the organization is willing to stand behind. */
export type KnowledgeCategory = "policy" | "faq" | "product";

/**
 * draft: stored, not yet approved for answers.
 * verified: reviewed and allowed to feed later retrieval.
 */
export type KnowledgeStatus = "draft" | "verified";

/**
 * One knowledge document belongs to one organization.
 * organizationId is copied from the verified tenant on the request.
 * title, category, and status are the structured fields. content is the body.
 */
export type KnowledgeDocument = {
  _id: ObjectId;
  organizationId: ObjectId;
  createdBy: ObjectId;
  title: string;
  content: string;
  category: KnowledgeCategory;
  status: KnowledgeStatus;
  createdAt: Date;
  updatedAt: Date;
};

export async function ensureKnowledgeIndexes(db: Db): Promise<void> {
  const knowledge = db.collection<KnowledgeDocument>(KNOWLEDGE_COLLECTION);
  const byOrganization: IndexSpecification = { organizationId: 1, createdAt: -1 };
  await knowledge.createIndex(byOrganization, { name: "knowledge_organization_created_at" });
}
