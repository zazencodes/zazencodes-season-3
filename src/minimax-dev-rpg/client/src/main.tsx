import { createRoot } from "react-dom/client";
import "./styles.css";
import { App } from "./App.js";
import { connectShared } from "./ws/client.js";
import { useStore } from "./store.js";

// Wire up the WS client → store before React renders so the first frame
// already sees the right connection state. NOTE: we deliberately avoid
// React.StrictMode in dev — it double-invokes the App's useEffect, which
// re-creates the Phaser game and accumulates scene listeners. The game
// is deterministic; we don't need the strict-mode safety net here.
const ws = connectShared();
useStore.getState().init(ws);

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

createRoot(root).render(<App />);
