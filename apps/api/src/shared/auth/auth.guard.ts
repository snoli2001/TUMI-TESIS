import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";

@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (process.env.AUTH_ENABLED !== "true") return true;
    const request = context.switchToHttp().getRequest<Request>();
    if (request.path.includes("/health")) return true;
    const header = request.header("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!process.env.API_TOKEN || token !== process.env.API_TOKEN) {
      throw new UnauthorizedException("Falta un token válido");
    }
    return true;
  }
}
