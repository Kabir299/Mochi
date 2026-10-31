# Next steps

Where the habit tracker stands and what's left, roughly in order. Last updated 2026-11-01.

## Done so far

- Expo (React Native + TypeScript) app for iPhone and Android, dark theme
- First-launch setup: habits wanted, body goal (+ optional weight), wake-up, prime time,
  work hours and pace → a timed starting plan (built on the phone, or "Personalise with AI"),
  plus calorie/protein/water goals and streak bar; redo it from Settings
- Habits: add, edit, archive, delete; icons; check off or count up with a − button
- Repeat: every day, some weekdays, or once; worth 1–3 points; start time (phone's clock picker) and duration
- Today: day picker, month calendar, day/week views, Structured-style timeline, time-spent bar
- Task menu (⋮): edit, note and mood, focus timer, move to next day, reorder, archive, delete
- Unfinished one-off tasks roll over ("Left over from earlier"); future check-offs ask first
- Daily % (weighted), configurable streak threshold and monthly freezes, freeze-used notice
- Pet with a name that grows with streaks (sprout, bow, crown), encouragement, confetti at 100%
- Reminders at each task's start time and an evening "streak at risk" nudge
- Focus timer that logs real time spent and checks the task off
- Habit templates (starter, morning, fitness, study, sleep, mindfulness)
- Progress: 7/30-day chart, trends, per-habit rates, insights, yearly heatmap, 10 badges, share
- Settings: streak rules, pet name, reminders, archived habits, export, delete all data
- AI (Pro, needs the server): analysis with goal tuning, coach chat, plan my day, brain dump
- Pro (test mode): water tracking, food tracking with calories and protein
- Everything saved on the phone (SQLite)
- Reminders: permission asked at the end of setup, pet-voiced messages, "5/10/15 min before"
  option, Sunday weekly recap (iPhone in Expo Go; Android needs the development build)
- First days: Easy pace by default, day-1 and day-3 streak cheers with confetti
- Pet wardrobe (tap the pet): 5 colours and accessories unlocked by best streak
- Share card: picture of the pet, streak and week, shared as an image
- Undo bar after every check-off
- Nutrition: fixed screens getting stuck on yesterday after midnight; 7-day calories chart
  and weekly protein; AI analysis and coach always get water/food goals and logs (Pro)
- AI server: optional APP_KEY check and per-address rate limit; Dockerfile and render.yaml
  for hosting; `eas.json` with development, preview and production builds
- Drafts: `PRIVACY.md` (privacy policy) and `STORE_LISTING.md` (name, keywords, description,
  screenshot plan)

## Waiting on you

- [x] **AI key** — done: Groq (fast, free) with Gemini as backup, both in `server/.env`.
      Claude is used instead if `ANTHROPIC_API_KEY` is added.
- [ ] **Test on a real phone** — Expo Go on iPhone and Android, same Wi-Fi as the PC, or run
      `npx expo start --tunnel` yourself to test from any network
- [ ] **Version control** — the project folder isn't a git repository yet; nothing is committed

## Needs your accounts (everything below that's code-only is done)

- [ ] **Expo account** (free, expo.dev) → `npx eas-cli@latest login`, then
      `npx eas-cli@latest build --profile development --platform android`. Unlocks Android
      reminders, the home-screen widget and the app blocker.
- [ ] **Render account** (free, render.com) + this project on GitHub → deploy `server/` with
      `render.yaml`, then put its URL in `EXPO_PUBLIC_AI_URL` and its APP_KEY in
      `EXPO_PUBLIC_APP_KEY` (an `.env` file in the app folder).
- [ ] **Supabase project** (free) → accounts, cloud sync, friends and accountability buddies.
- [ ] **Google Cloud OAuth client IDs** and an **Apple Developer account** → Google and Apple
      sign-in.
- [ ] **RevenueCat + store accounts** → real Pro purchases and the free trial.
- [ ] Fill in the bracketed parts of `PRIVACY.md` and host it (e.g. GitHub Pages).

## To build

### 1. Security
- [ ] App lock with Face ID / fingerprint (`expo-local-authentication`), optional in settings
- [x] Protect the AI server: app key header and rate limiting (CORS stays open: the app is
      a phone app, so the key is what keeps others out)

### 2. Accounts and sync
- [ ] Pick a backend: Supabase (recommended) or Firebase — needs an account from you
- [ ] Google sign-in (needs a Google Cloud project and OAuth client IDs from you);
      Sign in with Apple is required by the App Store if Google sign-in is offered on iPhone
- [ ] Cloud sync of habits, check-ins, notes, water and food so data follows the login
- [ ] Accountability buddy: share streaks with a friend and nudge each other (needs accounts)
- [ ] Encrypted backup / import

### 3. Hosting the AI server
- [ ] Deploy `server/` online (e.g. Cloudflare Workers, Railway, Fly.io)
- [ ] Set `EXPO_PUBLIC_AI_URL` in the app to the hosted address
- [ ] Use HTTPS (needed for real iPhone builds)

### 4. Development build
- [ ] Switch from Expo Go to a development build (`eas build --profile development`)
- [ ] Home-screen widget: today's % and the next task (needs the development build)
- [ ] Block distracting apps during focus mode, choosing which apps when starting a session
      - iPhone: Screen Time API (FamilyControls / ManagedSettings); Apple must approve the
        Family Controls entitlement for the developer account first
      - Android: usage-access or accessibility service with an overlay; check Google Play's
        policy on accessibility use before building

## Next session: Android app blocker (agreed plan)

Build this first. Android only; it needs a development build, so Expo Go stops being used.

- **Approach:** usage access + overlay, not an accessibility service (easier on Google Play).
  - Local Expo module in `modules/app-blocker` (Kotlin, Expo Modules API) plus a config plugin
    for the manifest.
  - Permissions: `PACKAGE_USAGE_STATS` (usage access), `SYSTEM_ALERT_WINDOW` (display over other
    apps), `FOREGROUND_SERVICE` (+ the matching foreground service type), `POST_NOTIFICATIONS`.
  - List launchable apps via a `<queries>` MAIN/LAUNCHER intent, not `QUERY_ALL_PACKAGES`.
  - A foreground service polls `UsageStatsManager` about once a second during a session; when a
    blocked app is in front, draw a full-screen overlay ("Stay focused · N min left", button back
    to the app). An ongoing notification shows the session is active.
  - JS API: list apps, check/open the two permission settings, start/stop a session with an end
    time and the blocked package names.
- **App side:** in the focus timer (`src/app/focus.tsx`), a "Block apps" picker (remember the
  last choice in settings), a permission walkthrough, start/stop blocking with the timer, and
  stop on finish/close.
- **Builds:** `eas.json` with a `development` profile (APK, internal distribution), then
  `npx eas-cli@latest build --profile development --platform android`. Afterwards run
  `npx expo start --dev-client` instead of Expo Go.
- **Needs from the user:** a free Expo account (expo.dev) and a one-time `npx eas-cli@latest login`
  in the terminal; allowing "install unknown apps" on the phone to install the APK.
- **Also free today without code:** Android Digital Wellbeing → Focus mode.

### 5. Pro purchases
- [ ] Replace the test "Unlock Pro" switch with real in-app purchases (RevenueCat recommended)
- [ ] Decide price and what's free vs Pro

### 6. Polish
- [ ] Drag to reorder and reschedule on the timeline (today: ⋮ → Move up / Move down)
- [ ] App icon and splash screen
- [ ] Light theme option

### 7. Release
- [ ] Apple Developer account ($99/year) and Google Play account ($25 one-time)
- [ ] Production builds with EAS (`npx eas-cli@latest build`), no Mac needed
- [ ] TestFlight / Play internal testing, then store listings and screenshots
- [ ] Privacy policy (required by both stores, especially with AI and accounts)

## More ideas

- [ ] Morning plan and evening review prompts
- [ ] Skip a day on purpose (sick, travel) without using a freeze
- [ ] Undo toast after deleting or checking something by mistake
- [ ] Weekly recap card every Sunday
- [ ] Photo food logging: snap a meal, Claude estimates calories and protein
- [ ] Apple Health / Google Health Connect: auto-complete step and sleep habits
- [ ] Calendar sync: show meetings on the timeline
- [ ] Automated tests for streaks, freezes and daily %
- [ ] Onboarding: 3 short screens explaining streaks, freezes and worth

## Known limits right now

- AI features only work when the phone is on the same Wi-Fi as the PC running the server
- Reminders only work in the phone app, not the browser preview
- In the browser preview the app can only be open in one tab at a time (phones are unaffected)
- Pro is unlocked for free in test mode
