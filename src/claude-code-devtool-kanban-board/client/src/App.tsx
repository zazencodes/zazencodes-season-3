import { Board } from "./components/Board";
import { Projects } from "./components/Projects";
import { useHashRoute } from "./hooks/useHashRoute";

export function App() {
  const route = useHashRoute();
  if (route.name === "board") return <Board projectId={route.projectId} />;
  return <Projects />;
}
