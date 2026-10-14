import { Router } from "express";
import { createOrganizationController } from "../controllers/organization.controller.js";
import { createRequireAuth } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/rbac.middleware.js";
import { createRequireTenant } from "../middleware/tenant.middleware.js";
import { validate } from "../middleware/validate.js";
import type { AuthService } from "../services/auth.service.js";
import type { OrganizationService } from "../services/organization.service.js";
import { createOrganizationBodySchema } from "../validators/organization.validator.js";

type OrganizationApi = Pick<OrganizationService, "create" | "getUserOrganizations" | "resolveTenant">;

export function createOrganizationRouter(authService: AuthService, organizationService: OrganizationApi): Router {
  const router = Router();
  const controller = createOrganizationController(organizationService);
  const requireAuth = createRequireAuth(authService);
  const requireTenant = createRequireTenant(organizationService);

  router.get("/", requireAuth, async (req, res) => {
    await controller.list(req, res);
  });

  router.post("/", requireAuth, validate({ body: createOrganizationBodySchema }), async (req, res) => {
    await controller.create(req, res);
  });

  router.patch(
    "/current/settings",
    requireAuth,
    requireTenant,
    requireRole(["owner", "admin"]),
    async (req, res) => {
      await controller.updateCurrentSettings(req, res);
    },
  );

  return router;
}

export function createWorkspaceRouter(authService: AuthService, organizationService: OrganizationApi): Router {
  const router = Router();
  const controller = createOrganizationController(organizationService);
  const requireAuth = createRequireAuth(authService);
  const requireTenant = createRequireTenant(organizationService);

  router.get("/current", requireAuth, requireTenant, async (req, res) => {
    await controller.current(req, res);
  });

  return router;
}
