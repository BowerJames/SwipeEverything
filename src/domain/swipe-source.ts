import type { MediumId, SwipeItem } from './swipe-item';

/**
 * Thrown by {@link SwipeSource.deleteItems} when the user dismissed the
 * system's delete confirmation without deleting anything. Part of the seam's
 * interface: adapters must map platform-specific cancellations onto it so the
 * session can tell "changed its mind" apart from "failed".
 */
export class SwipeCancelledError extends Error {
  constructor() {
    super('The delete was cancelled before anything was removed.');
    this.name = 'SwipeCancelledError';
  }
}

/**
 * Where swipable items come from, and how they leave. One adapter per medium
 * per platform: the device's photo library, an in-memory fake for tests, and
 * later contacts/calendar stores.
 *
 * The adapter stays dumb: no shuffling, no filtering, no progress bookkeeping.
 * All of that lives in the session, which keeps this interface small.
 */
export interface SwipeSource<T extends SwipeItem> {
  readonly medium: MediumId;

  /** Asks the platform for access. Resolves false when the user says no. */
  requestAccess(): Promise<boolean>;

  /** Lists every item in the medium, in whatever order the platform returns. */
  listAll(): Promise<T[]>;

  /**
   * Removes the given items, recoverably where the platform allows it
   * (trash / recently deleted). Resolves only once the items are actually
   * gone; rejects with {@link SwipeCancelledError} when the user backed out.
   */
  deleteItems(items: T[]): Promise<void>;
}
