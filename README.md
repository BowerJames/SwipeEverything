# SwipeEverything

A Tinder-style photo triage app for Android, built with React Native +
TypeScript. See your photos and videos one at a time in random order: swipe
right to keep one, swipe left to mark it for deletion. Review the marked
batch before anything is actually deleted — and deletions go to the system
trash, where they can be recovered.

A TypeScript replication of the ideas in
[PhotoSwipe](https://github.com/H-essified/PhotoSwipe) (macOS/Swift), with
its own architecture.

## Features

- **Random order** — your whole gallery, photos and videos, shuffled.
- **Swipe or tap** — drag a card past the threshold (or fling it), or use
  the ✕ / ♥ buttons.
- **Undo** — take back the last swipe; even a whole chain of them.
- **Videos** — tap the card to play or pause; scrub from the bar under the
  card. Only the top card plays.
- **Zoom** — pinch, double-tap, or the 🔍 button. While zoomed, dragging
  pans the photo instead of swiping the card, clamped to its edges.
- **Rotate** — quarter-turn a sideways photo; the view rotation resets with
  the next card.
- **Review before deleting** — nothing is deleted while you swipe. Marked
  items queue up; open the 🗑 grid to rescue any you regret, then delete the
  rest in one batch through the system's recoverable-delete dialog.
- **Remembers your progress** — swiped items don't come back on restart.
  "Start over with kept items" brings them back; the delete queue survives.
- **Multi-medium by design** — the swipe core is medium-agnostic. Photos are
  the first medium; contacts and calendar events are planned (see
  [Architecture](#architecture)).

## Run it

```bash
npm install
npm start          # then scan the QR code with Expo Go on your Android device
```

Or `npm run android` with a device/emulator connected. The first launch asks
for photo-library access.

## Test and typecheck

```bash
npm test           # vitest — domain unit tests, in-memory fakes at every seam
npm run typecheck  # tsc --noEmit
```

## Architecture

The design goal is **deep modules** with behaviour behind small interfaces,
placed at seams that have at least two adapters (one is always an in-memory
fake, so every seam is real from day one).

```
src/
  domain/                    medium-agnostic core (pure TypeScript, no React Native)
    swipe-item.ts            SwipeItem, Decision, MediumId
    swipe-source.ts          the source seam: requestAccess / listAll / deleteItems
    progress-store.ts        the persistence seam, keyed by medium
    swipe-session.ts         THE deep module: deck, shuffle, filter, decide,
                             undo, rescue, batch delete, stats, persistence
    *.test.ts                unit tests crossing the session interface
  media/photo/               the photo medium
    photo-source.ts          SwipeSource adapter over expo-media-library
    photo-card.tsx           the card renderer: zoom, pan, rotate, video
  platform/                  device adapters
    async-storage-progress-store.ts
  ui/                        medium-agnostic presentation
    card-stack.tsx           drag physics, stamps, stack depth, fly-out
    controls.tsx             circle buttons, stat bar
  app/                       wiring
    App.tsx                  photo medium meets session; phase → screen
    screens.tsx              swipe screen, review grid, done/denied/error
  testing/fakes.ts           in-memory SwipeSource + ProgressStore (harness)
```

### Adding a medium (contacts, calendar events, …)

1. Add the id to `MediumId`.
2. Write an adapter satisfying `SwipeSource<Item>` for the platform store
   (plus an in-memory fake in tests).
3. Write a card renderer for the item type.
4. Wire one more branch in `App.tsx`.

The session, the card stack, the review grid, persistence, and the test
harness are reused untouched — that is the point of the seam.

### Testing philosophy

Unit tests cross the **interface** of the session with in-memory fakes at
every seam (no React Native imports in `src/domain`). Tests assert
postconditions, invariants, and error modes — never the shuffle's order or
any other implementation detail. Behaviours stay flexible until a consumer
depends on them.

## Known limitations

- **Rotation is view-only** — PhotoSwipe saves a kept rotation back into the
  Apple Photos library as an editable change; managed Expo cannot write back
  to MediaStore, so rotation applies only while swiping.
- **Android only for now.** The domain and UI are platform-agnostic; Windows
  support would arrive as a new `SwipeSource` adapter under `platform/`
  (react-native-windows, bare workflow) without touching the core.

## License

TBD — the original PhotoSwipe is PolyForm Noncommercial; this repository is
an independent reimplementation and sets its own terms.
