import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function loadEnv(): void {
  const path = [join(process.cwd(), ".env"), join(__dirname, "../../../.env")].find((candidate) =>
    existsSync(candidate),
  );
  if (!path) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const index = line.indexOf("=");
    const key = line.slice(0, index);
    if (!process.env[key]) process.env[key] = line.slice(index + 1);
  }
}
