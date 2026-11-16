import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { mountApiReference } from "./shared/openapi";
import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  app.useBodyParser("json", { limit: "8mb" });
  app.useBodyParser("urlencoded", { limit: "1mb", extended: true });
  app.setGlobalPrefix("api");
  app.enableCors({ origin: true, credentials: true });
  mountApiReference(app);
  await app.listen(process.env.PORT ?? 3000, "0.0.0.0");
}

void bootstrap();
