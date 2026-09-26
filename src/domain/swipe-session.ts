import type { Decision, SwipeItem } from './swipe-item';
import type { Progress, ProgressStore } from './progress-store';
import { SwipeCancelledError } from './swipe-source';
import type { SwipeSource } from './swipe-source';

export type SessionPhase = 'idle' | 'loading' | 'denied' | 'ready' | 'error';

export interface SessionSnapshot<T extends SwipeItem> {
  readonly phase: SessionPhase;
  /** The full deck for this run; the current item sits at {@link position}. */
  readonly deck: readonly T[];
  readonly position: number;
  readonly current: T | null;
  /** The current item plus the two behind it — exactly what the card stack renders. */
  readonly upNext: readonly T[];
  readonly remaining: number;
  /** Items queued for deletion, awaiting review. */
  readonly pendingDelete: readonly T[];
  readonly keptThisSession: number;
  readonly canUndo: boolean;
  readonly isTrashing: boolean;
  readonly error: string | null;
}

export interface SwipeSession<T extends SwipeItem> {
  getState(): SessionSnapshot<T>;
  subscribe(listener: () => void): () => void;

  /** Requests access, loads the deck, restores the delete queue. */
  start(): Promise<void>;
  /** Records a decision on the current item and advances. */
  decide(decision: Decision): Promise<void>;
  /** Takes back the most recent decision. */
  undo(): Promise<void>;
  /** Takes an item back out of the delete queue (it stays reviewed, as a keep). */
  rescue(id: string): Promise<void>;
  /** Deletes everything in the queue through the source. */
  trashPending(): Promise<void>;
  /** Clears reviewed items so kept ones come back; the delete queue is left alone. */
  resetProgress(): Promise<void>;
  dismissError(): void;
}

class NotImplementedError extends Error {
  constructor(method: string) {
    super(`SwipeSession.${method} is not implemented yet.`);
  }
}

export function createSwipeSession<T extends SwipeItem>(deps: {
  source: SwipeSource<T>;
  progressStore: ProgressStore;
}): SwipeSession<T> {
  const { source, progressStore } = deps;

  interface HistoryEntry {
    item: T;
    decision: Decision;
  }

  const state = {
    phase: 'idle' as SessionPhase,
    deck: [] as T[],
    position: 0,
    pendingDelete: [] as T[],
    keptThisSession: 0,
    history: [] as HistoryEntry[],
    isTrashing: false,
    error: null as string | null,
  };

  /** Reviewed ids for this medium; the persistent delete queue is a subset. */
  const reviewed = new Set<string>();

  const listeners = new Set<() => void>();

  function buildSnapshot(): SessionSnapshot<T> {
    return {
      phase: state.phase,
      deck: state.deck,
      position: state.position,
      current: state.position < state.deck.length ? state.deck[state.position] : null,
      upNext: state.deck.slice(state.position, state.position + 3),
      remaining: state.deck.length - state.position,
      pendingDelete: state.pendingDelete,
      keptThisSession: state.keptThisSession,
      canUndo: state.history.length > 0,
      isTrashing: state.isTrashing,
      error: state.error,
    };
  }

  let snapshot = buildSnapshot();

  function notify() {
    snapshot = buildSnapshot();
    for (const listener of listeners) listener();
  }

  /** Persists are serialized; a failed save never breaks the session itself. */
  let persistTail: Promise<void> = Promise.resolve();
  function persist(): Promise<void> {
    const medium = source.medium;
    const progress: Progress = {
      reviewed: [...reviewed],
      pendingDelete: state.pendingDelete.map((i) => i.id),
    };
    persistTail = persistTail.then(
      () => progressStore.save(medium, progress),
      () => progressStore.save(medium, progress),
    );
    return persistTail;
  }

  function shuffle(items: T[]): T[] {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  async function start(): Promise<void> {
    state.phase = 'loading';
    state.error = null;
    notify();

    const granted = await source.requestAccess();
    if (!granted) {
      state.phase = 'denied';
      notify();
      return;
    }

    try {
      const progress = await progressStore.load(source.medium);
      const all = await source.listAll();
      reviewed.clear();
      for (const id of progress.reviewed) reviewed.add(id);

      // Queue ids that no longer exist in the source are dropped on restore.
      const byId = new Map(all.map((i) => [i.id, i]));
      state.pendingDelete = progress.pendingDelete
        .map((id) => byId.get(id))
        .filter((i): i is T => i !== undefined);

      state.deck = shuffle(all.filter((i) => !reviewed.has(i.id)));
      state.position = 0;
      state.history = [];
      state.keptThisSession = 0;
      state.phase = 'ready';
      notify();

      if (state.pendingDelete.length !== progress.pendingDelete.length) {
        await persist();
      }
    } catch (cause) {
      state.phase = 'error';
      state.error = cause instanceof Error ? cause.message : String(cause);
      notify();
    }
  }

  /** Decides the current item. All effects — advance, stats, queue, persistence — are one unit. */
  async function decide(decision: Decision): Promise<void> {
    const current = state.position < state.deck.length ? state.deck[state.position] : null;
    if (!current) return;

    reviewed.add(current.id);
    if (decision === 'delete') {
      state.pendingDelete = [...state.pendingDelete, current];
    } else {
      state.keptThisSession += 1;
    }
    state.history = [...state.history, { item: current, decision }];
    state.position += 1;
    notify();
    await persist();
  }

  async function undo(): Promise<void> {
    const last = state.history.at(-1);
    if (!last) return;

    state.history = state.history.slice(0, -1);
    state.position -= 1;
    reviewed.delete(last.item.id);
    if (last.decision === 'delete') {
      state.pendingDelete = state.pendingDelete.filter((i) => i.id !== last.item.id);
    } else {
      state.keptThisSession = Math.max(0, state.keptThisSession - 1);
    }
    notify();
    await persist();
  }

  async function rescue(id: string): Promise<void> {
    if (!state.pendingDelete.some((i) => i.id === id)) return;

    // The item stays reviewed — a rescue counts as a keep.
    state.pendingDelete = state.pendingDelete.filter((i) => i.id !== id);
    notify();
    await persist();
  }

  async function trashPending(): Promise<void> {
    const queued = [...state.pendingDelete];
    if (queued.length === 0) return;

    state.isTrashing = true;
    notify();
    try {
      await source.deleteItems(queued);
    } catch (cause) {
      if (!(cause instanceof SwipeCancelledError)) {
        state.error = cause instanceof Error ? cause.message : String(cause);
      }
      return; // queue intact; the user can try again
    } finally {
      state.isTrashing = false;
      notify();
    }

    state.pendingDelete = [];
    state.history = []; // undoing into deleted items makes no sense
    notify();
    await persist();
  }

  async function resetProgress(): Promise<void> {
    // Kept items come back; the delete queue stays reviewed so it stays hidden.
    reviewed.clear();
    for (const i of state.pendingDelete) reviewed.add(i.id);
    state.keptThisSession = 0;
    await persist();

    state.phase = 'loading';
    state.error = null;
    notify();
    try {
      const all = await source.listAll();
      state.deck = shuffle(all.filter((i) => !reviewed.has(i.id)));
      state.position = 0;
      state.history = [];
      state.phase = 'ready';
    } catch (cause) {
      state.phase = 'error';
      state.error = cause instanceof Error ? cause.message : String(cause);
    }
    notify();
  }

  function dismissError(): void {
    if (state.error === null) return;
    state.error = null;
    notify();
  }

  return {
    getState: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start,
    decide,
    undo,
    rescue,
    trashPending,
    resetProgress,
    dismissError,
  };
}
