import { describe, expect, it } from 'vitest';
import { createSwipeSession } from './swipe-session';
import { FakeProgressStore, FakeSwipeSource, item, type TestItem } from '../testing/fakes';
import { SwipeCancelledError } from './swipe-source';

async function setup(items: TestItem[] = [item('a'), item('b'), item('c'), item('d')]) {
  const source = new FakeSwipeSource(items);
  const store = new FakeProgressStore();
  const session = createSwipeSession({ source, progressStore: store });
  await session.start();
  return { source, store, session };
}

const ids = (items: readonly { id: string }[]) => items.map((i) => i.id);

describe('trashPending', () => {
  it('deletes the queued items through the source and clears the queue', async () => {
    const { source, store, session } = await setup();
    await session.decide('delete');
    await session.decide('delete');
    const queued = ids(session.getState().pendingDelete);

    await session.trashPending();

    const state = session.getState();
    expect(state.pendingDelete).toEqual([]);
    expect(source.deleteCalls).toHaveLength(1);
    expect(ids(source.deleteCalls[0]).sort()).toEqual([...queued].sort());
    expect(ids(source.items).sort()).toEqual(['a', 'b', 'c', 'd'].filter((i) => !queued.includes(i)).sort());

    const saved = store.saveCalls.at(-1)!.progress;
    expect(saved.pendingDelete).toEqual([]);
  });

  it('clears the undo history — you cannot undo into deleted items', async () => {
    const { session } = await setup();
    await session.decide('keep');
    await session.decide('delete');

    await session.trashPending();

    expect(session.getState().canUndo).toBe(false);
  });

  it('keeps the queue and reports an error when deletion fails', async () => {
    const { source, session } = await setup();
    source.deleteError = new Error('disk on fire');
    await session.decide('delete');

    await session.trashPending();

    const state = session.getState();
    expect(ids(state.pendingDelete)).toHaveLength(1);
    expect(state.error).toContain('disk on fire');
    expect(state.isTrashing).toBe(false);
  });

  it('treats a user cancellation as silence: queue kept, no error', async () => {
    const { source, session } = await setup();
    source.cancelNextDelete = true;
    await session.decide('delete');

    await session.trashPending();

    const state = session.getState();
    expect(ids(state.pendingDelete)).toHaveLength(1);
    expect(state.error).toBeNull();
    expect(new SwipeCancelledError().name).toBe('SwipeCancelledError'); // pins the sentinel the adapter must throw
  });

  it('does not call the source with an empty queue', async () => {
    const { source, session } = await setup();

    await session.trashPending();

    expect(source.deleteCalls).toEqual([]);
  });
});

describe('resetProgress', () => {
  it('brings kept items back but keeps queued ones out of the deck', async () => {
    const { session } = await setup();
    const [d0, d1] = session.getState().deck;
    await session.decide('keep'); // d0
    await session.decide('delete'); // d1

    await session.resetProgress();

    const state = session.getState();
    expect(state.phase).toBe('ready');
    expect(ids(state.deck).sort()).toEqual(['a', 'b', 'c', 'd'].filter((id) => id !== d1.id).sort());
    expect(state.keptThisSession).toBe(0);
    // the queue survives a reset untouched
    expect(ids(state.pendingDelete)).toEqual([d1.id]);
  });

  it('brings rescued items back with the rest of the kept ones', async () => {
    const { session } = await setup();
    const [d0] = session.getState().deck;
    await session.decide('delete');
    await session.rescue(d0.id);

    await session.resetProgress();

    const state = session.getState();
    expect(ids(state.deck)).toContain(d0.id); // a rescue counts as a keep
    expect(state.pendingDelete).toEqual([]);
  });
});

describe('errors', () => {
  it('dismissError clears the error message without touching the phase', async () => {
    const { source, session } = await setup();
    source.deleteError = new Error('nope');
    await session.decide('delete');
    await session.trashPending();
    expect(session.getState().error).toContain('nope');

    session.dismissError();

    const state = session.getState();
    expect(state.error).toBeNull();
    expect(state.phase).toBe('ready');
  });
});
