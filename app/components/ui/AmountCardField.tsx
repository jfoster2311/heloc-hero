// components/ui/AmountCardField.tsx
import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, Typography, Spacing, Radius } from '../../lib/theme';
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

const styles = StyleSheet.create({
  container: { marginBottom: Spacing[4] },
  label:     { fontSize: Typography.sm, fontWeight: Typography.medium, color: Colors.textSecondary, marginBottom: Spacing[2] },
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
    borderColor:      Colors.border,
    backgroundColor:  Colors.gray50,
  },
  cardActive: {
    backgroundColor: Colors.mint600,
    borderColor:     Colors.mint600,
  },
  cardText:       { fontSize: Typography.base, fontWeight: Typography.semibold, color: Colors.textSecondary },
  cardTextActive: { color: Colors.white },
  customWrap:     { marginTop: Spacing[3] },
  hint:           { fontSize: Typography.xs, color: Colors.textMuted, marginTop: Spacing[2] },
});
