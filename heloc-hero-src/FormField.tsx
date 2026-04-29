// components/ui/FormField.tsx
import {
  View, Text, TextInput, StyleSheet, TextInputProps,
} from 'react-native';
import { Colors, Typography, Spacing, Radius } from '../../lib/theme';

interface FormFieldProps extends TextInputProps {
  label: string;
  prefix?: string;
  suffix?: string;
  hint?: string;
  error?: string;
}

export default function FormField({
  label, prefix, suffix, hint, error, style, ...rest
}: FormFieldProps) {
  const hasError = !!error;

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.inputWrapper, hasError && styles.inputWrapperError]}>
        {prefix ? <Text style={styles.adornment}>{prefix}</Text> : null}
        <TextInput
          style={[styles.input, style]}
          placeholderTextColor={Colors.textMuted}
          {...rest}
        />
        {suffix ? <Text style={styles.adornment}>{suffix}</Text> : null}
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
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    backgroundColor: Colors.gray50,
    paddingHorizontal: Spacing[4],
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
