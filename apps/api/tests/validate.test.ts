import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { errorHandler } from "../src/middleware/error-handler.js";
import { notFound } from "../src/middleware/not-found.js";
import { requestId } from "../src/middleware/request-id.js";
import { validate } from "../src/middleware/validate.js";
import { createLogger } from "../src/utils/logger.js";

function createValidationApp() {
  const app = express();
  app.use(requestId);
  app.use(express.json());
  app.post(
    "/echo",
    validate({
      body: z.object({
        name: z.string().min(1),
      }),
    }),
    (req, res) => {
      res.status(200).json({ success: true, data: req.validated?.body });
    },
  );
  app.use(notFound);
  app.use(errorHandler(createLogger("silent")));
  return app;
}

describe("validate middleware", () => {
  it("rejects a body that does not match the schema", async () => {
    const response = await request(createValidationApp()).post("/echo").send({ name: "" });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(response.body.requestId).toEqual(expect.any(String));
  });

  it("passes a valid body to the route handler", async () => {
    const response = await request(createValidationApp()).post("/echo").send({ name: "NexusAI" });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ name: "NexusAI" });
  });
});
