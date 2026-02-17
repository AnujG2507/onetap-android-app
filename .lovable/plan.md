

# In-App Review Prompt -- Ethical, Non-Intrusive

## How It Works

The review prompt appears as a small, dismissable banner at the bottom of the home screen (above the bottom navigation). It shows up once -- after the user has been using the app for 5-7 days and has created at least 3 shortcuts -- then never appears again, regardless of whether the user taps "Rate" or dismisses it.

```text
+-----------------------------------------------+
|  Enjoying OneTap?                         [X]  |
|  A quick rating helps others discover it.      |
|  [Rate on Play Store]                          |
+-----------------------------------------------+
```

## Trigger Logic

- On onboarding completion, store a timestamp (`onetap_first_use_date`) in localStorage
- The prompt becomes eligible after 5 days have passed AND the user has 3+ shortcuts
- A random jitter of 0-2 days is added (so it appears between day 5-7, not robotically on day 5)
- Once shown and interacted with (tapped or dismissed), set `onetap_review_prompt_done = true` -- never show again
- If the user has fewer than 3 shortcuts after 30 days, mark as done silently (they're not engaged enough)

## Design Principles

- No modal, no dialog, no interruption -- just a gentle banner
- No guilt language ("Please rate us!")
- Single sentence explaining *why* it helps
- Dismiss button is prominent and easy to tap
- Tapping "Rate" opens the Play Store listing via Capacitor's Browser plugin
- On web (non-native), the banner is hidden entirely

## Files to Create / Modify

### 1. New: `src/hooks/useReviewPrompt.ts`

A custom hook that manages the entire lifecycle:

- Reads `onetap_first_use_date` and `onetap_review_prompt_done` from localStorage
- On first call (if no date exists), records the current timestamp
- Returns `{ shouldShow: boolean, dismiss: () => void, openReview: () => void }`
- `dismiss()` sets the done flag and hides the banner
- `openReview()` opens the Play Store URL via `@capacitor/browser`, then sets done flag
- Only returns `shouldShow: true` on native Android, after 5+ days, with 3+ shortcuts, and not already done

### 2. New: `src/components/ReviewPromptBanner.tsx`

A small, self-contained banner component:

- Renders a subtle card with rounded corners, matching the app's design language
- Contains: one-line message, "Rate on Play Store" text button, and an X dismiss button
- Uses framer-motion for a gentle slide-up entrance and fade-out exit
- Accepts `onDismiss` and `onRate` callbacks

### 3. Modified: `src/hooks/useOnboarding.ts`

- In `completeOnboarding()`, also record `onetap_first_use_date` if not already set
- This anchors the review timer to the moment the user finishes onboarding

### 4. Modified: `src/pages/Index.tsx`

- Import and call `useReviewPrompt()`
- Render `<ReviewPromptBanner>` just above the `<BottomNav>` when `shouldShow` is true

### 5. Modified: `src/i18n/locales/en.json`

- Add keys under a `reviewPrompt` namespace:
  - `title`: "Enjoying OneTap?"
  - `message`: "A quick rating helps others discover it."
  - `action`: "Rate on Play Store"

## What Does NOT Change

- No analytics, no tracking of whether users actually rated
- No repeat prompts, no "remind me later"
- No changes to settings or profile pages
- No backend/database involvement -- purely localStorage

