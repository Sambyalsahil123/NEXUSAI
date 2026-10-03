import type { Response } from "express";

type ErrorPayload = {
  code: string;
  message: string;
  details?: unknown;
};

export function sendSuccess<T>(res: Response, statusCode: number, data: T, requestId: string): void {
  res.status(statusCode).json({
    success: true,
    data,
    meta: { requestId },
  });
}

export function sendError(res: Response, statusCode: number, error: ErrorPayload, requestId: string): void {
  res.status(statusCode).json({
    success: false,
    error: {
      code: error.code,
      message: error.message,
      ...(error.details !== undefined ? { details: error.details } : {}),
    },
    requestId,
  });
}
