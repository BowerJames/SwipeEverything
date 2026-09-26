import { describe, expect, it } from 'vitest';
import { createSwipeSession } from './swipe-session';
import type { SessionSnapshot } from './swipe-session';
import { FakeProgressStore, FakeSwipeSource, item, type TestItem } from '../testing/fakes';

function setup(
  items: TestItem[] = [item('a'), item('b'), item('c'), item('d')],
  store = new FakeProgressStore(),
) {
  const source = new FakeSwipeSource(items);
  const session = createSwipeSession({ source, progressStore: store });
  return { source, store, session };
}

const ids = (items: readonly { id: string }[]) => items.map((i) => i.id);

describe('swipe session lifecycle', () => {
  it('starts idle with an empty deck', () => {
    const { session } = setup();

    const state = session.getState();

    expect(state.phase).toBe('idle');
    expect(state.deck).toEqual([]);
    expect(state.current).toBeNull();
    expect(state.remaining).toBe(0);
    expect(state.pendingDelete).toEqual([]);
  });

  it('requests access before anything else, and reports denial', async () => {
    const { source, session } = setup();
    source.accessGranted = false;

    await session.start();

    const state = session.getState();
    expect(state.phase).toBe('denied');
    expect(source.listCalls).toBe(0);
  });

  it('loads every unreviewed item into the deck', async () => {
    const { store, session } = setup([item('a'), item('b'), item('c')]);
    await store.save('photo', { reviewed: ['b'], pendingDelete: [] });

    await session.start();

    const state = session.getState();
    expect(state.phase).toBe('ready');
    expect(ids(state.deck).sort()).toEqual(['a', 'c']);
    expect(state.remaining).toBe(2);
    expect(state.current).not.toBeNull();
  });

  it('restores the pending-delete queue from the store', async () => {
    const { store, session } = setup([item('a'), item('b'), item('c')]);
    await store.save('photo', { reviewed: [], pendingDelete: ['a'] });

    await session.start();

    expect(ids(session.getState().pendingDelete)).toEqual(['a']);
  });

  it('shows the current item first in upNext, followed by at most two more', async () => {
    const { session } = setup([item('a'), item('b'), item('c'), item('d')]);

    await session.start();

    const state = session.getState();
    expect(state.upNext).toEqual(state.deck.slice(0, 3));
    expect(state.current).toBe(state.deck[0]);
  });

  it('is ready with no current item when everything is reviewed', async () => {
    const { store, session } = setup([item('a')]);
    await store.save('photo', { reviewed: ['a'], pendingDelete: [] });

    await session.start();

    const state = session.getState();
    expect(state.phase).toBe('ready');
    expect(state.current).toBeNull();
    expect(state.upNext).toEqual([]);
  });

  it('reports an error when the library cannot be listed', async () => {
    const { source, session } = setup();
    source.listAllError = new Error('boom');

    await session.start();

    const state = session.getState();
    expect(state.phase).toBe('error');
    expect(state.error).toContain('boom');
  });

  it('notifies subscribers whenever the state changes', async () => {
    const { session } = setup([item('a'), item('b')]);
    const states: SessionSnapshot<TestItem>[] = [];
    session.subscribe(() => states.push(session.getState()));

    await session.start();

    expect(states.length).toBeGreaterThan(0);
    expect(states.at(-1)!.phase).toBe('ready');
  });
});
