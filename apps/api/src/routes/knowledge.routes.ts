import { Router } from "express";
import { createKnowledgeController } from "../controllers/knowledge.controller.js";
import { createRequireAuth } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/rbac.middleware.js";
import { createRequireTenant } from "../middleware/tenant.middleware.js";
import { validate } from "../middleware/validate.js";
import type { AuthService } from "../services/auth.service.js";
import type { KnowledgeService } from "../services/knowledge.service.js";
import type { OrganizationService } from "../services/organization.service.js";
import type { RetrievalService } from "../services/retrieval.service.js";
import { createKnowledgeBodySchema, searchKnowledgeBodySchema } from "../validators/knowledge.validator.js";

type KnowledgeApi = Pick<KnowledgeService, "create">;
type RetrievalApi = Pick<RetrievalService, "search">;

export function createKnowledgeRouter(
  authService: AuthService,
  organizationService: Pick<OrganizationService, "resolveTenant">,
  knowledgeService: KnowledgeApi,
  retrievalService: RetrievalApi,
): Router {
  const router = Router();
  const controller = createKnowledgeController(knowledgeService, retrievalService);
  const requireAuth = createRequireAuth(authService);
  const requireTenant = createRequireTenant(organizationService);

  router.post(
    "/",
    requireAuth,
    requireTenant,
    requireRole(["owner", "admin"]),
    validate({ body: createKnowledgeBodySchema }),
    async (req, res) => {
      await controller.create(req, res);
    },
  );

  router.post("/search", requireAuth, requireTenant, validate({ body: searchKnowledgeBodySchema }), async (req, res) => {
    await controller.search(req, res);
  });

  return router;
}
