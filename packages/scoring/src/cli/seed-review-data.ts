import { disconnectPrisma } from "@anti-ghost/database";
import { seedReviewData } from "../seed-review-data";

async function main() {
  const summary = await seedReviewData();
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  const detail = error instanceof Error ? error.message : "Unknown error";
  console.error(`Review seed failed. Confirm DATABASE_URL and local Postgres availability.\n${detail}`);
  process.exitCode = 1;
}).finally(async () => {
  await disconnectPrisma();
});
