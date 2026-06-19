/** Single source of truth for all design tokens. No hard-coded values in screens. */

export const colors = {
  // Backgrounds — dark-mode-first
  bg: {
    base: '#09090B',
    elevated: '#18181B',
    overlay: '#27272A',
    subtle: '#3F3F46',
  },

  // Brand
  brand: {
    primary: '#6366F1',   // indigo-500
    primaryHover: '#4F46E5',
    accent: '#22D3EE',    // cyan-400
    accentDim: '#0E7490',
  },

  // Semantic
  success: '#22C55E',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#60A5FA',

  // Text
  text: {
    primary: '#FAFAFA',
    secondary: '#A1A1AA',
    tertiary: '#71717A',
    inverse: '#09090B',
  },

  // Borders
  border: {
    default: '#27272A',
    strong: '#3F3F46',
    focus: '#6366F1',
  },

  // Tokens (crypto)
  usdc: '#2775CA',
  eurc: '#003087',
  eth: '#627EEA',
  btc: '#F7931A',
} as const;

/** Motion durations in ms — standardized scale. */
export const duration = {
  fast: 120,
  normal: 200,
  slow: 320,
} as const;

/** Spring configs for react-native-reanimated worklets. */
export const spring = {
  snappy: { damping: 20, stiffness: 300, mass: 0.8 },
  gentle: { damping: 18, stiffness: 180, mass: 1 },
  sheet: { damping: 24, stiffness: 340, mass: 0.9 },
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  '2xl': 48,
  '3xl': 64,
} as const;

export const radius = {
  sm: 6,
  md: 12,
  lg: 18,
  xl: 24,
  full: 9999,
} as const;

export const typography = {
  family: {
    sans: 'System',
    mono: 'Courier',
  },
  size: {
    xs: 11,
    sm: 13,
    base: 15,
    md: 17,
    lg: 20,
    xl: 24,
    '2xl': 30,
    '3xl': 36,
  },
  weight: {
    regular: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  },
} as const;

export const zIndex = {
  sheet: 100,
  modal: 200,
  toast: 300,
} as const;
