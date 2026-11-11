import { Command } from "commander";
import chalk from "chalk";
import { api } from "../api.js";
import { handleError } from "../utils/errors.js";
import type { Card } from "../types.js";

function printCard(card: Card): void {
  console.log(chalk.bold(card.title), chalk.dim(`(${card.id})`));
  if (card.description) console.log(chalk.dim("  " + card.description));
  console.log(chalk.dim(`  column=${card.columnId} order=${card.order}`));
}

export const cardsCmd = new Command("cards").description("Manage cards");

cardsCmd
  .command("create <projectId> <columnId> <title> [description]")
  .description("Create a new card")
  .action(
    async (
      projectId: string,
      columnId: string,
      title: string,
      description?: string
    ) => {
      try {
        const card = await api.createCard(
          projectId,
          columnId,
          title,
          description
        );
        console.log(chalk.green("Card created:"));
        printCard(card);
      } catch (err) {
        handleError(err);
      }
    }
  );

cardsCmd
  .command("update <projectId> <cardId>")
  .description("Update a card's title, description, or column")
  .option("-t, --title <title>", "New title")
  .option("-d, --description <description>", "New description")
  .option("-c, --column <columnId>", "Move to column ID")
  .option("-o, --order <number>", "Set order within column", parseInt)
  .action(
    async (
      projectId: string,
      cardId: string,
      opts: {
        title?: string;
        description?: string;
        column?: string;
        order?: number;
      }
    ) => {
      try {
        const patch: Parameters<typeof api.updateCard>[2] = {};
        if (opts.title !== undefined) patch.title = opts.title;
        if (opts.description !== undefined) patch.description = opts.description;
        if (opts.column !== undefined) patch.columnId = opts.column;
        if (opts.order !== undefined) patch.order = opts.order;

        const card = await api.updateCard(projectId, cardId, patch);
        console.log(chalk.green("Card updated:"));
        printCard(card);
      } catch (err) {
        handleError(err);
      }
    }
  );

cardsCmd
  .command("move <projectId> <cardId> <columnId>")
  .description("Move a card to a different column")
  .action(async (projectId: string, cardId: string, columnId: string) => {
    try {
      const card = await api.updateCard(projectId, cardId, { columnId });
      console.log(chalk.green("Card moved:"));
      printCard(card);
    } catch (err) {
      handleError(err);
    }
  });

cardsCmd
  .command("delete <projectId> <cardId>")
  .description("Delete a card")
  .action(async (projectId: string, cardId: string) => {
    try {
      await api.deleteCard(projectId, cardId);
      console.log(chalk.green("✓"), "Card deleted.");
    } catch (err) {
      handleError(err);
    }
  });
