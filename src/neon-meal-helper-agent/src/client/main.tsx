import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { authClient } from "./auth.ts";
import "./styles.css";

type User = { id: string; name: string; email: string };

function Root() {
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    authClient.getSession().then(({ data, error }) => {
      if (error) throw new Error(error.message);
      setUser(data?.user ?? null);
    });
  }, []);

  if (user === undefined) return <div className="splash">Warming up the kitchen…</div>;
  if (user === null) return <SignIn onSignedIn={setUser} />;
  return (
    <App
      user={user}
      onSignOut={async () => {
        await authClient.signOut();
        setUser(null);
      }}
    />
  );
}

function SignIn({ onSignedIn }: { onSignedIn: (user: User) => void }) {
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result =
      mode === "signIn"
        ? await authClient.signIn.email({ email, password })
        : await authClient.signUp.email({ name, email, password });
    setBusy(false);
    if (result.error) return setError(result.error.message ?? "Something went wrong");
    onSignedIn(result.data.user);
  }

  return (
    <main className="signin">
      <form className="signin-card" onSubmit={submit}>
        <p className="eyebrow">Meal Helper</p>
        <h1>{mode === "signIn" ? "Back to the kitchen." : "Set up your kitchen."}</h1>
        {mode === "signUp" && (
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
          </label>
        )}
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete={mode === "signIn" ? "current-password" : "new-password"}
          />
        </label>
        {error && <p className="form-error">{error}</p>}
        <button className="btn primary" disabled={busy}>
          {busy ? "One moment…" : mode === "signIn" ? "Sign in" : "Create account"}
        </button>
        <button
          type="button"
          className="link"
          onClick={() => {
            setMode(mode === "signIn" ? "signUp" : "signIn");
            setError(null);
          }}
        >
          {mode === "signIn" ? "New here? Create an account" : "Have an account? Sign in"}
        </button>
      </form>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
