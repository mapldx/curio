import React, { useEffect, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { clearNotionSettings, getNotionSettings, setNotionSettings } from '../services/notionSettings';
import { colors, radii, typography } from '../constants/theme';
import type { NotionSettings } from '../types';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSettingsChange?: (settings: NotionSettings | null) => void;
}

export function NotionSettingsSheet({
  visible,
  onClose,
  onSettingsChange,
}: Props) {
  const [token, setToken] = useState('');
  const [parentPageId, setParentPageId] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;

    const settings = getNotionSettings();
    setToken(settings?.token || '');
    setParentPageId(settings?.parentPageId || '');
    setErrorMessage(null);
  }, [visible]);

  if (!visible) return null;

  const handleSave = () => {
    const nextToken = token.trim();
    const nextParentPageId = parentPageId.trim();

    if (!nextToken || !nextParentPageId) {
      setErrorMessage('Add both the integration token and the page ID.');
      return;
    }

    setNotionSettings(nextToken, nextParentPageId);
    onSettingsChange?.({
      token: nextToken,
      parentPageId: nextParentPageId,
    });
    onClose();
  };

  const handleClear = () => {
    clearNotionSettings();
    onSettingsChange?.(null);
    onClose();
  };

  return (
    <View style={styles.overlay}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.header}>
          <Text style={styles.title}>Connect to Notion</Text>
          <Pressable style={styles.closeBtn} onPress={onClose}>
            <Ionicons name="close" size={18} color={colors.textPrimary} />
          </Pressable>
        </View>

        <Text style={styles.body}>
          Create an integration at notion.so/my-integrations, share a page with it, then paste the token and page ID here.
        </Text>

        <View style={styles.field}>
          <Text style={styles.label}>Integration token</Text>
          <TextInput
            value={token}
            onChangeText={(value) => {
              setToken(value);
              if (errorMessage) setErrorMessage(null);
            }}
            style={styles.input}
            placeholder="secret_..."
            placeholderTextColor={colors.textDim}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Parent page ID</Text>
          <TextInput
            value={parentPageId}
            onChangeText={(value) => {
              setParentPageId(value);
              if (errorMessage) setErrorMessage(null);
            }}
            style={styles.input}
            placeholder="Page ID or full Notion page URL"
            placeholderTextColor={colors.textDim}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

        <View style={styles.actions}>
          <Pressable style={styles.secondaryBtn} onPress={handleClear}>
            <Text style={styles.secondaryText}>Clear</Text>
          </Pressable>
          <Pressable style={styles.primaryBtn} onPress={handleSave}>
            <Text style={styles.primaryText}>Save</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 40,
    backgroundColor: 'rgba(5, 6, 7, 0.74)',
    justifyContent: 'flex-end',
    padding: 16,
  },
  sheet: {
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
    padding: 18,
    gap: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.4,
    color: colors.textPrimary,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
  },
  body: {
    ...typography.caption,
    lineHeight: 19,
    color: colors.textSecondary,
  },
  field: {
    gap: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  input: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: colors.textPrimary,
  },
  error: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.error,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  secondaryBtn: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
  },
  secondaryText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  primaryBtn: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.accentDim,
    backgroundColor: colors.accentGlow,
  },
  primaryText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.accentText,
  },
});
