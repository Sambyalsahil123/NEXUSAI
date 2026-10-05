import { Router } from "express";
import { createAuthController } from "../controllers/auth.controller.js";
import { createRequireAuth } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.js";
import type { AuthService } from "../services/auth.service.js";
import { loginBodySchema, refreshTokenBodySchema, registerBodySchema } from "../validators/auth.validator.js";

export function createAuthRouter(authService: AuthService): Router {
  const router = Router();
  const controller = createAuthController(authService);
  const requireAuth = createRequireAuth(authService);

  router.post("/register", validate({ body: registerBodySchema }), async (req, res) => {
    await controller.register(req, res);
  });

  router.post("/login", validate({ body: loginBodySchema }), async (req, res) => {
    await controller.login(req, res);
  });

  router.post("/refresh", validate({ body: refreshTokenBodySchema }), async (req, res) => {
    await controller.refresh(req, res);
  });

  router.post("/logout", validate({ body: refreshTokenBodySchema }), async (req, res) => {
    await controller.logout(req, res);
  });

  router.get("/me", requireAuth, async (req, res) => {
    await controller.me(req, res);
  });

  return router;
}
