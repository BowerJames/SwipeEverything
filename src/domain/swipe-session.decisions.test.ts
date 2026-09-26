import { describe, expect, it } from 'vitest';
import { createSwipeSession } from './swipe-session';
import { FakeProgressStore, FakeSwipeSource, item, type TestItem } from '../testing/fakes';

async function setup(items: TestItem[] = [item('a'), item('b'), item('c')]) {
  const source = new FakeSwipeSource(items);
  const store = new FakeProgressStore();
  const session = createSwipeSession({ source, progressStore: store });
  await session.start();
  return { source, store, session };
}

const ids = (items: readonly { id: string }[]) => items.map((i) => i.id);

describe('decisions', () => {
  it('advances the deck, counts the keep, and marks the item reviewed', async () => {
    const { store, session } = await setup();
    const firstId = session.getState().current!.id;

    await session.decide('keep');

    const state = session.getState();
    expect(state.current!.id).not.toBe(firstId);
    expect(state.remaining).toBe(2);
    expect(state.keptThisSession).toBe(1);
    expect(state.canUndo).toBe(true);

    const saved = store.saveCalls.at(-1)!.progress;
    expect(saved.reviewed).toContain(firstId);
    expect(saved.pendingDelete).toEqual([]);
  });

  it('queues a deleted item instead of counting it', async () => {
    const { store, session } = await setup();
    const firstId = session.getState().current!.id;

    await session.decide('delete');

    const state = session.getState();
    expect(ids(state.pendingDelete)).toEqual([firstId]);
    expect(state.keptThisSession).toBe(0);
    expect(state.remaining).toBe(2);

    const saved = store.saveCalls.at(-1)!.progress;
    expect(saved.pendingDelete).toEqual([firstId]);
    expect(saved.reviewed).toContain(firstId);
  });

  it('is a no-op when the deck is exhausted', async () => {
    const { session } = await setup([item('a')]);
    await session.decide('delete');
    expect(session.getState().current).toBeNull();

    await session.decide('keep'); // must not throw or change anything

    const state = session.getState();
    expect(state.keptThisSession).toBe(0);
    expect(ids(state.pendingDelete)).toHaveLength(1);
  });
});

describe('undo', () => {
  it('restores a kept item: position, stats, and reviewed set', async () => {
    const { store, session } = await setup();
    const first = session.getState().current!;
    await session.decide('keep');

    await session.undo();

    const state = session.getState();
    expect(state.current).toBe(first);
    expect(state.keptThisSession).toBe(0);
    expect(state.canUndo).toBe(false);

    const saved = store.saveCalls.at(-1)!.progress;
    expect(saved.reviewed).not.toContain(first.id);
  });

  it('unqueues a deleted item', async () => {
    const { store, session } = await setup();
    const first = session.getState().current!;
    await session.decide('delete');

    await session.undo();

    const state = session.getState();
    expect(ids(state.pendingDelete)).toEqual([]);
    expect(state.current).toBe(first);

    const saved = store.saveCalls.at(-1)!.progress;
    expect(saved.pendingDelete).toEqual([]);
    expect(saved.reviewed).not.toContain(first.id);
  });

  it('undoes a whole chain of decisions in order', async () => {
    const { session } = await setup([item('a'), item('b'), item('c')]);
    const [d0, d1, d2] = session.getState().deck;
    await session.decide('keep');
    await session.decide('delete');
    await session.decide('keep');

    await session.undo();
    expect(session.getState().current!.id).toBe(d2.id);
    expect(session.getState().keptThisSession).toBe(1);
    expect(ids(session.getState().pendingDelete)).toEqual([d1.id]);

    await session.undo();
    expect(ids(session.getState().pendingDelete)).toEqual([]);
    expect(session.getState().keptThisSession).toBe(1);

    await session.undo();
    expect(session.getState().keptThisSession).toBe(0);
    expect(session.getState().canUndo).toBe(false);
  });

  it('is a no-op when history is empty', async () => {
    const { session } = await setup([item('a')]);

    await session.undo();

    expect(session.getState().canUndo).toBe(false);
  });
});

describe('rescue', () => {
  it('takes an item out of the delete queue but keeps it reviewed', async () => {
    const { store, session } = await setup();
    const [d0, d1, d2] = session.getState().deck;
    await session.decide('delete'); // d0
    await session.decide('keep'); // d1
    await session.decide('keep'); // d2 — deck exhausted

    await session.rescue(d0.id);

    const state = session.getState();
    expect(ids(state.pendingDelete)).toEqual([]);
    expect(state.current).toBeNull(); // rescuing does not put d0 back in the deck
    expect(ids(state.deck)).toEqual([d0.id, d1.id, d2.id]); // decisions advance; they never mutate the deck

    const saved = store.saveCalls.at(-1)!.progress;
    expect(saved.pendingDelete).toEqual([]);
    expect(saved.reviewed).toContain(d0.id);
  });

  it('is a no-op for an id that is not queued', async () => {
    const { session } = await setup();
    const firstId = session.getState().current!.id;
    await session.decide('delete');

    await session.rescue('not-queued');

    expect(ids(session.getState().pendingDelete)).toEqual([firstId]);
  });
});
