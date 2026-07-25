// app/tabs/cashflow.tsx — real budgeting, subordinate to the strategy.
//
// This screen used to refuse a category breakdown on principle: transactions
// were read for exactly one number — what the user has left each month — and
// showing where the money went was called a different product. That call has
// been reversed deliberately, and the reasoning it was protecting still holds,
// so it is enforced structurally instead of by omission:
//
//   · The hero is still the strategy's number, not a budget total. The payoff
//     and HELOC cards on the Dashboard remain the app's hero; this is a tool
//     that explains the surplus feeding them.
//   · Every exclusion comes from lib/cashflow.ts (`classifyTransactions`), so
//     the categories below always sum to the spending the projection was
//     computed from. A breakdown that quietly disagreed with the payoff date
//     would discredit both numbers.
//   · Live and estimated figures are labelled as such, everywhere. A period
//     total scaled from a typed monthly figure is not a measurement.
//   · The mortgage payment is NOT in the breakdown — the strategy models it
//     directly — and the screen says so rather than leaving a hole.
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
  Modal, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets, SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import UpcomingMoney, { buildUpcoming } from '../../components/UpcomingMoney';
import { parseDate } from '../../lib/mortgage';
import Hero, { HeroValue, HeroCaption } from '../../components/ui/Hero';
import { Skeleton, SkeletonGroup } from '../../components/ui/Skeleton';
import { Card } from '../../components/ui/primitives';
import { useAuth } from '../../hooks/useAuth';
import { useFinancials } from '../../hooks/useFinancials';
import { useDumpHistory } from '../../hooks/useDumpHistory';
import { useCategoryOverrides } from '../../hooks/useCategoryOverrides';
import { hapticLight, hapticSuccess, hapticError, hapticSelection } from '../../lib/haptics';
import {
  PERIODS, SPEND_CATEGORIES, categoryMeta, periodRange, summarizePeriod,
  type PeriodId, type SpendCategory, type CategoryTotal, type CategorizedTxn,
} from '../../lib/spending';
import { Colors, Typography, Spacing, Radius, OnDark, CommonStyles, TAB_BAR_CLEARANCE } from '../../lib/theme';

export default function CashFlowScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const f = useFinancials();
  const {
    buckets, totalDumped, count, lastDumpAt, loading: historyLoading,
    error: historyError, refresh: refreshHistory,
  } = useDumpHistory(profile?.id);
  const overrides = useCategoryOverrides(profile?.id);

  const [period, setPeriod] = useState<PeriodId>('month');
  const [openCategory, setOpenCategory] = useState<SpendCategory | null>(null);

  // Everything below comes from useFinancials, which exists precisely so two
  // screens cannot disagree about the same figure.
  const income    = f.income;
  const expenses  = f.expenses;
  const payment   = f.payment;
  const helocRate = f.helocRate;
  const helocRateAssumed = f.helocRateAssumed;
  const refreshing = f.refreshing;
  const helocInterest = (f.helocDrawn ?? 0) * helocRate / 12;

  const hasFigures = income > 0;
  const committed  = expenses + payment + (helocInterest > 1 ? helocInterest : 0);
  const surplus    = income - committed;
  const committedPct = income > 0 ? Math.min((committed / income) * 100, 100) : 0;

  // Recomputed when the period changes, not on a Date that would never
  // invalidate. `now` is read at render so a session left open overnight rolls
  // into the new day rather than summing yesterday's window.
  const range = useMemo(() => periodRange(period), [period]);

  const summary = useMemo(
    () => summarizePeriod({
      transactions: f.transactions,
      classification: f.transactionClassification,
      overrides: overrides.overrides,
      range,
      entered: { monthlyIncome: income, monthlyExpenses: expenses },
    }),
    [f.transactions, f.transactionClassification, overrides.overrides, range, income, expenses],
  );

  const upcoming = useMemo(
    () => buildUpcoming(
      f.derivedCashflow?.recurringIncome ?? [],
      {
        amount:   f.mortgage.nextPayment.value ?? payment,
        dueDate:  f.mortgage.nextPaymentDueDate.value
          ? parseDate(f.mortgage.nextPaymentDueDate.value)
          : null,
        reported: f.mortgage.nextPaymentDueDate.source === 'liability',
      },
    ),
    [f.derivedCashflow, f.mortgage.nextPayment, f.mortgage.nextPaymentDueDate, payment],
  );

  const onRefresh = useCallback(async () => {
    const [ok] = await Promise.all([f.refresh(), refreshHistory()]);
    if (ok) hapticSuccess();
    else hapticError();
  }, [f.refresh, refreshHistory]);

  const maxBucket = Math.max(...buckets.map(b => b.total), 0);

  const openRows = useMemo(
    () => openCategory
      ? summary.rows
          .filter(r => r.category === openCategory)
          .sort((a, b) => b.txn.amount - a.txn.amount)
      : [],
    [summary.rows, openCategory],
  );

  return (
    <View style={CommonStyles.screenContainer}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.mint600} />
        }
      >
        <Hero
          intensity={0.75}
          topBar={<Text style={styles.topTitle}>Cash flow</Text>}
        >
          <Text style={styles.heroEyebrow}>
            {surplus >= 0 ? 'AVAILABLE TO CYCLE EACH MONTH' : 'SHORT EACH MONTH'}
          </Text>

          {/* Committed includes interest on the linked HELOC balance, so while
              that balance is loading it is missing and the surplus above it
              reads HIGH — the flattering direction, on the figure the whole
              strategy is sized from. */}
          {f.loading ? (
            <SkeletonGroup label="Working out what you have left each month" style={styles.heroSkeleton}>
              <Skeleton onDark width={170} height={40} radius={Radius.sm} />
              <Skeleton onDark width={230} height={13} />
            </SkeletonGroup>
          ) : (
            <>
              <HeroValue>
                {hasFigures ? `${surplus < 0 ? '−' : ''}$${fmt(Math.abs(surplus))}` : '—'}
              </HeroValue>
              <HeroCaption>
                {hasFigures
                  ? `${committedPct.toFixed(0)}% of your income is already committed` +
                    (surplus < 0 ? ' — there is nothing left to cycle' : '')
                  : 'Add your income and expenses to see what the strategy has to work with'}
              </HeroCaption>
            </>
          )}
        </Hero>

        <View style={styles.content}>
        {!f.loading && f.error && (
          <TouchableOpacity
            style={styles.staleBanner}
            onPress={() => { hapticLight(); onRefresh(); }}
            accessibilityRole="button"
            accessibilityLabel="Balances may be out of date. Tap to retry."
          >
            <Ionicons name="cloud-offline-outline" size={16} color={Colors.textSecondary} />
            <Text style={styles.staleText}>
              Couldn&apos;t reach your balances — HELOC interest below may be out of date.
            </Text>
            <Text style={styles.staleAction}>Retry</Text>
          </TouchableOpacity>
        )}

        {/* ── Period totals ────────────────────────────────────────────────
            Income, spend and net for a window the user picks. The basis line
            is not a footnote here: "$3,100 spent" measured and "$3,100 spent"
            scaled from a figure someone typed at onboarding are different
            claims, and only one of them is evidence. */}
        <Card>
          <PeriodToggle value={period} onChange={p => { hapticSelection(); setPeriod(p); }} />

          <View style={styles.rangeRow}>
            <Text style={styles.rangeLabel}>{range.rangeLabel}</Text>
            {range.inProgress && <Text style={styles.rangeNote}>· in progress</Text>}
          </View>

          {f.loading ? (
            <SkeletonGroup label="Loading this period" style={styles.statsSkeleton}>
              <Skeleton width={220} height={44} radius={Radius.sm} />
              <Skeleton width={180} height={13} />
            </SkeletonGroup>
          ) : (
            <>
              <View style={styles.statRow}>
                <PeriodStat label="Income" value={summary.income} />
                <PeriodStat label="Spent"  value={summary.spend} />
                <PeriodStat label="Net" value={summary.net} emphasis signed />
              </View>

              <BasisNote basis={summary.basis} period={period} hasFigures={hasFigures} />

              {/* The thread back to the strategy. Deliberately states the
                  bridge rather than implying the two figures are the same:
                  net here is BEFORE the mortgage payment, because the payment
                  is modelled by the projection and excluded from these rows.
                  Calling a pre-mortgage figure "what powers your cycling"
                  would be wrong by exactly the payment. */}
              {hasFigures && (
                <View style={styles.tieBack}>
                  <Ionicons name="repeat-outline" size={15} color={Colors.mint700} />
                  <Text style={styles.tieBackText}>
                    {surplus > 0
                      ? `Net is before your mortgage payment. After it, $${fmt(surplus)} a month ` +
                        'is the number that powers your HELOC cycling.'
                      : 'After your mortgage payment there is nothing left over yet — ' +
                        'that surplus is what HELOC cycling runs on.'}
                  </Text>
                </View>
              )}
            </>
          )}
        </Card>

        {/* ── Where it went ────────────────────────────────────────────────
            Only ever rendered from real transactions. With no linked accounts
            there is nothing to break down, and a split invented from a single
            typed expense total would be a fabrication. */}
        <Card>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>Where it went</Text>
            {summary.basis === 'live' && summary.categories.length > 0 && (
              <Text style={styles.cardStatus}>${fmt(summary.spend)} total</Text>
            )}
          </View>

          {f.loading || overrides.loading ? (
            <SkeletonGroup label="Loading your spending by category">
              <View style={{ gap: Spacing[3] }}>
                {[0, 1, 2, 3].map(i => (
                  <View key={i} style={styles.catSkeletonRow}>
                    <Skeleton width={32} height={32} radius={Radius.md} />
                    <View style={{ flex: 1, gap: 6 }}>
                      <Skeleton width={130} height={13} />
                      <Skeleton width={'100%'} height={6} radius={3} />
                    </View>
                  </View>
                ))}
              </View>
            </SkeletonGroup>
          ) : summary.basis === 'estimated' ? (
            <View style={styles.stateBlock}>
              <Text style={styles.emptyBody}>
                {f.hasLinkedAccounts
                  ? f.awaitingTransactions
                    ? 'Your bank is still sending its history. Categories appear here once it lands — ' +
                      'usually within a few minutes of linking.'
                    : `No transactions in this ${period === 'week' ? 'week' : period}. ` +
                      'Try a longer period, or pull down to refresh.'
                  : 'Link an account and your spending is broken down here automatically. ' +
                    'Until then this screen runs on the figures you entered.'}
              </Text>
              {!f.hasLinkedAccounts && (
                <TouchableOpacity
                  style={styles.emptyBtn}
                  onPress={() => { hapticLight(); router.push('/modals/link-account' as never); }}
                  accessibilityLabel="Link an account"
                >
                  <Text style={styles.emptyBtnText}>Link an account</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <>
              {summary.categories.map(c => (
                <CategoryRow
                  key={c.id}
                  category={c}
                  onPress={() => { hapticLight(); setOpenCategory(c.id); }}
                />
              ))}

              {/* The largest single housing cost is missing from the list
                  above by design. Saying so beats a user concluding the
                  breakdown is broken. */}
              {payment > 0 && (
                <Text style={styles.sourceNote}>
                  Your mortgage payment (${fmt(payment)} a month) is not counted here — the
                  strategy models it directly, and counting it twice would understate your
                  surplus. Transfers between your own accounts are excluded too.
                </Text>
              )}

              {summary.untaggedCount > 0 && (
                <Text style={styles.untagged}>
                  {summary.untaggedCount} transaction{summary.untaggedCount === 1 ? '' : 's'} your
                  bank didn&apos;t label {summary.untaggedCount === 1 ? 'is' : 'are'} sitting in
                  Other. Tap a category to retag {summary.untaggedCount === 1 ? 'it' : 'them'}.
                </Text>
              )}
            </>
          )}

          {overrides.error && (
            <Text style={styles.errorNote}>{overrides.error}</Text>
          )}
        </Card>

        {/* ── The next two weeks ─────────────────────────────────────────── */}
        {upcoming.length > 0 && (
          <Card>
            <View style={styles.cardHead}>
              <Text style={styles.cardTitle}>Next 14 days</Text>
            </View>
            <UpcomingMoney items={upcoming} />
          </Card>
        )}

        {/* ── The trailing series behind the derived figure ───────────────
            One bar per month of surplus — the single quantity the strategy
            runs on. It earns its place by showing how steady that number is. */}
        {f.derivedCashflow?.usable && f.derivedCashflow.months.length > 0 && (
          <Card>
            <View style={styles.cardHead}>
              <Text style={styles.cardTitle}>Surplus by month</Text>
              <Text style={styles.cardStatus}>
                {f.derivedCashflow.coverageMonths} months from your accounts
              </Text>
            </View>
            <SurplusChart months={f.derivedCashflow.months} />
            <Text style={styles.chartNote}>
              Income minus spending, before your mortgage payment. Transfers between your own
              accounts are excluded.
            </Text>
          </Card>
        )}

        {/* ── Cycle history — real logged dumps ───────────────────────────── */}
        <Card>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>Your dumps</Text>
            {count > 0 && (
              <Text style={styles.cardStatus}>
                {count} logged · ${fmt(totalDumped)} total
              </Text>
            )}
          </View>

          {historyError ? (
            <View style={styles.stateBlock}>
              <Text style={styles.emptyBody}>
                Couldn&apos;t load your history: {historyError}
              </Text>
              <TouchableOpacity
                style={styles.emptyBtn}
                onPress={refreshHistory}
                accessibilityLabel="Try loading history again"
              >
                <Text style={styles.emptyBtnText}>Try again</Text>
              </TouchableOpacity>
            </View>
          ) : historyLoading ? (
            <SkeletonGroup label="Loading your dump history">
              <View style={styles.chart}>
                {[38, 64, 22, 80, 50, 70].map((h, i) => (
                  <View key={i} style={styles.barGroup}>
                    <View style={styles.barSlot}>
                      <Skeleton width={18} height={h} radius={4} />
                    </View>
                    <Skeleton width={22} height={9} />
                  </View>
                ))}
              </View>
            </SkeletonGroup>
          ) : count === 0 ? (
            <View style={styles.stateBlock}>
              <Text style={styles.emptyBody}>
                No dumps logged yet. When you move money onto your principal, record it here
                and this fills in with your real history.
              </Text>
              <TouchableOpacity
                style={styles.emptyBtn}
                onPress={() => { hapticLight(); router.push('/modals/move-money' as never); }}
                accessibilityLabel="Plan a move"
              >
                <Text style={styles.emptyBtnText}>Plan a move</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={styles.chart}>
                {buckets.map((b, i) => (
                  <View key={i} style={styles.barGroup}>
                    <View style={styles.barSlot}>
                      <View
                        style={[
                          styles.bar,
                          {
                            height: maxBucket > 0 ? Math.max(3, (b.total / maxBucket) * 88) : 3,
                            backgroundColor: b.total > 0 ? Colors.mint600 : Colors.gray100,
                          },
                        ]}
                      />
                    </View>
                    <Text style={styles.barLabel}>{b.label}</Text>
                  </View>
                ))}
              </View>
              <Text style={styles.chartNote}>
                Last 6 months
                {lastDumpAt
                  ? ` · most recent ${lastDumpAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                  : ''}
              </Text>
            </>
          )}
        </Card>

        <TouchableOpacity
          style={styles.editRow}
          onPress={() => { hapticLight(); router.push('/modals/assumptions' as never); }}
          accessibilityRole="button"
          accessibilityLabel="Edit your income and expense figures"
        >
          <Text style={styles.editRowText}>
            {f.surplusBasis === 'trailing'
              ? `Figures averaged from ${f.derivedCashflow?.coverageMonths ?? 0} months of your transactions`
              : 'Figures you entered'}
          </Text>
          <Text style={styles.editRowAction}>Edit</Text>
        </TouchableOpacity>
        </View>
      </ScrollView>

      <CategorySheet
        category={openCategory}
        rows={openRows}
        saving={overrides.saving}
        onClose={() => setOpenCategory(null)}
        onRecategorize={overrides.setCategory}
      />
    </View>
  );
}

// ─── Period controls ──────────────────────────────────────────────────────────

function PeriodToggle({ value, onChange }: {
  value: PeriodId;
  onChange: (p: PeriodId) => void;
}) {
  return (
    <View style={styles.toggle} accessibilityRole="tablist">
      {PERIODS.map(p => {
        const active = p.id === value;
        return (
          <TouchableOpacity
            key={p.id}
            style={[styles.toggleBtn, active && styles.toggleBtnActive]}
            onPress={() => onChange(p.id)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`Show this ${p.label.toLowerCase()}`}
          >
            <Text style={[styles.toggleText, active && styles.toggleTextActive]}>
              {p.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/**
 * A negative net is drawn in muted grey, never red — severity reads as
 * saturation in this palette, and a month of overspending is information.
 */
function PeriodStat({ label, value, emphasis, signed }: {
  label: string;
  value: number;
  emphasis?: boolean;
  signed?: boolean;
}) {
  const negative = value < 0;
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text
        style={[
          styles.statValue,
          emphasis && styles.statValueEmphasis,
          negative && styles.statValueNegative,
        ]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {signed && negative ? '−' : ''}${fmt(Math.abs(value))}
      </Text>
    </View>
  );
}

/** Which of the two claims the figures above are making. Never omitted. */
function BasisNote({ basis, period, hasFigures }: {
  basis: 'live' | 'estimated';
  period: PeriodId;
  hasFigures: boolean;
}) {
  const live = basis === 'live';
  if (!live && !hasFigures) {
    return (
      <View style={styles.basis}>
        <Ionicons name="help-circle-outline" size={14} color={Colors.textMuted} />
        <Text style={styles.basisText}>
          Nothing on file yet — add your income and expenses, or link an account.
        </Text>
      </View>
    );
  }
  return (
    <View style={[styles.basis, live && styles.basisLive]}>
      <Ionicons
        name={live ? 'pulse-outline' : 'create-outline'}
        size={14}
        color={live ? Colors.mint700 : Colors.textMuted}
      />
      <Text style={[styles.basisText, live && styles.basisTextLive]}>
        {live
          ? 'Summed from your own transactions'
          : `Estimated — your monthly figures scaled to a ${periodWord(period)}, not measured`}
      </Text>
    </View>
  );
}

function periodWord(p: PeriodId): string {
  return p === 'week' ? 'week' : p === 'month' ? 'month' : p === 'quarter' ? 'quarter' : 'year';
}

// ─── Categories ───────────────────────────────────────────────────────────────

function CategoryRow({ category, onPress }: { category: CategoryTotal; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={styles.catRow}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={
        `${category.label}, $${fmt(category.amount)}, ${category.pct.toFixed(0)} percent ` +
        `of spending, ${category.count} transaction${category.count === 1 ? '' : 's'}`
      }
      accessibilityHint="Shows the transactions in this category"
    >
      <View style={styles.catIcon}>
        <Ionicons name={category.icon} size={17} color={Colors.mint700} />
      </View>

      <View style={styles.catBody}>
        <View style={styles.catHead}>
          <Text style={styles.catLabel} numberOfLines={1}>{category.label}</Text>
          <Text style={styles.catAmount}>${fmt(category.amount)}</Text>
        </View>
        <View style={styles.catTrack}>
          <View style={[styles.catFill, { width: `${Math.max(2, category.pct)}%` }]} />
        </View>
        <Text style={styles.catMeta}>
          {category.pct.toFixed(0)}% · {category.count} transaction{category.count === 1 ? '' : 's'}
        </Text>
      </View>

      <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
    </TouchableOpacity>
  );
}

/**
 * The transactions behind one category, with a retag picker.
 *
 * A sheet rendered in place rather than a route: the modal would otherwise have
 * to re-fetch the transactions it is displaying, which means a second read and
 * two copies of the same rows that can differ mid-flight. This one reads the
 * rows the screen already has.
 */
function CategorySheet({ category, rows, saving, onClose, onRecategorize }: {
  category: SpendCategory | null;
  rows: CategorizedTxn[];
  saving: string | null;
  onClose: () => void;
  onRecategorize: (transactionId: string, next: SpendCategory) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const meta = category ? categoryMeta(category) : null;
  const total = rows.reduce((sum, r) => sum + r.txn.amount, 0);

  // onDismiss is iOS-only, so the picker is collapsed here too — otherwise
  // re-opening a category on Android shows a row still expanded from last time.
  const close = useCallback(() => { setExpanded(null); onClose(); }, [onClose]);

  return (
    <Modal
      visible={category !== null}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={close}
      onDismiss={() => setExpanded(null)}
    >
      <SafeAreaView style={styles.sheet} edges={['top', 'bottom']}>
        <View style={styles.sheetHeader}>
          <View style={styles.sheetTitleBlock}>
            <Text style={styles.sheetTitle}>{meta?.label ?? 'Category'}</Text>
            <Text style={styles.sheetSub}>
              ${fmt(total)} · {rows.length} transaction{rows.length === 1 ? '' : 's'}
            </Text>
          </View>
          <TouchableOpacity
            onPress={close}
            style={styles.sheetClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={22} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.sheetContent}
          showsVerticalScrollIndicator={false}
        >
          {rows.map(r => {
            const isOpen = expanded === r.txn.transaction_id;
            return (
              <View key={r.txn.transaction_id} style={styles.txnBlock}>
                <TouchableOpacity
                  style={styles.txnRow}
                  onPress={() => {
                    hapticLight();
                    setExpanded(isOpen ? null : r.txn.transaction_id);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={
                    `${r.txn.merchant_name ?? r.txn.name ?? 'Transaction'}, ` +
                    `$${fmtCents(r.txn.amount)}, ${formatDay(r.txn.date)}`
                  }
                  accessibilityHint="Opens the category picker for this transaction"
                >
                  <View style={styles.txnBody}>
                    <Text style={styles.txnName} numberOfLines={1}>
                      {r.txn.merchant_name ?? r.txn.name ?? 'Transaction'}
                    </Text>
                    <Text style={styles.txnMeta}>
                      {formatDay(r.txn.date)}
                      {r.overridden ? ' · you categorised this' : ''}
                    </Text>
                  </View>
                  {saving === r.txn.transaction_id ? (
                    <ActivityIndicator size="small" color={Colors.mint600} />
                  ) : (
                    <Text style={styles.txnAmount}>${fmtCents(r.txn.amount)}</Text>
                  )}
                  <Ionicons
                    name={isOpen ? 'chevron-up' : 'chevron-down'}
                    size={15}
                    color={Colors.textMuted}
                  />
                </TouchableOpacity>

                {isOpen && (
                  <View style={styles.picker}>
                    <Text style={styles.pickerLabel}>Move to</Text>
                    <View style={styles.pickerGrid}>
                      {SPEND_CATEGORIES.map(c => {
                        const active = c.id === r.category;
                        return (
                          <TouchableOpacity
                            key={c.id}
                            style={[styles.pickerChip, active && styles.pickerChipActive]}
                            disabled={active}
                            onPress={async () => {
                              hapticSelection();
                              setExpanded(null);
                              await onRecategorize(r.txn.transaction_id, c.id);
                            }}
                            accessibilityRole="button"
                            accessibilityState={{ selected: active }}
                            accessibilityLabel={`Categorise as ${c.label}`}
                          >
                            <Ionicons
                              name={c.icon}
                              size={14}
                              color={active ? Colors.mint700 : Colors.textSecondary}
                            />
                            <Text
                              style={[styles.pickerChipText, active && styles.pickerChipTextActive]}
                            >
                              {c.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                )}
              </View>
            );
          })}

          <Text style={styles.sheetFootnote}>
            Categories you set are yours and stay put — they never change what your bank
            reported, and they do not alter your payoff projection.
          </Text>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/**
 * One bar per month of surplus.
 *
 * Months where spending exceeded income get a muted bar hanging below the
 * baseline rather than a red one — a negative month is information, not an
 * error, and this palette carries severity as saturation.
 */
function SurplusChart({ months }: { months: { key: string; label: string; surplus: number }[] }) {
  const peak = Math.max(...months.map(m => Math.abs(m.surplus)), 1);
  return (
    <View style={styles.surplusChart}>
      {months.map(m => {
        const height = Math.max(3, (Math.abs(m.surplus) / peak) * 56);
        const negative = m.surplus < 0;
        return (
          <View key={m.key} style={styles.surplusCol}>
            <View style={styles.surplusUpper}>
              {!negative && <View style={[styles.surplusBar, { height }]} />}
            </View>
            <View style={styles.surplusBaseline} />
            <View style={styles.surplusLower}>
              {negative && <View style={[styles.surplusBar, styles.surplusBarNeg, { height }]} />}
            </View>
            <Text style={styles.barLabel}>{m.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function fmt(n: number) { return Math.round(n).toLocaleString('en-US'); }
function fmtCents(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function formatDay(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  topTitle: {
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
    color: OnDark.secondary,
    marginBottom: Spacing[5],
  },
  heroEyebrow: {
    fontSize: 11,
    fontWeight: Typography.extrabold,
    color: OnDark.muted,
    letterSpacing: 1.4,
  },
  content: { paddingHorizontal: Spacing[4], gap: Spacing[4], paddingTop: Spacing[1] },
  heroSkeleton: { gap: Spacing[3], paddingVertical: Spacing[2] },
  statsSkeleton: { gap: Spacing[3], paddingVertical: Spacing[2] },

  staleBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    backgroundColor: Colors.gray100,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[3],
    minHeight: 44,
  },
  staleText: { flex: 1, fontSize: Typography.xs, color: Colors.textSecondary, lineHeight: 17 },
  staleAction: { fontSize: Typography.xs, fontWeight: Typography.semibold, color: Colors.mint700 },

  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing[3],
  },
  cardTitle: {
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
    color: Colors.textPrimary,
    marginBottom: Spacing[3],
  },
  cardStatus: { fontSize: Typography.xs, color: Colors.textMuted, marginBottom: Spacing[3] },

  // ── Period toggle ────────────────────────────────────────────────────────
  toggle: {
    flexDirection: 'row',
    backgroundColor: Colors.gray100,
    borderRadius: Radius.md,
    padding: 3,
    gap: 3,
  },
  toggleBtn: {
    flex: 1,
    minHeight: 38,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleBtnActive: {
    backgroundColor: Colors.surface,
    shadowColor: '#0A0F0D',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  toggleText: { fontSize: Typography.sm, fontWeight: Typography.medium, color: Colors.textSecondary },
  toggleTextActive: { color: Colors.textPrimary, fontWeight: Typography.semibold },

  rangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[1],
    marginTop: Spacing[3],
  },
  rangeLabel: { fontSize: Typography.xs, fontWeight: Typography.semibold, color: Colors.textSecondary },
  rangeNote: { fontSize: Typography.xs, color: Colors.textMuted },

  statRow: { flexDirection: 'row', gap: Spacing[3], marginTop: Spacing[3] },
  stat: { flex: 1, gap: 2 },
  statLabel: {
    fontSize: 10,
    fontWeight: Typography.extrabold,
    color: Colors.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  statValue: { fontSize: Typography.lg, fontWeight: Typography.semibold, color: Colors.textPrimary },
  statValueEmphasis: { fontSize: Typography.xl, fontWeight: Typography.bold, color: Colors.mint700 },
  statValueNegative: { color: Colors.gray500 },

  basis: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    marginTop: Spacing[3],
    paddingVertical: Spacing[2],
    paddingHorizontal: Spacing[3],
    borderRadius: Radius.md,
    backgroundColor: Colors.gray100,
  },
  basisLive: { backgroundColor: Colors.mint50 },
  basisText: { flex: 1, fontSize: 11, color: Colors.textMuted, lineHeight: 16 },
  basisTextLive: { color: Colors.mint700 },

  tieBack: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing[2],
    marginTop: Spacing[3],
    paddingTop: Spacing[3],
    borderTopWidth: 1,
    borderTopColor: Colors.borderSubtle,
  },
  tieBackText: { flex: 1, fontSize: Typography.xs, color: Colors.textSecondary, lineHeight: 18 },

  // ── Category list ────────────────────────────────────────────────────────
  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    minHeight: 60,
    paddingVertical: Spacing[2],
  },
  catIcon: {
    width: 34,
    height: 34,
    borderRadius: Radius.md,
    backgroundColor: Colors.mint50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catBody: { flex: 1, gap: 5 },
  catHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing[2] },
  catLabel: { flex: 1, fontSize: Typography.sm, fontWeight: Typography.medium, color: Colors.textPrimary },
  catAmount: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  catTrack: { height: 6, borderRadius: 3, backgroundColor: Colors.gray100, overflow: 'hidden' },
  catFill: { height: 6, borderRadius: 3, backgroundColor: Colors.mint600 },
  catMeta: { fontSize: 11, color: Colors.textMuted },
  catSkeletonRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },

  untagged: {
    fontSize: Typography.xs,
    color: Colors.textSecondary,
    lineHeight: 17,
    marginTop: Spacing[3],
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[3],
    borderRadius: Radius.md,
    backgroundColor: Colors.mint50,
  },
  errorNote: { fontSize: Typography.xs, color: Colors.textSecondary, marginTop: Spacing[3] },

  sourceNote: {
    fontSize: Typography.xs,
    color: Colors.textMuted,
    lineHeight: 17,
    marginTop: Spacing[3],
    paddingTop: Spacing[3],
    borderTopWidth: 1,
    borderTopColor: Colors.gray100,
  },

  stateBlock: { gap: Spacing[3] },
  emptyBody: { fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 20 },
  emptyBtn: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: Spacing[4],
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.mint200,
    backgroundColor: Colors.mint50,
  },
  emptyBtnText: {
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    color: Colors.mint700,
  },

  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing[3],
    minHeight: 44,
    paddingHorizontal: Spacing[1],
  },
  editRowText: { flex: 1, fontSize: Typography.xs, color: Colors.textMuted, lineHeight: 17 },
  editRowAction: { fontSize: Typography.xs, fontWeight: Typography.semibold, color: Colors.mint700 },

  // ── Category sheet ───────────────────────────────────────────────────────
  sheet: { flex: 1, backgroundColor: Colors.background },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[5],
    paddingVertical: Spacing[4],
  },
  sheetTitleBlock: { flex: 1, gap: 2 },
  sheetTitle: { fontSize: Typography.xl, fontWeight: Typography.bold, color: Colors.textPrimary },
  sheetSub: { fontSize: Typography.xs, color: Colors.textMuted },
  sheetClose: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  sheetContent: { padding: Spacing[4], gap: Spacing[2], paddingBottom: Spacing[10] },

  txnBlock: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    overflow: 'hidden',
  },
  txnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    minHeight: 60,
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[3],
  },
  txnBody: { flex: 1, gap: 3 },
  txnName: { fontSize: Typography.sm, fontWeight: Typography.medium, color: Colors.textPrimary },
  txnMeta: { fontSize: 11, color: Colors.textMuted },
  txnAmount: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },

  picker: {
    paddingHorizontal: Spacing[4],
    paddingBottom: Spacing[4],
    paddingTop: Spacing[1],
    gap: Spacing[2],
    borderTopWidth: 1,
    borderTopColor: Colors.borderSubtle,
    backgroundColor: Colors.surfaceSunken,
  },
  pickerLabel: {
    fontSize: 10,
    fontWeight: Typography.extrabold,
    color: Colors.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: Spacing[3],
  },
  pickerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[2] },
  pickerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: Spacing[3],
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  pickerChipActive: { backgroundColor: Colors.mint50, borderColor: Colors.mint600 },
  pickerChipText: { fontSize: Typography.xs, fontWeight: Typography.medium, color: Colors.textSecondary },
  pickerChipTextActive: { color: Colors.mint700, fontWeight: Typography.semibold },

  sheetFootnote: {
    fontSize: Typography.xs,
    color: Colors.textMuted,
    lineHeight: 18,
    textAlign: 'center',
    paddingHorizontal: Spacing[2],
    paddingTop: Spacing[4],
  },

  surplusChart: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  surplusCol: { flex: 1, alignItems: 'center' },
  surplusUpper: { height: 60, justifyContent: 'flex-end' },
  surplusLower: { height: 24, justifyContent: 'flex-start' },
  surplusBaseline: { height: 1, alignSelf: 'stretch', backgroundColor: Colors.borderSubtle },
  surplusBar: { width: 14, borderRadius: 3, backgroundColor: Colors.mint600 },
  surplusBarNeg: { backgroundColor: Colors.gray300 },

  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing[2], height: 112 },
  barGroup: { flex: 1, alignItems: 'center', gap: Spacing[2] },
  barSlot: { height: 88, justifyContent: 'flex-end' },
  bar: { width: 18, borderRadius: 4 },
  barLabel: { fontSize: 11, color: Colors.textMuted },
  chartNote: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: Spacing[3] },
});
