import { useCallback, useState } from "react";
import { Chat } from "./Chat.tsx";
import { Pane } from "./pane/Pane.tsx";
import { WorkspaceProvider } from "./workspace.tsx";

export function App({ user, onSignOut }: { user: { name: string; email: string }; onSignOut: () => void }) {
  // On narrow screens the pane is a sheet over the chat.
  const [paneOpen, setPaneOpen] = useState(false);
  const openPane = useCallback(() => setPaneOpen(true), []);

  return (
    <WorkspaceProvider onNavigate={openPane}>
      <div className={`shell ${paneOpen ? "pane-open" : ""}`}>
        <aside className="pane">
          <Pane onClose={() => setPaneOpen(false)} />
        </aside>
        <main className="chat-column">
          <header className="topbar">
            <button className="btn ghost pane-toggle" onClick={openPane} aria-label="Open kitchen">
              ☰ Kitchen
            </button>
            <h1 className="wordmark">
              Meal <em>Helper</em>
            </h1>
            <div className="account">
              <span title={user.email}>{user.name || user.email}</span>
              <button className="btn ghost small" onClick={onSignOut}>
                Sign out
              </button>
            </div>
          </header>
          <Chat />
        </main>
      </div>
    </WorkspaceProvider>
  );
}
