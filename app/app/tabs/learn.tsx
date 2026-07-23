// app/tabs/learn.tsx
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { TAB_BAR_CLEARANCE } from './_layout';
import Hero, { HeroCaption } from '../../components/ui/Hero';
import { SectionLabel } from '../../components/ui/primitives';
import { Colors, Typography, Spacing, Radius, OnDark, CommonStyles } from '../../lib/theme';

const ARTICLES = [
  {
    id: 1,
    category: 'Strategy',
    title: 'How the HELOC Hero Strategy Works',
    body: `The HELOC Hero strategy uses your home equity line of credit as a financial buffer. Instead of letting your paycheck sit in a low-interest savings account, you deposit it directly into your HELOC — reducing the balance and therefore the daily interest accrual.

Each month you pay your bills out of the HELOC like a checking account. At the end of the month, your surplus has been working hard reducing HELOC interest the whole time.

Periodically, you take a larger lump sum from your HELOC and dump it directly onto your mortgage principal. This dramatically reduces mortgage interest over the long run.

The math works because HELOC interest accrues daily on the average daily balance. Every dollar deposited saves you money immediately.`,
  },
  {
    id: 2,
    category: 'Strategy',
    title: 'Safe Sweep™ Explained',
    body: `Safe Sweep™ works out how much cash is genuinely spare before you move anything into your HELOC. HELOC Hero does not move money — you make the transfer at your bank, and Safe Sweep™ tells you the amount.

Formula: Sweep Amount = Available Balance − Buffer Target − Upcoming Bills

The buffer keeps cash on hand for unexpected expenses. The upcoming bills estimate guards against overdrafting yourself. Only the true surplus is suggested.`,
  },
  {
    id: 3,
    category: 'Strategy',
    title: 'Safe Dump™ Explained',
    body: `Safe Dump™ handles the mortgage acceleration piece. Once enough HELOC credit has been freed up, it calculates the lump sum to put toward your mortgage principal and shows you what that move costs and saves. You make the payment; HELOC Hero records it and updates your payoff.

Formula: Dump Amount = min(Accumulated Sweep, HELOC Available Credit)

It only suggests a dump once your accumulated sweep reaches your minimum threshold, so you are not repeatedly drawing your HELOC down to nothing.`,
  },
  {
    id: 4,
    category: 'Risk',
    title: 'What Are the Risks?',
    body: `The HELOC strategy is not for everyone. Key risks to understand:

1. Variable rate risk — HELOCs have variable interest rates. If rates rise significantly, the math can change.

2. Discipline required — The strategy requires maintaining spending discipline. If expenses increase, the surplus shrinks.

3. HELOC draw period — Most HELOCs have a 10-year draw period followed by a repayment period. Plan accordingly.

4. Home equity risk — Your home is collateral. Understand this commitment before using a HELOC aggressively.

The strategy works best for people with stable income, controlled expenses, and a long time horizon.`,
  },
  {
    id: 5,
    category: 'HELOC Basics',
    title: 'How to Get a HELOC',
    body: `To qualify for a HELOC you generally need:
    
• At least 15–20% equity in your home
• Credit score of 620+ (700+ for best rates)
• Debt-to-income ratio below 43%
• Stable income history

The process: apply with a lender → home appraisal → underwriting → close. Usually takes 2–6 weeks.

What to look for, because the strategy depends on it: an interest-only draw period of at least 10 years. A HELOC that amortizes from day one, or whose draw period ends sooner, will not support cycling. Ask about the rate cap, the margin over prime, and any annual or early-closure fees.

HELOC Hero does not broker HELOCs or receive offers on your behalf. Shop lenders yourself and compare on those terms.`,
  },
];

const FAQ = [
  {
    q: 'Do I need a HELOC to use this app?',
    a: 'No. The calculator and projections work without one. The full strategy does require a HELOC — see "How to Get a HELOC" above for what to look for. You apply directly with a lender; HELOC Hero is not a lender or a broker.',
  },
  {
    q: 'Is my banking data safe?',
    a: 'Yes. We use Plaid — the industry standard for bank connections. We never see or store your bank login credentials. Your data is encrypted and we never sell it.',
  },
  {
    q: 'How much could I realistically save?',
    a: 'It depends entirely on your mortgage balance, interest rate, and how much surplus you can consistently put toward it — the surplus matters most. Run the calculator for a projection from your own numbers. Those figures are estimates based on what you enter, not a guarantee, and we don\'t publish typical-user results.',
  },
  {
    q: 'What if my HELOC rate is higher than my mortgage?',
    a: "That's actually fine — and expected. The HELOC balance stays low because you're constantly sweeping money in and dumping it out. The average daily HELOC balance is small compared to the mortgage balance being reduced.",
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Yes. Subscriptions are billed through your Apple ID, so you cancel in the App Store under Subscriptions — the same place you manage every other app. You can also delete your account and its data from Settings at any time.',
  },
];

export default function LearnScreen() {
  const insets = useSafeAreaInsets();
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
  const [expandedArticle, setExpandedArticle] = useState<number | null>(null);

  return (
    <View style={CommonStyles.screenContainer}>
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
        {/* Articles */}
        <SectionLabel>STRATEGY GUIDES</SectionLabel>
        {ARTICLES.map(article => (
          <TouchableOpacity
            key={article.id}
            style={[CommonStyles.card, styles.articleCard]}
            onPress={() =>
              setExpandedArticle(expandedArticle === article.id ? null : article.id)
            }
            activeOpacity={0.8}
          >
            <View style={styles.articleHeader}>
              <View style={styles.categoryBadge}>
                <Text style={styles.categoryText}>{article.category}</Text>
              </View>
              <Ionicons
                name={expandedArticle === article.id ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={Colors.textMuted}
              />
            </View>
            <Text style={styles.articleTitle}>{article.title}</Text>
            {expandedArticle === article.id && (
              <Text style={styles.articleBody}>{article.body}</Text>
            )}
          </TouchableOpacity>
        ))}

        {/* FAQ */}
        <SectionLabel>FREQUENTLY ASKED</SectionLabel>
        {FAQ.map((item, i) => (
          <TouchableOpacity
            key={i}
            style={[CommonStyles.card, styles.faqCard]}
            onPress={() => setExpandedFaq(expandedFaq === i ? null : i)}
            activeOpacity={0.8}
          >
            <View style={styles.faqHeader}>
              <Text style={styles.faqQuestion}>{item.q}</Text>
              <Ionicons
                name={expandedFaq === i ? 'remove-circle-outline' : 'add-circle-outline'}
                size={20}
                color={Colors.mint600}
              />
            </View>
            {expandedFaq === i && (
              <Text style={styles.faqAnswer}>{item.a}</Text>
            )}
          </TouchableOpacity>
        ))}

        {/* Disclaimer */}
        <View style={styles.disclaimer}>
          <Ionicons name="information-circle-outline" size={16} color={Colors.textMuted} />
          <Text style={styles.disclaimerText}>
            HELOC Hero provides financial education and tools, not financial advice. Consult a
            licensed financial advisor before making significant financial decisions.
          </Text>
        </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  heroTitle: {
    fontSize: Typography['3xl'],
    fontWeight: Typography.extrabold,
    color: OnDark.primary,
    letterSpacing: -0.6,
  },
  content: { paddingHorizontal: Spacing[4], gap: Spacing[3], paddingTop: Spacing[1] },
  articleCard: { gap: Spacing[2] },
  articleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  categoryBadge: {
    backgroundColor: Colors.mint50,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing[3],
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: Colors.mint200,
  },
  categoryText: { fontSize: Typography.xs, color: Colors.mint700, fontWeight: Typography.medium },
  articleTitle: {
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
    color: Colors.textPrimary,
    lineHeight: 22,
  },
  articleBody: {
    fontSize: Typography.sm,
    color: Colors.textSecondary,
    lineHeight: 22,
    marginTop: Spacing[2],
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: Spacing[3],
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
    color: Colors.textPrimary,
    lineHeight: 22,
  },
  faqAnswer: {
    fontSize: Typography.sm,
    color: Colors.textSecondary,
    lineHeight: 22,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: Spacing[3],
  },
  disclaimer: {
    flexDirection: 'row',
    gap: Spacing[2],
    padding: Spacing[4],
    backgroundColor: Colors.gray50,
    borderRadius: Radius.md,
    marginTop: Spacing[2],
  },
  disclaimerText: {
    flex: 1,
    fontSize: Typography.xs,
    color: Colors.textMuted,
    lineHeight: 18,
  },
});
