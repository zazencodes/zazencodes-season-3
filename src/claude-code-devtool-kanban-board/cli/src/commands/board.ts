import { Command } from "commander";
import { api } from "../api.js";
import { handleError } from "../utils/errors.js";
import { printBoard } from "../utils/display.js";

export const boardCmd = new Command("board")
  .description("Show the board for a project")
  .argument("<projectId>", "Project ID")
  .action(async (projectId: string) => {
    try {
      const [board, projects] = await Promise.all([
        api.getBoard(projectId),
        api.listProjects(),
      ]);
      const project = projects.find((p) => p.id === projectId);
      printBoard(board, project?.name);
    } catch (err) {
      handleError(err);
    }
  });
