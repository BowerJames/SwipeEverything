import AsyncStorage from '@react-native-async-storage/async-storage';
import type { MediumId } from '../domain/swipe-item';
import type { Progress, ProgressStore } from '../domain/progress-store';

const keyFor = (medium: MediumId) => `swipe-everything.progress.${medium}`;

/**
 * Device-side {@link ProgressStore}: one JSON blob per medium in async
 * storage. Everything stays on the device.
 */
export class AsyncStorageProgressStore implements ProgressStore {
  async load(medium: MediumId): Promise<Progress> {
    const raw = await AsyncStorage.getItem(keyFor(medium));
    if (!raw) return { reviewed: [], pendingDelete: [] };
    try {
      const parsed = JSON.parse(raw) as Partial<Progress>;
      return {
        reviewed: Array.isArray(parsed.reviewed) ? parsed.reviewed : [],
        pendingDelete: Array.isArray(parsed.pendingDelete) ? parsed.pendingDelete : [],
      };
    } catch {
      return { reviewed: [], pendingDelete: [] };
    }
  }

  async save(medium: MediumId, progress: Progress): Promise<void> {
    await AsyncStorage.setItem(keyFor(medium), JSON.stringify(progress));
  }
}
