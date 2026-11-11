import express from "express";
import cors from "cors";
import { projectsRouter } from "./routes/projects.js";
import { columnsRouter } from "./routes/columns.js";
import { cardsRouter } from "./routes/cards.js";

const app = express();
const PORT = Number(process.env.PORT ?? 3001);

app.use(cors());
app.use(express.json());

app.use("/api/projects", projectsRouter);
app.use("/api/projects/:projectId/columns", columnsRouter);
app.use("/api/projects/:projectId/cards", cardsRouter);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "internal server error" });
});

app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
});
