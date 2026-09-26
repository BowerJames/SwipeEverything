import {
  AssetField,
  MediaType,
  Query,
  requestPermissionsAsync,
  Asset,
} from 'expo-media-library';
import type { MediumId, SwipeItem } from '../../domain/swipe-item';
import { SwipeCancelledError } from '../../domain/swipe-source';
import type { SwipeSource } from '../../domain/swipe-source';

/** Everything the photo card needs to render one library item. */
export interface PhotoItem extends SwipeItem {
  readonly id: string;
  readonly medium: MediumId;
  /** Local content URI — expo-image downsamples it; expo-video plays it. */
  readonly uri: string;
  readonly creationTime: number | null;
  readonly isVideo: boolean;
  /** Playback duration in seconds; 0 for stills. */
  readonly duration: number;
}

/** True when the user dismissed the system delete dialog without deleting. */
function isUserCancellation(cause: unknown): boolean {
  const message = cause instanceof Error ? cause.message : String(cause);
  return /cancel|dismiss/i.test(message);
}

/**
 * The photo medium: the device's gallery (Android's MediaStore via
 * expo-media-library). Deleting goes through the system's recoverable
 * request where the OS provides one.
 *
 * On Android an asset's id is its `content://` URI, so the lightweight
 * metadata query is enough for both display and playback; full `Asset`
 * objects are constructed only when items are actually deleted.
 */
export function createPhotoSource(): SwipeSource<PhotoItem> {
  return {
    medium: 'photo',

    async requestAccess() {
      const { granted } = await requestPermissionsAsync();
      return granted;
    },

    async listAll() {
      const metas = await new Query()
        .within(AssetField.MEDIA_TYPE, [MediaType.IMAGE, MediaType.VIDEO])
        .exeForMetadata();
      return metas.map((meta) => ({
        id: meta.id,
        medium: 'photo' as const,
        uri: meta.id,
        creationTime: meta.creationTime,
        isVideo: meta.mediaType === MediaType.VIDEO,
        // The media store reports durations in milliseconds.
        duration: meta.duration !== null ? meta.duration / 1000 : 0,
      }));
    },

    async deleteItems(items) {
      try {
        await Asset.delete(items.map((item) => new Asset(item.id)));
      } catch (cause) {
        if (isUserCancellation(cause)) throw new SwipeCancelledError();
        throw cause;
      }
    },
  };
}
