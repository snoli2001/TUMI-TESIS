import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  OnModuleInit,
  UnauthorizedException,
} from "@nestjs/common";
import { getPrisma } from "@tumi/database";
import type { Request } from "express";
import {
  GESTOR_SESSION_SECONDS,
  clearGestorCookie,
  gestorCookie,
  hashSessionToken,
  newSessionToken,
  readCookie,
  GESTOR_COOKIE,
} from "./gestor-cookie";
import { hashPassword, passwordsMatch } from "./gestor-password";

export interface GestorProfile {
  id: string;
  email: string;
  name: string;
}

export interface GestorLogin {
  profile: GestorProfile;
  cookie: string;
}

@Injectable()
export class GestorAccounts implements OnModuleInit {
  private readonly logger = new Logger(GestorAccounts.name);

  async onModuleInit(): Promise<void> {
    const prisma = getPrisma();
    const count = await prisma.gestor.count();
    if (count > 0) return;
    const email = process.env.GESTOR_EMAIL?.trim().toLowerCase() ?? "";
    const password = process.env.GESTOR_PASSWORD ?? "";
    if (!email.includes("@") || password.length < 8) {
      this.logger.warn("No hay gestores y faltan GESTOR_EMAIL o GESTOR_PASSWORD");
      return;
    }
    await prisma.gestor.create({
      data: {
        id: randomUUID(),
        email,
        name: "Gestor",
        passwordHash: await hashPassword(password),
      },
    });
    this.logger.log(`Gestor inicial creado: ${email}`);
  }

  async login(body: unknown): Promise<GestorLogin> {
    const input = accountFields(body, false);
    const gestor = await getPrisma().gestor.findUnique({ where: { email: input.email } });
    if (!gestor || !(await passwordsMatch(input.password, gestor.passwordHash))) {
      throw new UnauthorizedException("Correo o contraseña incorrectos");
    }
    const token = newSessionToken();
    await getPrisma().gestorSession.create({
      data: {
        id: randomUUID(),
        gestorId: gestor.id,
        tokenHash: hashSessionToken(token),
        expiresAt: new Date(Date.now() + GESTOR_SESSION_SECONDS * 1000),
      },
    });
    return {
      profile: { id: gestor.id, email: gestor.email, name: gestor.name },
      cookie: gestorCookie(token),
    };
  }

  async logout(request: Request): Promise<string> {
    const token = readCookie(request.header("cookie"), GESTOR_COOKIE);
    if (token) {
      await getPrisma().gestorSession.deleteMany({ where: { tokenHash: hashSessionToken(token) } });
    }
    return clearGestorCookie();
  }

  async fromRequest(request: Request): Promise<GestorProfile | null> {
    const token = readCookie(request.header("cookie"), GESTOR_COOKIE);
    if (!token) return null;
    const row = await getPrisma().gestorSession.findUnique({
      where: { tokenHash: hashSessionToken(token) },
      include: { gestor: true },
    });
    if (!row) return null;
    if (row.expiresAt.getTime() <= Date.now()) {
      await getPrisma().gestorSession.delete({ where: { id: row.id } }).catch(() => undefined);
      return null;
    }
    return { id: row.gestor.id, email: row.gestor.email, name: row.gestor.name };
  }

  async create(body: unknown): Promise<GestorProfile> {
    const input = accountFields(body, true);
    try {
      const gestor = await getPrisma().gestor.create({
        data: {
          id: randomUUID(),
          email: input.email,
          name: input.name,
          passwordHash: await hashPassword(input.password),
        },
      });
      return { id: gestor.id, email: gestor.email, name: gestor.name };
    } catch (error) {
      if (isUnique(error)) throw new ConflictException("Ese correo ya tiene una cuenta");
      throw error;
    }
  }
}

function accountFields(body: unknown, named: boolean): { email: string; name: string; password: string } {
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const email = typeof record.email === "string" ? record.email.trim().toLowerCase() : "";
  const name = typeof record.name === "string" ? record.name.trim() : "";
  const password = typeof record.password === "string" ? record.password : "";
  if (!email.includes("@") || email.length > 160) throw new BadRequestException("Escribe un correo válido");
  if (password.length < 8 || password.length > 200) {
    throw new BadRequestException("La contraseña necesita al menos 8 caracteres");
  }
  if (named && (name.length < 1 || name.length > 80)) throw new BadRequestException("Escribe el nombre del gestor");
  return { email, name: name || "Gestor", password };
}

function isUnique(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}
