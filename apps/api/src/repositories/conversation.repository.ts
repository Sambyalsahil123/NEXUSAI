import { ObjectId, type Db } from "mongodb";
import {
  CONVERSATIONS_COLLECTION,
  DEFAULT_CONVERSATION_TITLE,
  type Conversation,
  type ConversationChannel,
} from "../models/conversation.model.js";

export type NewConversationInput = {
  organizationId: ObjectId;
  title: string;
  channel: ConversationChannel;
};

export class ConversationRepository {
  constructor(private readonly db: Db) {}

  async create(input: NewConversationInput): Promise<Conversation> {
    const now = new Date();
    const document: Conversation = {
      _id: new ObjectId(),
      organizationId: input.organizationId,
      title: input.title,
      channel: input.channel,
      status: "open",
      createdAt: now,
      updatedAt: now,
    };
    await this.collection().insertOne(document);
    return document;
  }

  async findInOrganization(organizationId: ObjectId, conversationId: ObjectId): Promise<Conversation | null> {
    return this.collection().findOne({ _id: conversationId, organizationId });
  }

  async renameIfDefault(organizationId: ObjectId, conversationId: ObjectId, title: string): Promise<void> {
    const now = new Date();
    await this.collection().updateOne(
      { _id: conversationId, organizationId, title: DEFAULT_CONVERSATION_TITLE },
      { $set: { title, updatedAt: now } },
    );
  }

  async touch(organizationId: ObjectId, conversationId: ObjectId, updatedAt: Date): Promise<void> {
    await this.collection().updateOne({ _id: conversationId, organizationId }, { $set: { updatedAt } });
  }

  private collection() {
    return this.db.collection<Conversation>(CONVERSATIONS_COLLECTION);
  }
}
