// components/ui/FormField.tsx
import {
  View, Text, TextInput, StyleSheet, TextInputProps,
} from 'react-native';
import { useState } from 'react';
import { Colors, Typography, Spacing, Radius } from '../../lib/theme';

interface FormFieldProps extends TextInputProps {
  label: string;
  prefix?: string;
  suffix?: string;
  hint?: string;
  error?: string;
}

export default function FormField({
  label, prefix, suffix, hint, error, style, onFocus, onBlur, ...rest
}: FormFieldProps) {
  const [focused, setFocused] = useState(false);
  const hasError = !!error;

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
          style={[styles.input, style]}
          placeholderTextColor={Colors.textMuted}
          onFocus={e => { setFocused(true); onFocus?.(e); }}
          onBlur={e => { setFocused(false); onBlur?.(e); }}
          {...rest}
        />
        {suffix ? <Text style={[styles.adornment, focused && styles.adornmentFocused]}>{suffix}</Text> : null}
      </View>
      {hint && !error ? <Text style={styles.hint}>{hint}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: Spacing[4] },
  label: {
    fontSize: Typography.sm,
    fontWeight: Typography.medium,
    color: Colors.textSecondary,
    marginBottom: Spacing[2],
  },
  labelFocused: { color: Colors.mint600 },
  labelError: { color: Colors.error },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    backgroundColor: Colors.gray50,
    paddingHorizontal: Spacing[4],
  },
  inputWrapperFocused: {
    borderColor: Colors.mint600,
    backgroundColor: Colors.surface,
    shadowColor: Colors.mint600,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  inputWrapperError: {
    borderColor: Colors.error,
    backgroundColor: '#fef2f2',
  },
  input: {
    flex: 1,
    fontSize: Typography.base,
    color: Colors.textPrimary,
    paddingVertical: Spacing[4],
  },
  adornment: {
    fontSize: Typography.base,
    color: Colors.textMuted,
    marginRight: 4,
  },
  adornmentFocused: { color: Colors.mint600 },
  hint: {
    fontSize: Typography.xs,
    color: Colors.textMuted,
    marginTop: Spacing[1],
  },
  error: {
    fontSize: Typography.xs,
    color: Colors.error,
    marginTop: Spacing[1],
  },
});
