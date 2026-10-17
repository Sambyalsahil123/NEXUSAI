import { ObjectId, type Db } from "mongodb";
import {
  KNOWLEDGE_CHUNKS_COLLECTION,
  type KnowledgeChunk,
  type KnowledgeChunkMetadata,
} from "../models/chunk.model.js";

export type NewKnowledgeChunkInput = {
  chunkIndex: number;
  content: string;
  metadata: KnowledgeChunkMetadata;
  embedding: number[];
  isEmbedded: boolean;
};

export class ChunkRepository {
  constructor(private readonly db: Db) {}

  async replaceForDocument(
    organizationId: ObjectId,
    documentId: ObjectId,
    chunks: NewKnowledgeChunkInput[],
  ): Promise<KnowledgeChunk[]> {
    await this.deleteByDocument(organizationId, documentId);
    if (chunks.length === 0) {
      return [];
    }

    const createdAt = new Date();
    const documents: KnowledgeChunk[] = chunks.map((chunk) => ({
      _id: new ObjectId(),
      organizationId,
      documentId,
      chunkIndex: chunk.chunkIndex,
      content: chunk.content,
      metadata: chunk.metadata,
      embedding: chunk.embedding,
      isEmbedded: chunk.isEmbedded,
      createdAt,
    }));
    await this.collection().insertMany(documents);

    return documents;
  }

  async findByDocument(organizationId: ObjectId, documentId: ObjectId): Promise<KnowledgeChunk[]> {
    return this.collection().find({ organizationId, documentId }).sort({ chunkIndex: 1 }).toArray();
  }

  async deleteByDocument(organizationId: ObjectId, documentId: ObjectId): Promise<void> {
    await this.collection().deleteMany({ organizationId, documentId });
  }

  private collection() {
    return this.db.collection<KnowledgeChunk>(KNOWLEDGE_CHUNKS_COLLECTION);
  }
}
