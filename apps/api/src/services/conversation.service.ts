import { ObjectId } from "mongodb";
import { AppError } from "../errors/app-error.js";
import { ErrorCodes } from "../errors/codes.js";
import {
  DEFAULT_CONVERSATION_TITLE,
  type Conversation,
  type ConversationChannel,
  type ConversationStatus,
} from "../models/conversation.model.js";
import { CONVERSATION_HISTORY_LIMIT, type MessageRole } from "../models/message.model.js";
import type { ConversationRepository } from "../repositories/conversation.repository.js";
import type { MessageRepository } from "../repositories/message.repository.js";
import type { RagService } from "./rag.service.js";

const RETRIEVAL_QUERY_MAX_CHARS = 1_000;
const TITLE_MAX_CHARS = 80;

type ConversationStore = Pick<ConversationRepository, "create" | "findInOrganization" | "renameIfDefault" | "touch">;
type MessageStore = Pick<MessageRepository, "create" | "findRecent" | "deleteById">;
type GroundedAnswers = Pick<RagService, "answer">;

export type PublicConversation = {
  id: string;
  organizationId: string;
  title: string;
  channel: ConversationChannel;
  status: ConversationStatus;
  createdAt: Date;
};

export type PublicConversationMessage = {
  id: string;
  role: MessageRole;
  content: string;
  sources: { documentId: string; title: string; score: number }[];
};

export type PostedConversationTurn = {
  conversationId: string;
  userMessage: PublicConversationMessage;
  assistantMessage: PublicConversationMessage;
};

export class ConversationService {
  constructor(
    private readonly conversations: ConversationStore,
    private readonly messages: MessageStore,
    private readonly rag: GroundedAnswers,
  ) {}

  async create(
    organizationId: string,
    input: { title?: string; channel?: ConversationChannel },
  ): Promise<PublicConversation> {
    if (!ObjectId.isValid(organizationId)) {
      throw new AppError(ErrorCodes.FORBIDDEN, "You do not have access to this organization", 403);
    }

    const conversation = await this.conversations.create({
      organizationId: new ObjectId(organizationId),
      title: input.title ?? DEFAULT_CONVERSATION_TITLE,
      channel: input.channel ?? "api",
    });
    return toPublicConversation(conversation);
  }

  async postMessage(organizationId: string, conversationId: string, content: string): Promise<PostedConversationTurn> {
    if (!ObjectId.isValid(organizationId)) {
      throw new AppError(ErrorCodes.FORBIDDEN, "You do not have access to this organization", 403);
    }
    if (!ObjectId.isValid(conversationId)) {
      throw new AppError(ErrorCodes.NOT_FOUND, "Conversation not found", 404);
    }

    const organizationObjectId = new ObjectId(organizationId);
    const conversationObjectId = new ObjectId(conversationId);
    const conversation = await this.conversations.findInOrganization(organizationObjectId, conversationObjectId);
    if (!conversation) {
      throw new AppError(ErrorCodes.NOT_FOUND, "Conversation not found", 404);
    }
    if (conversation.status !== "open") {
      throw new AppError(ErrorCodes.CONFLICT, "This conversation is closed", 409);
    }

    const history = await this.messages.findRecent(
      organizationObjectId,
      conversationObjectId,
      CONVERSATION_HISTORY_LIMIT,
    );
    const priorUserText = history
      .filter((message) => message.role === "user")
      .map((message) => message.content)
      .join("\n");
    const retrievalQuery = `${priorUserText}\n${content}`.trim().slice(-RETRIEVAL_QUERY_MAX_CHARS);
    const grounded = await this.rag.answer({
      organizationId,
      question: content,
      history: history.map((message) => ({ role: message.role, content: message.content })),
      retrievalQuery,
    });

    const userCreatedAt = new Date();
    const userMessage = await this.messages.create({
      organizationId: organizationObjectId,
      conversationId: conversationObjectId,
      role: "user",
      content,
      metadata: null,
      createdAt: userCreatedAt,
    });

    try {
      const assistantMessage = await this.messages.create({
        organizationId: organizationObjectId,
        conversationId: conversationObjectId,
        role: "assistant",
        content: grounded.answer,
        metadata: { sources: grounded.sources },
        createdAt: new Date(userCreatedAt.getTime() + 1),
      });
      await this.conversations.renameIfDefault(organizationObjectId, conversationObjectId, titleFrom(content));
      await this.conversations.touch(organizationObjectId, conversationObjectId, assistantMessage.createdAt);

      return {
        conversationId,
        userMessage: toPublicMessage(userMessage),
        assistantMessage: toPublicMessage(assistantMessage),
      };
    } catch (error) {
      await this.messages.deleteById(organizationObjectId, userMessage._id);
      throw error;
    }
  }
}

function titleFrom(content: string): string {
  const title = content.trim().slice(0, TITLE_MAX_CHARS);
  return title.length > 0 ? title : DEFAULT_CONVERSATION_TITLE;
}

function toPublicConversation(conversation: Conversation): PublicConversation {
  return {
    id: conversation._id.toHexString(),
    organizationId: conversation.organizationId.toHexString(),
    title: conversation.title,
    channel: conversation.channel,
    status: conversation.status,
    createdAt: conversation.createdAt,
  };
}

function toPublicMessage(message: {
  _id: ObjectId;
  role: MessageRole;
  content: string;
  metadata: { sources: { documentId: string; title: string; score: number }[] } | null;
}): PublicConversationMessage {
  return {
    id: message._id.toHexString(),
    role: message.role,
    content: message.content,
    sources: message.metadata?.sources ?? [],
  };
}
