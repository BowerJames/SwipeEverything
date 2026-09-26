import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import Slider from '@react-native-community/slider';
import type { Decision } from '../domain/swipe-item';
import type { SessionSnapshot, SwipeSession } from '../domain/swipe-session';
import type { CardStackHandle } from '../ui/card-stack';
import { CardStack } from '../ui/card-stack';
import { CircleButton, StatBar } from '../ui/controls';
import type { PhotoCardHandle } from '../media/photo/photo-card';
import { PhotoCard } from '../media/photo/photo-card';
import type { PhotoItem } from '../media/photo/photo-source';

export interface ScreenProps {
  session: SwipeSession<PhotoItem>;
  state: SessionSnapshot<PhotoItem>;
}

const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
};

/** The main triage loop: card stack, action bar, stats. */
export function SwipeScreen({ session, state }: ScreenProps) {
  const stackRef = useRef<CardStackHandle>(null);
  const cardRef = useRef<PhotoCardHandle>(null);
  const [zoomed, setZoomed] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [video, setVideo] = useState({ playing: false, time: 0 });

  const current = state.current;
  const isVideo = current?.isVideo ?? false;

  // Presentation state resets when the top card changes.
  useEffect(() => {
    setZoomed(false);
    setRotation(0);
    setVideo({ playing: false, time: 0 });
  }, [current?.id]);

  const decide = useCallback(
    (decision: Decision) => {
      void session.decide(decision);
    },
    [session],
  );

  const rotateLeft = useCallback(() => {
    cardRef.current?.resetZoom();
    setRotation((r) => r - 1);
  }, []);

  return (
    <View style={styles.screen}>
      <View style={styles.stackArea}>
        <CardStack
          ref={stackRef}
          items={state.upNext}
          onDecide={decide}
          swipeEnabled={!zoomed}
          renderCard={(item, isTop) => (
            <PhotoCard
              ref={isTop ? cardRef : undefined}
              item={item}
              active={isTop}
              rotation={isTop ? rotation : 0}
              onZoomChange={isTop ? setZoomed : undefined}
              onVideoStateChange={isTop ? setVideo : undefined}
            />
          )}
        />
      </View>

      <StatBar
        remaining={state.remaining}
        kept={state.keptThisSession}
        markedForDeletion={state.pendingDelete.length}
      />

      <View style={styles.buttonRow}>
        <CircleButton
          glyph="✕"
          color="#ff3b30"
          size={64}
          accessibilityLabel="Mark for deletion"
          onPress={() => stackRef.current?.flyOut('delete')}
        />
        <CircleButton
          glyph="↩"
          color="#ff9500"
          size={44}
          accessibilityLabel="Undo last swipe"
          disabled={!state.canUndo}
          onPress={() => void session.undo()}
        />
        {isVideo ? (
          <CircleButton
            glyph={video.playing ? '⏸' : '▶'}
            color="#007aff"
            size={44}
            accessibilityLabel="Play or pause"
            onPress={() => cardRef.current?.togglePlay()}
          />
        ) : (
          <>
            <CircleButton
              glyph="⟲"
              color="#af52de"
              size={44}
              accessibilityLabel="Rotate left"
              onPress={rotateLeft}
            />
            <CircleButton
              glyph={zoomed ? '⊖' : '🔍'}
              color="#007aff"
              size={44}
              accessibilityLabel="Zoom in or out"
              onPress={() => cardRef.current?.toggleZoom()}
            />
          </>
        )}
        <CircleButton
          glyph="♥"
          color="#34c759"
          size={64}
          accessibilityLabel="Keep"
          onPress={() => stackRef.current?.flyOut('keep')}
        />
      </View>

      {isVideo && current && (
        <View style={styles.scrubRow}>
          <Text style={styles.scrubTime}>{formatTime(video.time)}</Text>
          <Slider
            style={styles.slider}
            minimumValue={0}
            maximumValue={Math.max(current.duration, 0.1)}
            value={Math.min(video.time, current.duration)}
            minimumTrackTintColor="#fff"
            maximumTrackTintColor="rgba(255,255,255,0.3)"
            onValueChange={(seconds) => cardRef.current?.seek(seconds)}
            disabled={!video.playing}
          />
          <Text style={styles.scrubTime}>{formatTime(current.duration)}</Text>
        </View>
      )}
    </View>
  );
}

/** Everything has been swiped through. */
export function DoneScreen({ session, state }: ScreenProps) {
  return (
    <View style={styles.center}>
      <Text style={styles.doneGlyph}>✅</Text>
      <Text style={styles.doneTitle}>You've been through everything</Text>
      {state.pendingDelete.length > 0 && (
        <Text style={styles.doneHint}>
          {state.pendingDelete.length} item{state.pendingDelete.length === 1 ? '' : 's'} still
          waiting to be deleted.
        </Text>
      )}
      <Pressable style={styles.secondaryButton} onPress={() => void session.resetProgress()}>
        <Text style={styles.secondaryButtonText}>Start over with kept items</Text>
      </Pressable>
    </View>
  );
}

/** Photo library access was refused. */
export function DeniedScreen({ session }: ScreenProps) {
  return (
    <View style={styles.center}>
      <Text style={styles.doneGlyph}>🖼️</Text>
      <Text style={styles.doneTitle}>SwipeEverything needs access to your photos</Text>
      <Text style={styles.doneHint}>
        Turn on access in Settings › Apps › SwipeEverything › Permissions, then try again.
      </Text>
      <Pressable style={styles.secondaryButton} onPress={() => void session.start()}>
        <Text style={styles.secondaryButtonText}>Try again</Text>
      </Pressable>
      <Pressable
        style={styles.secondaryButton}
        onPress={() => Linking.openSettings()}
      >
        <Text style={styles.secondaryButtonText}>Open settings</Text>
      </Pressable>
    </View>
  );
}

export function ErrorScreen({ session, state }: ScreenProps) {
  return (
    <View style={styles.center}>
      <Text style={styles.doneGlyph}>⚠️</Text>
      <Text style={styles.doneTitle}>Something went wrong</Text>
      <Text style={styles.doneHint}>{state.error}</Text>
      <Pressable style={styles.secondaryButton} onPress={() => void session.start()}>
        <Text style={styles.secondaryButtonText}>Try again</Text>
      </Pressable>
    </View>
  );
}

export function LoadingView() {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" />
      <Text style={styles.doneHint}>Loading your library…</Text>
    </View>
  );
}

/** The review-before-delete grid: tap any item to keep it instead. */
export function ReviewModal({
  session,
  state,
  visible,
  onClose,
}: ScreenProps & { visible: boolean; onClose: () => void }) {
  // When the queue empties — everything deleted or rescued — close the sheet.
  useEffect(() => {
    if (visible && state.pendingDelete.length === 0 && !state.isTrashing) onClose();
  }, [visible, state.pendingDelete.length, state.isTrashing, onClose]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.reviewRoot}>
        <Text style={styles.reviewTitle}>{state.pendingDelete.length} marked for deletion</Text>
        <Text style={styles.doneHint}>
          Tap any item to keep it instead. Deleted items can be recovered from your gallery's
          trash.
        </Text>
        <FlatList
          style={styles.grid}
          data={state.pendingDelete}
          numColumns={3}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <Pressable
              style={styles.cell}
              accessibilityLabel="Keep this item"
              onPress={() => void session.rescue(item.id)}
            >
              <Image
                source={{ uri: item.uri }}
                style={styles.cellImage}
                contentFit="cover"
                recyclingKey={item.id}
                transition={100}
              />
            </Pressable>
          )}
        />
        <View style={styles.reviewFooter}>
          <Pressable style={styles.secondaryButton} onPress={onClose}>
            <Text style={styles.secondaryButtonText}>Done</Text>
          </Pressable>
          <Pressable
            style={[
              styles.deleteButton,
              (state.pendingDelete.length === 0 || state.isTrashing) && styles.disabled,
            ]}
            disabled={state.pendingDelete.length === 0 || state.isTrashing}
            onPress={() => void session.trashPending()}
          >
            <Text style={styles.deleteButtonText}>
              {state.isTrashing ? 'Deleting…' : `Delete ${state.pendingDelete.length} items`}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

/** Small alert surfacing for session errors while swiping. */
export function useErrorAlert(state: SessionSnapshot<PhotoItem>, session: SwipeSession<PhotoItem>) {
  const lastError = useRef<string | null>(null);
  useEffect(() => {
    if (state.error && state.error !== lastError.current) {
      lastError.current = state.error;
      Alert.alert('Something went wrong', state.error, [
        { text: 'OK', onPress: () => session.dismissError() },
      ]);
    } else if (!state.error) {
      lastError.current = null;
    }
  }, [state.error, session]);
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    padding: 12,
    gap: 14,
  },
  stackArea: {
    flex: 1,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 24,
    paddingBottom: 4,
  },
  scrubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  scrubTime: {
    color: '#666',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  slider: {
    flex: 1,
    height: 32,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 32,
  },
  doneGlyph: {
    fontSize: 56,
  },
  doneTitle: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  doneHint: {
    color: '#666',
    textAlign: 'center',
  },
  secondaryButton: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#c8c8cc',
  },
  secondaryButtonText: {
    color: '#007aff',
    fontSize: 16,
  },
  reviewRoot: {
    flex: 1,
    padding: 16,
    gap: 12,
    paddingTop: 48,
  },
  reviewTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  grid: {
    flex: 1,
  },
  cell: {
    flex: 1 / 3,
    aspectRatio: 1,
    padding: 2,
  },
  cellImage: {
    flex: 1,
    borderRadius: 8,
    backgroundColor: '#eee',
  },
  reviewFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 16,
  },
  deleteButton: {
    backgroundColor: '#ff3b30',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
  },
  deleteButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.4,
  },
});
