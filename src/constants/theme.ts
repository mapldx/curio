export const colors = {
  background: '#050607',
  surface: '#0b0d10',
  surfaceRaised: '#11151a',
  surfaceHover: '#171c22',
  panel: '#0f1318',
  panelRaised: '#131a22',
  overlay: 'rgba(6, 8, 11, 0.86)',
  accent: '#1ed39b',
  accentDim: 'rgba(30, 211, 155, 0.4)',
  accentGlow: 'rgba(30, 211, 155, 0.14)',
  accentText: '#baf7e4',
  textPrimary: '#f3f4f5',
  textSecondary: 'rgba(243, 244, 245, 0.62)',
  textTertiary: 'rgba(243, 244, 245, 0.4)',
  textDim: 'rgba(243, 244, 245, 0.24)',
  border: 'rgba(255, 255, 255, 0.08)',
  borderLight: 'rgba(255, 255, 255, 0.14)',
  error: '#d45f5f',
  success: '#52d08b',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const radii = {
  sm: 10,
  md: 16,
  lg: 24,
  xl: 28,
  full: 9999,
};

export const typography = {
  hero: { fontSize: 34, fontWeight: '800' as const, letterSpacing: -1.2 },
  title: { fontSize: 26, fontWeight: '800' as const, letterSpacing: -0.8 },
  heading: { fontSize: 22, fontWeight: '700' as const, letterSpacing: -0.5 },
  body: { fontSize: 15, fontWeight: '500' as const, lineHeight: 23 },
  caption: { fontSize: 13, fontWeight: '400' as const },
  label: { fontSize: 11, fontWeight: '600' as const, letterSpacing: 1.5, textTransform: 'uppercase' as const },
  meta: { fontSize: 12, fontWeight: '400' as const },
};
