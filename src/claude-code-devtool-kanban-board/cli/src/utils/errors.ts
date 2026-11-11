import chalk from "chalk";

export function handleError(err: unknown): never {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(chalk.red("Error:"), msg);
  process.exit(1);
}
