import { anthropic } from "@ai-sdk/anthropic";
import { start } from "@skybridge/test";
import { expect, it } from "vitest";
import { app } from "../src/server.js";

it("opens the explorer from a natural prompt", async () => {
  const chat = await start({ app, model: anthropic("claude-sonnet-4-5") });
  await chat.send("Let me explore the Palmer Penguins dataset");

  expect.chat(chat).toHaveCalledToolOnce("explore-dataset");
});
