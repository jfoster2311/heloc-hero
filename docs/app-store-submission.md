# HELOC Hero — App Store Submission Package

## App Name & Subtitle Options

**Primary name:** HELOC Hero

**Subtitle options (30 chars max):**
1. Pay Off Your Mortgage Sooner  (30)
2. Mortgage Payoff Accelerator  (29)
3. HELOC Strategy & Calculator  (29)

Recommended: **"Pay Off Your Mortgage Sooner"**

---

## App Description (4,000 chars max)

> Copy framing: lead with the user's outcome, label projections as estimates, no guarantees.

**Short description (first 255 chars — shown before "more"):**

HELOC Hero helps homeowners use the HELOC cycling strategy to pay off their mortgage years sooner. See your projected payoff date, track your surplus, and know exactly when to make each move in the strategy financial educators call the "velocity banking method."

**Full description:**

Most homeowners pay their mortgage on autopilot — and lose tens of thousands of dollars to avoidable interest in the process.

HELOC Hero is built around one strategy: use a Home Equity Line of Credit (HELOC) as a temporary holding account for your monthly surplus. By routing surplus through your HELOC before making periodic principal "dumps" to your mortgage, you reduce the daily balance on which interest accrues — potentially shaving years off your payoff timeline and saving thousands in projected interest costs.

**What HELOC Hero does:**

• PROJECTED PAYOFF — Enter your mortgage details and monthly surplus to see an estimated payoff date under the cycling strategy vs. paying normally. All projections are estimates based on your inputs; actual results will vary.

• HELOC HERO SCORE™ — A composite readiness score (0–100) based on your surplus, HELOC utilization, and credit profile. Higher scores indicate better conditions for the strategy.

• CYCLE TRACKING — Log each "dump" payment and track your acceleration over time.

• CASH FLOW VIEW — See monthly income, obligations, and estimated surplus at a glance.

• LINKED ACCOUNTS (Pro) — Connect bank accounts via Plaid to track live balances without manual entry.

• SAFE SWEEP™ & SAFE DUMP™ (Pro) — The two calculations the strategy turns on: how much of your cash is genuinely spare to move to your HELOC, and how large a principal dump your line can support. HELOC Hero does not move money and is not connected to any payment rail — you make every transfer at your own bank, and the app records it and updates your projection.

• REMINDERS (Pro) — Scheduled on your device from your own figures, so you hear from us when your surplus is ready to move or your line is clear again, and not otherwise.

**Important disclosures:**
This app provides financial education and projection tools. Nothing in HELOC Hero is financial advice, a guarantee of savings, or a lending recommendation. Consult a licensed financial professional before changing your mortgage strategy. HELOC Hero is not a lender.

---

## Keywords (100 chars max)

`HELOC,mortgage payoff,velocity banking,home equity,interest savings,debt free,cycling strategy`

(95 chars)

---

## Promotional Text (170 chars — updateable without new build)

See how much sooner you could pay off your mortgage. Free calculator. No credit check. No lender. Just your numbers.

---

## Privacy Nutrition Labels

**Data Used to Track You:** None

**Data Linked to You:**
- Contact Info: Email address (account authentication)
- Financial Info: Bank account balances and mortgage data (Plaid-linked accounts, Pro tier only)
- Identifiers: User ID (account management)

**Data Not Linked to You:** None collected

**No third-party tracking SDKs are integrated. No analytics SDK is present.**

---

## Screenshot Plan (6.7" iPhone — 1290 × 2796px)

All screenshots use real app UI. No fabricated numbers that imply guaranteed outcomes. Projection labels visible.

| # | Screen | Caption (30 words max) |
|---|--------|------------------------|
| 1 | Welcome / Hero gradient | "See your projected mortgage-free date. The HELOC cycling strategy, one clear decision at a time." |
| 2 | Payoff calculator results | "Enter your numbers. Instantly see your estimated payoff date and projected interest saved." |
| 3 | Dashboard — milestone card + projection bar | "Track every cycle. Watch your projected payoff date move closer with each dump." |
| 4 | Cash Flow tab | "Know your monthly surplus. That's the engine of the whole strategy." |
| 5 | Accounts tab (linked via Plaid) | "Link accounts with Plaid. See live balances without spreadsheets. Pro feature." |
| 6 | Upgrade / Pro screen | "Know when to move and how much. Reminders on your device — you make every transfer." |

---

## App Review Notes

**Reviewer instructions:**

1. **Demo account** (to be created before submission):
   - Email: `demo@helochero.com`
   - Password: `HeroDemo2026!`
   - Account is pre-seeded with sample mortgage data and one completed cycle.

2. **Plaid sandbox credentials** (for linking accounts in review):
   - Username: `user_good`
   - Password: `pass_good`
   - Institution: select any sandbox bank
   - This requires Pro tier — use the "Start Free Trial" button on the upgrade screen to activate the 7-day trial before testing Plaid.

3. **Reaching Pro tier during review:**
   - Tap the Settings icon (top-right of any tab) → Plan row → "Upgrade →"
   - Or tap "Link Account" on the Accounts tab (gated behind Pro)
   - Tap "Start 7 days free" to begin the trial (sandbox purchase in Sandbox environment)

4. **Account deletion location:**
   - Settings → Account Actions → "Delete My Account"
   - Confirmation alert → confirms → data deleted from all Supabase tables → user signed out

5. **No login wall before value:** The calculator, learn tab, and projections are fully accessible without signing in (guest mode). Sign-up is required only for saving data and linking accounts.

---

## Pre-Submission Checklist

### Legal / Compliance
- [ ] Projection disclaimers visible on all calculator/dashboard projection outputs ("estimated", "projected")
- [ ] "Not financial advice, not a lender" footer in calculator and onboarding
- [ ] No SOC 2 or audit certifications claimed (none have been performed)
- [ ] No "HELOC Hero LLC" claimed until entity is formed
- [ ] Privacy policy URL live: helochero.com/privacy
- [ ] Terms of Service URL live: helochero.com/terms
- [ ] HELOC referral disclosures reviewed by attorney before any live lender links

### App Store Connect
- [ ] `heloc_pro_monthly` product created ($19.99/mo)
- [ ] `heloc_pro_annual` product created ($179/yr)
- [ ] 7-day introductory offer configured on both products
- [ ] Screenshot set uploaded for all required device sizes
- [ ] App preview video (optional but recommended)
- [ ] Age rating: 4+ (no objectionable content)
- [ ] Category: Finance (primary), Utilities (secondary)
- [ ] Support URL: helochero.com/help (or status page)

### RevenueCat
- [ ] iOS app created with bundle ID `com.jfoster2311.helochwero`
- [ ] Entitlement `pro` created and mapped to both products
- [ ] Default offering configured
- [ ] iOS key (`appl_...`) stored as `EXPO_PUBLIC_REVENUECAT_IOS_KEY` in EAS production environment

### Technical
- [ ] `npx tsc --noEmit` exits clean
- [ ] EAS production build submitted and passes internal testing
- [ ] Auto-lock (Face ID / passcode) tested on physical device
- [ ] Plaid Link tested on physical device (requires dev/prod build — not Expo Go)
- [ ] RevenueCat purchase + restore tested on physical device with StoreKit sandbox account
- [ ] Account deletion tested end-to-end (data removed from Supabase)
- [ ] Deep link to App Store subscriptions (`Manage Subscription`) tested
- [ ] Notification permission prompt tested. It is deliberately withheld until the user is on Pro AND has a surplus or a drawn balance, so a free account will correctly never see it. Verify the denied path too: deny once, then confirm Settings → Alerts shows "Notifications are off" with a working Open Settings link, since iOS will not present the prompt a second time.

### Demo Account
- [ ] Demo account `demo@helochero.com` created in Supabase
- [ ] Seeded with believable mid-strategy data (seed script at app/lib/seedDemo.ts)
- [ ] Demo credentials confirmed in App Review notes field

### Content
- [ ] All screenshots finalized with real app UI
- [ ] Captions reviewed — no guarantees, all projections labelled
- [ ] Promo text updated for launch (can change without new build)
- [ ] Keywords under 100 chars
- [ ] Description under 4,000 chars
