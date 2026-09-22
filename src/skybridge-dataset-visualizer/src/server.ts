import { Skybridge } from "skybridge/server";
import { z } from "zod";
import { DATASET_IDS, DATASETS, loadDataset } from "./datasets.js";

export const app = new Skybridge({
  name: "alpic-openai-app",
  version: "0.0.1",
  handler: (server) =>
    server.registerTool(
      {
        name: "explore-dataset",
        description:
          "Open an interactive explorer for a dataset: a scatter chart next to a sortable, filterable table. " +
          `Available datasets: ${DATASET_IDS.map((id) => `${id} (${DATASETS[id].label})`).join(", ")}.`,
        inputSchema: {
          dataset: z
            .enum(DATASET_IDS)
            .default("penguins")
            .describe("The dataset to explore."),
        },
        annotations: {
          title: "Explore a dataset",
          readOnlyHint: true,
          destructiveHint: false,
          openWorldHint: true,
        },
        _meta: {
          "openai/toolInvocation/invoking": "Loading the dataset…",
          "openai/toolInvocation/invoked": "Explorer ready.",
        },
        view: {
          component: "explorer",
          description: "Interactive dataset explorer",
          // No `domain`: Skybridge fills in the origin actually serving the
          // widget, per request, so tunnels and production both work.
          csp: {
            resourceDomains: [
              "https://fonts.googleapis.com",
              "https://fonts.gstatic.com",
            ],
          },
        },
      },
      async ({ dataset }) => {
        const { label, description, fields, defaults } = DATASETS[dataset];
        const rows = await loadDataset(dataset);

        return {
          // What the model should see: the dataset's shape, not its rows.
          structuredContent: {
            dataset,
            label,
            description,
            fields,
            defaults,
            total: rows.length,
          },
          content: [
            {
              type: "text",
              text: `Opened the ${label} explorer: ${rows.length} rows, ${fields.length} columns (${fields
                .map((field) => field.label)
                .join(", ")}). ${description}`,
            },
          ],
          // Delivered to the view only, so the rows cost no model context.
          _meta: { rows },
          isError: false,
        };
      },
    ),
});

export type AppType = typeof app;
