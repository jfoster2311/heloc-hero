// components/ui/AmountCardField.tsx
import { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Typography, Spacing, Radius } from '../../lib/theme';
import { createThemedStyles, useTheme } from '../../lib/themeContext';
import SliderField from './SliderField';
import { hapticSelection } from '../../lib/haptics';

export interface AmountPreset {
  value: number;
  label: string;
}

interface Props {
  label: string;
  value: number;
  presets: AmountPreset[];
  customMin: number;
  customMax: number;
  customStep?: number;
  format: (v: number) => string;
  hint?: string;
  onChange: (v: number) => void;
}

export default function AmountCardField({
  label, value, presets, customMin, customMax, customStep = 1_000, format, hint, onChange,
}: Props) {
  const styles = useStyles();
  const matchesPreset = presets.some(p => p.value === value);
  const [customMode, setCustomMode] = useState(!matchesPreset);
  const showCustom = customMode || !matchesPreset;

  function selectPreset(v: number) {
    hapticSelection();
    setCustomMode(false);
    onChange(v);
  }

  function selectCustom() {
    if (showCustom) return;
    hapticSelection();
    setCustomMode(true);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.grid}>
        {presets.map(p => {
          const active = !showCustom && p.value === value;
          return (
            <TouchableOpacity
              key={p.value}
              style={[styles.card, active && styles.cardActive]}
              onPress={() => selectPreset(p.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.cardText, active && styles.cardTextActive]}>{p.label}</Text>
            </TouchableOpacity>
          );
        })}
        <TouchableOpacity
          style={[styles.card, showCustom && styles.cardActive]}
          onPress={selectCustom}
          accessibilityRole="radio"
          accessibilityState={{ selected: showCustom }}
        >
          <Text style={[styles.cardText, showCustom && styles.cardTextActive]}>Custom</Text>
        </TouchableOpacity>
      </View>

      {showCustom && (
        <View style={styles.customWrap}>
          <SliderField
            label="Custom amount"
            value={value}
            min={customMin}
            max={customMax}
            step={customStep}
            format={format}
            onChange={onChange}
          />
        </View>
      )}

      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const useStyles = createThemedStyles(t => ({
  container: { marginBottom: Spacing[4] },
  label:     { fontSize: Typography.sm, fontWeight: Typography.medium, color: t.colors.textSecondary, marginBottom: Spacing[2] },
  grid:      { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[2] },
  card: {
    minWidth:         '31%',
    flexGrow:         1,
    minHeight:        56,
    justifyContent:   'center',
    alignItems:       'center',
    paddingVertical:  Spacing[3],
    paddingHorizontal: Spacing[2],
    borderRadius:     Radius.md,
    borderWidth:      1.5,
    borderColor:      t.colors.border,
    backgroundColor:  t.colors.gray50,
  },
  cardActive: {
    backgroundColor: t.colors.mint600,
    borderColor:     t.colors.mint600,
  },
  cardText:       { fontSize: Typography.base, fontWeight: Typography.semibold, color: t.colors.textSecondary },
  cardTextActive: { color: t.colors.white },
  customWrap:     { marginTop: Spacing[3] },
  hint:           { fontSize: Typography.xs, color: t.colors.textMuted, marginTop: Spacing[2] },
}));
