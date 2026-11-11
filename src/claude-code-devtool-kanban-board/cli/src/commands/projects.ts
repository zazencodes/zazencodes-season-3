import { Command } from "commander";
import chalk from "chalk";
import { api } from "../api.js";
import { handleError } from "../utils/errors.js";
import { printProject, printProjects } from "../utils/display.js";

export const projectsCmd = new Command("projects")
  .description("Manage projects");

projectsCmd
  .command("list")
  .description("List all projects")
  .action(async () => {
    try {
      const projects = await api.listProjects();
      printProjects(projects);
    } catch (err) {
      handleError(err);
    }
  });

projectsCmd
  .command("create <name>")
  .description("Create a new project")
  .action(async (name: string) => {
    try {
      const project = await api.createProject(name);
      console.log(chalk.green("Project created:"));
      printProject(project);
    } catch (err) {
      handleError(err);
    }
  });

projectsCmd
  .command("rename <projectId> <name>")
  .description("Rename a project")
  .action(async (projectId: string, name: string) => {
    try {
      const project = await api.renameProject(projectId, name);
      console.log(chalk.green("Project renamed:"));
      printProject(project);
    } catch (err) {
      handleError(err);
    }
  });

projectsCmd
  .command("delete <projectId>")
  .description("Delete a project")
  .action(async (projectId: string) => {
    try {
      await api.deleteProject(projectId);
      console.log(chalk.green("✓"), "Project deleted.");
    } catch (err) {
      handleError(err);
    }
  });
