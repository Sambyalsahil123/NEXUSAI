import { Router } from "express";
import { createOrganizationController } from "../controllers/organization.controller.js";
import { createRequireAuth } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.js";
import type { AuthService } from "../services/auth.service.js";
import type { OrganizationService } from "../services/organization.service.js";
import { createOrganizationBodySchema } from "../validators/organization.validator.js";

type OrganizationApi = Pick<OrganizationService, "create" | "getUserOrganizations">;

export function createOrganizationRouter(authService: AuthService, organizationService: OrganizationApi): Router {
  const router = Router();
  const controller = createOrganizationController(organizationService);
  const requireAuth = createRequireAuth(authService);

  router.get("/", requireAuth, async (req, res) => {
    await controller.list(req, res);
  });

  router.post("/", requireAuth, validate({ body: createOrganizationBodySchema }), async (req, res) => {
    await controller.create(req, res);
  });

  return router;
}
