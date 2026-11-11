import type { C2SEvent, S2CEvent } from "@minimax-dev-rpg/protocol";
import { C2SEventSchema, S2CEventSchema } from "@minimax-dev-rpg/protocol";
import { bus } from "./bus.js";

/**
 * Resilient typed WebSocket client. Reconnects with backoff, validates every
 * inbound message against the zod schema, and fans them out to:
 *   - the zustand store (via callbacks registered by store.ts)
 *   - the event bus (for transient FX)
 */
export class WsClient {
  private socket: WebSocket | null = null;
  private url: string;
  private reconnectAttempts = 0;
  private pingTimer: number | null = null;
  private storeHandlers: ((e: S2CEvent) => void)[] = [];
  private statusListeners = new Set<(connected: boolean) => void>();
  connected = false;

  constructor(url: string) {
    this.url = url;
  }

  connect() {
    this.open();
  }

  private open() {
    try {
      this.socket = new WebSocket(this.url);
    } catch (err) {
      console.error("[ws] failed to construct", err);
      this.scheduleReconnect();
      return;
    }
    this.socket.addEventListener("open", () => {
      this.connected = true;
      this.reconnectAttempts = 0;
      this.notifyStatus(true);
      this.startPing();
    });
    this.socket.addEventListener("close", () => {
      this.connected = false;
      this.notifyStatus(false);
      this.stopPing();
      this.scheduleReconnect();
    });
    this.socket.addEventListener("error", (e) => {
      console.warn("[ws] error", e);
    });
    this.socket.addEventListener("message", (e) => this.onMessage(e.data as string));
  }

  private onMessage(raw: string) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    const result = S2CEventSchema.safeParse(parsed);
    if (!result.success) {
      console.warn("[ws] malformed event", result.error.message, parsed);
      return;
    }
    const event = result.data;
    bus.emit({ ...event });
    for (const handler of this.storeHandlers) handler(event);
  }

  send(event: C2SEvent) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    // Re-validate to catch client-side drift; cheap and defensive.
    const ok = C2SEventSchema.safeParse(event);
    if (!ok.success) {
      console.warn("[ws] refusing to send malformed C2S", ok.error.message);
      return;
    }
    this.socket.send(JSON.stringify(event));
  }

  /** Register a handler for every server event. Used by the zustand store. */
  onServerEvent(fn: (e: S2CEvent) => void): () => void {
    this.storeHandlers.push(fn);
    return () => {
      const i = this.storeHandlers.indexOf(fn);
      if (i >= 0) this.storeHandlers.splice(i, 1);
    };
  }

  onStatus(fn: (connected: boolean) => void): () => void {
    this.statusListeners.add(fn);
    fn(this.connected);
    return () => this.statusListeners.delete(fn);
  }

  private notifyStatus(connected: boolean) {
    for (const fn of this.statusListeners) fn(connected);
  }

  private startPing() {
    this.stopPing();
    this.pingTimer = window.setInterval(() => {
      this.send({ kind: "ping", ts: Date.now() });
    }, 15000);
  }

  private stopPing() {
    if (this.pingTimer !== null) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private scheduleReconnect() {
    const delay = Math.min(8000, 500 * 2 ** this.reconnectAttempts);
    this.reconnectAttempts++;
    setTimeout(() => this.open(), delay);
  }
}

/** Resolve the WS URL relative to the current page (Vite dev proxy passes through). */
export const wsUrl = () => {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/ws`;
};

let _shared: WsClient | null = null;
/**
 * Process-wide singleton. We want exactly one WS connection even though
 * several modules (store, UI, Phaser scenes) need to talk to it.
 * Call `connectShared()` once from app boot.
 */
export const getShared = () => {
  if (!_shared) _shared = new WsClient(wsUrl());
  return _shared;
};
export const connectShared = () => {
  const c = getShared();
  c.connect();
  return c;
};
