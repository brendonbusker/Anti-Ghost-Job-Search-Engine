import { disconnectPrisma } from "@anti-ghost/database";
import { canonicalizeActiveListings } from "../canonicalization";

async function main() {
  const summary = await canonicalizeActiveListings();
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Canonicalization failed");
  process.exitCode = 1;
}).finally(async () => {
  await disconnectPrisma();
});
