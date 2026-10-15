import { ObjectId, type Db } from "mongodb";
import {
  KNOWLEDGE_COLLECTION,
  type KnowledgeCategory,
  type KnowledgeDocument,
} from "../models/knowledge.model.js";

export type NewKnowledgeDocumentInput = {
  organizationId: ObjectId;
  createdBy: ObjectId;
  title: string;
  content: string;
  category: KnowledgeCategory;
};

export class KnowledgeRepository {
  constructor(private readonly db: Db) {}

  async create(input: NewKnowledgeDocumentInput): Promise<KnowledgeDocument> {
    const now = new Date();
    const document: KnowledgeDocument = {
      _id: new ObjectId(),
      organizationId: input.organizationId,
      createdBy: input.createdBy,
      title: input.title,
      content: input.content,
      category: input.category,
      status: "draft",
      createdAt: now,
      updatedAt: now,
    };
    await this.collection().insertOne(document);

    return document;
  }

  private collection() {
    return this.db.collection<KnowledgeDocument>(KNOWLEDGE_COLLECTION);
  }
}
