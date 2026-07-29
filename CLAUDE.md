# CLAUDE.md — HELOC Hero

Project manifest for Claude Code. Read this first, every session. When in doubt, follow this file over your defaults.

## What this app is
HELOC Hero is a React Native (Expo SDK 54) iOS app that helps homeowners pay off their mortgage years faster using the HELOC "cycling" strategy: use a HELOC to make large periodic principal payments ("dumps"), replenish with monthly surplus, repeat. Goal: a polished, App Store-ready, revenue-generating product. Pro tier unlocks live account syncing and automation.
- Expo slug: heloc-hero · Bundle ID: com.jfoster2311.helochwero
- Supabase project: lpsqrjwlleewckucdlhz · Apple Team: R7C7442ZTG
- Project root in repo: /workspaces/heloc-hero/app

## THE #1 RULE: commit after every meaningful change
This project lost a large body of uncommitted work in a branch switch. Never again.
- After each change that typechecks: git add + git commit with a clear message.
- Never switch branches, reset, or clean with uncommitted work you care about.
- Push to origin at the end of every session.
- Do not run two AI tools against the repo at once on overlapping files.

## Architecture (this branch)
State/logic lives in app/lib/: onboardingStore.ts, projections.ts (computeProjection, genericProjection, formatMonths), helocScore.ts (computeHelocScore, genericHelocScore), automation.ts, theme.ts (Colors, Typography, Spacing, Radius, Shadows, CommonStyles), supabase.ts, types.ts.
Screens are Expo Router files under app/app/: tabs/, auth/, onboarding/, modals/.
supabase.ts reads keys from Constants.expoConfig.extra FIRST, then process.env. Keys live in app.json -> extra (anon key is public/safe). NOTE: empty strings in extra shadow the env fallback because ?? does not catch "".
IMPORTANT: there is NO single Zustand appStore.ts on this branch. Do not import appStore or assume selectors like selectNetWorth/selectStreak. Adapt ported features to the modules that actually exist. Verify imports against real files before writing.

## Design system — monochrome green (via lib/theme.ts)
Use theme tokens, not hardcoded values — `lib/theme.ts` is the single source of truth and `lib/themeContext` (createThemedStyles/useTheme) is how screens read it. Do NOT hardcode hex or add a second palette file. Palette is monochrome green — NO red/amber/blue/purple. Negative numbers use muted grey (`gray500`), never red.
Do not quote hexes from this file — they drift. Read the tokens. Contrast is measured, not eyeballed: every text pairing clears WCAG AA (4.5:1, or 3:1 for large text and UI boundaries) in BOTH palettes, verified in both light and dark.
Three tokens exist because the obvious choice failed measurement, so prefer them:
- `accentInk` for accent TEXT and icons. `mint600` is a FILL — as ink it is 2.62:1 on a white card.
- `onAccent` for a label on a solid `mint600` fill. White there is 2.62:1 light / 2.02:1 dark.
- `borderField` for an INPUT's boundary. `border` is 1.23:1 and a field's fill is 1.06:1, so nothing would delineate the control. Card borders and dividers keep the soft `border`/`borderSubtle` — those are decorative and exempt.
`gray400` is decorative only (2.54:1): tab tint, switch thumbs, spinners, bar fills. Never text on a light surface.
NO emojis in UI — use Ionicons sized/colored from theme.
Quality bar: Apple HIG. Touch targets >=44pt, 8pt spacing, real loading/empty/error states, haptics on key interactions, safe-area correctness, smooth animations, accessibility labels.

## THE HONESTY RULE (critical — legal exposure)
Never display a claim the product cannot back up. This is finance; false claims are FTC/state-AG/App-Store-removal risk.
- NO "SOC 2 Type II Compliant", "annual third-party audits", or audit-report offers (no audit has been done).
- NO fake security features: no fake 2FA toggle, no fake "trusted devices", no fake "security audit log".
- NO "Anonymous Analytics" toggle unless an analytics SDK is actually integrated AND reflected in App Store privacy labels (currently none).
- NO data-export/retention promises ("within 24 hours", "logs retained 7 years") unless the pipeline exists.
- Security claims must be plain and true: "Encrypted in transit and at rest" is fine for Supabase; do not dress as a certification.
- Savings/payoff numbers are ALWAYS "projected/estimated", never "guaranteed". Keep disclaimer: not financial advice, not a lender.
- Do not claim "HELOC Hero LLC" unless the entity is formed.
If a feature is not built, hide the control or label it truthfully — never fake it. Auto-lock is the model: a REAL control (expo-local-authentication, locks after 15 min background) with an honest subtitle.

## Monetization rules
- Subscriptions MUST use Apple IAP (via RevenueCat), NOT Stripe-in-WebView (violates Guideline 3.1.1).
- Pro gating: lock Plaid/account-linking (live sync, dump detection, Smart Sweep, live net worth) behind Pro. Calculator, manual entry, cycle tracking, learn, projections stay FREE.
- Include "Restore Purchases" + App Store billing disclosure. "Manage Subscription" deep-links to App Store subscriptions.
- 7-day free trial (App Store Connect intro offer + RevenueCat).

## HELOC referral rules (future)
- Only recommend interest-only HELOCs with 10+ year draw period (required for cycling). Enforce with an isStrategyFit gate so a bad lender can never display.
- Disclose referrals honestly; get a fintech/lending attorney to review disclosures + licensing before enabling real referral links.

## Plaid cost discipline
- Balance = per-call; Liabilities = per-item monthly subscription. Throttle auto-refresh to ~once/12h (cache + lastSynced); allow manual refresh. Don't refresh on every mount.
- Plaid, RevenueCat, LocalAuthentication are NATIVE modules: dev/prod builds only, not Expo Go. Guard requires with try/catch.

## Build / run
- Metro: cd app && npx expo start --tunnel --clear
- Supabase keys in app.json -> extra.
- Native-module changes need a fresh EAS build: cd app && eas build --platform ios --profile development
- TypeScript clean before commit: cd app && npx tsc --noEmit (exit 0)
- Edge Functions deploy via Supabase dashboard (in-Codespace CLI hangs).

## Copy tone
Calm, confident, plain-English, premium. Lead with the user's number/benefit, label projections as estimates, never hype or guarantee.
