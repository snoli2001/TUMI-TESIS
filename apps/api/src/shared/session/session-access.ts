import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { UnauthorizedException } from "@nestjs/common";
import { getPrisma } from "@tumi/database";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function hashAccessKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function accessKeysMatch(storedHash: string, presentedKey: string): boolean {
  const actual = Buffer.from(hashAccessKey(presentedKey));
  const expected = Buffer.from(storedHash);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

export async function openSession(sessionId: string | undefined, accessKey: string | undefined): Promise<string> {
  const key = requireKey(accessKey);
  const id = sessionId && UUID.test(sessionId) ? sessionId : randomUUID();
  const prisma = getPrisma();
  const hash = hashAccessKey(key);
  await prisma.factSession.upsert({
    where: { id },
    create: { id, accessKeyHash: hash },
    update: {},
  });
  const row = await prisma.factSession.findUnique({ where: { id } });
  if (!row?.accessKeyHash || !accessKeysMatch(row.accessKeyHash, key)) {
    throw new UnauthorizedException("La sesión no corresponde a esta llave");
  }
  return id;
}

export async function readSession(sessionId: string | undefined, accessKey: string | undefined): Promise<string | null> {
  const key = requireKey(accessKey);
  if (!sessionId || !UUID.test(sessionId)) throw new UnauthorizedException("Falta la sesión");
  const row = await getPrisma().factSession.findUnique({ where: { id: sessionId } });
  if (!row) return null;
  if (!row.accessKeyHash || !accessKeysMatch(row.accessKeyHash, key)) {
    throw new UnauthorizedException("La sesión no corresponde a esta llave");
  }
  return sessionId;
}

function requireKey(accessKey: string | undefined): string {
  const key = accessKey?.trim() ?? "";
  if (key.length < 16) throw new UnauthorizedException("Falta la llave de la sesión");
  return key;
}
