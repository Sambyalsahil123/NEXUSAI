import { Router } from "express";
import { createPublicConversationController } from "../controllers/public-conversation.controller.js";
import {
  clientIp,
  createRateLimiter,
  MemorySlidingWindowStore,
  PUBLIC_RATE_WINDOW_MS,
  PUBLIC_SESSION_LIMIT,
  PUBLIC_STREAM_LIMIT,
} from "../middleware/rate-limiter.middleware.js";
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
  const limits = new MemorySlidingWindowStore();
  const limitNewSessions = createRateLimiter(limits, {
    limit: PUBLIC_SESSION_LIMIT,
    windowMs: PUBLIC_RATE_WINDOW_MS,
    key: (req) => `public-session:${clientIp(req)}`,
  });
  const limitStreams = createRateLimiter(limits, {
    limit: PUBLIC_STREAM_LIMIT,
    windowMs: PUBLIC_RATE_WINDOW_MS,
    key: (req) => `public-stream:${clientIp(req)}:${req.organization?.id ?? "unknown"}`,
  });

  router.post("/conversations", limitNewSessions, requireWidgetAuth, async (req, res) => {
    await controller.create(req, res);
  });

  router.post(
    "/conversations/:id/messages/stream",
    requireWidgetAuth,
    limitStreams,
    validate({ params: conversationParamsSchema, body: postMessageBodySchema }),
    async (req, res) => {
      await controller.streamMessage(req, res);
    },
  );

  return router;
}
