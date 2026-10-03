import { Router } from "express";
import { createAuthController } from "../controllers/auth.controller.js";
import { validate } from "../middleware/validate.js";
import type { AuthService } from "../services/auth.service.js";
import { registerBodySchema } from "../validators/auth.validator.js";

export function createAuthRouter(authService: AuthService): Router {
  const router = Router();
  const controller = createAuthController(authService);

  router.post("/register", validate({ body: registerBodySchema }), async (req, res) => {
    await controller.register(req, res);
  });

  return router;
}
