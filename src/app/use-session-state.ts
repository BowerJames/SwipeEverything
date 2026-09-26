import { useSyncExternalStore } from 'react';
import type { SessionSnapshot, SwipeSession } from '../domain/swipe-session';
import type { SwipeItem } from '../domain/swipe-item';

/**
 * Binds a session to React: the component re-renders whenever the session's
 * snapshot changes. The session is the single source of truth; screens hold
 * only presentation state (zoom, rotation, modal visibility).
 */
export function useSessionState<T extends SwipeItem>(session: SwipeSession<T>): SessionSnapshot<T> {
  return useSyncExternalStore(session.subscribe, session.getState, session.getState);
}
