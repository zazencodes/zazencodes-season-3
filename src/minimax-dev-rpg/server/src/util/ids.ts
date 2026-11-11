/** Tiny id helper. crypto.randomUUID is available in Node 20+ and modern browsers. */
export const newId = (): string =>
  (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)).replace(
    /-/g,
    "",
  );
