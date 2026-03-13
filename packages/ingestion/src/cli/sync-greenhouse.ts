import { disconnectPrisma } from "@anti-ghost/database";
import { persistAdapterResult } from "../persistence";
import { syncGreenhouseBoard } from "../sources/greenhouse";

async function main() {
  const boardToken = readBoardTokenFromArgs();

  if (!boardToken) {
    throw new Error("Pass a Greenhouse board token with --board=<token>.");
  }

  const result = await syncGreenhouseBoard({
    boardToken,
  });

  const persisted = await persistAdapterResult(result);

  console.log(
    JSON.stringify(
      {
        boardToken,
        sourceId: persisted.sourceId,
        createdCount: persisted.createdCount,
        updatedCount: persisted.updatedCount,
        deactivatedCount: persisted.deactivatedCount,
      },
      null,
      2,
    ),
  );
}

function readBoardTokenFromArgs(): string | undefined {
  const boardArg = process.argv.find((arg) => arg.startsWith("--board="));
  return boardArg?.split("=")[1];
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await disconnectPrisma();
});
