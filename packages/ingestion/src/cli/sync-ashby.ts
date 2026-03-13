import { disconnectPrisma } from "@anti-ghost/database";
import { persistAdapterResult } from "../persistence";
import { syncAshbyBoard } from "../sources/ashby";

async function main() {
  const boardName = readBoardNameFromArgs();

  if (!boardName) {
    throw new Error("Pass an Ashby board name with --board=<board-name>.");
  }

  const result = await syncAshbyBoard({
    boardName,
  });

  const persisted = await persistAdapterResult(result);

  console.log(
    JSON.stringify(
      {
        boardName,
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

function readBoardNameFromArgs(): string | undefined {
  const boardArg = process.argv.find((arg) => arg.startsWith("--board="));
  return boardArg?.split("=")[1];
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await disconnectPrisma();
});
