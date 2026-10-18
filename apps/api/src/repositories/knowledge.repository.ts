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

  async update(
    organizationId: ObjectId,
    documentId: ObjectId,
    input: { title: string; content: string; category: KnowledgeCategory },
  ): Promise<KnowledgeDocument | null> {
    return this.collection().findOneAndUpdate(
      { _id: documentId, organizationId },
      { $set: { title: input.title, content: input.content, category: input.category, updatedAt: new Date() } },
      { returnDocument: "after" },
    );
  }

  async findVerifiedIds(organizationId: ObjectId): Promise<ObjectId[]> {
    const documents = await this.collection().find({ organizationId, status: "verified" }).toArray();
    return documents.map((document) => document._id);
  }

  async deleteById(id: ObjectId): Promise<void> {
    await this.collection().deleteOne({ _id: id });
  }

  private collection() {
    return this.db.collection<KnowledgeDocument>(KNOWLEDGE_COLLECTION);
  }
}
