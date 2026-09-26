import type { MediumId, SwipeItem } from '../domain/swipe-item';
import type { Progress, ProgressStore } from '../domain/progress-store';
import { SwipeCancelledError } from '../domain/swipe-source';
import type { SwipeSource } from '../domain/swipe-source';

/** A minimal item for tests: just the medium-agnostic core. */
export interface TestItem extends SwipeItem {
  readonly id: string;
  readonly medium: MediumId;
}

export function item(id: string, medium: MediumId = 'photo'): TestItem {
  return { id, medium };
}

/** In-memory {@link SwipeSource} with knobs for steering every failure mode. */
export class FakeSwipeSource implements SwipeSource<TestItem> {
  readonly medium: MediumId = 'photo';

  items: TestItem[] = [];
  accessGranted = true;
  listAllError: Error | null = null;
  deleteError: Error | null = null;
  cancelNextDelete = false;

  listCalls = 0;
  deleteCalls: TestItem[][] = [];

  constructor(items: TestItem[] = []) {
    this.items = [...items];
  }

  async requestAccess(): Promise<boolean> {
    return this.accessGranted;
  }

  async listAll(): Promise<TestItem[]> {
    this.listCalls++;
    if (this.listAllError) throw this.listAllError;
    return [...this.items];
  }

  async deleteItems(items: TestItem[]): Promise<void> {
    this.deleteCalls.push([...items]);
    if (this.cancelNextDelete) {
      this.cancelNextDelete = false;
      throw new SwipeCancelledError();
    }
    if (this.deleteError) throw this.deleteError;
    const gone = new Set(items.map((i) => i.id));
    this.items = this.items.filter((i) => !gone.has(i.id));
  }
}

/** In-memory {@link ProgressStore} that records every save. */
export class FakeProgressStore implements ProgressStore {
  private data = new Map<MediumId, Progress>();

  loadCalls: MediumId[] = [];
  saveCalls: Array<{ medium: MediumId; progress: Progress }> = [];

  constructor(initial?: { medium?: MediumId; progress: Progress }) {
    if (initial) this.data.set(initial.medium ?? 'photo', initial.progress);
  }

  async load(medium: MediumId): Promise<Progress> {
    this.loadCalls.push(medium);
    return (
      this.data.get(medium) ?? { reviewed: [], pendingDelete: [] }
    );
  }

  async save(medium: MediumId, progress: Progress): Promise<void> {
    this.saveCalls.push({ medium, progress });
    this.data.set(medium, progress);
  }
}
