import React, {
  useEffect,
  useImperativeHandle,
  useRef,
  type ReactNode,
} from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import type { Decision, SwipeItem } from '../domain/swipe-item';

const SWIPE_THRESHOLD = 120;
const VELOCITY_THRESHOLD = 900;
const FLY_DISTANCE = 900;
const FLY_DURATION = 220;
const SPRING = { damping: 18, stiffness: 220 } as const;

export interface CardStackHandle {
  /** Animates the top card off-screen, then reports the decision. */
  flyOut(decision: Decision): void;
}

interface CardStackProps<T extends SwipeItem> {
  /** The current item first, followed by the cards behind it (at most 3). */
  items: readonly T[];
  renderCard: (item: T, isTop: boolean) => ReactNode;
  onDecide: (decision: Decision) => void;
  /** False while zoomed in: dragging must pan the photo, not swipe the card. */
  swipeEnabled: boolean;
  ref?: React.Ref<CardStackHandle>;
}

/**
 * The medium-agnostic swipe surface: drag physics, KEEP/DELETE stamps, card
 * stack depth, and fly-out for button decisions. It never learns what is on
 * the cards — `renderCard` draws them, `onDecide` reports the verdict.
 */
export function CardStack<T extends SwipeItem>({
  items,
  renderCard,
  onDecide,
  swipeEnabled,
  ref,
}: CardStackProps<T>) {
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const flying = useSharedValue(false);

  const onDecideRef = useRef(onDecide);
  onDecideRef.current = onDecide;

  const topId = items[0]?.id;

  // The next card mounts fresh; reset before it paints.
  useEffect(() => {
    tx.value = 0;
    ty.value = 0;
    flying.value = false;
  }, [topId, tx, ty, flying]);

  useImperativeHandle(
    ref,
    () => ({
      flyOut(decision: Decision) {
        if (flying.value) return;
        flying.value = true;
        const direction = decision === 'keep' ? 1 : -1;
        tx.value = withTiming(direction * FLY_DISTANCE, { duration: FLY_DURATION }, (finished) => {
          if (finished) runOnJS(onDecideRef.current)(decision);
        });
        ty.value = withTiming(ty.value + 60, { duration: FLY_DURATION });
      },
    }),
    [flying, tx, ty],
  );

  const pan = Gesture.Pan()
    .enabled(swipeEnabled)
    .minPointers(1)
    .onUpdate((event) => {
      if (flying.value) return;
      tx.value = event.translationX;
      ty.value = event.translationY;
    })
    .onEnd((event) => {
      if (flying.value) return;
      const dragged = Math.abs(event.translationX) > SWIPE_THRESHOLD;
      const flung = Math.abs(event.velocityX) > VELOCITY_THRESHOLD;
      if (dragged || flung) {
        const right = event.translationX > 0 || event.velocityX > 0;
        const direction = right ? 1 : -1;
        flying.value = true;
        tx.value = withTiming(direction * FLY_DISTANCE, { duration: FLY_DURATION }, (finished) => {
          if (finished) runOnJS(onDecideRef.current)(right ? 'keep' : 'delete');
        });
        ty.value = withTiming(ty.value + 60, { duration: FLY_DURATION });
      } else {
        tx.value = withSpring(0, SPRING);
        ty.value = withSpring(0, SPRING);
      }
    });

  const topStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { rotate: `${tx.value / 22}deg` },
    ],
  }));

  const behindStyle = useAnimatedStyle(() => {
    const progress = Math.min(Math.abs(tx.value) / 300, 1);
    return { transform: [{ scale: 0.94 + 0.06 * progress }] };
  });

  const keepStampStyle = useAnimatedStyle(() => ({
    opacity: Math.max(0, Math.min(tx.value / SWIPE_THRESHOLD, 1)),
  }));

  const deleteStampStyle = useAnimatedStyle(() => ({
    opacity: Math.max(0, Math.min(-tx.value / SWIPE_THRESHOLD, 1)),
  }));

  const behind = items.slice(1);
  const top = items[0];

  return (
    <View style={styles.stack}>
      {behind.map((item) => (
        <Animated.View key={item.id} style={[styles.card, behindStyle]} pointerEvents="none">
          {renderCard(item, false)}
        </Animated.View>
      ))}
      {top && (
        <GestureDetector gesture={pan}>
          <Animated.View style={[styles.card, topStyle]}>
            {renderCard(top, true)}
            {swipeEnabled && (
              <View style={FILL} pointerEvents="none">
                <Animated.View style={[styles.stampKeep, keepStampStyle]}>
                  <Stamp text="KEEP" color="#34c759" angle={-14} />
                </Animated.View>
                <Animated.View style={[styles.stampDelete, deleteStampStyle]}>
                  <Stamp text="DELETE" color="#ff3b30" angle={14} />
                </Animated.View>
              </View>
            )}
          </Animated.View>
        </GestureDetector>
      )}
    </View>
  );
}

function Stamp({ text, color, angle }: { text: string; color: string; angle: number }) {
  return (
    <View
      style={[
        styles.stamp,
        { borderColor: color, transform: [{ rotate: `${angle}deg` }] },
      ]}
    >
      {/* eslint-disable-next-line react-native/no-color-literals */}
      <Animated.Text style={[styles.stampText, { color }]}>{text}</Animated.Text>
    </View>
  );
}

const FILL = { position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0 };

const styles = StyleSheet.create({
  stack: {
    flex: 1,
  },
  card: {
    ...FILL,
    borderRadius: 20,
    backgroundColor: '#000',
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  stampKeep: {
    position: 'absolute',
    top: 24,
    left: 16,
  },
  stampDelete: {
    position: 'absolute',
    top: 24,
    right: 16,
  },
  stamp: {
    borderWidth: 4,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  stampText: {
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: 1,
  },
});
