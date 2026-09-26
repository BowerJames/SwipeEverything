import type { MediumId } from './swipe-item';

/** What survives an app restart, per medium. */
export interface Progress {
  /** Item ids the user has already been through. */
  readonly reviewed: readonly string[];
  /** Item ids queued for deletion, not yet removed. */
  readonly pendingDelete: readonly string[];
}

export const EMPTY_PROGRESS: Progress = { reviewed: [], pendingDelete: [] };

/**
 * Reads and writes swipe progress. One adapter per platform (async storage on
 * the device, an in-memory fake for tests).
 *
 * The store is keyed by medium: each medium's progress is independent.
 */
export interface ProgressStore {
  load(medium: MediumId): Promise<Progress>;
  save(medium: MediumId, progress: Progress): Promise<void>;
}
