// components/ui/ChipField.tsx
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, Typography, Spacing, Radius } from '../../lib/theme';

interface Option<T> {
  value: T;
  label: string;
}

interface Props<T> {
  label: string;
  options: Option<T>[];
  value: T;
  onChange: (v: T) => void;
}

export default function ChipField<T extends string | number>({ label, options, value, onChange }: Props<T>) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        {options.map(opt => {
          const active = opt.value === value;
          return (
            <TouchableOpacity
              key={String(opt.value)}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => onChange(opt.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { marginBottom: Spacing[4] },
  label:        { fontSize: Typography.sm, fontWeight: Typography.medium, color: Colors.textSecondary, marginBottom: Spacing[2] },
  row:          { flexDirection: 'row', gap: Spacing[2] },
  chip: {
    flex:             1,
    paddingVertical:  Spacing[3],
    borderRadius:     Radius.md,
    borderWidth:      1.5,
    borderColor:      Colors.border,
    backgroundColor:  Colors.gray50,
    alignItems:       'center',
  },
  chipActive: {
    backgroundColor: Colors.mint600,
    borderColor:     Colors.mint600,
  },
  chipText:       { fontSize: Typography.sm, fontWeight: Typography.medium, color: Colors.textSecondary },
  chipTextActive: { color: Colors.white },
});
