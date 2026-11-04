import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { fonts, frosted } from '../theme/themes';

/** Glassy, slightly transparent window. */
export function GlassCard({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useTheme();
  return (
    <View
      style={[
        styles.card,
        frosted,
        {
          backgroundColor: theme.colors.glass,
          borderColor: theme.colors.glassBorder,
          borderTopColor: theme.colors.glassHighlight,
          shadowColor: theme.colors.shadow,
          backgroundImage: theme.colors.glassSheen,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/**
 * Glossy reflection across the top half of a button, like light catching a
 * curved glass surface. Place it as the first child of a rounded container
 * with `overflow: 'hidden'`.
 */
export function Reflection({ strength = 1 }: { strength?: number }) {
  const top = (0.42 * strength).toFixed(2);
  const bottom = (0.06 * strength).toFixed(2);
  return (
    <View
      pointerEvents="none"
      style={[
        styles.reflection,
        {
          backgroundImage: `linear-gradient(180deg, rgba(255, 255, 255, ${top}) 0%, rgba(255, 255, 255, ${bottom}) 100%)`,
        },
      ]}
    />
  );
}

type ButtonVariant = 'primary' | 'ghost';

/** Softly rounded glass button with a slight reflection. */
export function GlassButton({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useTheme();
  const isPrimary = variant === 'primary';
  const textColor = isPrimary ? theme.colors.buttonText : theme.colors.text;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.button,
        frosted,
        {
          backgroundColor: isPrimary ? theme.colors.buttonBg : theme.colors.glass,
          borderColor: isPrimary ? 'rgba(255, 255, 255, 0.3)' : theme.colors.glassBorder,
          borderTopColor: theme.colors.glassHighlight,
          opacity: disabled ? 0.5 : pressed ? 0.8 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
        style,
      ]}
    >
      <Reflection strength={theme.dark && !isPrimary ? 0.4 : 1} />
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <Text style={[styles.buttonText, { color: textColor }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 2,
  },
  button: {
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
    overflow: 'hidden',
  },
  reflection: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '50%',
  },
  buttonText: {
    fontFamily: fonts.body,
    fontSize: 16,
    fontWeight: '600',
  },
});
