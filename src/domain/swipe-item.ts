/**
 * The medium-agnostic vocabulary every swipeable entity shares.
 *
 * A medium (photos now; contacts and calendar events later) provides items
 * through a {@link SwipeSource} and renders them with a medium-specific card.
 * The session never learns anything beyond what is on this type.
 */

/** Identifies which medium an item came from. New media add members here. */
export type MediumId = 'photo';

/** The decision a swipe expresses. */
export type Decision = 'keep' | 'delete';

/**
 * Everything the swipe core needs to know about a swipable thing.
 * Medium adapters extend this with their own metadata; the extra fields are
 * invisible to the session and read only by the medium's card renderer.
 */
export interface SwipeItem {
  readonly id: string;
  readonly medium: MediumId;
}
