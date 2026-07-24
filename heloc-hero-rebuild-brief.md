# HELOC Hero — Rebuild Brief (for Claude Code)

Context: a prior chat session produced work that was never committed and was lost in a branch switch. This brief reconstructs WHAT to rebuild and in what order, on the CURRENT branch, adapting to its real architecture (projections.ts / helocScore.ts / theme.ts / onboardingStore.ts — there is NO appStore.ts; do not assume one).

Read CLAUDE.md first. Commit after EVERY item. Run npx tsc --noEmit before each commit. Work top to bottom (ordered by value + dependency).

## 0. Ground yourself first
- git status clean? If not, commit or stash.
- Read app/lib/theme.ts, projections.ts, helocScore.ts, onboardingStore.ts, supabase.ts, types.ts and the screens under app/app/tabs|auth|onboarding|modals.
- Confirm the directory layout (this branch nests as app/app/...). Put new files where siblings live.
- Map how screens read state/projections so ported features use real modules, not invented imports.

## 1. App Store submission package (no code — do first, zero risk)
Create docs/app-store-submission.md: app name/subtitle options, description (savings framed as PROJECTED not guaranteed), keywords (100-char), promo text, privacy nutrition labels (collects email, Plaid financial data, user IDs; NO tracking, NO analytics SDK), screenshot plan (6 story screens + captions), App Review notes (demo account, Plaid sandbox creds user_good/pass_good, how to reach Pro, account-deletion location), pre-submission checklist. Commit.

## 2. Honesty cleanup (HIGH — legal exposure)
In settings (and anywhere they appear): remove SOC 2 badge + "SOC 2 Report" rows + all "per SOC 2" text; remove fake 2FA toggle, hardcoded "Trusted Devices", "Security Audit Log"; remove "Anonymous Analytics" toggle (no SDK, contradicts privacy labels); fix "Export My Data" (no 24h SLA) and "Data Retention" (no "indefinitely / 7-year logs"); replace cert-style line with plain "Encrypted in transit and at rest"; copyright year 2026; only claim "HELOC Hero LLC" if formed; remove "coming soon" dead-ends / empty onPress rows. Replace SOC 2 badge with honest "Security & Privacy" card (encrypted in transit/at rest, data never sold, deletion honored). Commit.

## 3. Apple IAP migration (HIGH — #1 rejection risk)
- npx expo install react-native-purchases (do NOT add to app.json plugins; it autolinks).
- app/lib/purchases.ts: safe-guarded RevenueCat wrapper — initPurchases, identifyPurchaser, isProActive, getOfferings, purchasePackage, restorePurchases, purchasesAvailable. Entitlement id "pro". Reads EXPO_PUBLIC_REVENUECAT_IOS_KEY.
- app/hooks/useIsPro.ts: reactive {isPro, loading, refresh}; rechecks on AppState active; falls back false when module unavailable.
- Rewrite upgrade screen to native IAP (offerings -> purchase -> success), add Restore control + App Store auto-renew billing disclosure, fallback static prices. Keep value framing.
- Wire initPurchases/identifyPurchaser into root layout on session load + auth change.
- Gate Plaid account-linking behind useIsPro (free users -> upgrade).
- "Manage Subscription" deep-links to https://apps.apple.com/account/subscriptions
Commit each sub-step.

## 4. Real account deletion (Apple 5.1.1(v))
- Supabase Edge Function delete-account (service-role key, resolve user from JWT, delete rows from plaid_items/user_profiles/cycles/subscriptions, then admin.auth.admin.deleteUser). Uses corsHeaders from _shared/cors.ts.
- Wire Settings Delete My Account -> confirm -> POST w/ session token -> clear local state -> sign out -> login.
- Deploy via Supabase dashboard. Commit.

## 5. Real auto-lock (model for honest features)
- npx expo install expo-local-authentication.
- app/lib/appLock.ts: persist enabled flag, deviceSupportsLock, isLockEnabled, setLockEnabled (refuses if no biometrics/passcode), authenticate, shouldLock, 15-min threshold.
- app/components/LockGate.tsx: wraps app in root layout; AppState background timestamp; on return if enabled + stale show branded lock overlay requiring Face ID/passcode.
- Settings Auto Lock toggle reads/writes real setting; honest subtitle. Commit.

## 6. Conversion-optimized onboarding (reveal)
- Rebuild reveal CTA: primary "Start 7 days free" (-> upgrade), secondary "Continue with the free version", risk-reversal line under button, share moved BELOW CTA, consistent pricing ($179/yr · $19.99/mo). Persist answers on BOTH paths before navigating.
- Add "Not a budgeting app" card (reveal short; upgrade fuller — names Mint/YNAB, passive tracking vs active payoff strategy, 3 things only a strategy engine does: exact dump amount, cycle timing, live payoff curve).
- Replace emojis with Ionicons. Commit.

## 7. No-HELOC referral journey
- Capture + PERSIST helocStatus (have_one/no_heloc/not_sure).
- app/lib/lenders.ts: typed Lender + LENDERS array (empty now) + isStrategyFit() (interest-only AND 10+ yr draw) + eligibleLenders(). Hard filter.
- app/app/modals/get-heloc.tsx: guide — two non-negotiables (interest-only, 10+ yr draw) with WHY, qualifying basics, what to avoid, lender list from eligibleLenders() (Partner tag + disclosure when populated, "coming soon" empty state otherwise).
- Reveal no-HELOC card -> taps through to guide.
- Adapt dashboard milestones so no-HELOC users see "Open your HELOC" (tappable -> guide) as active first step, not impossible "First dump". Commit each.

## 8. Retention + cost
- Streak: derive consecutive-month cycling streak from dump history; quiet status strip (green Ionicon flame), resets after >1mo gap.
- Notification priming: value-first sheet before iOS prompt; fire real prompt only on Enable; persist; show once after first dashboard load. Fix push projectId to read Constants.expoConfig.extra.eas.projectId.
- Plaid throttle: cache + auto-refresh only if lastSynced > 12h; keep manual refresh. Commit each.

## 9. Demo seed (screenshots + review)
- app/lib/seedDemo.ts: populate a believable mid-strategy scenario THROUGH real setters/modules. Hidden trigger (long-press Settings version footer) -> Load demo / Clear all. Commit.

## 10. Final pass
- npx tsc --noEmit clean. Remove leftover emojis app-wide. Verify no off-palette colors. Push to origin. Then fresh EAS build to test IAP + Plaid + auto-lock + icon on device.

## Ops checklist (human — not code)
- [ ] Live legal URLs: helochero.com/privacy, /terms, /help, status.helochero.com
- [ ] App Store Connect: heloc_pro_monthly ($19.99) + heloc_pro_annual ($179) + 7-day intro offer
- [ ] RevenueCat: iOS app (com.jfoster2311.helochwero), entitlement pro, offering default, copy iOS key (appl_...) into EXPO_PUBLIC_REVENUECAT_IOS_KEY (EAS prod env)
- [ ] Deploy delete-account via Supabase dashboard
- [ ] Demo account for App Review; paste creds into review notes
- [ ] Attorney review of HELOC referral disclosures before real links
- [ ] Form the LLC before claiming it in-app
