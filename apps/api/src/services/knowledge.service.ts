import { ObjectId } from "mongodb";
import { AppError } from "../errors/app-error.js";
import { ErrorCodes } from "../errors/codes.js";
import type { KnowledgeCategory, KnowledgeDocument, KnowledgeStatus } from "../models/knowledge.model.js";
import type { ChunkRepository } from "../repositories/chunk.repository.js";
import type { KnowledgeRepository } from "../repositories/knowledge.repository.js";
import type { CreateKnowledgeBody } from "../validators/knowledge.validator.js";
import { chunkKnowledge } from "./chunking.service.js";
import type { IEmbeddingService } from "./embedding.service.js";

type KnowledgeStore = Pick<KnowledgeRepository, "create" | "update" | "deleteById">;
type ChunkStore = Pick<ChunkRepository, "replaceForDocument" | "deleteByDocument">;

export type PublicKnowledgeDocument = {
  id: string;
  organizationId: string;
  title: string;
  content: string;
  category: KnowledgeCategory;
  status: KnowledgeStatus;
  createdAt: Date;
};

export type KnowledgeScope = {
  organizationId: string;
  createdBy: string;
};

export class KnowledgeService {
  constructor(
    private readonly documents: KnowledgeStore,
    private readonly chunks: ChunkStore,
    private readonly embeddings: IEmbeddingService,
  ) {}

  async create(scope: KnowledgeScope, input: CreateKnowledgeBody): Promise<PublicKnowledgeDocument> {
    if (!ObjectId.isValid(scope.organizationId) || !ObjectId.isValid(scope.createdBy)) {
      throw new AppError(ErrorCodes.FORBIDDEN, "You do not have access to this organization", 403);
    }

    const document = await this.documents.create({
      organizationId: new ObjectId(scope.organizationId),
      createdBy: new ObjectId(scope.createdBy),
      title: input.title,
      content: input.content,
      category: input.category,
    });

    try {
      await this.replaceChunks(document);
    } catch (error) {
      await this.documents.deleteById(document._id);
      await this.chunks.deleteByDocument(document.organizationId, document._id);
      throw error;
    }

    return toPublicKnowledgeDocument(document);
  }

  async update(organizationId: string, documentId: string, input: CreateKnowledgeBody): Promise<PublicKnowledgeDocument> {
    if (!ObjectId.isValid(organizationId)) {
      throw new AppError(ErrorCodes.FORBIDDEN, "You do not have access to this organization", 403);
    }
    if (!ObjectId.isValid(documentId)) {
      throw new AppError(ErrorCodes.NOT_FOUND, "Knowledge document not found", 404);
    }

    const updated = await this.documents.update(new ObjectId(organizationId), new ObjectId(documentId), input);
    if (!updated) {
      throw new AppError(ErrorCodes.NOT_FOUND, "Knowledge document not found", 404);
    }

    await this.replaceChunks(updated);
    return toPublicKnowledgeDocument(updated);
  }

  private async replaceChunks(document: KnowledgeDocument): Promise<void> {
    const drafts = chunkKnowledge({
      organizationId: document.organizationId.toHexString(),
      documentId: document._id.toHexString(),
      title: document.title,
      category: document.category,
      content: document.content,
    });
    const embedded = await Promise.all(
      drafts.map(async (draft) => {
        const embedding = await this.embeddings.generateEmbedding(draft.content);
        return {
          chunkIndex: draft.chunkIndex,
          content: draft.content,
          metadata: draft.metadata,
          embedding,
          isEmbedded: embedding.length > 0,
        };
      }),
    );

    await this.chunks.replaceForDocument(document.organizationId, document._id, embedded);
  }
}

function toPublicKnowledgeDocument(document: KnowledgeDocument): PublicKnowledgeDocument {
  return {
    id: document._id.toHexString(),
    organizationId: document.organizationId.toHexString(),
    title: document.title,
    content: document.content,
    category: document.category,
    status: document.status,
    createdAt: document.createdAt,
  };
}
