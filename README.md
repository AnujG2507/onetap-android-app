# OneTap Shortcuts

**"One tap to what matters. Nothing else."**

A paid Android app that creates home screen shortcuts for instant access to URLs, contacts, files, PDFs, videos, and scheduled reminders. Local-first, calm, and privacy-respecting.

---

## Documentation

| Document | Purpose |
|----------|---------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Technical architecture, stack, project structure |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Build pipeline, CI/CD, environments |
| [RELEASE_PROCESS.md](RELEASE_PROCESS.md) | How to ship updates safely |
| [SUPABASE.md](SUPABASE.md) | Backend schema, edge functions, auth |
| [PRODUCT_IDEOLOGY.md](PRODUCT_IDEOLOGY.md) | Core principles and constraints |
| [APP_SUMMARY.md](APP_SUMMARY.md) | Comprehensive app summary and data model |
| [ANDROID_SETUP.md](ANDROID_SETUP.md) | Local Android development setup |
| [UBUNTU_SETUP.md](UBUNTU_SETUP.md) | Ubuntu VM setup guide |
| [PLAY_STORE_CHECKLIST.md](PLAY_STORE_CHECKLIST.md) | Pre-publish checklist |
| [GOOGLE_PLAY_PUBLISHING.md](GOOGLE_PLAY_PUBLISHING.md) | Publishing strategies reference |
| [LANGUAGE_SUPPORT_REENABLE.md](LANGUAGE_SUPPORT_REENABLE.md) | Multi-language re-enablement guide |

---

## Quick Start (Development)

```bash
# Clone and install
git clone <repo-url>
cd onetap-app
npm install

# Web development
npm run dev

# Android (requires JDK 21, Android Studio)
node scripts/android/clean-rebuild-android.mjs --run
```

See [ANDROID_SETUP.md](ANDROID_SETUP.md) for full setup instructions.

---

## Stack

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui
- **Native:** Capacitor 8, Android (Java, minSdk 31)
- **Backend:** Lovable Cloud (optional, for sync only)
- **Auth:** Google OAuth via Android App Links
- **CI/CD:** GitHub Actions → Google Play

---

## Principles

- **Local-first:** All data on device, cloud is optional and additive-only
- **Calm UX:** No intrusive notifications, no anxiety-inducing indicators
- **Resource-respectful:** No background services, no polling, no analytics
- **Paid upfront:** No ads, no subscriptions, no tracking

See [PRODUCT_IDEOLOGY.md](PRODUCT_IDEOLOGY.md) for the full manifesto.

---

## Repository Rules

- `main` is always production-ready
- All development in `feature/*` branches
- Tag-based releases trigger CI (`v1.0.0`)
- Human review required before merge and release

---

*A product by a solo entrepreneur. Built to last.*
