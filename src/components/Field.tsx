import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { fonts } from '../theme/themes';

interface FieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  hint?: string;
  /** Mask the value and show a Show/Hide toggle. */
  secret?: boolean;
}

export function Field({ label, hint, secret, ...inputProps }: FieldProps) {
  const { theme } = useTheme();
  const [revealed, setRevealed] = useState(false);
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.wrapper}>
      <Text style={[styles.label, { color: theme.colors.text }]}>{label}</Text>
      <View
        style={[
          styles.inputRow,
          {
            backgroundColor: theme.colors.inputBg,
            borderColor: focused ? theme.colors.primary : theme.colors.inputBorder,
          },
        ]}
      >
        <TextInput
          {...inputProps}
          secureTextEntry={secret && !revealed}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          placeholderTextColor={theme.colors.placeholder}
          onFocus={(e) => {
            setFocused(true);
            inputProps.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            inputProps.onBlur?.(e);
          }}
          style={[styles.input, { color: theme.colors.text }]}
        />
        {secret ? (
          <Pressable
            onPress={() => setRevealed((r) => !r)}
            accessibilityRole="button"
            accessibilityLabel={revealed ? `Hide ${label}` : `Show ${label}`}
            hitSlop={8}
          >
            <Text style={[styles.toggle, { color: theme.colors.primary }]}>
              {revealed ? 'Hide' : 'Show'}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {hint ? <Text style={[styles.hint, { color: theme.colors.mutedText }]}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: 16 },
  label: {
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
  },
  input: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 15,
    paddingVertical: 12,
    // remove the browser focus outline on web; the border color shows focus instead
    outlineStyle: 'none' as any,
  },
  toggle: {
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: '600',
    paddingLeft: 10,
  },
  hint: {
    fontFamily: fonts.body,
    fontSize: 12,
    marginTop: 5,
  },
});
