import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

interface CircleButtonProps {
  glyph: string;
  color: string;
  size?: number;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel: string;
}

/** The round action button used across the swipe bar. */
export function CircleButton({
  glyph,
  color,
  size = 56,
  onPress,
  disabled = false,
  accessibilityLabel,
}: CircleButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.button,
        { width: size, height: size, borderColor: color, opacity: disabled ? 0.35 : 1 },
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.glyph, { color, fontSize: size * 0.42 }]}>{glyph}</Text>
    </Pressable>
  );
}

interface StatBarProps {
  remaining: number;
  kept: number;
  markedForDeletion: number;
}

export function StatBar({ remaining, kept, markedForDeletion }: StatBarProps) {
  return (
    <Text style={styles.stats}>
      {remaining} left · {kept} kept · {markedForDeletion} marked
    </Text>
  );
}

const styles = StyleSheet.create({
  button: {
    borderWidth: 2,
    borderRadius: 999,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  pressed: {
    transform: [{ scale: 0.9 }],
  },
  glyph: {
    fontWeight: '700',
  },
  stats: {
    color: '#666',
    fontSize: 13,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
});
