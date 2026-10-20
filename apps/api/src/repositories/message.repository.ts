import { ObjectId, type Db } from "mongodb";
import { MESSAGES_COLLECTION, type Message, type MessageMetadata, type MessageRole } from "../models/message.model.js";

export type NewMessageInput = {
  organizationId: ObjectId;
  conversationId: ObjectId;
  role: MessageRole;
  content: string;
  metadata: MessageMetadata | null;
  createdAt: Date;
};

export class MessageRepository {
  constructor(private readonly db: Db) {}

  async create(input: NewMessageInput): Promise<Message> {
    const document: Message = {
      _id: new ObjectId(),
      organizationId: input.organizationId,
      conversationId: input.conversationId,
      role: input.role,
      content: input.content,
      metadata: input.metadata,
      createdAt: input.createdAt,
    };
    await this.collection().insertOne(document);
    return document;
  }

  async findRecent(organizationId: ObjectId, conversationId: ObjectId, limit: number): Promise<Message[]> {
    const messages = await this.collection()
      .find({ organizationId, conversationId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();
    return messages.reverse();
  }

  async deleteById(organizationId: ObjectId, messageId: ObjectId): Promise<void> {
    await this.collection().deleteOne({ _id: messageId, organizationId });
  }

  private collection() {
    return this.db.collection<Message>(MESSAGES_COLLECTION);
  }
}
