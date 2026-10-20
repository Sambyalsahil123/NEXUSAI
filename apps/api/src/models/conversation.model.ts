import type { Db, IndexSpecification, ObjectId } from "mongodb";

export const CONVERSATIONS_COLLECTION = "conversations";

export const DEFAULT_CONVERSATION_TITLE = "New conversation";

export type ConversationChannel = "widget" | "api";

export type ConversationStatus = "open" | "closed";

/**
 * One conversation belongs to one organization.
 * organizationId is copied from the verified tenant on the request.
 */
export type Conversation = {
  _id: ObjectId;
  organizationId: ObjectId;
  title: string;
  channel: ConversationChannel;
  status: ConversationStatus;
  createdAt: Date;
  updatedAt: Date;
};

export async function ensureConversationIndexes(db: Db): Promise<void> {
  const conversations = db.collection<Conversation>(CONVERSATIONS_COLLECTION);
  const byOrganization: IndexSpecification = { organizationId: 1, createdAt: -1 };
  await conversations.createIndex(byOrganization, { name: "conversations_organization_created_at" });
}
