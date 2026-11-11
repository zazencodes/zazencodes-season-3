// The meal agent: a Pi agent whose model calls go through the branch's Neon AI Gateway.

import { Agent, type AgentMessage } from "@earendil-works/pi-agent-core";
import { createModels, createProvider, type Model } from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import * as data from "./data.ts";
import { createTools } from "./tools.ts";
import { ATTACHMENTS_MARKER, type ChatEvent, type ChatMessage, type ContentBlock } from "../shared/types.ts";

/**
 * GLM 5.3 Flash (open weights, Z.ai) on the gateway's unified chat-completions
 * endpoint. It streams its reasoning as `reasoning_content`, which Pi surfaces
 * as thinking.
 */
const model: Model<"openai-completions"> = {
  id: "glm-5-3-flash",
  name: "GLM 5.3 Flash",
  api: "openai-completions",
  provider: "neon",
  baseUrl: `${process.env.NEON_AI_GATEWAY_BASE_URL}/v1`,
  reasoning: true,
  input: ["text", "image"],
  // Billed through Neon; Pi's cost tracking is not used.
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 1_000_000,
  maxTokens: 32_000,
  compat: {
    supportsStore: false,
    supportsDeveloperRole: false,
    supportsReasoningEffort: false,
    supportsStrictMode: false,
    maxTokensField: "max_tokens",
  },
};

const models = createModels();
models.setProvider(
  createProvider({
    id: "neon",
    name: "Neon AI Gateway",
    auth: {
      apiKey: {
        name: "Neon AI Gateway token",
        resolve: async () => ({ auth: { apiKey: process.env.NEON_AI_GATEWAY_TOKEN } }),
      },
    },
    models: [model],
    api: openAICompletionsApi(),
  }),
);

function systemPrompt(timeZone: string) {
  const now = new Date();
  const date = new Intl.DateTimeFormat("en-CA", { timeZone, dateStyle: "short" }).format(now);
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long" }).format(now);
  return `You are a meal-planning assistant. You manage the user's recipes, meal plan, grocery lists, and pantry using your tools.

Today is ${weekday}, ${date} (${timeZone}).

How to work:
- Data lives only in the tools. Look things up before answering questions about it, and never invent ids.
- When the user mentions a recipe, meal, list, or pantry item that may already exist, search first and update rather than duplicate.
- Save recipes with structured ingredients (numeric quantity, unit, name) so they can be scaled and added to grocery lists.
- When the user attaches files, call view_file to read them. When you transcribe a recipe from a file, pass its file_id to create_recipe.
- Link things: plan meals with recipe_id, and set recipe_id on grocery items bought for a recipe.
- Before building a grocery list for planned meals, check the pantry and leave out what the user already has, unless they ask otherwise.
- Make the changes the user asks for without asking for confirmation, except before deleting things they did not mention.
- Keep replies short. The user sees every object you create or change in a side pane, so summarise instead of repeating whole recipes or lists.`;
}

/** Image bytes stay in Object Storage, not in chat history. */
function forStorage(message: ChatMessage): ChatMessage {
  if (message.role !== "toolResult") return message;
  return {
    ...message,
    content: message.content.map(
      (block): ContentBlock =>
        block.type === "image"
          ? { type: "text", text: "[Image omitted from history. Call view_file again to see it.]" }
          : block,
    ),
  };
}

export interface ChatInput {
  text: string;
  fileIds: string[];
  timeZone: string;
}

/** Run one user turn, persisting every message and reporting progress through `emit`. */
export async function runChat(userId: string, input: ChatInput, emit: (event: ChatEvent) => void) {
  const attached = await Promise.all(input.fileIds.map((id) => data.getFile(userId, id)));
  const text = attached.length
    ? `${input.text}${ATTACHMENTS_MARKER}${attached.map((f) => `- ${f.name} (file_id: ${f.id}, ${f.contentType})`).join("\n")}`
    : input.text;

  const history = await data.loadChatSession(userId);
  const agent = new Agent({
    initialState: {
      systemPrompt: systemPrompt(input.timeZone),
      model,
      thinkingLevel: "medium",
      tools: createTools(userId),
      messages: history.map((row) => row.message as AgentMessage),
    },
    streamFn: models.streamSimple.bind(models),
  });

  agent.subscribe(async (event) => {
    switch (event.type) {
      case "message_start":
        if (event.message.role === "assistant") emit({ type: "assistant_start" });
        break;
      case "message_update": {
        const e = event.assistantMessageEvent;
        if (e.type === "text_delta" || e.type === "thinking_delta") {
          emit({
            type: "delta",
            kind: e.type === "text_delta" ? "text" : "thinking",
            contentIndex: e.contentIndex,
            delta: e.delta,
          });
        }
        break;
      }
      case "message_end": {
        const message = event.message as ChatMessage;
        if (message.role === "user" || message.role === "assistant" || message.role === "toolResult") {
          emit({ type: "row", row: await data.appendChatMessage(userId, forStorage(message)) });
        }
        break;
      }
      case "tool_execution_start":
        emit({ type: "tool_start", toolCallId: event.toolCallId, toolName: event.toolName, args: event.args });
        break;
      case "tool_execution_end":
        emit({
          type: "tool_end",
          toolCallId: event.toolCallId,
          isError: event.isError,
          details: event.isError ? null : event.result.details,
        });
        break;
    }
  });

  await agent.prompt({ role: "user", content: text, timestamp: Date.now() });
}
