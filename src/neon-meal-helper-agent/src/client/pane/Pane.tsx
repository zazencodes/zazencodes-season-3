import { useWorkspace, type Tab } from "../workspace.tsx";
import { FilesView } from "./Files.tsx";
import { GroceriesView } from "./Groceries.tsx";
import { MealPlanView } from "./MealPlan.tsx";
import { PantryView } from "./Pantry.tsx";
import { RecipesView } from "./Recipes.tsx";

const TABS: { tab: Tab; label: string }[] = [
  { tab: "recipes", label: "Recipes" },
  { tab: "plan", label: "Plan" },
  { tab: "groceries", label: "Groceries" },
  { tab: "pantry", label: "Pantry" },
  { tab: "files", label: "Files" },
];

export function Pane({ onClose }: { onClose: () => void }) {
  const { target, navigate } = useWorkspace();
  return (
    <div className="pane-inner">
      <div className="pane-top">
        <nav className="tabs">
          {TABS.map(({ tab, label }) => (
            <button
              key={tab}
              className={`tab ${target.tab === tab ? "active" : ""}`}
              onClick={() => navigate({ tab })}
            >
              {label}
            </button>
          ))}
        </nav>
        <button className="btn ghost small pane-close" onClick={onClose} aria-label="Back to chat">
          Chat →
        </button>
      </div>
      <div className="pane-body" key={target.tab}>
        {target.tab === "recipes" && <RecipesView />}
        {target.tab === "plan" && <MealPlanView />}
        {target.tab === "groceries" && <GroceriesView />}
        {target.tab === "pantry" && <PantryView />}
        {target.tab === "files" && <FilesView />}
      </div>
    </div>
  );
}
