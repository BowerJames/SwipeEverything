import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { createSwipeSession } from '../domain/swipe-session';
import { createPhotoSource } from '../media/photo/photo-source';
import { AsyncStorageProgressStore } from '../platform/async-storage-progress-store';
import type { PhotoItem } from '../media/photo/photo-source';
import { useSessionState } from './use-session-state';
import {
  DeniedScreen,
  DoneScreen,
  ErrorScreen,
  LoadingView,
  ReviewModal,
  SwipeScreen,
  useErrorAlert,
} from './screens';

/**
 * App wiring: the photo medium meets the medium-agnostic session here, and
 * nothing else. A second medium later means one more source adapter and one
 * more branch choosing what to render.
 */
export default function App() {
  const [session] = useState(() =>
    createSwipeSession<PhotoItem>({
      source: createPhotoSource(),
      progressStore: new AsyncStorageProgressStore(),
    }),
  );
  const state = useSessionState(session);
  const [reviewOpen, setReviewOpen] = useState(false);

  useEffect(() => {
    void session.start();
  }, [session]);

  useErrorAlert(state, session);

  return (
    <GestureHandlerRootView style={styles.root}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <Text style={styles.title}>SwipeEverything</Text>
        <Pressable
          accessibilityLabel="Review items marked for deletion"
          disabled={state.pendingDelete.length === 0}
          onPress={() => setReviewOpen(true)}
          style={[
            styles.trashButton,
            state.pendingDelete.length === 0 && styles.trashDisabled,
          ]}
        >
          <Text style={styles.trashText}>
            🗑 {state.pendingDelete.length}
          </Text>
        </Pressable>
      </View>

      <View style={styles.body}>
        {state.phase === 'ready' &&
          (state.current ? (
            <SwipeScreen session={session} state={state} />
          ) : (
            <DoneScreen session={session} state={state} />
          ))}
        {state.phase === 'denied' && <DeniedScreen session={session} state={state} />}
        {state.phase === 'error' && <ErrorScreen session={session} state={state} />}
        {(state.phase === 'idle' || state.phase === 'loading') && <LoadingView />}
      </View>

      <ReviewModal
        session={session}
        state={state}
        visible={reviewOpen}
        onClose={() => setReviewOpen(false)}
      />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#f7f7f9',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 8,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
  },
  trashButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: '#ffe5e2',
  },
  trashDisabled: {
    opacity: 0.35,
  },
  trashText: {
    color: '#c0392b',
    fontWeight: '600',
  },
  body: {
    flex: 1,
  },
});
