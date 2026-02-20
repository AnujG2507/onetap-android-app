# OneTap Shortcuts — Release Process

> **Purpose of this document:** Teach you how to ship updates safely and repeatedly, even if you've never released an Android app before. The core principle: **CI builds, human decides.**

---

## Table of Contents

1. [How Releases Work (Overview)](#1-how-releases-work-overview)
2. [Branching Strategy](#2-branching-strategy)
3. [Feature Branch Workflow](#3-feature-branch-workflow)
4. [Pre-Release Checklist](#4-pre-release-checklist)
5. [Step-by-Step Release](#5-step-by-step-release)
6. [Play Store Track Strategy](#6-play-store-track-strategy)
7. [Emergency Fixes (Hotfixes)](#7-emergency-fixes-hotfixes)
8. [If Something Goes Wrong (Decision Tree)](#8-if-something-goes-wrong-decision-tree)
9. [Release Notes](#9-release-notes)
10. [What NOT to Do](#10-what-not-to-do)
11. [Version History](#11-version-history)

---

## 1. How Releases Work (Overview)

```
feature branch → main → git tag → CI builds → internal track → test on device → production
                  │                    │              │                              │
              human merges        automatic       human tests                  human promotes
```

**The key idea:** Automation handles the boring, repeatable parts (building, signing, uploading). Humans handle the irreversible decisions (merging to main, promoting to production).

---

## 2. Branching Strategy

```
main ─────────────────────────────────────────────▶ (always releasable)
  │                                    ▲
  │                                    │
  └── feature/add-notes ──────────────┘ (merge via PR)
  │                                    ▲
  └── feature/fix-pdf-viewer ─────────┘ (merge via PR)
```

### Rules

| Rule | Why |
|------|-----|
| `main` is always production-ready | So you can ship a hotfix anytime without untangling unfinished work |
| All work happens in `feature/*` branches | Keeps `main` clean |
| Merge via pull request with review | Catches mistakes before they reach production |
| Never commit directly to `main` | Prevents accidental broken releases |

---

## 3. Feature Branch Workflow

### Starting a new feature

```bash
# 1. Make sure main is up to date
git checkout main
git pull origin main

# 2. Create a feature branch
git checkout -b feature/your-feature-name

# 3. Make your changes, commit often
git add .
git commit -m "feat: describe what you changed"

# 4. Push your branch
git push origin feature/your-feature-name
```

### Merging your feature

```bash
# 1. Create a Pull Request on GitHub

# 2. Review the changes:
#    - Does the app build? (npm run build)
#    - Does it work on a physical device? (npx cap run android)
#    - Did you test the specific feature you changed?

# 3. Merge the PR on GitHub

# 4. After merging, update your local main
git checkout main
git pull origin main
```

---

## 4. Pre-Release Checklist

Go through this list before every release. Do not skip items.

### Code

- [ ] All changes merged to `main` via reviewed PR
- [ ] `main` builds successfully: `npm run build` completes without errors
- [ ] No console errors or warnings in the build
- [ ] Native files in `native/android/` are up to date

### Testing (on Physical Android Device)

- [ ] Installed on physical Android device via `npx cap run android`
- [ ] Tested all shortcut types:
  - [ ] URL shortcuts open correctly
  - [ ] Contact call shortcuts work
  - [ ] Contact message shortcuts work
  - [ ] WhatsApp shortcuts work
  - [ ] PDF shortcuts open native viewer
  - [ ] Video shortcuts play correctly
  - [ ] File shortcuts open files
  - [ ] Slideshow shortcuts work
  - [ ] Text note shortcuts render Markdown correctly
  - [ ] Text checklist shortcuts toggle checkboxes and persist state across opens
- [ ] Tested scheduled reminders (create, wait for it to fire, check recurrence)
- [ ] Tested cloud sync (sign in, sync, verify data appears)
- [ ] Tested offline behavior (airplane mode — app should work normally)
- [ ] Tested permission denial (deny permissions — app should not crash)
- [ ] Tested OAuth sign-in flow on device (App Links intercept correctly)

### Version Decision

Decide the version number using semantic versioning:

| Change Type | Version Bump | Example |
|------------|-------------|---------|
| Bug fix, no new features | Patch: `1.0.x` | `v1.0.0` → `v1.0.1` |
| New feature, backward compatible | Minor: `1.x.0` | `v1.0.1` → `v1.1.0` |
| Breaking change (very rare) | Major: `x.0.0` | `v1.1.0` → `v2.0.0` |

### Release Notes

- [ ] Updated `whatsnew/en-US.txt` with user-facing changes

---

## 5. Step-by-Step Release

### Step 1: Tag the release

```bash
git checkout main
git pull origin main
git tag v1.0.0        # Replace with your actual version
git push origin v1.0.0
```

**What happens next (automatic):**
- GitHub Actions starts the build workflow
- A signed AAB is created
- The AAB is uploaded to Google Play's **internal** test track
- A GitHub Release is created

### Step 2: Wait for CI

Go to your GitHub repository → Actions tab. Wait for the "Android Release Build" workflow to complete (usually 5-10 minutes).

### Step 3: Test on internal track (physical device only)

1. Open Google Play Console
2. Go to your app → Testing → Internal testing
3. Copy the test link and open it on your **physical Android phone**
4. Install the app from the internal track
5. Test the key features listed in the pre-release checklist

### Step 4: Promote to production

**Option A: Via CI (recommended)**
1. Go to GitHub → Actions → Android Release Build
2. Click "Run workflow"
3. Set track to `production`
4. Click "Run workflow"

**Option B: Via Play Console**
1. Open Play Console → Release → Production
2. Click "Create new release"
3. Click "Add from library" → select the tested AAB
4. Add release notes
5. Click "Review release" → "Start rollout to Production"

### Step 5: Post-release

- [ ] Verify the app appears on Play Store (may take 1-24 hours)
- [ ] Monitor Play Console for crashes/ANRs for the first 48 hours

---

## 6. Play Store Track Strategy

| Track | Who Sees It | When to Use |
|-------|------------|-------------|
| Internal | Only your test accounts | Every release (always test here first) |
| Alpha | Invited testers | When you want feedback from a small group |
| Beta | Anyone who opts in | When you want wider testing |
| Production | Everyone | When you're confident the release is stable |

**Tag pushes always go to internal.** Promotion to any other track requires manual action.

---

## 7. Emergency Fixes (Hotfixes)

If you discover a critical bug in production:

```bash
# 1. Fix the bug directly on main (or a quick branch)
git checkout main
git pull origin main
# Make the fix
git add .
git commit -m "fix: describe the critical fix"
git push origin main

# 2. Tag a patch version
git tag v1.0.1
git push origin v1.0.1

# 3. Wait for CI to build and upload to internal
# 4. Test on physical device via internal track
# 5. Promote to production immediately
```

**Speed matters for hotfixes,** but never skip testing on a physical device. A broken hotfix is worse than the original bug.

---

## 8. If Something Goes Wrong (Decision Tree)

```
Something went wrong with a release
        │
        ├── Is the app crashing for all users?
        │       │
        │       ├── YES → Use Play Console "Halt rollout"
        │       │         Fix the issue, tag a new patch, test, promote
        │       │
        │       └── NO → Is it a cosmetic issue?
        │               │
        │               ├── YES → Fix it, ship in the next regular release
        │               │
        │               └── NO → Is it affecting core functionality?
        │                       │
        │                       ├── YES → Hotfix (see Section 7)
        │                       │
        │                       └── NO → Fix it, ship in the next release
        │
        ├── Did the CI build fail?
        │       │
        │       ├── Check GitHub Actions logs for the error
        │       ├── Common: missing secrets, Java errors, version conflicts
        │       └── Fallback: build locally (see DEPLOYMENT.md)
        │
        └── Did Play Store reject the app?
                │
                ├── Read the rejection reason carefully
                ├── See PLAY_STORE_CHECKLIST.md for common reasons
                └── Fix the issue and resubmit
```

### Important: Do NOT use Play Console's "rollback" feature

Play Console offers a "rollback" button, but it is unreliable. Instead, always "fix forward" — create a new patch version with the fix, test it, and promote it.

---

## 9. Release Notes

Release notes live in `whatsnew/en-US.txt`. Update this file before tagging a release.

**Good release notes:**
```
• Added notes field to bookmarks
• Fixed PDF viewer crash on files larger than 50MB
• Improved contact shortcut creation speed
```

**Bad release notes:**
```
• Bug fixes and performance improvements
```

Keep notes user-facing and specific.

---

## 10. What NOT to Do

| ❌ Don't | Why |
|----------|-----|
| Auto-promote to production | You lose the ability to catch issues before real users see them |
| Skip internal track testing | The one time you skip it will be the one time it's broken |
| Release on Fridays | If something breaks, you'll be fixing it over the weekend |
| Bundle many risky changes in one release | If something breaks, you won't know which change caused it |
| Delete old git tags | Tags are your release history — keep them |
| Test only in emulators | Always verify on a physical device |

---

## 11. Version History

| Version | Date | Notes |
|---------|------|-------|
| 1.0.0 | TBD | Initial release |

Update this table with each release.

---

*Last updated: February 2026*
