import { Platform } from 'react-native';

export type ThemeName = 'cyan' | 'lavender_space' | 'cyan_space' | 'safe_space';

export interface Theme {
  name: ThemeName;
  label: string;
  /** Whether the background is dark (controls status bar + star field). */
  dark: boolean;
  /** Show the blinking star field behind the content. */
  stars: boolean;
  /** Strength of the glossy reflection on glass (non-filled) buttons, 0–1. */
  glassReflection: number;
  colors: {
    background: string;
    text: string;
    mutedText: string;
    primary: string;
    accent: string;
    /** Translucent fill for glassy cards/windows. */
    glass: string;
    glassBorder: string;
    /** Brighter top edge, as if light is catching the rim of the glass. */
    glassHighlight: string;
    /** Diagonal sheen laid over glass windows (CSS gradient). */
    glassSheen: string;
    /** More opaque glass for large panels (chat window). */
    panel: string;
    /** Near-opaque fill for popup menus (theme picker). */
    menu: string;
    /** Soft color glows painted on the page so translucent glass has something to show (CSS gradients). */
    backgroundGlow: string;
    /** Translucent fill for inputs sitting inside a glass card. */
    inputBg: string;
    inputBorder: string;
    placeholder: string;
    /** Primary (filled) button. */
    buttonBg: string;
    buttonText: string;
    success: string;
    danger: string;
    shadow: string;
  };
}

// Colors taken from style_guide/cyan_theme.png
const cyan: Theme = {
  name: 'cyan',
  label: 'Cyan',
  dark: false,
  stars: false,
  glassReflection: 1,
  colors: {
    background: '#eef4f6',
    text: '#2e3537',
    mutedText: 'rgba(46, 53, 55, 0.65)',
    primary: '#5997a6',
    accent: '#3d6069',
    glass: 'rgba(255, 255, 255, 0.32)',
    glassBorder: 'rgba(255, 255, 255, 0.6)',
    glassHighlight: 'rgba(255, 255, 255, 0.95)',
    glassSheen:
      'linear-gradient(135deg, rgba(255, 255, 255, 0.45) 0%, rgba(255, 255, 255, 0.08) 45%, rgba(255, 255, 255, 0) 60%)',
    panel: 'rgba(255, 255, 255, 0.4)',
    menu: 'rgba(238, 244, 246, 0.95)',
    backgroundGlow:
      'radial-gradient(circle at 12% 18%, rgba(89, 151, 166, 0.38) 0%, rgba(89, 151, 166, 0) 38%), ' +
      'radial-gradient(circle at 62% 35%, rgba(89, 151, 166, 0.30) 0%, rgba(89, 151, 166, 0) 30%), ' +
      'radial-gradient(circle at 88% 55%, rgba(61, 96, 105, 0.28) 0%, rgba(61, 96, 105, 0) 40%), ' +
      'radial-gradient(circle at 30% 92%, rgba(89, 151, 166, 0.25) 0%, rgba(89, 151, 166, 0) 35%)',
    inputBg: 'rgba(255, 255, 255, 0.45)',
    inputBorder: 'rgba(89, 151, 166, 0.35)',
    placeholder: 'rgba(46, 53, 55, 0.4)',
    buttonBg: 'rgba(89, 151, 166, 0.88)',
    buttonText: '#eef4f6',
    success: '#3d6069',
    danger: '#a14a4a',
    shadow: '#3d6069',
  },
};

// Colors taken from style_guide/lavender_space_theme.png
const lavenderSpace: Theme = {
  name: 'lavender_space',
  label: 'Lavender Space',
  dark: true,
  stars: true,
  glassReflection: 0.4,
  colors: {
    background: '#1b1b1e',
    text: '#fbfaff',
    mutedText: 'rgba(251, 250, 255, 0.6)',
    primary: '#d5b5dd',
    accent: '#d5b5dd',
    glass: 'rgba(251, 250, 255, 0.05)',
    glassBorder: 'rgba(251, 250, 255, 0.14)',
    glassHighlight: 'rgba(251, 250, 255, 0.35)',
    glassSheen:
      'linear-gradient(135deg, rgba(251, 250, 255, 0.10) 0%, rgba(251, 250, 255, 0.02) 45%, rgba(251, 250, 255, 0) 60%)',
    panel: 'rgba(27, 27, 30, 0.55)',
    menu: 'rgba(27, 27, 30, 0.92)',
    // Faint lavender nebula; the background stays primarily black per the style guide.
    backgroundGlow:
      'radial-gradient(circle at 85% 15%, rgba(213, 181, 221, 0.10) 0%, rgba(213, 181, 221, 0) 40%), ' +
      'radial-gradient(circle at 10% 80%, rgba(213, 181, 221, 0.07) 0%, rgba(213, 181, 221, 0) 40%)',
    // Darker fill so stars don't sit behind typed text.
    inputBg: 'rgba(27, 27, 30, 0.6)',
    inputBorder: 'rgba(213, 181, 221, 0.3)',
    placeholder: 'rgba(251, 250, 255, 0.35)',
    buttonBg: 'rgba(213, 181, 221, 0.85)',
    buttonText: '#1b1b1e',
    success: '#c9e8c4',
    danger: '#f2a7a7',
    shadow: '#000000',
  },
};

// Lavender Space with the cyan theme's lighter cyan (#5997a6) in place of lavender.
const cyanSpace: Theme = {
  name: 'cyan_space',
  label: 'Cyan Space',
  dark: true,
  stars: true,
  glassReflection: 0.4,
  colors: {
    background: '#1b1b1e',
    text: '#fbfaff',
    mutedText: 'rgba(251, 250, 255, 0.6)',
    primary: '#5997a6',
    accent: '#5997a6',
    glass: 'rgba(251, 250, 255, 0.05)',
    glassBorder: 'rgba(251, 250, 255, 0.14)',
    glassHighlight: 'rgba(251, 250, 255, 0.35)',
    glassSheen:
      'linear-gradient(135deg, rgba(251, 250, 255, 0.10) 0%, rgba(251, 250, 255, 0.02) 45%, rgba(251, 250, 255, 0) 60%)',
    panel: 'rgba(27, 27, 30, 0.55)',
    menu: 'rgba(27, 27, 30, 0.92)',
    // Faint cyan nebula; the background stays primarily black per the style guide.
    backgroundGlow:
      'radial-gradient(circle at 85% 15%, rgba(89, 151, 166, 0.10) 0%, rgba(89, 151, 166, 0) 40%), ' +
      'radial-gradient(circle at 10% 80%, rgba(89, 151, 166, 0.07) 0%, rgba(89, 151, 166, 0) 40%)',
    // Darker fill so stars don't sit behind typed text.
    inputBg: 'rgba(27, 27, 30, 0.6)',
    inputBorder: 'rgba(89, 151, 166, 0.3)',
    placeholder: 'rgba(251, 250, 255, 0.35)',
    buttonBg: 'rgba(89, 151, 166, 0.85)',
    buttonText: '#1b1b1e',
    success: '#c9e8c4',
    danger: '#f2a7a7',
    shadow: '#000000',
  },
};

// Lavender Space's starry black base, with the cyan theme's cyan in place of
// lavender and white-ish frosted glass like the cyan theme's windows.
const safeSpace: Theme = {
  name: 'safe_space',
  label: 'Safe Space',
  dark: true,
  stars: true,
  glassReflection: 0.8,
  colors: {
    background: '#1b1b1e',
    text: '#fbfaff',
    mutedText: 'rgba(251, 250, 255, 0.7)',
    primary: '#5997a6',
    accent: '#5997a6',
    glass: 'rgba(255, 255, 255, 0.24)',
    glassBorder: 'rgba(255, 255, 255, 0.45)',
    glassHighlight: 'rgba(255, 255, 255, 0.85)',
    glassSheen:
      'linear-gradient(135deg, rgba(255, 255, 255, 0.30) 0%, rgba(255, 255, 255, 0.06) 45%, rgba(255, 255, 255, 0) 60%)',
    panel: 'rgba(255, 255, 255, 0.24)',
    menu: 'rgba(72, 76, 80, 0.94)',
    // Faint cyan nebula; the background stays primarily black.
    backgroundGlow:
      'radial-gradient(circle at 85% 15%, rgba(89, 151, 166, 0.14) 0%, rgba(89, 151, 166, 0) 40%), ' +
      'radial-gradient(circle at 10% 80%, rgba(89, 151, 166, 0.10) 0%, rgba(89, 151, 166, 0) 40%)',
    // Darker fill so stars don't sit behind typed text.
    inputBg: 'rgba(27, 27, 30, 0.55)',
    inputBorder: 'rgba(89, 151, 166, 0.55)',
    placeholder: 'rgba(251, 250, 255, 0.4)',
    buttonBg: 'rgba(89, 151, 166, 0.88)',
    buttonText: '#fbfaff',
    success: '#c9e8c4',
    danger: '#f2a7a7',
    shadow: '#000000',
  },
};

export const themes: Record<ThemeName, Theme> = {
  cyan,
  lavender_space: lavenderSpace,
  cyan_space: cyanSpace,
  safe_space: safeSpace,
};

export const themeList: Theme[] = [cyan, lavenderSpace, cyanSpace, safeSpace];

export const DEFAULT_THEME: ThemeName = 'cyan';

/**
 * Frosted-glass blur of whatever is behind a translucent surface.
 * Web only (CSS backdrop-filter); native shows the plain translucent fill.
 */
export const frosted = Platform.select<object>({
  web: { backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' },
  default: {},
});

// Style guide font is Trebuchet. It ships with iOS/macOS/Windows; Android falls back to sans-serif.
export const fonts = {
  body: Platform.select({
    ios: 'Trebuchet MS',
    web: '"Trebuchet MS", "Lucida Grande", sans-serif',
    default: 'sans-serif',
  }),
  // High-contrast serif to echo the STARSTELL wordmark.
  display: Platform.select({
    ios: 'Didot',
    web: 'Didot, "Bodoni 72", "Bodoni MT", Georgia, serif',
    default: 'serif',
  }),
};
