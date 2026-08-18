/**
 * Lightweight event bus for transient events (combat ticks, damage pops) that
 * the React HUD and Phaser scenes both want to react to without persisting
 * into the store. Persistent state goes through zustand; one-shots go here.
 */
type Listener = (event: { kind: string; [k: string]: unknown }) => void;

class EventBus {
  private listeners = new Map<string, Set<Listener>>();

  on(kind: string, fn: Listener): () => void {
    let set = this.listeners.get(kind);
    if (!set) {
      set = new Set();
      this.listeners.set(kind, set);
    }
    set.add(fn);
    return () => set!.delete(fn);
  }

  emit(event: { kind: string; [k: string]: unknown }) {
    const set = this.listeners.get(event.kind);
    if (!set) return;
    for (const fn of set) fn(event);
  }
}

export const bus = new EventBus();
