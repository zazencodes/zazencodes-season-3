export type FieldKind = "quantitative" | "categorical";

export type Field = {
  /** Key as it appears in the raw dataset rows. */
  key: string;
  label: string;
  kind: FieldKind;
};

export type Dataset = {
  id: string;
  label: string;
  description: string;
  url: string;
  /** Row count of the source file, so the view can be opened before fetching. */
  rowCount: number;
  fields: Field[];
  /** Default chart encodings. */
  defaults: { x: string; y: string; color: string };
};

export const DATASETS = {
  penguins: {
    id: "penguins",
    label: "Palmer Penguins",
    description:
      "344 penguins from three islands in the Palmer Archipelago, with beak, flipper and body mass measurements.",
    url: "https://cdn.jsdelivr.net/npm/vega-datasets@3/data/penguins.json",
    rowCount: 344,
    fields: [
      { key: "Species", label: "Species", kind: "categorical" },
      { key: "Island", label: "Island", kind: "categorical" },
      { key: "Sex", label: "Sex", kind: "categorical" },
      { key: "Beak Length (mm)", label: "Beak length (mm)", kind: "quantitative" },
      { key: "Beak Depth (mm)", label: "Beak depth (mm)", kind: "quantitative" },
      { key: "Flipper Length (mm)", label: "Flipper length (mm)", kind: "quantitative" },
      { key: "Body Mass (g)", label: "Body mass (g)", kind: "quantitative" },
    ],
    defaults: {
      x: "Flipper Length (mm)",
      y: "Body Mass (g)",
      color: "Species",
    },
  },
} as const satisfies Record<string, Dataset>;

export type DatasetId = keyof typeof DATASETS;

export const DATASET_IDS = Object.keys(DATASETS) as [DatasetId, ...DatasetId[]];

export type Row = Record<string, string | number | null>;

export async function loadDataset(id: DatasetId): Promise<Row[]> {
  const { url } = DATASETS[id];
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  return (await response.json()) as Row[];
}
