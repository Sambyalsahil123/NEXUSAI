import { Router } from "express";
import { createAuthController } from "../controllers/auth.controller.js";
import { validate } from "../middleware/validate.js";
import type { AuthService } from "../services/auth.service.js";
import { loginBodySchema, registerBodySchema } from "../validators/auth.validator.js";

export function createAuthRouter(authService: AuthService): Router {
  const router = Router();
  const controller = createAuthController(authService);

  router.post("/register", validate({ body: registerBodySchema }), async (req, res) => {
    await controller.register(req, res);
  });

  router.post("/login", validate({ body: loginBodySchema }), async (req, res) => {
    await controller.login(req, res);
  });

  return router;
}
