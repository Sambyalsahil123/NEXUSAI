import { Router } from "express";
import { createConversationController } from "../controllers/conversation.controller.js";
import { createRequireAuth } from "../middleware/auth.middleware.js";
import { createRequireTenant } from "../middleware/tenant.middleware.js";
import { validate } from "../middleware/validate.js";
import type { AuthService } from "../services/auth.service.js";
import type { ConversationService } from "../services/conversation.service.js";
import type { OrganizationService } from "../services/organization.service.js";
import {
  conversationParamsSchema,
  createConversationBodySchema,
  postMessageBodySchema,
} from "../validators/conversation.validator.js";

type ConversationApi = Pick<ConversationService, "create" | "postMessage" | "streamMessage">;

export function createConversationRouter(
  authService: AuthService,
  organizationService: Pick<OrganizationService, "resolveTenant">,
  conversationService: ConversationApi,
): Router {
  const router = Router();
  const controller = createConversationController(conversationService);
  const requireAuth = createRequireAuth(authService);
  const requireTenant = createRequireTenant(organizationService);

  router.post("/", requireAuth, requireTenant, validate({ body: createConversationBodySchema }), async (req, res) => {
    await controller.create(req, res);
  });

  router.post(
    "/:id/messages",
    requireAuth,
    requireTenant,
    validate({ params: conversationParamsSchema, body: postMessageBodySchema }),
    async (req, res) => {
      await controller.postMessage(req, res);
    },
  );

  router.post(
    "/:id/messages/stream",
    requireAuth,
    requireTenant,
    validate({ params: conversationParamsSchema, body: postMessageBodySchema }),
    async (req, res) => {
      await controller.streamMessage(req, res);
    },
  );

  return router;
}
