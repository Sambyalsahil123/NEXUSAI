import { Router } from "express";
import { createPublicConversationController } from "../controllers/public-conversation.controller.js";
import { createRequireWidgetAuth } from "../middleware/widget-auth.middleware.js";
import { validate } from "../middleware/validate.js";
import type { ConversationService } from "../services/conversation.service.js";
import type { OrganizationService } from "../services/organization.service.js";
import { conversationParamsSchema, postMessageBodySchema } from "../validators/conversation.validator.js";

type PublicConversationApi = Pick<ConversationService, "create" | "streamMessage">;

export function createPublicRouter(
  organizationService: Pick<OrganizationService, "resolveByPublishableKey">,
  conversationService: PublicConversationApi,
): Router {
  const router = Router();
  const controller = createPublicConversationController(conversationService);
  const requireWidgetAuth = createRequireWidgetAuth(organizationService);

  router.post("/conversations", requireWidgetAuth, async (req, res) => {
    await controller.create(req, res);
  });

  router.post(
    "/conversations/:id/messages/stream",
    requireWidgetAuth,
    validate({ params: conversationParamsSchema, body: postMessageBodySchema }),
    async (req, res) => {
      await controller.streamMessage(req, res);
    },
  );

  return router;
}
