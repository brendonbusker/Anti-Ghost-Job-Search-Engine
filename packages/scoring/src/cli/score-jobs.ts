import { disconnectPrisma } from "@anti-ghost/database";
import { scoreCanonicalJobs } from "../scoring";

async function main() {
  const summary = await scoreCanonicalJobs();
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  const detail = error instanceof Error ? error.message : "Unknown error";
  console.error(`Job scoring failed. Confirm DATABASE_URL and local Postgres availability.\n${detail}`);
  process.exitCode = 1;
}).finally(async () => {
  await disconnectPrisma();
});
