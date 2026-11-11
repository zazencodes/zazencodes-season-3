import { useEffect, useState } from "react";

export type Route =
  | { name: "projects" }
  | { name: "board"; projectId: string };

function parse(hash: string): Route {
  const clean = hash.replace(/^#/, "");
  const match = clean.match(/^\/projects\/([^/]+)/);
  if (match) return { name: "board", projectId: match[1] };
  return { name: "projects" };
}

export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parse(window.location.hash));

  useEffect(() => {
    const onChange = () => setRoute(parse(window.location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  return route;
}

export function navigate(path: string): void {
  window.location.hash = path;
}
