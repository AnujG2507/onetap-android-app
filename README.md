# OneTap Shortcuts

**"One tap to what matters. Nothing else."**

OneTap is a paid Android app that creates home screen shortcuts for instant access to URLs, contacts, files, PDFs, videos, and scheduled reminders. It is local-first — all data lives on the user's device, and cloud sync is entirely optional. There are no ads, no subscriptions, and no tracking.

> **This project does not depend on Lovable Cloud.** Lovable is used only as a code editing assistant. The production stack is: **Android app + Supabase backend + Vercel website**. There is no platform lock-in.

---

## What Problem Does This Solve?

Android users frequently access the same URLs, contacts, and files. OneTap lets them create a single icon on their home screen that opens any of these in one tap — no searching, no navigating, no waiting.

---

## How Everything Fits Together (High-Level)

```
┌─────────────────────────────────────────────────────┐
│                   User's Phone                       │
│                                                      │
│  ┌──────────────┐    ┌───────────────────────────┐  │
│  │ Home Screen  │───▶│  OneTap App (React + Java) │  │
│  │  Shortcuts   │    │                            │  │
│  └──────────────┘    │  ┌─────────────────────┐   │  │
│                      │  │  localStorage       │   │  │
│                      │  │  (ALL user data)    │   │  │
│                      │  └─────────────────────┘   │  │
│                      └────────────┬───────────────┘  │
│                                   │ (optional)       │
└───────────────────────────────────┼──────────────────┘
                                    │
                          ┌─────────▼─────────┐
                          │    Supabase        │
                          │                    │
                          │  • Cloud Sync      │
                          │  • Google Sign-In  │
                          │  • URL Metadata    │
                          └────────────────────┘

┌───────────────────────────────────────────────────────┐
│              Vercel (onetapapp.in)                      │
│                                                        │
│  • Marketing website                                   │
│  • Privacy policy hosting                              │
│  • assetlinks.json for OAuth deep links                │
└───────────────────────────────────────────────────────┘
```

**Key insight:** The cloud is optional. The app works perfectly without internet, without sign-in, and without the cloud. If the cloud disappeared tomorrow, users would lose nothing.

---

## What This Repository Contains

| Folder / File | What It Is |
|---------------|-----------|
| `src/` | The React web app (UI, hooks, business logic) |
| `native/android/` | Custom Java code for Android-specific features |
| `android/` | ⚠️ **Generated** by Capacitor — never edit this directly |
| `supabase/` | Cloud backend: database migrations and serverless functions |
| `scripts/android/` | Build automation scripts |
| `.github/workflows/` | CI/CD pipeline for automated builds |
| `public/` | Static files (privacy policy, favicon, domain verification) |

## What This Repository Does NOT Contain

- No iOS project (Android only)
- No separate backend server (Supabase handles everything)
- No staging environment (single backend for test and production)
- No analytics or tracking code
- No ad SDKs

---

## ⚠️ Do Not Touch (Unless You Fully Understand the Consequences)

These files are critical to production. Changing them incorrectly can break the app, lock you out of signing, or cause Play Store rejections.

| File / Area | Why It's Dangerous |
|---|---|
| `android/` folder | **Generated** — gets overwritten by build scripts. Edit `native/android/` instead. |
| `src/lib/supabaseClient.ts` | Custom Supabase client with hardcoded external project credentials. Do not change unless switching Supabase projects. |
| `src/lib/supabaseTypes.ts` | Database type definitions (manually maintained). Must match your Supabase schema. |
| `.env` | System-managed by Lovable Cloud. Not used by the app — the custom client bypasses it. |
| `supabase/config.toml` | Supabase configuration. |
| `public/.well-known/assetlinks.json` | Controls OAuth deep links. Wrong fingerprint = sign-in breaks. |
| Release keystore (`.jks` file) | **If you lose this, you cannot update the app on Play Store. Ever.** |
| GitHub Secrets | Contain signing keys and Play Store credentials. Wrong values = broken CI. |

## ✅ Safe Things to Modify

These are safe to change during normal development:

| Area | What You Can Do |
|---|---|
| `src/components/` | Add or edit UI components |
| `src/hooks/` | Add or edit React hooks |
| `src/lib/` | Add or edit business logic |
| `src/pages/` | Add or edit page-level components |
| `native/android/app/src/` | Edit native Java code (gets copied to `android/` by build script) |
| `src/i18n/locales/` | Edit translations |
| `whatsnew/en-US.txt` | Edit Play Store release notes |
| `index.html` | Edit HTML metadata |
| `tailwind.config.ts` | Edit design tokens |
| `src/index.css` | Edit global styles |

---

## How Deployment Works (10,000-Foot View)

```
1. You write code in src/ or native/android/
2. You push to main branch
3. When ready to release, you tag a version: git tag v1.2.3
4. GitHub Actions automatically builds a signed app bundle
5. The bundle is uploaded to Google Play's internal test track
6. You manually test it on a physical Android device
7. You manually promote it to production
```

**The key principle:** CI builds automatically, but releasing to real users always requires a human decision.

### Testing Philosophy

All app testing happens on **real Android devices only**. There are no web previews, no emulator-only testing workflows, and no cloud preview environments. Debug builds are tested via USB, and release builds are tested via Google Play's internal track.

---

## Documentation Guide

Read these documents in this order when you're getting started:

| # | Document | Read When... |
|---|----------|-------------|
| 1 | [PRODUCT_IDEOLOGY.md](PRODUCT_IDEOLOGY.md) | You want to understand **why** things are built this way |
| 2 | [ARCHITECTURE.md](ARCHITECTURE.md) | You want to understand **how** things fit together |
| 3 | [SUPABASE.md](SUPABASE.md) | You need to touch the backend (database, auth, edge functions) |
| 4 | [ANDROID_SETUP.md](ANDROID_SETUP.md) | You're setting up local Android development |
| 5 | [DEPLOYMENT.md](DEPLOYMENT.md) | You want to understand the build pipeline |
| 6 | [RELEASE_PROCESS.md](RELEASE_PROCESS.md) | You're shipping an update |
| 7 | [PLAY_STORE_CHECKLIST.md](PLAY_STORE_CHECKLIST.md) | You're submitting to Google Play |
| 8 | [APP_SUMMARY.md](APP_SUMMARY.md) | Quick reference for data models and file locations |

---

## Quick Start (Local Development)

```bash
# 1. Clone the repository
git clone <repo-url>
cd onetap-app

# 2. Install dependencies
npm install

# 3. Run on Android device (requires JDK 21 + Android Studio)
node scripts/android/clean-rebuild-android.mjs --run
```

See [ANDROID_SETUP.md](ANDROID_SETUP.md) for detailed setup instructions.

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| UI | React 18 + TypeScript | Modern, well-supported component framework |
| Build | Vite | Fast builds and hot reload |
| Styling | Tailwind CSS + shadcn/ui | Consistent design system |
| Native Bridge | Capacitor 8 | Wraps web app in native Android shell |
| Native Code | Java (Android) | Home screen shortcuts, notifications, PDF/video viewers |
| Backend | Supabase | Cloud sync and auth (self-hosted or managed) |
| Auth | Google OAuth via Supabase | Simple, trusted sign-in |
| CI/CD | GitHub Actions | Automated builds, manual releases |
| Website | Vercel | Marketing site and domain verification |

---

## Core Principles

1. **Local-first:** All data on device. Cloud is optional and additive-only.
2. **Calm UX:** No intrusive notifications, no "Are you sure?" dialogs, no anxiety.
3. **Resource-respectful:** No background services, no polling, no analytics, no tracking.
4. **Paid upfront:** One-time purchase. No ads, no subscriptions, no in-app purchases.
5. **Human intent required:** CI builds code, but humans decide when to release.
6. **No platform lock-in:** Lovable is a code editor, not infrastructure.

See [PRODUCT_IDEOLOGY.md](PRODUCT_IDEOLOGY.md) for the full philosophy.

---

## Repository Rules

- `main` branch is always production-ready
- All development happens in `feature/*` branches
- Tag-based releases trigger CI builds (e.g., `v1.0.0`)
- Human review required before merging and releasing
- All testing on physical Android devices

---

*A product by a solo entrepreneur. Built to last.*
