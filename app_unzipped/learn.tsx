// app/tabs/learn.tsx
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Colors, Typography, Spacing, Radius, Shadows, CommonStyles } from '../../lib/theme';

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
    body: `Safe Sweep™ is HELOC Hero's automatic cash management system. It watches your savings account balance and, when it rises above your set buffer amount, automatically moves the surplus into your HELOC.

Formula: Sweep Amount = Available Balance − Buffer Target − Upcoming Bills

The buffer ensures you always have cash on hand for unexpected expenses. The upcoming bills estimate protects against overdrafts. Only the true surplus gets swept.`,
  },
  {
    id: 3,
    category: 'Strategy',
    title: 'Safe Dump™ Explained',
    body: `Safe Dump™ handles the mortgage acceleration piece. Once enough HELOC credit has been freed up through Safe Sweeps, HELOC Hero automatically makes a lump-sum payment toward your mortgage principal.

Formula: Dump Amount = min(Accumulated Sweep, HELOC Available Credit)

This only triggers when your accumulated sweep balance reaches your minimum dump threshold — protecting you from over-leveraging your HELOC.`,
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

HELOC Hero's marketplace shows you pre-qualified offers from multiple lenders based on your profile — no hard credit pull required to browse.`,
  },
];

const FAQ = [
  {
    q: 'Do I need a HELOC to use this app?',
    a: 'No! The calculator and projections work without one. But the full strategy requires a HELOC. We can help you find and apply for one through our marketplace.',
  },
  {
    q: 'Is my banking data safe?',
    a: 'Yes. We use Plaid — the industry standard for bank connections. We never see or store your bank login credentials. Your data is encrypted and we never sell it.',
  },
  {
    q: 'How much could I realistically save?',
    a: 'It depends on your mortgage balance, interest rate, and monthly surplus. The typical HELOC Hero user saves 5–12 years and $40,000–$120,000 in interest. Run the calculator to see your specific numbers.',
  },
  {
    q: 'What if my HELOC rate is higher than my mortgage?',
    a: "That's actually fine — and expected. The HELOC balance stays low because you're constantly sweeping money in and dumping it out. The average daily HELOC balance is small compared to the mortgage balance being reduced.",
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Yes. Cancel anytime from Settings. Your data is yours — we can export it for you on request.',
  },
];

export default function LearnScreen() {
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
  const [expandedArticle, setExpandedArticle] = useState<number | null>(null);

  return (
    <SafeAreaView style={CommonStyles.screenContainer} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Learn</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Articles */}
        <Text style={styles.sectionTitle}>Strategy Guides</Text>
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
        <Text style={[styles.sectionTitle, { marginTop: Spacing[4] }]}>
          Frequently Asked Questions
        </Text>
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
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: Spacing[5],
    paddingVertical: Spacing[4],
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: Typography.xl, fontWeight: Typography.bold, color: Colors.textPrimary },
  content: { padding: Spacing[4], gap: Spacing[3], paddingBottom: Spacing[10] },
  sectionTitle: {
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
    color: Colors.textPrimary,
    marginBottom: Spacing[1],
  },
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
