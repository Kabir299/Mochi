# Plan: from "runs on my PC" to "anyone can download it"

Today the app runs in Expo Go and the AI server runs on your PC, so it only works for you on your
Wi-Fi. These are the steps to make it work for everyone, in order. Each step says who does
it: **You** (needs your account, money or a click) or **Claude** (code, in a session).

Rough total: 2–3 sessions of work, ~$124 in store fees, and $0/month to start.

## Done (1 Nov 2026)

- Git repository with a first commit; `.env` files are ignored.
- App identity: name **Mochi**, bundle ID / package `com.mochihabits.app`, version 1.0.0.
- App icon, Android adaptive + monochrome icon, splash screen, notification icon.
- `eas.json` production profile (Play app bundle, iOS auto build numbers, submit to Play internal track).
- Store builds unlock every Pro feature for free (no fake purchase screen for reviewers);
  set `FREE_LAUNCH` in `src/state/settings.tsx` to false once real purchases exist.
- Privacy page ready to host: `docs/index.html` (GitHub Pages → "Deploy from branch", folder
  `/docs`). Fill in your name and contact email first, then set
  `EXPO_PUBLIC_PRIVACY_URL` so Settings shows a Privacy policy link.
- expo-doctor: 20/20 checks pass; production bundle exports cleanly.

For store builds, set the AI address as EAS environment variables (not in a file):
`npx eas-cli@latest env:create --name EXPO_PUBLIC_AI_URL --value https://<your-app>.onrender.com`
and the same for `EXPO_PUBLIC_APP_KEY` and `EXPO_PUBLIC_PRIVACY_URL`.

---

## Phase 1 — Put the code somewhere safe (15 min)

1. **Claude:** `git init`, a `.gitignore` that keeps `server/.env` out, first commit.
2. **You:** create a free GitHub account and a **private** repository; Claude pushes to it.

Why first: every host below deploys from GitHub, and it's your backup.

## Phase 2 — Host the AI server (30 min, free)

1. **You:** sign up at render.com with GitHub → New → Blueprint → pick the repo. It reads
   `server/render.yaml` (already written).
2. **You:** in Render, paste `GROQ_API_KEY` and `GEMINI_API_KEY`. `APP_KEY` is generated.
3. **Claude:** create `habit-tracker/.env` with
   `EXPO_PUBLIC_AI_URL=https://<your-app>.onrender.com` and `EXPO_PUBLIC_APP_KEY=<APP_KEY>`,
   then test every AI feature against the hosted server.

Notes:
- Render's free tier sleeps after 15 minutes idle; the first AI request then takes ~30 s.
  Upgrade ($7/month) or move to Fly.io/Railway once you have real users.
- Already done: per-user rate limit (40 requests / 10 min) and the app key check.
- Later, with accounts: limit AI per signed-in user and per plan (free vs Pro) instead of per IP.

## Phase 3 — Real app builds (1 session)

1. **You:** free account at expo.dev, then in the terminal: `npx eas-cli@latest login`.
2. **Claude:** final app identity in `app.json`: name, `ios.bundleIdentifier` and
   `android.package` (e.g. `com.yourname.mochi`), version, permissions text for
   notifications.
3. **Claude:** app icon and splash screen (pet on the dark background).
4. **Claude:** `npx eas-cli@latest build --profile development --platform android` → an APK
   you install on your phone. From then on use `npx expo start --dev-client`.
   This unlocks on Android: reminders, the home-screen widget, the app blocker.
5. **Claude:** build the widget and the app blocker (planned in `NEXT_STEPS.md`).

## Phase 4 — Accounts and sync (1–2 sessions, free tier)

1. **You:** create a Supabase project; give Claude the project URL and *anon* key (safe in apps).
2. **You:** Google Cloud OAuth client IDs (Android + iOS + web) and, for iPhone, an Apple
   Developer account (Sign in with Apple is required if Google sign-in is offered).
3. **Claude:** sign-in screens, cloud sync of habits/logs/nutrition (local-first: works
   offline, syncs when online), account deletion (both stores require it).
4. **Claude:** friends: invite link, see each other's streaks, send a nudge.

## Phase 5 — Get paid (1 session)

1. **You:** RevenueCat account (free until $2.5k/month revenue), connect both stores.
2. **Claude:** replace the test "Unlock Pro" switch with real purchases, a 7-day trial shown
   after setup, and "Restore purchases".
3. **You:** pick prices (suggested: ₹129/month, ₹799/year in India; $3.99 / $24.99 elsewhere).

## Phase 6 — Store release

1. **You:** Google Play Console ($25 one-time) and Apple Developer Program ($99/year).
2. **You:** host `PRIVACY.md` publicly (GitHub Pages is free) after filling in the brackets.
3. **Claude:** `npx eas-cli@latest build --profile production` for both platforms, then
   `npx eas-cli@latest submit`.
4. **You + Claude:** screenshots and text from `STORE_LISTING.md`; Play "internal testing" and
   iPhone TestFlight with 5–10 friends for a week; fix what they find; then public release.
5. **Claude:** crash reporting (Sentry, free tier) and `eas update` for quick fixes without a
   new store review.

---

## What it costs to run

| Item | Cost |
| --- | --- |
| Google Play account | $25 once |
| Apple Developer | $99 / year |
| Render (AI server) | $0, or $7/month to avoid cold starts |
| Groq / Gemini AI | $0 on free tiers; roughly $1–5/month per 1,000 active users after |
| Supabase, RevenueCat, Expo builds, Sentry | $0 on free tiers to start |

## Checklist before going public

- [ ] AI server on HTTPS with APP_KEY set; app points to it
- [ ] Notifications tested on a real Android build and an iPhone
- [ ] Data survives app updates (migrations tested on an old database)
- [ ] Account deletion and data export work
- [ ] Privacy policy URL live; store privacy labels filled in
- [ ] App icon, splash, screenshots, store text
- [ ] 1 week of friends testing with no crashes
