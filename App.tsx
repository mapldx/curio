import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { Platform, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider, useApp } from './src/context/AppContext';
import { AudioProvider } from './src/context/AudioContext';
import { DiscoverScreen } from './src/screens/DiscoverScreen';
import { ListeningScreen } from './src/screens/ListeningScreen';
import { colors } from './src/constants/theme';

if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const meta = document.querySelector('meta[name="viewport"]');
  if (meta) {
    const content = meta.getAttribute('content') || '';
    if (!content.includes('viewport-fit')) {
      meta.setAttribute('content', content + ', viewport-fit=cover');
    }
  }
}

const webViewportFrame: any =
  Platform.OS === 'web'
    ? ({
        minHeight: '100dvh',
        height: '100dvh',
      } as const)
    : null;

function Router() {
  const { state } = useApp();

  switch (state.screen) {
    case 'listening':
    case 'interrupted':
      return <ListeningScreen />;
    case 'discover':
    default:
      return <DiscoverScreen />;
  }
}

export default function App() {
  return (
    <View style={[styles.container, webViewportFrame]}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <AppProvider>
          <AudioProvider>
            <View style={[styles.safeAreaShell, webViewportFrame]}>
              <View style={[styles.stage, webViewportFrame]}>
                <View style={[styles.deviceFrame, webViewportFrame]}>
                  <Router />
                </View>
              </View>
            </View>
          </AudioProvider>
        </AppProvider>
      </SafeAreaProvider>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  stage: {
    flex: 1,
    minHeight: 0,
    width: '100%',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  safeAreaShell: {
    flex: 1,
    minHeight: 0,
  },
  deviceFrame: {
    flex: 1,
    minHeight: 0,
    width: '100%',
    maxWidth: Platform.OS === 'web' ? 430 : undefined,
    backgroundColor: colors.background,
    overflow: 'hidden',
    borderLeftWidth: Platform.OS === 'web' ? StyleSheet.hairlineWidth : 0,
    borderRightWidth: Platform.OS === 'web' ? StyleSheet.hairlineWidth : 0,
    borderColor: 'rgba(255,255,255,0.08)',
  },
});
