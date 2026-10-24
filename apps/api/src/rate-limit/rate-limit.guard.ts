import {
  CanActivate,
  ExecutionContext,
  HttpException,
  Injectable,
} from "@nestjs/common";
import type { Request } from "express";
import { RedisService } from "../redis/redis.service";

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(private readonly redis: RedisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    if (request.path.includes("/health") || request.method !== "POST") return true;
    const ip = request.ip || request.socket.remoteAddress || "local";
    const count = await this.redis.hit(`rl:${ip}`, 60);
    if (count !== null && count > 30) {
      throw new HttpException("Demasiadas consultas. Espera un minuto.", 429);
    }
    return true;
  }
}
