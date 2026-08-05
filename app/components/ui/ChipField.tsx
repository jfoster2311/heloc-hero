// components/ui/ChipField.tsx
// SliderField and AmountCardField — the two controls either side of this one on
// the same forms — both buzz on selection. This one did not, so moving between
// them felt like the screen intermittently stopped responding.
import { View, Text } from 'react-native';
import { Touchable } from './press';
import { hapticSelection } from '../../lib/haptics';
import { Typography, Spacing, Radius } from '../../lib/theme';
import { createThemedStyles, useTheme } from '../../lib/themeContext';

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
  const styles = useStyles();
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        {options.map(opt => {
          const active = opt.value === value;
          return (
            <Touchable
              haptic="selection"
              key={String(opt.value)}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => { onChange(opt.value); }}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${label}: ${opt.label}`}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {opt.label}
              </Text>
            </Touchable>
          );
        })}
      </View>
    </View>
  );
}

const useStyles = createThemedStyles(t => ({
  container:    { marginBottom: Spacing[4] },
  label:        { fontSize: Typography.sm, fontWeight: Typography.medium, color: t.colors.textSecondary, marginBottom: Spacing[2] },
  row:          { flexDirection: 'row', gap: Spacing[2] },
  chip: {
    flex:             1,
    paddingVertical:  Spacing[3],
    borderRadius:     Radius.md,
    borderWidth:      1.5,
    borderColor:      t.colors.border,
    backgroundColor:  t.colors.gray50,
    alignItems:       'center',
  },
  chipActive: {
    backgroundColor: t.colors.mint600,
    borderColor:     t.colors.mint600,
  },
  chipText:       { fontSize: Typography.sm, fontWeight: Typography.medium, color: t.colors.textSecondary },
  chipTextActive: { color: t.colors.onAccent },
}));
