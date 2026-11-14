import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
import { GestorAccounts } from "./gestor-accounts";

@Injectable()
export class GestorGuard implements CanActivate {
  constructor(private readonly accounts: GestorAccounts) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const gestor = await this.accounts.fromRequest(request);
    if (!gestor) throw new UnauthorizedException("Inicia sesión");
    return true;
  }
}
