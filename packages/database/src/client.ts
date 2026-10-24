import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";

let client: PrismaClient | undefined;

export function getPrisma(): PrismaClient {
  if (!client) {
    const connectionString =
      process.env.DATABASE_URL ??
      "postgresql://tumi:tumi@localhost:5432/tumi";
    const adapter = new PrismaPg({ connectionString });
    client = new PrismaClient({ adapter });
  }
  return client;
}

export async function disconnectPrisma(): Promise<void> {
  if (client) {
    await client.$disconnect();
    client = undefined;
  }
}
