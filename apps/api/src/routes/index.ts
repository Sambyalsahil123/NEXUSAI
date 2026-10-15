import { Router } from "express";
import type { AuthService } from "../services/auth.service.js";
import type { HealthService } from "../services/health.service.js";
import type { KnowledgeService } from "../services/knowledge.service.js";
import type { OrganizationService } from "../services/organization.service.js";
import { createAuthRouter } from "./auth.routes.js";
import { createHealthRouter } from "./health.routes.js";
import { createKnowledgeRouter } from "./knowledge.routes.js";
import { createOrganizationRouter, createWorkspaceRouter } from "./organization.routes.js";

export function createApiRouter(
  healthService: HealthService,
  authService: AuthService,
  organizationService: Pick<OrganizationService, "create" | "getUserOrganizations" | "resolveTenant">,
  knowledgeService: Pick<KnowledgeService, "create">,
): Router {
  const router = Router();
  router.use(createHealthRouter(healthService));
  router.use("/auth", createAuthRouter(authService));
  router.use("/organizations", createOrganizationRouter(authService, organizationService));
  router.use("/workspaces", createWorkspaceRouter(authService, organizationService));
  router.use("/knowledge", createKnowledgeRouter(authService, organizationService, knowledgeService));
  return router;
}
