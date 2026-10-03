import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";
import { AppError } from "../errors/app-error.js";
import { ErrorCodes } from "../errors/codes.js";

type RequestSchemas = {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
};

function issuesOf(error: { issues: { path: PropertyKey[]; message: string }[] }) {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join("."),
    message: issue.message,
  }));
}

export function validate(schemas: RequestSchemas) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const validated: NonNullable<Request["validated"]> = {};

    if (schemas.body) {
      const result = schemas.body.safeParse(req.body);
      if (!result.success) {
        next(
          new AppError(ErrorCodes.VALIDATION_ERROR, "Request validation failed", 400, issuesOf(result.error)),
        );
        return;
      }
      validated.body = result.data;
    }

    if (schemas.query) {
      const result = schemas.query.safeParse(req.query);
      if (!result.success) {
        next(
          new AppError(ErrorCodes.VALIDATION_ERROR, "Request validation failed", 400, issuesOf(result.error)),
        );
        return;
      }
      validated.query = result.data;
    }

    if (schemas.params) {
      const result = schemas.params.safeParse(req.params);
      if (!result.success) {
        next(
          new AppError(ErrorCodes.VALIDATION_ERROR, "Request validation failed", 400, issuesOf(result.error)),
        );
        return;
      }
      validated.params = result.data;
    }

    req.validated = validated;
    next();
  };
}
