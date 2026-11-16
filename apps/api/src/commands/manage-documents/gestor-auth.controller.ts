import { Body, Controller, Delete, Get, Post, Req, Res, UnauthorizedException } from "@nestjs/common";
import type { Request, Response } from "express";
import { GestorAccounts } from "../../shared/auth/gestor-accounts";
import { ApiGestorCurrent, ApiGestorLogin, ApiGestorLogout } from "../../shared/openapi";

@Controller("gestor")
export class GestorAuthController {
  constructor(private readonly accounts: GestorAccounts) {}

  @Post("sesion")
  @ApiGestorLogin()
  async login(@Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    const session = await this.accounts.login(body);
    response.setHeader("Set-Cookie", session.cookie);
    return session.profile;
  }

  @Delete("sesion")
  @ApiGestorLogout()
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    response.setHeader("Set-Cookie", await this.accounts.logout(request));
    return { ok: true };
  }

  @Get("sesion")
  @ApiGestorCurrent()
  async current(@Req() request: Request) {
    const gestor = await this.accounts.fromRequest(request);
    if (!gestor) throw new UnauthorizedException("Inicia sesión");
    return gestor;
  }
}
