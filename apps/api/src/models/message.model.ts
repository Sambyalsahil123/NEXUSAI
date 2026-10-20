import type { Db, IndexSpecification, ObjectId } from "mongodb";

export const MESSAGES_COLLECTION = "messages";

/** How many prior messages are copied into the next prompt. */
export const CONVERSATION_HISTORY_LIMIT = 6;

export type MessageRole = "user" | "assistant" | "system";

export type MessageCitation = {
  documentId: string;
  title: string;
  score: number;
};

export type MessageMetadata = {
  sources: MessageCitation[];
};

/**
 * A message belongs to one conversation inside one organization.
 * Both ids are taken from the server, not from the client body.
 */
export type Message = {
  _id: ObjectId;
  organizationId: ObjectId;
  conversationId: ObjectId;
  role: MessageRole;
  content: string;
  metadata: MessageMetadata | null;
  createdAt: Date;
};

export async function ensureMessageIndexes(db: Db): Promise<void> {
  const messages = db.collection<Message>(MESSAGES_COLLECTION);
  const byConversation: IndexSpecification = { organizationId: 1, conversationId: 1, createdAt: 1 };
  await messages.createIndex(byConversation, { name: "messages_organization_conversation_created_at" });
}
