import { Command } from "commander";
import chalk from "chalk";
import { api } from "../api.js";
import { handleError } from "../utils/errors.js";

function printColumn(col: { id: string; title: string; order: number }): void {
  console.log(
    chalk.bold(col.title),
    chalk.dim(`(${col.id}) order=${col.order}`)
  );
}

export const columnsCmd = new Command("columns").description("Manage columns");

columnsCmd
  .command("create <projectId> <title>")
  .description("Create a new column")
  .action(async (projectId: string, title: string) => {
    try {
      const col = await api.createColumn(projectId, title);
      console.log(chalk.green("Column created:"));
      printColumn(col);
    } catch (err) {
      handleError(err);
    }
  });

columnsCmd
  .command("rename <projectId> <columnId> <title>")
  .description("Rename a column")
  .action(async (projectId: string, columnId: string, title: string) => {
    try {
      const col = await api.renameColumn(projectId, columnId, title);
      console.log(chalk.green("Column renamed:"));
      printColumn(col);
    } catch (err) {
      handleError(err);
    }
  });

columnsCmd
  .command("delete <projectId> <columnId>")
  .description("Delete a column (and all its cards)")
  .action(async (projectId: string, columnId: string) => {
    try {
      await api.deleteColumn(projectId, columnId);
      console.log(chalk.green("✓"), "Column deleted.");
    } catch (err) {
      handleError(err);
    }
  });
