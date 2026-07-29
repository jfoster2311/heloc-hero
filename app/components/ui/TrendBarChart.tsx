// components/ui/TrendBarChart.tsx — the app's only small bar chart.
//
// Five charts were heading for five implementations of the same thing: a
// category's spend against its ceiling, a whole budget month by month, income
// with no ceiling to fail, a merchant's months with one highlighted, and the
// month picker in a report. They differ in exactly one respect — what decides a
// bar's colour — so that is the prop, and everything else is shared.
//
//   'threshold'  a ceiling exists and each bar passes or fails it
//   'flat'       there is nothing to fail; every bar is the same weight
//   'selection'  one bar is the one you are looking at; the rest are context
//
// Getting this wrong in the obvious direction — colouring income bars by some
// threshold — is what produces a chart telling someone their earnings are a
// failure, so `flat` exists to make "no judgement applies here" a thing a caller
// must say out loud rather than a default it can drift away from.
import { View, Text, StyleSheet } from 'react-native';
import { Typography, Spacing, type Theme } from '../../lib/theme';
import { createThemedStyles, useTheme } from '../../lib/themeContext';
import { getBarColor } from '../../lib/budget';
import type { MonthPoint } from '../../lib/spending';

export type BarColorMode = 'threshold' | 'flat' | 'selection';

export interface TrendBarChartProps {
  points: MonthPoint[];
  colorMode: BarColorMode;
  /** The ceiling each bar is tested against. Required by 'threshold'. */
  threshold?: number | null;
  /**
   * Which bar is selected, by key. Defaults to the point marked `current`.
   * Only read by 'selection'.
   */
  selectedKey?: string;
  height?: number;
  /** Renders each bar's value above it. Off by default — five labels is noise. */
  showValues?: boolean;
  /** Screen-reader summary. The bars themselves carry nothing readable. */
  accessibilityLabel: string;
}

const DEFAULT_HEIGHT = 76;

export default function TrendBarChart({
  points,
  colorMode,
  threshold = null,
  selectedKey,
  height = DEFAULT_HEIGHT,
  showValues = false,
  accessibilityLabel,
}: TrendBarChartProps) {
  const styles = useStyles();
  const theme = useTheme();
  if (points.length === 0) return null;

  // The ceiling participates in the scale, not just the colouring. Without it,
  // a month at 98% of budget and a month at 400% both render as tall bars and
  // the line they are being measured against is nowhere on the chart.
  const peak = Math.max(
    ...points.map(p => p.amount),
    colorMode === 'threshold' && threshold ? threshold : 0,
    1,
  );

  const selected = selectedKey ?? points.find(p => p.current)?.key;

  // Where the dashed ceiling sits, as a fraction of the plot height.
  const thresholdFrac =
    colorMode === 'threshold' && threshold && threshold > 0
      ? Math.min(1, threshold / peak)
      : null;

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
      <View style={[styles.plot, { height }]}>
        {thresholdFrac !== null && (
          // Drawn as discrete ticks rather than a dashed border: React Native
          // renders `borderStyle: 'dashed'` inconsistently on a single-sided
          // border, and a ceiling line that silently drew solid would be
          // indistinguishable from a bar.
          <View
            style={[styles.ceilingLine, { bottom: thresholdFrac * height }]}
            pointerEvents="none"
          >
            {Array.from({ length: 24 }).map((_, i) => (
              <View key={i} style={styles.ceilingTick} />
            ))}
          </View>
        )}

        {points.map(p => {
          const isSelected = p.key === selected;
          const frac = peak > 0 ? p.amount / peak : 0;
          return (
            <View key={p.key} style={styles.col}>
              {showValues && (
                <Text style={styles.value} numberOfLines={1}>
                  {p.amount > 0 ? `$${compact(p.amount)}` : ''}
                </Text>
              )}
              <View
                style={[
                  styles.bar,
                  {
                    // A floor of 3px so a real-but-tiny month is a bar rather
                    // than nothing. A genuinely empty month gets 0 and reads as
                    // empty, which is the distinction worth keeping.
                    height: p.amount > 0 ? Math.max(3, frac * (height - 8)) : 0,
                    backgroundColor: barColor(colorMode, p, threshold, isSelected, theme),
                  },
                  // The selection outline is neutral and layered over whatever
                  // the fill already means, so "the bar I tapped" never reads as
                  // a verdict on that bar.
                  colorMode === 'selection' && isSelected && styles.barSelected,
                ]}
              />
            </View>
          );
        })}
      </View>

      <View style={styles.axis}>
        {points.map(p => (
          <View key={p.key} style={styles.col}>
            <Text
              style={[styles.axisLabel, p.key === selected && styles.axisLabelSelected]}
              numberOfLines={1}
            >
              {p.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * Takes the theme rather than reading it, because this is called from inside the
 * bar `.map` — a hook there would run in a loop and behind a branch. Same reason
 * `buildSegments` takes its ramp: a plain helper stays a plain helper.
 */
function barColor(
  mode: BarColorMode,
  point: MonthPoint,
  threshold: number | null,
  isSelected: boolean,
  theme: Theme,
): string {
  switch (mode) {
    case 'threshold':
      // The one shared threshold rule, so this chart and every progress bar in
      // the app agree about what "over" means.
      return getBarColor(point.amount, threshold, theme);
    case 'flat':
      return theme.colors.mint600;
    case 'selection':
      return isSelected ? theme.colors.mint600 : theme.colors.mint400;
  }
}

/** "1.2k" past a thousand — these labels sit under ~40px-wide bars. */
function compact(n: number): string {
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1_000)  return `${(n / 1000).toFixed(1)}k`;
  return String(Math.round(n));
}

const useStyles = createThemedStyles(t => ({
  plot: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing[2],
  },
  col: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  bar: { width: '100%', maxWidth: 34, borderRadius: 4 },
  barSelected: {
    borderWidth: 2,
    borderColor: t.semantic.selected,
  },
  value: {
    fontSize: 9,
    color: t.colors.textMuted,
    marginBottom: 3,
  },

  ceilingLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  ceilingTick: {
    width: 4,
    height: 1,
    backgroundColor: t.colors.gray300,
  },

  axis: {
    flexDirection: 'row',
    gap: Spacing[2],
    marginTop: Spacing[2],
  },
  axisLabel: { fontSize: 10, color: t.colors.textMuted },
  axisLabelSelected: {
    color: t.colors.textSecondary,
    fontWeight: Typography.semibold,
  },
}));
