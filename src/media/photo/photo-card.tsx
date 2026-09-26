import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import type { PhotoItem } from './photo-source';

const MAX_ZOOM = 5;
const ZOOM_STEP = 2.5;
const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);
const FILL = { position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0 };

const formatDuration = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
};

/** Commands the swipe bar needs from the top card. */
export interface PhotoCardHandle {
  toggleZoom(): void;
  resetZoom(): void;
  togglePlay(): void;
  seek(seconds: number): void;
}

interface PhotoCardProps {
  item: PhotoItem;
  active: boolean;
  /** Clockwise quarter turns for the photo. Session-only: not saved to the library. */
  rotation: number;
  /** The top card reports zoom so the screen can switch drag→pan. */
  onZoomChange?: (zoomed: boolean) => void;
  /** The top video card reports playback so the screen can draw a scrubber. */
  onVideoStateChange?: (state: { playing: boolean; time: number }) => void;
}

interface ZoomHandle {
  toggleZoom(): void;
  resetZoom(): void;
}

interface VideoHandle {
  togglePlay(): void;
  seek(seconds: number): void;
}

/**
 * How one photo renders inside the card stack: everything photo-specific —
 * zoom, pan, rotation, playback, metadata — lives here, behind the generic
 * card chrome the stack provides.
 */
export function PhotoCard({
  item,
  active,
  rotation,
  onZoomChange,
  onVideoStateChange,
  ref,
}: PhotoCardProps & { ref?: React.Ref<PhotoCardHandle> }) {
  const zoomRef = useRef<ZoomHandle>(null);
  const videoRef = useRef<VideoHandle>(null);

  useImperativeHandle(ref, () => ({
    toggleZoom: () => zoomRef.current?.toggleZoom(),
    resetZoom: () => zoomRef.current?.resetZoom(),
    togglePlay: () => videoRef.current?.togglePlay(),
    seek: (seconds: number) => videoRef.current?.seek(seconds),
  }));

  return (
    <View style={styles.fill}>
      {item.isVideo ? (
        <VideoCard ref={videoRef} item={item} active={active} onStateChange={onVideoStateChange} />
      ) : (
        <ZoomablePhoto
          ref={zoomRef}
          item={item}
          rotation={rotation}
          onZoomChange={onZoomChange}
        />
      )}
      <InfoBar item={item} />
    </View>
  );
}

/**
 * Pinch / double-tap zoom with edge-clamped panning, mirroring the target
 * app: while zoomed, dragging pans the photo instead of swiping the card.
 * A sideways photo is laid out in a swapped frame so it still fits after
 * turning.
 */
function ZoomablePhoto({
  item,
  rotation,
  onZoomChange,
  ref,
}: {
  item: PhotoItem;
  rotation: number;
  onZoomChange?: (zoomed: boolean) => void;
  ref?: React.Ref<ZoomHandle>;
}) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const panX = useSharedValue(0);
  const panY = useSharedValue(0);
  const savedPanX = useSharedValue(0);
  const savedPanY = useSharedValue(0);
  const cardW = useSharedValue(0);
  const cardH = useSharedValue(0);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [zoomed, setZoomed] = useState(false);

  const reportZoomRef = useRef<(value: boolean) => void>(() => {});
  reportZoomRef.current = (value: boolean) => {
    setZoomed(value);
    onZoomChange?.(value);
  };

  function resetZoom() {
    'worklet';
    scale.value = withSpring(1);
    panX.value = withSpring(0);
    panY.value = withSpring(0);
    savedScale.value = 1;
    savedPanX.value = 0;
    savedPanY.value = 0;
    runOnJS(reportZoomRef.current)(false);
  }

  function applyZoom(targetScale: number, atX: number, atY: number) {
    'worklet';
    const maxX = (cardW.value * (targetScale - 1)) / 2;
    const maxY = (cardH.value * (targetScale - 1)) / 2;
    const targetX = clamp((cardW.value / 2 - atX) * (targetScale - 1), -maxX, maxX);
    const targetY = clamp((cardH.value / 2 - atY) * (targetScale - 1), -maxY, maxY);
    scale.value = withTiming(targetScale);
    panX.value = withTiming(targetX);
    panY.value = withTiming(targetY);
    savedScale.value = targetScale;
    savedPanX.value = targetX;
    savedPanY.value = targetY;
    runOnJS(reportZoomRef.current)(true);
  }

  function toggleZoom() {
    'worklet';
    if (scale.value > 1.01) {
      resetZoom();
    } else {
      applyZoom(ZOOM_STEP, cardW.value / 2, cardH.value / 2);
    }
  }

  useImperativeHandle(ref, () => ({
    toggleZoom: () => toggleZoom(),
    resetZoom: () => resetZoom(),
  }));

  const pinch = Gesture.Pinch()
    .onUpdate((event) => {
      scale.value = clamp(savedScale.value * event.scale, 1, MAX_ZOOM);
    })
    .onEnd(() => {
      if (scale.value < 1.05) {
        resetZoom();
      } else {
        savedScale.value = scale.value;
        runOnJS(reportZoomRef.current)(true);
      }
    });

  const pan = Gesture.Pan()
    .enabled(zoomed)
    .onUpdate((event) => {
      const maxX = (cardW.value * (scale.value - 1)) / 2;
      const maxY = (cardH.value * (scale.value - 1)) / 2;
      panX.value = clamp(savedPanX.value + event.translationX, -maxX, maxX);
      panY.value = clamp(savedPanY.value + event.translationY, -maxY, maxY);
    })
    .onEnd(() => {
      savedPanX.value = panX.value;
      savedPanY.value = panY.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((event) => {
      if (scale.value > 1.01) {
        resetZoom();
      } else {
        applyZoom(ZOOM_STEP, event.x, event.y);
      }
    });

  const zoomStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: panX.value },
      { translateY: panY.value },
      { scale: scale.value },
    ],
  }));

  // A sideways photo is laid out in a swapped frame so, after turning, it
  // still fits the card exactly.
  const turns = ((rotation % 4) + 4) % 4;
  const sideways = turns % 2 === 1;

  return (
    <View
      style={styles.fill}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        cardW.value = width;
        cardH.value = height;
        setSize({ width, height });
      }}
    >
      <GestureDetector gesture={Gesture.Simultaneous(doubleTap, pinch, pan)}>
        <Animated.View style={styles.fill}>
          <Animated.View style={zoomStyle}>
            <Animated.View
              style={{
                width: sideways ? size.height : size.width,
                height: sideways ? size.width : size.height,
                transform: [{ rotate: `${turns * 90}deg` }],
              }}
            >
              <Image
                source={{ uri: item.uri }}
                style={styles.fill}
                contentFit="contain"
                recyclingKey={item.id}
                transition={120}
              />
            </Animated.View>
          </Animated.View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

/** Plays the video on the top card. Only one video plays at a time. */
function VideoCard({
  item,
  active,
  onStateChange,
  ref,
}: {
  item: PhotoItem;
  active: boolean;
  onStateChange?: (state: { playing: boolean; time: number }) => void;
  ref?: React.Ref<VideoHandle>;
}) {
  const player = useVideoPlayer({ uri: item.uri }, (p) => {
    p.loop = false;
    p.timeUpdateEventInterval = 0.25;
  });
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);

  const toggle = useCallback(() => {
    if (player.playing) {
      player.pause();
    } else {
      player.play();
    }
  }, [player]);

  useImperativeHandle(ref, () => ({
    togglePlay: () => toggle(),
    seek: (seconds: number) => {
      player.currentTime = seconds;
      setTime(seconds);
    },
  }));

  // Playback events drive our state; the scrubber and buttons only read it.
  useEffect(() => {
    const subscription = player.addListener('playingChange', ({ isPlaying }) => {
      setPlaying(isPlaying);
    });
    const ended = player.addListener('playToEnd', () => {
      setTime(0);
    });
    const progress = player.addListener('timeUpdate', ({ currentTime }) => {
      setTime(currentTime);
    });
    return () => {
      subscription.remove();
      ended.remove();
      progress.remove();
    };
  }, [player]);

  // Leaving the card stops playback: only the top card ever plays.
  useEffect(() => {
    if (!active && player.playing) player.pause();
  }, [active, player]);

  useEffect(() => {
    onStateChange?.({ playing, time });
  }, [playing, time, onStateChange]);

  const toggleRef = useRef(toggle);
  toggleRef.current = toggle;
  const tap = Gesture.Tap().onEnd(() => {
    runOnJS(toggleRef.current)();
  });

  return (
    <GestureDetector gesture={tap}>
      <View style={styles.fill}>
        <View style={styles.fill} pointerEvents="none">
          <VideoView
            player={player}
            style={styles.fill}
            contentFit="contain"
            nativeControls={false}
          />
        </View>
        {!playing && (
          <View style={[FILL, styles.playBadge]} pointerEvents="none">
            <Text style={styles.playGlyph}>▶</Text>
          </View>
        )}
      </View>
    </GestureDetector>
  );
}

function InfoBar({ item }: { item: PhotoItem }) {
  const date = item.creationTime !== null ? new Date(item.creationTime).toLocaleDateString() : '';
  return (
    <View style={styles.infoBar} pointerEvents="none">
      <Text style={styles.infoText}>
        {item.isVideo ? `${date} · ${formatDuration(item.duration)}` : date}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  playBadge: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  playGlyph: {
    fontSize: 64,
    color: 'rgba(255,255,255,0.9)',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowRadius: 8,
  },
  infoBar: {
    position: 'absolute',
    left: 12,
    bottom: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  infoText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '500',
  },
});
