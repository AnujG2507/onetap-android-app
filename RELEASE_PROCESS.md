# OneTap Shortcuts - Release Process

## Overview

Every release follows this principle: **CI builds, human decides.**

---

## Pre-Release Checklist

### Code

- [ ] All changes merged to `main` via PR review
- [ ] `main` branch builds successfully locally
- [ ] No console errors or warnings in dev build
- [ ] Native files in `native/android/` are up to date

### Testing

- [ ] Install on physical device via `npx cap run android`
- [ ] Test all shortcut types (URL, contact, message, WhatsApp, PDF, video, file, slideshow)
- [ ] Test scheduled reminders (create, fire, recurrence)
- [ ] Test cloud sync (manual + verify daily auto doesn't over-trigger)
- [ ] Test offline behavior (airplane mode)
- [ ] Test on Android 12, 13, 14, 15 if possible
- [ ] Test permission denial + grant flows

### Version

- [ ] Decide version number (semver):
  - **Patch** (1.0.x): Bug fixes, no new features
  - **Minor** (1.x.0): New features, backward compatible
  - **Major** (x.0.0): Breaking changes (rare)
- [ ] Version code will auto-calculate: `major * 10000 + minor * 100 + patch`

---

## Release Steps

### 1. Tag the Release

```bash
git checkout main
git pull origin main
git tag v1.0.0        # Replace with actual version
git push origin v1.0.0
```

This triggers CI which:
- Builds the AAB
- Uploads to Google Play **internal** track
- Creates a GitHub Release

### 2. Test on Internal Track

- Install from Play Console internal testing
- Run through core flows on a clean device
- Verify the AAB is correctly signed

### 3. Promote to Production

**Option A: Via CI** (recommended)
```
GitHub → Actions → Android Release Build → Run workflow
  Track: production
  Skip upload: false
```

**Option B: Via Play Console**
- Go to Release → Production → Create new release
- "Add from library" → select the tested AAB
- Add release notes
- Review and roll out

### 4. Post-Release

- [ ] Verify app appears on Play Store
- [ ] Monitor Play Console for crashes/ANRs (first 24-48 hours)
- [ ] Respond to any user reviews

---

## Hotfix Process

For urgent production fixes:

```bash
git checkout main
# Make the fix
git add . && git commit -m "fix: description"
git tag v1.0.1
git push origin main v1.0.1
```

CI builds → test on internal → promote to production.

---

## Release Notes

Create `whatsnew/en-US.txt` before tagging:

```
• [Feature or fix description]
• [Another change]
```

Keep it user-facing and concise. Technical details go in the Git commit history.

---

## What NOT to Do

- ❌ Auto-promote to production (always manual)
- ❌ Skip internal track testing
- ❌ Release on Fridays
- ❌ Change pricing during a release
- ❌ Bundle multiple risky changes in one release

---

## Rollback

If a release causes issues:

1. **Assess severity** — is it a crash or cosmetic?
2. **Fix forward** — tag a new patch version
3. **Play Console halt** — use "Halt rollout" if critical
4. Do NOT rely on Play Console's "rollback" — it's unreliable

---

## Version History

| Version | Date | Notes |
|---------|------|-------|
| 1.0.0 | TBD | Initial release |

---

*Last updated: February 2026*
