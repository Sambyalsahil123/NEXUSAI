import type { Request, Response } from "express";
import { AppError } from "../errors/app-error.js";
import { ErrorCodes } from "../errors/codes.js";
import type { ConversationService } from "../services/conversation.service.js";
import { getRequestId } from "../utils/request-id.js";
import { sendSuccess } from "../utils/http.js";
import {
  conversationParamsSchema,
  createConversationBodySchema,
  postMessageBodySchema,
} from "../validators/conversation.validator.js";

type ConversationApi = Pick<ConversationService, "create" | "postMessage">;

export function createConversationController(conversationService: ConversationApi) {
  return {
    async create(req: Request, res: Response): Promise<void> {
      if (!req.user) {
        throw new AppError(ErrorCodes.UNAUTHORIZED, "Authentication required", 401);
      }
      if (!req.organization) {
        throw new AppError(ErrorCodes.FORBIDDEN, "You do not have access to this organization", 403);
      }

      const body = createConversationBodySchema.safeParse(req.validated?.body ?? {});
      if (!body.success) {
        throw new AppError(ErrorCodes.VALIDATION_ERROR, "Request validation failed", 400);
      }

      const conversation = await conversationService.create(req.organization.id, body.data);
      sendSuccess(res, 201, conversation, getRequestId(req));
    },

    async postMessage(req: Request, res: Response): Promise<void> {
      if (!req.user) {
        throw new AppError(ErrorCodes.UNAUTHORIZED, "Authentication required", 401);
      }
      if (!req.organization) {
        throw new AppError(ErrorCodes.FORBIDDEN, "You do not have access to this organization", 403);
      }

      const params = conversationParamsSchema.safeParse(req.validated?.params);
      const body = postMessageBodySchema.safeParse(req.validated?.body);
      if (!params.success || !body.success) {
        throw new AppError(ErrorCodes.VALIDATION_ERROR, "Request validation failed", 400);
      }

      const turn = await conversationService.postMessage(req.organization.id, params.data.id, body.data.content);
      sendSuccess(res, 200, turn, getRequestId(req));
    },
  };
}
