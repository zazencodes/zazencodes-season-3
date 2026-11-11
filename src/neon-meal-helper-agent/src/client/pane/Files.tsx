import { useEffect, useRef } from "react";
import { api } from "../api.ts";
import { uploadFile } from "../upload.ts";
import { useResource, useWorkspace } from "../workspace.tsx";
import { Empty, Loading, useAction } from "./common.tsx";
import type { FileRecord, RecipeSummary } from "../../shared/types.ts";

export function FilesView() {
  const { versions, changed } = useWorkspace();
  const { data, error } = useResource(() => api.get<FileRecord[]>("/api/files"), [versions.files]);
  const recipes = useResource(() => api.get<RecipeSummary[]>("/api/recipes"), [versions.recipes]);
  const { run, busy, errorView } = useAction();
  return (
    <section>
      <div className="pane-head">
        <h2>Recipe files</h2>
        <label className="btn small">
          {busy ? "Uploading…" : "Upload"}
          <input
            type="file"
            hidden
            multiple
            accept="image/*,text/*,.md"
            onChange={(e) => {
              const picked = Array.from(e.target.files ?? []);
              e.target.value = "";
              run(async () => {
                for (const file of picked) await uploadFile(file);
                changed(["files"]);
              });
            }}
          />
        </label>
      </div>
      <p className="muted small">Attach files in the chat to have the agent turn them into recipes.</p>
      {errorView}
      {!data ? (
        <Loading error={error} />
      ) : data.length === 0 ? (
        <Empty>No files yet.</Empty>
      ) : (
        <ul className="files">
          {data.map((file) => (
            <FileCard key={file.id} file={file} recipes={recipes.data ?? []} />
          ))}
        </ul>
      )}
    </section>
  );
}

function FileCard({ file, recipes }: { file: FileRecord; recipes: RecipeSummary[] }) {
  const { target, navigate, changed } = useWorkspace();
  const { run, busy, errorView } = useAction();
  const ref = useRef<HTMLLIElement>(null);
  const highlighted = target.id === file.id;
  useEffect(() => {
    if (highlighted) ref.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [highlighted]);
  const url = `/api/files/${file.id}/content`;
  const recipe = recipes.find((r) => r.id === file.recipeId);

  return (
    <li ref={ref} className={`file-card ${highlighted ? "highlight" : ""}`}>
      <a href={url} target="_blank" rel="noreferrer" className="file-preview">
        {file.contentType.startsWith("image/") ? <img src={url} alt={file.name} loading="lazy" /> : <span>TXT</span>}
      </a>
      <div className="file-meta">
        <span className="card-title">{file.name}</span>
        <span className="muted small">
          {new Date(file.createdAt).toLocaleDateString()} · {Math.ceil(file.sizeBytes / 1024)} KB
        </span>
        {recipe && (
          <button className="ref recipe mini" onClick={() => navigate({ tab: "recipes", id: recipe.id })}>
            {recipe.title}
          </button>
        )}
        <select
          value={file.recipeId ?? ""}
          disabled={busy}
          onChange={(e) =>
            run(async () => {
              await api.patch(`/api/files/${file.id}`, { recipeId: e.target.value || null });
              changed(["files", "recipes"]);
            })
          }
        >
          <option value="">Not linked to a recipe</option>
          {recipes.map((r) => (
            <option key={r.id} value={r.id}>
              {r.title}
            </option>
          ))}
        </select>
        <button
          className="btn small ghost danger"
          disabled={busy}
          onClick={() =>
            confirm(`Delete ${file.name}?`) &&
            run(async () => {
              await api.delete(`/api/files/${file.id}`);
              changed(["files", "recipes"]);
            })
          }
        >
          Delete
        </button>
        {errorView}
      </div>
    </li>
  );
}
