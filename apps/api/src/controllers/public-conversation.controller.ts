import type { Request, Response } from "express";
import { AppError } from "../errors/app-error.js";
import { ErrorCodes } from "../errors/codes.js";
import type { ConversationService } from "../services/conversation.service.js";
import type { PublicOrganization } from "../services/organization.service.js";
import { writeConversationStream } from "../utils/conversation-stream.js";
import { getRequestId } from "../utils/request-id.js";
import { sendSuccess } from "../utils/http.js";
import { conversationParamsSchema, postMessageBodySchema } from "../validators/conversation.validator.js";

type PublicConversationApi = Pick<ConversationService, "create" | "streamMessage">;

export function createPublicConversationController(conversationService: PublicConversationApi) {
  return {
    async create(req: Request, res: Response): Promise<void> {
      const organization = widgetOrganization(req);
      const conversation = await conversationService.create(organization.id, { channel: "widget" });
      sendSuccess(res, 201, conversation, getRequestId(req));
    },

    async streamMessage(req: Request, res: Response): Promise<void> {
      const organization = widgetOrganization(req);
      const params = conversationParamsSchema.safeParse(req.validated?.params);
      const body = postMessageBodySchema.safeParse(req.validated?.body);
      if (!params.success || !body.success) {
        throw new AppError(ErrorCodes.VALIDATION_ERROR, "Request validation failed", 400);
      }

      await writeConversationStream(res, (onChunk) =>
        conversationService.streamMessage(organization.id, params.data.id, body.data.content, onChunk),
      );
    },
  };
}

function widgetOrganization(req: Request): PublicOrganization {
  if (!req.organization) {
    throw new AppError(ErrorCodes.UNAUTHORIZED, "Invalid or missing publishable key", 401);
  }
  return req.organization;
}
