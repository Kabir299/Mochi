# Privacy Policy

_Draft. Last updated 1 November 2026. Fill in the bracketed parts and host it at a public URL
(both app stores require one) before release._

Mochi: Habit Tracker & Planner ("the app") is made by [your name or company]. This policy explains what the app
does with your information.

## What stays on your phone

Your habits, check-ins, notes, moods, focus time, water, food and gym logs, setup answers (goals,
wake-up time, pace), body goal and weight if given, and settings are stored only on your
device, in an encrypted database whose key is kept in your phone's secure storage. We don't
have a copy. Deleting the app, or using Settings → Delete all data, removes them.

Settings → Save a backup creates a file with this data that you keep wherever you choose
(for example Google Drive, iCloud or a chat with yourself) to restore on a new phone. The
file is not encrypted and is never sent to us.

## What is sent when you use AI features

AI features (setup plan, analysis, coach, plan my day, food estimates) only run
when you tap them. The app then sends a summary to our AI server: habit names, completion
percentages, streaks, the text you typed, your setup answers and, if you log them, daily
water, calorie and protein totals. It does not send your name, contacts, location or device
identifiers.

Our server passes that summary to an AI provider (currently Groq, with Google Gemini as a
backup) to produce the answer, and then forgets it. We don't store these
requests or use them for advertising. The providers process them under their own API terms,
which do not allow training on API data by default. To stop abuse, the server briefly keeps
a count of requests per IP address in memory; it is not written to disk.

## Account and sync (optional)

You can use Mochi without an account. If you choose to sign in with Google, we receive your name
and email address from Google, and a copy of your habits, check-ins, notes, water, food and gym logs
and settings is saved to our database provider (Supabase) so the same data appears on every device
you sign in to. This copy is protected so only your account can reach it, but unlike buddy updates
it is not end-to-end encrypted. Signing out stops syncing and leaves the data on your device.
Settings → Delete account removes your account and the saved copy for good.

## Buddies

Buddies are something you choose to set up, and nothing is sent until you do. When you link with a
friend, you choose what they see: your name, overall progress and streak for the last week, plus
the names, rates and streaks of all your repeating habits or only the ones you pick. You can change
this for each friend at any time.

These updates are encrypted on your phone before they leave it and stored on our database provider
(Supabase) until your friend's phone collects them. Only the latest update is kept. The key is in
the invite you send your friend and is never sent to us, so we can't read them. We do store a
random ID for your phone (only its hash), which phones are linked, and when an update was sent, and
as with any internet service the provider can see your IP address when your phone connects.

Removing a buddy deletes the link and both people's stored updates at once. If you are offline,
this happens the next time you connect. Delete all data does the same for all your buddies when you
have a connection. Anything left behind is deleted after 6 months without use. A backup file
includes your buddy links and their keys, so keep it somewhere private.

The AI buddy is worked out on your phone from your own history, and nothing about it is sent
anywhere.

## Purchases

Mochi Pro is bought through the App Store or Google Play; we never see your card details.
To confirm your subscription, RevenueCat (our purchase service) receives an anonymous app ID
and your store purchase receipts. It is not linked to your name or email.

## App lock

App lock is on by default on phones with a screen lock, and you can turn it off in Settings. Your phone checks your fingerprint, face or PIN itself. The app only
learns "unlocked" or "not unlocked" and never sees or stores the biometric data.

## Notifications

Reminders are scheduled on your phone. Nothing about them is sent to us.

## Things the app does not do

- No ads, analytics or tracking SDKs, and no account unless you choose to sign in
- No selling or sharing of data with anyone except the AI provider, RevenueCat and Supabase, as above
- Not intended for children under 13

## Changes and contact

If this policy changes, the new version will be posted here with a new date. Questions:
[contact email].
