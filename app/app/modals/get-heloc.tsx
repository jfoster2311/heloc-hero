// app/modals/get-heloc.tsx — HELOC guide for users who don't have one yet
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { eligibleLenders } from '../../lib/lenders';
import { Colors, Typography, Spacing, Radius, Shadows } from '../../lib/theme';

export default function GetHelocModal() {
  const router = useRouter();
  const lenders = eligibleLenders();

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.title}>Open a HELOC</Text>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="close" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Two non-negotiables */}
        <Text style={styles.sectionTitle}>The two non-negotiables</Text>
        <Text style={styles.sectionBody}>
          Not every HELOC works for this strategy. You need both of the following:
        </Text>

        <View style={styles.requirementCard}>
          <View style={styles.requirementRow}>
            <View style={styles.requirementIcon}>
              <Ionicons name="checkmark-circle" size={22} color={Colors.mint600} />
            </View>
            <View style={styles.requirementText}>
              <Text style={styles.requirementTitle}>Interest-only draw period</Text>
              <Text style={styles.requirementBody}>
                You must only owe interest on what you've drawn — not principal. This keeps your
                monthly HELOC payment predictably low while you cycle surplus through it.
              </Text>
            </View>
          </View>

          <View style={[styles.requirementRow, { borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: Spacing[4] }]}>
            <View style={styles.requirementIcon}>
              <Ionicons name="checkmark-circle" size={22} color={Colors.mint600} />
            </View>
            <View style={styles.requirementText}>
              <Text style={styles.requirementTitle}>10+ year draw period</Text>
              <Text style={styles.requirementBody}>
                The cycling strategy requires years of sustained access. A 10-year draw period is
                the minimum — 15 or 20 is better. Avoid short 5-year draw-period products.
              </Text>
            </View>
          </View>
        </View>

        {/* Qualifying basics */}
        <Text style={styles.sectionTitle}>What lenders look at</Text>
        <View style={styles.listCard}>
          <ListRow icon="home-outline"    text="Sufficient home equity — typically 15–20% equity remaining after the HELOC" />
          <ListRow icon="trending-up-outline" text="Credit score of 680+ (720+ for best rates)" />
          <ListRow icon="cash-outline"    text="Debt-to-income ratio under 43%" />
          <ListRow icon="document-text-outline" text="Stable employment or verifiable self-employment income" />
        </View>

        {/* What to avoid */}
        <Text style={styles.sectionTitle}>What to avoid</Text>
        <View style={styles.avoidCard}>
          <AvoidRow text="HELOCs that require you to draw a minimum amount immediately at opening" />
          <AvoidRow text="Products with a repayment period that starts right away (not interest-only)" />
          <AvoidRow text="Fixed-rate draw structures — you need variable rate flexibility for the strategy to work" />
          <AvoidRow text="Draw periods shorter than 10 years" />
        </View>

        {/* Lender list */}
        <Text style={styles.sectionTitle}>
          {lenders.length > 0 ? 'Recommended lenders' : 'Finding a lender'}
        </Text>

        {lenders.length > 0 ? (
          lenders.map(lender => (
            <View key={lender.id} style={styles.lenderCard}>
              <View style={styles.lenderRow}>
                <Text style={styles.lenderName}>{lender.name}</Text>
                {lender.isPartner && (
                  <View style={styles.partnerBadge}>
                    <Text style={styles.partnerBadgeText}>Partner</Text>
                  </View>
                )}
              </View>
              {lender.aprRangeText && (
                <Text style={styles.lenderApr}>Rate: {lender.aprRangeText}</Text>
              )}
              {lender.disclosure && (
                <Text style={styles.lenderDisclosure}>{lender.disclosure}</Text>
              )}
              {lender.applyUrl && (
                <TouchableOpacity
                  style={styles.applyBtn}
                  onPress={() => Linking.openURL(lender.applyUrl!)}
                  accessibilityLabel={`Apply at ${lender.name}`}
                >
                  <Text style={styles.applyBtnText}>View →</Text>
                </TouchableOpacity>
              )}
            </View>
          ))
        ) : (
          <View style={styles.comingSoonCard}>
            <Ionicons name="time-outline" size={20} color={Colors.textMuted} />
            <Text style={styles.comingSoonText}>
              We're vetting lenders that meet both requirements. In the meantime, search for
              "interest-only HELOC 10-year draw" at local credit unions and online lenders. Always
              confirm interest-only draw and 10+ year draw period before applying.
            </Text>
          </View>
        )}

        <Text style={styles.disclaimer}>
          HELOC Hero is not a lender and does not receive compensation for referrals at this time.
          All lender relationships are subject to individual underwriting. Rates and terms vary.
          Consult a licensed mortgage professional before applying.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function ListRow({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={styles.listRow}>
      <Ionicons name={icon as never} size={16} color={Colors.mint600} />
      <Text style={styles.listRowText}>{text}</Text>
    </View>
  );
}

function AvoidRow({ text }: { text: string }) {
  return (
    <View style={styles.listRow}>
      <Ionicons name="close-circle-outline" size={16} color={Colors.gray400} />
      <Text style={styles.listRowText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[5],
    paddingVertical: Spacing[4],
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: { fontSize: Typography.lg, fontWeight: Typography.bold, color: Colors.textPrimary },
  content: { padding: Spacing[5], gap: Spacing[4], paddingBottom: Spacing[10] },

  sectionTitle: {
    fontSize: Typography.base,
    fontWeight: Typography.bold,
    color: Colors.textPrimary,
    marginTop: Spacing[2],
  },
  sectionBody: {
    fontSize: Typography.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginTop: -Spacing[2],
  },

  requirementCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing[5],
    gap: Spacing[4],
    ...Shadows.card,
  },
  requirementRow: { flexDirection: 'row', gap: Spacing[3], alignItems: 'flex-start' },
  requirementIcon: { paddingTop: 2, flexShrink: 0 },
  requirementText: { flex: 1 },
  requirementTitle: {
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  requirementBody: {
    fontSize: Typography.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },

  listCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing[5],
    gap: Spacing[3],
    ...Shadows.card,
  },
  listRow: { flexDirection: 'row', gap: Spacing[3], alignItems: 'flex-start' },
  listRowText: { flex: 1, fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 20 },

  avoidCard: {
    backgroundColor: Colors.gray50,
    borderRadius: Radius.lg,
    padding: Spacing[5],
    gap: Spacing[3],
    borderWidth: 1,
    borderColor: Colors.border,
  },

  lenderCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing[4],
    gap: Spacing[2],
    ...Shadows.card,
  },
  lenderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  lenderName: { fontSize: Typography.base, fontWeight: Typography.semibold, color: Colors.textPrimary },
  partnerBadge: {
    backgroundColor: Colors.mint50,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing[3],
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: Colors.mint200,
  },
  partnerBadgeText: { fontSize: Typography.xs, color: Colors.mint700, fontWeight: Typography.medium },
  lenderApr: { fontSize: Typography.sm, color: Colors.textSecondary },
  lenderDisclosure: { fontSize: Typography.xs, color: Colors.textMuted, lineHeight: 16 },
  applyBtn: { alignSelf: 'flex-start', paddingVertical: Spacing[1] },
  applyBtnText: { fontSize: Typography.sm, color: Colors.mint600, fontWeight: Typography.semibold },

  comingSoonCard: {
    flexDirection: 'row',
    gap: Spacing[3],
    alignItems: 'flex-start',
    backgroundColor: Colors.gray50,
    borderRadius: Radius.lg,
    padding: Spacing[5],
    borderWidth: 1,
    borderColor: Colors.border,
  },
  comingSoonText: { flex: 1, fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 20 },

  disclaimer: {
    fontSize: Typography.xs,
    color: Colors.textMuted,
    lineHeight: 18,
    textAlign: 'center',
    paddingHorizontal: Spacing[2],
  },
});
