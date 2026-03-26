import React from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/theme';

interface Props {
  notionPageUrl?: string | null;
  notionPageTitle?: string | null;
  episodePageUrl?: string | null;
  episodePageTitle?: string | null;
  notionSaveIsNew?: boolean | null;
  notionSaving?: boolean;
  notionSaveError?: string | null;
}

export function NotionSaveToast({
  notionPageUrl,
  notionPageTitle,
  episodePageUrl,
  episodePageTitle,
  notionSaveIsNew,
  notionSaving,
  notionSaveError,
}: Props) {
  if (!notionSaving && !notionPageUrl && !notionSaveError && !episodePageUrl) return null;

  if (notionSaving) {
    return (
      <View style={styles.container}>
        <View style={styles.labelRow}>
          <ActivityIndicator size="small" color={colors.accentText} />
          <Text style={styles.label}>Saving to Notion...</Text>
        </View>
      </View>
    );
  }

  if (notionPageUrl) {
    return (
      <View style={styles.container}>
        <View style={styles.labelRow}>
          <Ionicons name="checkmark-circle" size={13} color={colors.success} />
          <Text style={styles.label}>Saved to Notion</Text>
        </View>
        <Pressable style={styles.actionRow} onPress={() => Linking.openURL(notionPageUrl)}>
          <Text style={styles.value}>
            {notionPageTitle
              ? `"${notionPageTitle}"`
              : notionSaveIsNew
                ? 'New episode page ready'
                : 'Episode study guide updated'}
          </Text>
          <Text style={styles.meta}>
            {notionSaveIsNew ? 'New episode page created' : 'Added to existing episode page'}
          </Text>
          <Text style={styles.link}>Open in Notion</Text>
        </Pressable>
      </View>
    );
  }

  if (episodePageUrl) {
    return (
      <View style={styles.container}>
        <View style={styles.labelRow}>
          <Ionicons name="document-text-outline" size={13} color={colors.accentText} />
          <Text style={styles.label}>Episode Page in Notion</Text>
        </View>
        <Pressable style={styles.actionRow} onPress={() => Linking.openURL(episodePageUrl)}>
          <Text style={styles.value}>
            {episodePageTitle ? `"${episodePageTitle}"` : 'Open linked episode page'}
          </Text>
          <Text style={styles.meta}>New saves for this episode will append here</Text>
          <Text style={styles.link}>Open in Notion</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Ionicons name="alert-circle-outline" size={13} color={colors.textDim} />
        <Text style={[styles.label, styles.errorLabel]}>Couldn't save to Notion</Text>
      </View>
      {notionSaveError ? (
        <Text style={styles.errorText} numberOfLines={2}>
          {notionSaveError}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: colors.accentText,
  },
  errorLabel: {
    color: colors.textDim,
  },
  actionRow: {
    paddingTop: 8,
  },
  value: {
    fontSize: 13,
    lineHeight: 17,
    color: colors.textPrimary,
    marginBottom: 3,
  },
  link: {
    fontSize: 12,
    color: colors.success,
  },
  meta: {
    fontSize: 12,
    lineHeight: 16,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  errorText: {
    paddingTop: 8,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
  },
});
