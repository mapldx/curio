import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/theme';

interface Props {
  onPress: () => void;
}

export function HomeSearchRail({ onPress }: Props) {
  const glassStyle: any =
    Platform.OS === 'web'
      ? ({
          backdropFilter: 'blur(22px)',
          WebkitBackdropFilter: 'blur(22px)',
        } as const)
      : null;

  return (
    <Pressable
      style={[styles.container, glassStyle]}
      onPress={onPress}
    >
      <View style={styles.left}>
        <Ionicons
          name="search"
          size={15}
          color={colors.textTertiary}
        />
        <Text style={styles.placeholder}>Search podcasts, topics, moments</Text>
      </View>
      <View style={styles.pill}>
        <Text style={styles.pillText}>Browse</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 46,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(9, 11, 14, 0.84)',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    overflow: 'hidden',
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  placeholder: {
    fontSize: 13,
    color: colors.textTertiary,
  },
  pill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    height: 28,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(30, 211, 155, 0.26)',
    backgroundColor: 'rgba(30, 211, 155, 0.08)',
  },
  pillText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.accentText,
  },
});
