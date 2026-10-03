import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/app-error.js";
import { ErrorCodes } from "../errors/codes.js";
import { sendError } from "../utils/http.js";
import type { Logger } from "../utils/logger.js";
import { getRequestId } from "../utils/request-id.js";

type JsonParseError = SyntaxError & { status?: number; type?: string };

function isJsonParseError(error: unknown): error is JsonParseError {
  return (
    error instanceof SyntaxError &&
    "type" in error &&
    (error as JsonParseError).type === "entity.parse.failed"
  );
}

export function errorHandler(logger: Logger) {
  return (error: unknown, req: Request, res: Response, _next: NextFunction): void => {
    const requestId = getRequestId(req);

    if (error instanceof AppError) {
      if (error.statusCode >= 500) {
        logger.error({ err: error, requestId }, error.message);
      }
      sendError(
        res,
        error.statusCode,
        {
          code: error.code,
          message: error.message,
          ...(error.details !== undefined ? { details: error.details } : {}),
        },
        requestId,
      );
      return;
    }

    if (isJsonParseError(error)) {
      sendError(
        res,
        400,
        {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "Request body must be valid JSON",
        },
        requestId,
      );
      return;
    }

    logger.error({ err: error, requestId }, "unhandled error");
    sendError(
      res,
      500,
      {
        code: ErrorCodes.INTERNAL_ERROR,
        message: "Internal server error",
      },
      requestId,
    );
  };
}
