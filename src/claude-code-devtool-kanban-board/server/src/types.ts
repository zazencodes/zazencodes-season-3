export type Column = {
  id: string;
  title: string;
  order: number;
};

export type Card = {
  id: string;
  columnId: string;
  title: string;
  description: string;
  order: number;
};

export type Board = {
  columns: Column[];
  cards: Card[];
};

export type Project = {
  id: string;
  name: string;
  createdAt: string;
};

export type Database = {
  projects: Project[];
  boards: Record<string, Board>;
};
