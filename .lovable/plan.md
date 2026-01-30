

## Goal
Elevate the WhatsApp message picker dialog to match the app's premium aesthetic with refined styling, subtle animations, and ensure tap tracking works correctly across all shortcut types.

## Current State Analysis

### Dialog Styling Issues
The current `WhatsAppProxyActivity` builds the dialog programmatically with basic styling:
- Simple gray backgrounds (`#f5f5f5`)
- Basic rounded corners
- No elevation/shadow effects
- No touch feedback animations
- Static emoji icons instead of proper iconography
- Plain divider styling

### Tap Tracking Verification
All proxy activities correctly implement tap tracking:
1. **VideoProxyActivity** - Records tap at line 51-54
2. **PDFProxyActivity** - Records tap at line 65-66
3. **ContactProxyActivity** - Records tap at line 53-56
4. **LinkProxyActivity** - Records tap at line 62-65
5. **MessageProxyActivity** - Records tap at line 53-58
6. **WhatsAppProxyActivity** - Records tap at line 62-65

The flow is complete: Proxy activities call `NativeUsageTracker.recordTap()`, which stores events in SharedPreferences. On app startup/resume, `syncNativeUsageEvents()` in `useShortcuts.ts` retrieves and processes these events.

## Design Changes

### Premium Dialog Aesthetic
Based on the app's design system from `index.css`:
- **Primary color**: HSL 211, 100%, 50% (Material Blue - `#0080FF`)
- **Background**: Clean whites and subtle grays
- **Elevation**: Material Design surface levels
- **Typography**: Bold headers, muted subtitles

### Enhanced UI Elements

1. **Dialog Container**
   - Pure white background with elevated shadow
   - Larger corner radius (20dp) for modern feel
   - Subtle border for definition

2. **Header Section**
   - WhatsApp green accent indicator bar at top
   - Centered title with refined typography
   - Contact name as prominent heading
   - Subtle "Choose an option" subtitle

3. **Open Chat Card (Primary Action)**
   - Light blue tinted background matching primary color
   - Subtle border with primary color
   - Arrow/chevron icon instead of emoji
   - Proper ripple effect on press

4. **Divider**
   - Thinner, more elegant styling
   - Lighter gray color
   - Text in matching muted color

5. **Message Cards**
   - Clean white cards with subtle border
   - Left accent bar in primary color
   - Proper quote styling
   - Hover/press state with color shift
   - Message number badge

6. **Cancel Button**
   - Text-only style, not a standard dialog button
   - Centered at bottom with padding
   - Muted color that's still tappable

7. **Animations**
   - Fade-in on dialog open
   - Scale animation on card press
   - Subtle haptic feedback

## Technical Implementation

### File Changes

#### Modified Files:

1. **`native/android/app/src/main/java/app/onetap/shortcuts/WhatsAppProxyActivity.java`**
   - Redesign `showMessageChooserDialog()` with premium styling
   - Add `createPremiumOptionCard()` for Open Chat button
   - Add `createPremiumMessageCard()` for message options
   - Implement ripple effects via `RippleDrawable`
   - Add haptic feedback on selections
   - Use Material Design color palette from app

2. **`native/android/app/src/main/res/drawable/dialog_rounded_bg.xml`**
   - Add elevation/shadow effect
   - Increase corner radius

3. **`native/android/app/src/main/res/drawable/message_option_bg.xml`**
   - Update pressed state colors
   - Add border styling

4. **`native/android/app/src/main/res/values/styles.xml`**
   - Refine dialog theme
   - Add animation styles

#### New Files:

5. **`native/android/app/src/main/res/drawable/primary_option_bg.xml`**
   - Background for the "Open chat" primary action card
   - Uses primary blue accent color

6. **`native/android/app/src/main/res/drawable/message_card_bg.xml`**
   - Refined card background with border

## Detailed Implementation

### Color Palette (from app's design system)
```java
// Primary Blue (Material Blue)
private static final String COLOR_PRIMARY = "#0080FF";      // HSL 211, 100%, 50%
private static final String COLOR_PRIMARY_LIGHT = "#E6F2FF"; // Light blue tint

// WhatsApp Green (for accent bar)
private static final String COLOR_WHATSAPP = "#25D366";

// Neutrals
private static final String COLOR_BG = "#FFFFFF";
private static final String COLOR_SURFACE = "#FAFAFA";
private static final String COLOR_BORDER = "#E5E5E5";
private static final String COLOR_TEXT = "#1A1A1A";
private static final String COLOR_TEXT_MUTED = "#6B7280";
private static final String COLOR_DIVIDER = "#E0E0E0";
```

### Premium Dialog Layout (Programmatic)
```
┌────────────────────────────────────────┐
│ ▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔ │  ← WhatsApp green accent bar (4dp)
│                                        │
│         Message John Smith             │  ← Bold title, 20sp
│          Choose an option              │  ← Muted subtitle, 14sp
│                                        │
│  ┌──────────────────────────────────┐  │
│  │  ○  Open chat                 ➔  │  │  ← Primary blue bg, white icon
│  │     Start typing a new message   │  │
│  └──────────────────────────────────┘  │
│                                        │
│  ─────── Quick messages ───────        │  ← Elegant divider
│                                        │
│  ┌──────────────────────────────────┐  │
│  │  ▎ "Hey! Are you free today?"    │  │  ← Blue left accent bar
│  └──────────────────────────────────┘  │
│                                        │
│  ┌──────────────────────────────────┐  │
│  │  ▎ "On my way!"                  │  │
│  └──────────────────────────────────┘  │
│                                        │
│  ┌──────────────────────────────────┐  │
│  │  ▎ "Running late, 10 mins"       │  │
│  └──────────────────────────────────┘  │
│                                        │
│              Cancel                    │  ← Muted text button
│                                        │
└────────────────────────────────────────┘
```

### Key Code Changes for WhatsAppProxyActivity

1. **Color Constants**: Add Material Design palette as static final strings

2. **Header with Accent Bar**: Add WhatsApp green bar at top for brand recognition

3. **Premium Open Chat Card**: 
   - Blue-tinted background
   - Circular icon container
   - Chevron arrow indicating action
   - RippleDrawable for touch feedback

4. **Refined Message Cards**:
   - White background with subtle border
   - Primary color accent bar on left (3dp)
   - Better typography hierarchy
   - Proper ellipsization for long messages
   - Scale animation on press

5. **Haptic Feedback**: Add `performHapticFeedback()` on selections

6. **Dialog Window Styling**:
   - Larger corner radius
   - Proper elevation shadow
   - Smooth fade animation

## Testing Checklist

### Tap Tracking Verification
After implementation, verify all shortcut types record taps correctly:
- [ ] Video shortcuts (VideoProxyActivity)
- [ ] PDF shortcuts (PDFProxyActivity)  
- [ ] Contact call shortcuts (ContactProxyActivity)
- [ ] Link shortcuts (LinkProxyActivity)
- [ ] Messaging shortcuts with 0-1 messages (MessageProxyActivity)
  - WhatsApp (0 messages)
  - WhatsApp (1 message)
  - Telegram
  - Signal
  - Slack
- [ ] WhatsApp shortcuts with 2+ messages (WhatsAppProxyActivity)

### Dialog UI Testing
- [ ] Dialog appears with premium styling
- [ ] WhatsApp green accent bar visible at top
- [ ] "Open chat" has blue-tinted background
- [ ] Message cards have left accent bar
- [ ] Touch feedback (ripple) works on all interactive elements
- [ ] Haptic feedback on tap
- [ ] Long messages truncate properly with ellipsis
- [ ] Cancel button dismisses and returns to home screen
- [ ] Dialog dismisses on outside tap
- [ ] Selecting "Open chat" opens WhatsApp without message
- [ ] Selecting a message opens WhatsApp with that message pre-filled

