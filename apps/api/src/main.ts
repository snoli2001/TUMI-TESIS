import "reflect-metadata";
import { json, urlencoded } from "express";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(json({ limit: "8mb" }));
  app.use(urlencoded({ extended: true, limit: "1mb" }));
  app.setGlobalPrefix("api");
  app.enableCors({ origin: true, credentials: true });
  await app.listen(process.env.PORT ?? 3000, "0.0.0.0");
}

void bootstrap();
