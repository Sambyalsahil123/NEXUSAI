import { ObjectId } from "mongodb";
import { AppError } from "../errors/app-error.js";
import { ErrorCodes } from "../errors/codes.js";
import type { KnowledgeCategory, KnowledgeDocument, KnowledgeStatus } from "../models/knowledge.model.js";
import type { KnowledgeRepository } from "../repositories/knowledge.repository.js";
import type { CreateKnowledgeBody } from "../validators/knowledge.validator.js";

type KnowledgeStore = Pick<KnowledgeRepository, "create">;

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
  constructor(private readonly documents: KnowledgeStore) {}

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

    return toPublicKnowledgeDocument(document);
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
