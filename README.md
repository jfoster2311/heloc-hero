# HELOC Hero — Expo + Supabase MVP

A production-ready React Native app for the Apple App Store.
Built with Expo, Supabase, Plaid, and Stripe.

---

## Project Structure

```
heloc-hero/
├── app/
│   ├── _layout.tsx              # Root — handles auth routing
│   ├── auth/
│   │   ├── login.tsx
│   │   └── signup.tsx
│   ├── onboarding/
│   │   ├── welcome.tsx          # Step 1: value prop
│   │   ├── home-info.tsx        # Step 2: mortgage details
│   │   ├── income.tsx           # Step 3: income/expenses
│   │   ├── heloc-info.tsx       # Step 4: HELOC details
│   │   └── credit-score.tsx     # Step 5: credit score
│   ├── tabs/
│   │   ├── _layout.tsx          # Bottom tab bar
│   │   ├── dashboard.tsx        # Main overview
│   │   ├── accounts.tsx         # Linked accounts
│   │   ├── calculator.tsx       # Interactive calculator
│   │   ├── cashflow.tsx         # Income/expense trends
│   │   └── learn.tsx            # Educational content
│   └── modals/
│       ├── upgrade.tsx          # Subscription upgrade
│       └── link-account.tsx     # Plaid link flow
├── lib/
│   ├── supabase.ts              # Supabase client
│   ├── types.ts                 # All TypeScript types
│   ├── helocScore.ts            # HELOC Hero Score™ algorithm
│   ├── projections.ts           # Payoff projection engine
│   ├── automation.ts            # Safe Sweep™ / Safe Dump™ sizing (advisory only)
│   └── theme.ts                 # Colors, typography, spacing
├── hooks/
│   ├── useAuth.ts               # Auth + user profile
│   └── useAccounts.ts           # Plaid accounts (realtime)
├── components/
│   ├── ui/                      # Reusable UI components
│   └── charts/                  # Recharts/Victory wrappers
├── supabase/
│   ├── migrations/
│   │   └── 001_initial_schema.sql
│   └── functions/
│       ├── _shared/             # cors.ts, supabase.ts, plaid.ts, notifications.ts
│       ├── plaid-webhook/       # Receives Plaid webhooks
│       ├── plaid-create-link-token/
│       ├── plaid-exchange-token/
│       ├── plaid-get-accounts/
│       ├── heloc-score/         # Server-side score (Pro)
│       ├── stripe-checkout/     # Subscription checkout
│       └── send-notification/   # Push notifications
├── app.json
├── eas.json
└── package.json
```

---

## Quick Start

### Prerequisites
- Node.js 18+
- [Expo CLI](https://docs.expo.dev/get-started/installation/): `npm install -g expo-cli`
- [EAS CLI](https://docs.expo.dev/eas/): `npm install -g eas-cli`
- Xcode (for iOS simulator)
- Supabase project
- Plaid developer account
- Stripe account

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
# Fill in your Supabase URL, anon key, and Stripe price IDs
```

### 3. Run the database migration
Go to Supabase Dashboard → SQL Editor → paste `supabase/migrations/001_initial_schema.sql` → Run.

### 4. Add Supabase Edge Function secrets
Dashboard → Project Settings → Edge Functions → Secrets:
- `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV`
- `PLAID_WEBHOOK_URL`
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_MEDIUM`, `STRIPE_PRICE_FULL`
- `FIREBASE_SERVER_KEY`
- `SAVINGS_THRESHOLD`, `EQUITY_THRESHOLD`

### 5. Deploy Edge Functions
```bash
supabase functions deploy plaid-webhook --no-verify-jwt
supabase functions deploy plaid-create-link-token
supabase functions deploy plaid-exchange-token
supabase functions deploy plaid-get-accounts
supabase functions deploy heloc-score
supabase functions deploy stripe-checkout
supabase functions deploy send-notification
```

### 6. Start development
```bash
npx expo start
# Press 'i' for iOS simulator
```

---

## Building for App Store

### First time setup
```bash
eas login
eas build:configure
```

### Create a production build
```bash
eas build --platform ios --profile production
```

### Submit to App Store
```bash
eas submit --platform ios
```

---

## Key Algorithms

### HELOC Hero Score™
- **Surplus (55%)**: Monthly income minus expenses as % of income
- **Utilization (25%)**: HELOC balance / limit (lower = better)
- **Credit Score (20%)**: Normalized 580–800 range
- **MTE Modifier (±10%)**: Mortgage-to-equity ratio bonus/penalty

### Safe Sweep™ / Safe Dump™

Both are SIZING CALCULATIONS, not actions. HELOC Hero has no payment rail and
moves no money: it works out the amount, the user makes the transfer at their
own bank, and the app records it. Any copy, function or feature that implies
otherwise is a bug — see THE HONESTY RULE in CLAUDE.md.

```
sweepAmount = availableSavings - bufferTarget - upcomingBills
dumpAmount  = accumulated >= minDump ? min(accumulated, helocAvailableCredit) : 0
```

`bufferTarget` and `upcomingBills` are user-editable in Settings → Alerts →
What to leave behind, because they define what the app is willing to call spare.

---

## Tier Features

Two tiers, Free and Pro, sold through Apple IAP via RevenueCat. The Medium/Full
split below was a Stripe-era design and is gone; `isPaidTier` still maps the
legacy `medium`/`full` values onto Pro so old rows keep working.

| Feature | Free | Pro |
|---|---|---|
| Calculator, manual entry, cycle tracking, learn | ✅ | ✅ |
| Projections | Generic | Your own figures |
| HELOC Hero Score™ | Generic | Personalized |
| Plaid linking + live balances | ❌ | ✅ |
| Servicer-reported mortgage terms | ❌ | ✅ |
| Transaction-derived cash flow | ❌ | ✅ |
| Safe Sweep™ / Safe Dump™ sizing | ❌ | ✅ |
| Cycle reminders (local, on-device) | ❌ | ✅ |
