import React from 'react';
import {
  Image,
  StyleSheet,
  View,
  type ImageStyle,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { colors, radii } from '../constants/theme';

interface Props {
  uri?: string;
  style?: StyleProp<ViewStyle>;
  imageStyle?: StyleProp<ImageStyle>;
}

export function EpisodeArtwork({ uri, style, imageStyle }: Props) {
  return (
    <View style={[styles.frame, style]}>
      {uri ? (
        <Image source={{ uri }} style={[styles.image, imageStyle]} resizeMode="cover" />
      ) : (
        <View style={styles.fallback}>
          <View style={[styles.arch, styles.archLeft]} />
          <View style={[styles.arch, styles.archRight]} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
    borderRadius: radii.xl,
    backgroundColor: '#181b19',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  fallback: {
    flex: 1,
    backgroundColor: '#202420',
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 18,
    paddingBottom: 18,
  },
  arch: {
    flex: 1,
    maxWidth: 128,
    height: '72%',
    borderTopLeftRadius: radii.xl * 2,
    borderTopRightRadius: radii.xl * 2,
  },
  archLeft: {
    backgroundColor: 'rgba(156, 174, 156, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(186, 247, 228, 0.05)',
  },
  archRight: {
    backgroundColor: 'rgba(63, 54, 46, 0.34)',
    borderWidth: 1,
    borderColor: colors.border,
  },
});
