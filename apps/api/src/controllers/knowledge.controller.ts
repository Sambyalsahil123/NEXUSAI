import type { Request, Response } from "express";
import { AppError } from "../errors/app-error.js";
import { ErrorCodes } from "../errors/codes.js";
import type { KnowledgeService } from "../services/knowledge.service.js";
import type { RetrievalService } from "../services/retrieval.service.js";
import { getRequestId } from "../utils/request-id.js";
import { sendSuccess } from "../utils/http.js";
import { createKnowledgeBodySchema, searchKnowledgeBodySchema } from "../validators/knowledge.validator.js";

type KnowledgeApi = Pick<KnowledgeService, "create">;
type RetrievalApi = Pick<RetrievalService, "search">;

export function createKnowledgeController(knowledgeService: KnowledgeApi, retrievalService: RetrievalApi) {
  return {
    async create(req: Request, res: Response): Promise<void> {
      if (!req.user) {
        throw new AppError(ErrorCodes.UNAUTHORIZED, "Authentication required", 401);
      }
      if (!req.organization) {
        throw new AppError(ErrorCodes.FORBIDDEN, "You do not have access to this organization", 403);
      }

      const body = createKnowledgeBodySchema.safeParse(req.validated?.body);
      if (!body.success) {
        throw new AppError(ErrorCodes.VALIDATION_ERROR, "Request validation failed", 400);
      }

      const document = await knowledgeService.create(
        { organizationId: req.organization.id, createdBy: req.user.id },
        body.data,
      );
      sendSuccess(res, 201, document, getRequestId(req));
    },

    async search(req: Request, res: Response): Promise<void> {
      if (!req.user) {
        throw new AppError(ErrorCodes.UNAUTHORIZED, "Authentication required", 401);
      }
      if (!req.organization) {
        throw new AppError(ErrorCodes.FORBIDDEN, "You do not have access to this organization", 403);
      }

      const body = searchKnowledgeBodySchema.safeParse(req.validated?.body);
      if (!body.success) {
        throw new AppError(ErrorCodes.VALIDATION_ERROR, "Request validation failed", 400);
      }

      const results = await retrievalService.search({
        organizationId: req.organization.id,
        query: body.data.query,
        limit: body.data.limit,
      });
      sendSuccess(res, 200, results, getRequestId(req));
    },
  };
}
