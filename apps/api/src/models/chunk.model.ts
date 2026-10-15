import type { Db, IndexSpecification, ObjectId } from "mongodb";
import type { KnowledgeCategory } from "./knowledge.model.js";

export const KNOWLEDGE_CHUNKS_COLLECTION = "knowledge_chunks";

export type KnowledgeChunkMetadata = {
  category: KnowledgeCategory;
  title: string;
  headerContext: string;
};

/**
 * A retrieval piece of one knowledge document.
 * organizationId is copied from the parent document, which came from the verified tenant.
 */
export type KnowledgeChunk = {
  _id: ObjectId;
  organizationId: ObjectId;
  documentId: ObjectId;
  chunkIndex: number;
  content: string;
  metadata: KnowledgeChunkMetadata;
  createdAt: Date;
};

export async function ensureChunkIndexes(db: Db): Promise<void> {
  const chunks = db.collection<KnowledgeChunk>(KNOWLEDGE_CHUNKS_COLLECTION);
  const byDocument: IndexSpecification = { organizationId: 1, documentId: 1 };
  const byIdInOrganization: IndexSpecification = { organizationId: 1, _id: 1 };

  await chunks.createIndex(byDocument, { name: "knowledge_chunks_organization_document" });
  await chunks.createIndex(byIdInOrganization, { name: "knowledge_chunks_organization_id" });
}
