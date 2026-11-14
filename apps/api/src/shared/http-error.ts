import { HttpException } from "@nestjs/common";
import type { Response } from "express";

export function sendHttpError(response: Response, error: unknown): boolean {
  if (!(error instanceof HttpException)) return false;
  const body = error.getResponse();
  const message =
    typeof body === "string"
      ? body
      : body && typeof body === "object" && "message" in body
        ? String((body as { message: unknown }).message)
        : error.message;
  response.status(error.getStatus()).json({ message });
  return true;
}
