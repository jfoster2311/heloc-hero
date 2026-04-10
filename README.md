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
│   ├── automation.ts            # Safe Sweep™ / Safe Dump™
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
│       ├── heloc-score/         # Server-side score (Medium+)
│       ├── safe-sweep/          # Automation (Full tier)
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
supabase functions deploy safe-sweep
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

### Safe Sweep™
```
sweepAmount = availableSavings - bufferTarget - upcomingBills
```

### Safe Dump™
```
dumpAmount = accumulated >= minDump ? min(accumulated, helocAvailableCredit) : 0
```

---

## Tier Features

| Feature | Free | Medium ($14.99) | Full ($50) |
|---|---|---|---|
| Calculator | ✅ | ✅ | ✅ |
| Plaid linking | ❌ | ✅ | ✅ |
| HELOC Hero Score™ | Generic | Personalized | Personalized |
| Projections | Generic | Real data | Real data |
| Safe Sweep™ | ❌ | ❌ | ✅ |
| Safe Dump™ | ❌ | ❌ | ✅ |
| Realtime sync | ❌ | ❌ | ✅ |
| Push alerts | ❌ | ❌ | ✅ |
