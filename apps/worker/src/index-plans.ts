import { disconnectPrisma } from "@tumi/database";
import { loadEnv } from "./load-env";
import { indexNextBatch } from "./plan-index";

loadEnv();

async function main(): Promise<void> {
  const limit = Number(process.env.INDEX_PLAN_LIMIT ?? 0);
  let after: string | undefined;
  let indexed = 0;
  let skipped = 0;
  let failed = 0;
  let chunks = 0;
  let seen = 0;
  for (;;) {
    const batch = await indexNextBatch(after);
    seen += 4;
    indexed += batch.indexed;
    skipped += batch.skipped;
    failed += batch.failed;
    chunks += batch.chunks;
    console.log(
      JSON.stringify({
        cursor: batch.next,
        indexed,
        skipped,
        failed,
        chunks,
      }),
    );
    if (!batch.next || (limit > 0 && seen >= limit)) break;
    after = batch.next;
  }
  await disconnectPrisma();
}

void main().catch(async (error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  await disconnectPrisma();
  process.exit(1);
});
