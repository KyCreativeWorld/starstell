import { Platform } from 'react-native';

export type ThemeName = 'cyan' | 'lavender_space';

export interface Theme {
  name: ThemeName;
  label: string;
  /** Whether the background is dark (controls status bar + star field). */
  dark: boolean;
  /** Show the blinking star field behind the content. */
  stars: boolean;
  colors: {
    background: string;
    text: string;
    mutedText: string;
    primary: string;
    accent: string;
    /** Translucent fill for glassy cards/windows. */
    glass: string;
    glassBorder: string;
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
  colors: {
    background: '#eef4f6',
    text: '#2e3537',
    mutedText: 'rgba(46, 53, 55, 0.65)',
    primary: '#5997a6',
    accent: '#3d6069',
    glass: 'rgba(255, 255, 255, 0.55)',
    glassBorder: 'rgba(255, 255, 255, 0.9)',
    inputBg: 'rgba(255, 255, 255, 0.6)',
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
  colors: {
    background: '#1b1b1e',
    text: '#fbfaff',
    mutedText: 'rgba(251, 250, 255, 0.6)',
    primary: '#d5b5dd',
    accent: '#d5b5dd',
    glass: 'rgba(251, 250, 255, 0.07)',
    glassBorder: 'rgba(251, 250, 255, 0.18)',
    inputBg: 'rgba(251, 250, 255, 0.06)',
    inputBorder: 'rgba(213, 181, 221, 0.3)',
    placeholder: 'rgba(251, 250, 255, 0.35)',
    buttonBg: 'rgba(213, 181, 221, 0.85)',
    buttonText: '#1b1b1e',
    success: '#c9e8c4',
    danger: '#f2a7a7',
    shadow: '#000000',
  },
};

export const themes: Record<ThemeName, Theme> = {
  cyan,
  lavender_space: lavenderSpace,
};

export const themeList: Theme[] = [cyan, lavenderSpace];

export const DEFAULT_THEME: ThemeName = 'cyan';

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
