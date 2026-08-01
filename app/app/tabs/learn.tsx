// app/tabs/learn.tsx — what the strategy is, what the app does, and who it is wrong for.
//
// Rewritten after this screen was found teaching a product that does not exist.
// What it used to say, and why each is gone:
//  · "Safe Sweep™ Explained" and "Safe Dump™ Explained" — branded features with
//    invented formulas (`Available Balance − Buffer Target − Upcoming Bills`,
//    `min(Accumulated Sweep, HELOC Available Credit)`). Neither is what ships.
//    Those same two names were stripped from the paywall in an earlier audit
//    precisely because they described automation this app cannot perform, and
//    they survived here, where a user is most likely to believe them.
//  · A description of the ALL-IN-ONE variant — paycheck deposited straight into
//    the line, every bill paid from it. That is a different, riskier strategy
//    than the one this app models, and a user who followed it because Learn
//    said so would be running their entire income through a variable-rate
//    secured line on our say-so.
//
// The rule for this file: every mechanic described here must be traceable to
// lib/safeToMove.ts, lib/sweep.ts or lib/config.ts. If the copy and the code
// disagree, the copy is the bug. Thresholds are interpolated from config rather
// than typed as prose, so they cannot drift out of sync again.
import {
  View, Text, ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import Hero, { HeroCaption } from '../../components/ui/Hero';
import { SectionLabel } from '../../components/ui/primitives';
import { hapticLight } from '../../lib/haptics';
import { UTILIZATION, BUFFER } from '../../lib/config';
import { Typography, Spacing, Radius, OnDark, TAB_BAR_CLEARANCE } from '../../lib/theme';
import { createThemedStyles, useTheme } from '../../lib/themeContext';

/** Thresholds read from config so the copy cannot outlive the numbers. */
const REPLENISH_PCT = Math.round(UTILIZATION.replenishThreshold * 100);
const HOLD_PCT      = Math.round(UTILIZATION.hold * 100);

/**
 * The three mechanics, as a scannable layer above the long-form guides.
 *
 * Every line here is traceable, per the rule at the top of this file:
 *  · 01 is runCycling in lib/projections.ts — the dump is a principal payment.
 *  · 02 is UTILIZATION.replenishThreshold, interpolated rather than typed, the
 *    same constant lib/strike.ts and lib/safeToMove.ts gate the next dump on.
 *  · 03 is components/NetDebt.tsx, which exists specifically because a rising
 *    line mid-cycle reads as backsliding when the two debts are shown apart.
 *
 * ── What is deliberately NOT here ─────────────────────────────────────────
 * A "cash shield" card, on the claim that surplus parked in the line suppresses
 * the interest charged on the MORTGAGE. It does not: money sitting against the
 * line reduces what the LINE charges, and mortgage interest only falls when a
 * dump reduces mortgage principal. Beyond being wrong, the average-daily-balance
 * framing it comes from belongs to the all-in-one variant — paycheck into the
 * line, bills paid from it — which lib/strike.ts and article 1 below both tell
 * the user outright this app does not ask of them. There is no shield mechanic
 * in lib/ to describe, and inventing one is how this screen went wrong before.
 */
const CONCEPTS: { n: string; icon: keyof typeof Ionicons.glyphMap; title: string; body: string }[] = [
  {
    n: '01',
    icon: 'arrow-down-circle-outline',
    title: 'The dump',
    body: 'Draw a lump sum from your line and put it straight onto your mortgage principal. '
      + 'The balance falls that day, so every remaining mortgage payment carries less interest.',
  },
  {
    n: '02',
    icon: 'repeat-outline',
    title: 'Replenish, then strike',
    body: `Your monthly surplus pays the line back down. The next dump opens once the line is `
      + `back to your replenish threshold — ${REPLENISH_PCT}% by default, and adjustable. `
      + `No surplus means nothing replenishes, and the loop stops after one turn.`,
  },
  {
    n: '03',
    icon: 'layers-outline',
    title: 'One number, not two',
    body: 'Mid-cycle your line is up — that is what a dump looks like from the line’s side. '
      + 'The app tracks the mortgage and the line as a single figure, so doing the right thing '
      + 'never reads as going backwards.',
  },
];

interface Article {
  id: number;
  category: string;
  title: string;
  body: string;
  /** Optional jump to the screen that actually does the thing. */
  action?: { label: string; route: string };
}

const ARTICLES: Article[] = [
  {
    id: 1,
    category: 'Strategy',
    title: 'How the HELOC Hero strategy works',
    body: `Your mortgage is large, long, and front-loaded with interest. A HELOC is small, short-lived, and charges interest daily on whatever you owe that day. The strategy trades the second against the first.

It runs in a loop:

1. Draw a lump sum from your HELOC and put it straight onto your mortgage principal. This is a "dump". Principal falls immediately, so every remaining mortgage payment contains less interest.

2. Send your monthly surplus — income minus expenses minus your mortgage payment — at the HELOC balance until the line is paid back down.

3. Once the line is replenished, the next dump is available. Repeat.

The reason it works is the shape of the two debts, not a trick. You carry a small HELOC balance for a short time in order to remove principal from a large balance for a long time. That is also why the surplus matters more than the rates: with no surplus there is nothing to replenish with, and the loop stops after one turn.

One thing to be clear about, because a common version of this strategy online says otherwise: this app does not ask you to deposit your paycheck into your HELOC or pay your bills out of it. That is a different arrangement with different risks. Keep banking the way you already do.

HELOC Hero never moves your money. Every draw, transfer and payment is one you make yourself at your own bank. The app works out the amounts, shows the reasoning, and records what you did.`,
  },
  {
    id: 2,
    category: 'Strategy',
    title: 'How "Safe to move" decides',
    body: `Safe to move answers one question: is now a sensible time to put money onto the mortgage? It returns CLEAR, CAUTION or HOLD, an amount, and the reasoning behind both.

Some things make the strategy structurally unsound, and any one of them is a HOLD outright rather than a smaller amount:

• The HELOC amortizes instead of charging interest only — cycling does not work on it
• The draw period has closed, so no further draws are possible
• The mortgage carries a prepayment penalty
• There is no HELOC limit on file, or no monthly surplus to replenish with
• The line is already drawn close to its limit

Past those, two numbers set the status. The first is how much of your line is drawn: above ${HOLD_PCT}% there is no meaningful emergency room left. The second is your buffer — cash plus remaining credit, measured in months of expenses. Under ${BUFFER.minMonths} months a move is never recommended; between ${BUFFER.minMonths} and ${BUFFER.comfortMonths} it is recommended with a caution.

Liquidity is always stated alongside the saving. Interest saved without saying what it cost you in available cash is a sales pitch, not a recommendation.

Worth knowing: this reasons from balances that refresh roughly twice a day, so it can be working from figures a few hours old. It shows its reasoning so you can tell when it is wrong.`,
    action: { label: 'See your own status', route: '/tabs/dashboard' },
  },
  {
    id: 3,
    category: 'Strategy',
    title: 'How "Safe to sweep" decides',
    body: `Taken literally, the strategy says send every spare dollar at the line. That is correct and unlivable. Safe to sweep works out how much of this month's surplus you can spend without slowing the plan down.

It starts from your surplus and subtracts what is genuinely committed:

• The repayment needed to bring your line back to your replenish threshold — ${REPLENISH_PCT}% by default, and adjustable — because that is exactly what re-opens your next dump
• The interest your line charges in the meantime, calculated on the full drawn balance

Whatever survives that is free to spend.

The commitment is derived from the same threshold Safe to move uses, deliberately. If this card ran its own model of replenishment, you could be told your surplus was free to spend while the card above it said HOLD, and neither number would survive the contradiction.

Where the arithmetic has to round, it rounds toward a smaller free figure. Telling you $400 is spare when it was $500 costs you nothing; the reverse quietly slows down the payoff you are here for.`,
    action: { label: 'See what is free to spend', route: '/tabs/dashboard' },
  },
  {
    id: 4,
    category: 'Risk',
    title: 'What are the risks?',
    body: `This strategy is not for everyone, and it is worth being honest about what can go wrong.

1. Variable rate risk — HELOC rates move. Yours is typically prime plus a margin, with a lifetime cap. Ask your lender for both. If rates rise sharply the cost of carrying the balance rises with them, and the maths gets worse.

2. Your home is the collateral. A HELOC is secured against your house. Aggressive use of one is a real commitment, not a budgeting technique.

3. The surplus is the whole engine. If income drops or expenses rise, the surplus shrinks and the loop slows or stops — while the HELOC balance is still there.

4. The draw period ends. Most HELOCs allow draws for about 10 years, then convert to repayment. Know your date, and plan for the balance to still be outstanding when it arrives.

5. Discipline over years. The strategy only pays off over a long horizon. Drawing the line for anything other than the mortgage breaks it.

It works best for people with stable income, controlled expenses, meaningful equity, and a long time horizon. If that is not you, paying extra directly onto the mortgage each month is a slower plan with far less that can go wrong.`,
    // Points at the editor for the two facts this article tells the reader to
    // go and find out — the draw-period end date and the rate — rather than at
    // a screen that would only display them back.
    action: { label: 'Record your HELOC terms', route: '/modals/heloc-terms' },
  },
  {
    id: 5,
    category: 'HELOC Basics',
    title: 'How to get a HELOC',
    body: `To qualify you generally need:

• At least 15–20% equity in your home
• A credit score of 620+, or 700+ for the best rates
• A debt-to-income ratio below 43%
• Stable income history

The process runs: apply with a lender, home appraisal, underwriting, close. Usually two to six weeks.

What to look for, because the strategy depends on it: an interest-only draw period of at least 10 years. A HELOC that amortizes from day one, or whose draw period ends sooner, will not support cycling. Ask about the rate cap, the margin over prime, and any annual or early-closure fees.

HELOC Hero does not broker HELOCs or receive offers on your behalf. Shop lenders yourself and compare on those terms.`,
    action: { label: 'What to look for', route: '/modals/get-heloc' },
  },
];

const FAQ = [
  {
    q: 'Does HELOC Hero move money for me?',
    a: 'No. There is no payment rail in this app and it never initiates a transfer. It works out the amounts, explains the reasoning, and records the moves you make yourself at your own bank. Anything in the app that says a dump or a sweep happened is recording what you told it you did.',
  },
  {
    q: 'Do I need a HELOC to use this app?',
    a: 'No. The calculator, projections and cycle tracking work without one. The full strategy does require a HELOC — see "How to get a HELOC" above for what to look for. You apply directly with a lender; HELOC Hero is not a lender or a broker.',
  },
  {
    q: 'Is my banking data safe?',
    a: 'We connect through Plaid, the same service most banking apps use, so your bank login is entered with Plaid and never seen or stored by us. Your data is encrypted in transit and at rest. We do not sell it. You can disconnect an institution from the Accounts tab at any time, or delete your account and all of its data from Settings.',
  },
  {
    q: 'How much could I realistically save?',
    a: 'It depends on your mortgage balance, your rate, and how much surplus you can consistently put toward it — the surplus matters most. Run the calculator for a projection from your own numbers. Those figures are estimates based on what you enter and on assumptions the calculator lists, not a guarantee, and we do not publish typical-user results.',
  },
  {
    q: 'What if my HELOC rate is higher than my mortgage rate?',
    a: 'That is expected, and it is not automatically a problem. What matters is that you carry a small HELOC balance for a short time to remove principal from a much larger balance for a much longer time. It stops being true if the line stays heavily drawn, which is why the app gates the next dump on replenishing it first.',
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Yes. Subscriptions are billed through your Apple ID, so you cancel in the App Store under Subscriptions — the same place you manage every other app. You can also delete your account and its data from Settings at any time.',
  },
];

export default function LearnScreen() {
  const insets = useSafeAreaInsets();
  const { colors, common } = useTheme();
  const styles = useStyles();
  const router = useRouter();
  // Sets, not a single id.
  //
  // Both of these used to hold ONE open item, so opening a guide silently
  // closed the one above it. On a reference screen that is the wrong default:
  // articles 2 and 3 describe the two halves of the same decision, and a reader
  // comparing them had to keep re-opening each in turn. Nothing about the layout
  // required it — the cards are independent and the screen already scrolls.
  const [expandedFaq, setExpandedFaq] = useState<ReadonlySet<number>>(new Set());
  const [expandedArticle, setExpandedArticle] = useState<ReadonlySet<number>>(new Set());

  function toggle(
    set: ReadonlySet<number>,
    setter: (next: ReadonlySet<number>) => void,
    id: number,
  ) {
    hapticLight();
    const next = new Set(set);
    if (!next.delete(id)) next.add(id);
    setter(next);
  }

  const allArticlesOpen = expandedArticle.size === ARTICLES.length;

  return (
    <View style={common.screenContainer}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }}
        showsVerticalScrollIndicator={false}
      >
        <Hero intensity={0.6}>
          <Text style={styles.heroTitle}>Learn</Text>
          <HeroCaption>
            How the strategy works, what it costs, and who it is wrong for.
          </HeroCaption>
        </Hero>

        <View style={styles.content}>
        {/* ── THE SURPLUS RULE ────────────────────────────────────────────────
            Promoted out of the sixth paragraph of article 1, where the single
            most important safety instruction on the screen was sitting behind a
            tap-to-expand. A user who never opens that guide never reads it.

            Tinted mint, not red. The palette has no red in it, and this is a
            rule to follow rather than an error the user has made — the same
            reason negative numbers on this app are grey. Alarm styling would
            also imply the app had detected something about THIS user, which it
            has not: this is guidance, shown to everyone, always. */}
        <View style={styles.ruleCard}>
          <View style={styles.ruleIcon}>
            <Ionicons name="shield-checkmark-outline" size={20} color={colors.mint700} />
          </View>
          <View style={styles.ruleBody}>
            <Text style={styles.ruleTitle}>Surplus, not salary</Text>
            <Text style={styles.ruleText}>
              Keep banking the way you already do: your paycheck lands in checking and your
              bills are paid from there. Only what is genuinely{' '}
              <Text style={styles.ruleEm}>left over</Text> goes at the line, so a month where
              cash flow stops is a month you pause — not a month you cannot pay the bills.
              The version of this strategy that runs your whole income through the HELOC is a
              different and riskier arrangement, and this app never asks it of you.
            </Text>
          </View>
        </View>

        {/* ── CORE MECHANICS ──────────────────────────────────────────────────
            A scannable summary above the guides, for the reader who wants the
            shape of the strategy before committing to five long articles.

            Plain Views, not Pressables. There is nothing behind them to open —
            the guides below hold the detail — and a card that depresses under
            the finger and then does nothing is a worse answer than a card that
            never offered. */}
        <SectionLabel>CORE MECHANICS</SectionLabel>
        {CONCEPTS.map(c => (
          <View key={c.n} style={[common.card, styles.conceptCard]}>
            <View style={styles.conceptHead}>
              <Text style={styles.conceptNumber}>{c.n}</Text>
              <View style={styles.conceptIcon}>
                <Ionicons name={c.icon} size={18} color={colors.mint700} />
              </View>
            </View>
            <Text style={styles.conceptTitle}>{c.title}</Text>
            <Text style={styles.conceptBody}>{c.body}</Text>
          </View>
        ))}

        {/* Articles.
            The header carries an expand-all rather than the screen opening
            every guide by default: five long articles unfurled on arrival is a
            wall of text, not a more useful screen. The control puts that choice
            where the reader can make it. */}
        <View style={styles.sectionRow}>
          {/* marginTop moved to the row, so the label sits on the button's
              centre line instead of 8pt below it. */}
          <SectionLabel style={styles.sectionRowLabel}>STRATEGY GUIDES</SectionLabel>
          <TouchableOpacity
            style={styles.expandAll}
            onPress={() => {
              hapticLight();
              setExpandedArticle(allArticlesOpen ? new Set() : new Set(ARTICLES.map(a => a.id)));
            }}
            accessibilityRole="button"
            accessibilityLabel={allArticlesOpen ? 'Collapse all guides' : 'Expand all guides'}
          >
            <Text style={styles.expandAllText}>
              {allArticlesOpen ? 'Collapse all' : 'Expand all'}
            </Text>
          </TouchableOpacity>
        </View>
        {ARTICLES.map(article => {
          const open = expandedArticle.has(article.id);
          return (
            // The card is a plain View, not a Touchable, so the toggle and the
            // jump below it stay two separate accessibility elements. Nesting
            // them would let TouchableOpacity's implicit `accessible` group the
            // link into the card and put it out of VoiceOver's reach entirely.
            <View key={article.id} style={[common.card, styles.articleCard]}>
              <TouchableOpacity
                style={styles.articleToggle}
                onPress={() => toggle(expandedArticle, setExpandedArticle, article.id)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityState={{ expanded: open }}
                accessibilityLabel={`${article.title}. ${article.category}.`}
                accessibilityHint={open ? 'Collapses this guide' : 'Expands this guide'}
              >
                <View style={styles.articleHeader}>
                  <View style={styles.categoryBadge}>
                    <Text style={styles.categoryText}>{article.category}</Text>
                  </View>
                  <Ionicons
                    name={open ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color={colors.textMuted}
                  />
                </View>
                <Text style={styles.articleTitle}>{article.title}</Text>
              </TouchableOpacity>

              {open && <Text style={styles.articleBody}>{article.body}</Text>}

              {open && article.action && (
                <TouchableOpacity
                  style={styles.articleAction}
                  onPress={() => {
                    hapticLight();
                    router.push(article.action!.route as never);
                  }}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={article.action.label}
                >
                  <Text style={styles.articleActionText}>{article.action.label}</Text>
                  <Ionicons name="arrow-forward" size={15} color={colors.mint700} />
                </TouchableOpacity>
              )}
            </View>
          );
        })}

        {/* FAQ */}
        <SectionLabel>FREQUENTLY ASKED</SectionLabel>
        {FAQ.map((item, i) => {
          const open = expandedFaq.has(i);
          return (
            <TouchableOpacity
              key={item.q}
              style={[common.card, styles.faqCard]}
              onPress={() => toggle(expandedFaq, setExpandedFaq, i)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityState={{ expanded: open }}
              accessibilityLabel={item.q}
              accessibilityHint={open ? 'Collapses this answer' : 'Expands this answer'}
            >
              <View style={styles.faqHeader}>
                <Text style={styles.faqQuestion}>{item.q}</Text>
                <Ionicons
                  name={open ? 'remove-circle-outline' : 'add-circle-outline'}
                  size={20}
                  color={colors.accentInk}
                />
              </View>
              {open && <Text style={styles.faqAnswer}>{item.a}</Text>}
            </TouchableOpacity>
          );
        })}

        {/* Disclaimer */}
        <View style={styles.disclaimer}>
          <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
          <Text style={styles.disclaimerText}>
            HELOC Hero provides financial education and tools, not financial advice. Projected
            savings and payoff dates are estimates based on the figures you enter, not guarantees.
            Consult a licensed financial advisor before making significant financial decisions.
          </Text>
        </View>
        </View>
      </ScrollView>
    </View>
  );
}

const useStyles = createThemedStyles(t => ({
  heroTitle: {
    fontSize: Typography['3xl'],
    fontWeight: Typography.extrabold,
    color: OnDark.primary,
    letterSpacing: -0.6,
  },
  content: { paddingHorizontal: Spacing[4], gap: Spacing[3], paddingTop: Spacing[1] },
  // Keeps the expand-all on the section label's baseline. SectionLabel carries
  // its own vertical padding, so the row only has to align them.
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing[3],
    marginTop: Spacing[2],
  },
  sectionRowLabel: { marginTop: 0 },
  expandAll: { minHeight: 44, justifyContent: 'center' },
  expandAllText: {
    fontSize: Typography.xs,
    fontWeight: Typography.semibold,
    color: t.colors.mint700,
  },
  articleCard: { gap: Spacing[2] },
  articleToggle: { gap: Spacing[2], minHeight: 44, justifyContent: 'center' },
  articleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  categoryBadge: {
    backgroundColor: t.colors.mint50,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing[3],
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: t.colors.mint200,
  },
  categoryText: { fontSize: Typography.xs, color: t.colors.mint700, fontWeight: Typography.medium },
  articleTitle: {
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
    color: t.colors.textPrimary,
    lineHeight: 22,
  },
  articleBody: {
    fontSize: Typography.sm,
    color: t.colors.textSecondary,
    lineHeight: 22,
    marginTop: Spacing[2],
    borderTopWidth: 1,
    borderTopColor: t.colors.border,
    paddingTop: Spacing[3],
  },
  articleAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    minHeight: 44,
    marginTop: Spacing[1],
  },
  articleActionText: {
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    color: t.colors.mint700,
  },
  faqCard: { gap: Spacing[2] },
  faqHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing[3],
  },
  faqQuestion: {
    flex: 1,
    fontSize: Typography.base,
    fontWeight: Typography.medium,
    color: t.colors.textPrimary,
    lineHeight: 22,
  },
  faqAnswer: {
    fontSize: Typography.sm,
    color: t.colors.textSecondary,
    lineHeight: 22,
    borderTopWidth: 1,
    borderTopColor: t.colors.border,
    paddingTop: Spacing[3],
  },
  disclaimer: {
    flexDirection: 'row',
    gap: Spacing[2],
    padding: Spacing[4],
    backgroundColor: t.colors.gray50,
    borderRadius: Radius.md,
    marginTop: Spacing[2],
  },
  disclaimerText: {
    flex: 1,
    fontSize: Typography.xs,
    color: t.colors.textMuted,
    lineHeight: 18,
  },
  // ── The surplus rule ──────────────────────────────────────────────────────
  ruleCard: {
    flexDirection: 'row',
    gap: Spacing[3],
    padding: Spacing[4],
    borderRadius: Radius.lg,
    backgroundColor: t.colors.mint50,
    borderWidth: 1,
    borderColor: t.colors.mint200,
  },
  ruleIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: t.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ruleBody: { flex: 1 },
  ruleTitle: {
    fontSize: Typography.base,
    fontWeight: Typography.bold,
    color: t.colors.mint700,
    marginBottom: Spacing[1],
  },
  ruleText: { fontSize: Typography.sm, color: t.colors.textSecondary, lineHeight: 21 },
  ruleEm: { fontWeight: Typography.bold, color: t.colors.textPrimary },

  // ── Core mechanics ────────────────────────────────────────────────────────
  conceptCard: { gap: Spacing[1] },
  conceptHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing[1],
  },
  // Large, low-contrast ordinal. It is a position marker, not information, so it
  // sits below the title in the reading order by weight of colour alone.
  conceptNumber: {
    fontSize: 30,
    fontWeight: Typography.extrabold,
    color: t.colors.borderSubtle,
    letterSpacing: -1,
  },
  conceptIcon: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    backgroundColor: t.colors.mint50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  conceptTitle: {
    fontSize: Typography.lg,
    fontWeight: Typography.bold,
    color: t.colors.textPrimary,
  },
  conceptBody: { fontSize: Typography.sm, color: t.colors.textSecondary, lineHeight: 21 },

}));
