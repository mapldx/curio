import React from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors } from '../constants/theme';

export interface ShelfCardItem {
  id: string;
  title: string;
  meta: string;
  imageUrl?: string;
  onPress: () => void;
}

interface Props {
  title: string;
  onSeeAll: () => void;
  items: ShelfCardItem[];
}

export function PodcastShelfSection({ title, onSeeAll, items }: Props) {
  if (items.length === 0) return null;

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Pressable onPress={onSeeAll}>
          <Text style={styles.link}>See all</Text>
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {items.map((item) => (
          <Pressable key={item.id} style={styles.card} onPress={item.onPress}>
            {item.imageUrl ? (
              <Image source={{ uri: item.imageUrl }} style={styles.artwork} />
            ) : (
              <View style={[styles.artwork, styles.artworkFallback]} />
            )}
            <Text style={styles.cardTitle} numberOfLines={2}>
              {item.title}
            </Text>
            <Text style={styles.cardMeta} numberOfLines={1}>
              {item.meta}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: 22,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 12,
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  link: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textTertiary,
  },
  row: {
    gap: 12,
    paddingRight: 16,
  },
  card: {
    width: 98,
  },
  artwork: {
    width: 98,
    height: 98,
    borderRadius: 14,
    backgroundColor: colors.panelRaised,
    marginBottom: 8,
  },
  artworkFallback: {
    backgroundColor: colors.panelRaised,
  },
  cardTitle: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  cardMeta: {
    fontSize: 11,
    lineHeight: 14,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
