// components/ui/FormField.tsx
// components/ui/FormField.tsx — one labelled input, with its own focus and
// error states.
//
// Forwards its ref to the underlying TextInput so a form can chain fields:
// returnKeyType="next" on one, .focus() on the next. Without that, every
// multi-field screen makes the user dismiss the keyboard and tap the next box,
// which is the difference between a form that feels considered and one that
// feels like a web page from 2011.
import { View, Text, TextInput, TextInputProps } from 'react-native';
import { useState, forwardRef } from 'react';
import { Typography, Spacing, Radius } from '../../lib/theme';
import { createThemedStyles, useTheme } from '../../lib/themeContext';

interface FormFieldProps extends TextInputProps {
  label: string;
  prefix?: string;
  suffix?: string;
  hint?: string;
  error?: string;
  /**
   * Style the field as rejected WITHOUT printing a message under it. For when
   * the explanation already lives somewhere better — a form-level banner that
   * names the problem once, rather than the same sentence twice on one screen.
   */
  invalid?: boolean;
  /**
   * Interactive element pinned inside the field, right-aligned — a show/hide
   * password toggle, a clear button. Laid out INSIDE the input wrapper rather
   * than absolutely positioned over it by the caller, which is how a password
   * eye ends up misaligned the moment the label wraps to two lines.
   */
  accessory?: React.ReactNode;
}

const FormField = forwardRef<TextInput, FormFieldProps>(function FormField({
  label, prefix, suffix, hint, error, invalid, accessory, style, onFocus, onBlur, ...rest
}, ref) {
  const { colors } = useTheme();
  const styles = useStyles();
  const [focused, setFocused] = useState(false);
  const hasError = !!error || !!invalid;

  return (
    <View style={styles.container}>
      <Text style={[
        styles.label,
        focused && !hasError && styles.labelFocused,
        hasError && styles.labelError,
      ]}>
        {label}
      </Text>
      <View style={[
        styles.inputWrapper,
        focused && !hasError && styles.inputWrapperFocused,
        hasError && styles.inputWrapperError,
      ]}>
        {prefix ? <Text style={[styles.adornment, focused && styles.adornmentFocused]}>{prefix}</Text> : null}
        <TextInput
          ref={ref}
          style={[styles.input, style]}
          placeholderTextColor={colors.textMuted}
          onFocus={e => { setFocused(true); onFocus?.(e); }}
          onBlur={e => { setFocused(false); onBlur?.(e); }}
          {...rest}
        />
        {suffix ? <Text style={[styles.adornment, focused && styles.adornmentFocused]}>{suffix}</Text> : null}
        {accessory}
      </View>
      {hint && !error ? <Text style={styles.hint}>{hint}</Text> : null}
      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text>
      ) : null}
    </View>
  );
});

export default FormField;

const useStyles = createThemedStyles(t => ({
  container: { marginBottom: Spacing[4] },
  label: {
    fontSize: Typography.sm,
    fontWeight: Typography.medium,
    color: t.colors.textSecondary,
    marginBottom: Spacing[2],
  },
  labelFocused: { color: t.colors.accentInk },
  labelError: { color: t.colors.error },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: t.colors.borderField,
    borderRadius: Radius.md,
    backgroundColor: t.colors.gray50,
    paddingHorizontal: Spacing[4],
  },
  inputWrapperFocused: {
    borderColor: t.colors.mint600,
    backgroundColor: t.colors.surface,
    shadowColor: t.colors.mint600,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  // Grey, not pink. This was '#fef2f2' — a red tint under a grey border and
  // grey message, which is both visually incoherent and against the palette
  // rule that negative states are muted grey and never red.
  inputWrapperError: {
    borderColor: t.colors.error,
    backgroundColor: t.colors.gray50,
  },
  input: {
    flex: 1,
    fontSize: Typography.base,
    color: t.colors.textPrimary,
    paddingVertical: Spacing[4],
    minHeight: 48,
  },
  adornment: {
    fontSize: Typography.base,
    color: t.colors.textMuted,
    marginRight: 4,
  },
  adornmentFocused: { color: t.colors.accentInk },
  hint: {
    fontSize: Typography.xs,
    color: t.colors.textMuted,
    marginTop: Spacing[1],
  },
  error: {
    fontSize: Typography.xs,
    color: t.colors.error,
    marginTop: Spacing[1],
  },
}));
