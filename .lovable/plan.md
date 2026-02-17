

# Add Tooltips to the Built-in Video Player

## Current State
The WebView-based video player (`VideoPlayer.tsx`) has three icon-only buttons in the header -- Back, Open with, and Share -- with no text labels or tooltips. Users unfamiliar with the icons may not know what each button does.

## Approach
Wrap each icon button with the existing `Tooltip` component from `@/components/ui/tooltip`. Radix tooltips support touch devices: a long-press reveals the label, and it auto-dismisses. This is non-intrusive and doesn't interfere with normal tap behavior.

## Changes

### `src/pages/VideoPlayer.tsx`

1. **Import tooltip components** -- Add `Tooltip, TooltipTrigger, TooltipContent, TooltipProvider` from `@/components/ui/tooltip`

2. **Wrap the header controls area** in a `TooltipProvider` with a short `delayDuration` (e.g., 300ms)

3. **Wrap each of the 3 icon buttons** in the playing/ready state header:

| Button | Icon | Tooltip text (i18n key) |
|--------|------|------------------------|
| Back / Exit | `ArrowLeft` | `videoPlayer.tooltipBack` |
| Open with | `ExternalLink` | `videoPlayer.tooltipOpenWith` |
| Share | `Share2` | `videoPlayer.tooltipShare` |

4. **Style the tooltip content** to match the dark video player theme: dark background, white text, no border (since the player is already on a black background)

5. **Add i18n keys** to `src/i18n/locales/en.json` under the `videoPlayer` namespace:
   - `tooltipBack`: "Exit"
   - `tooltipOpenWith`: "Open with another app"
   - `tooltipShare`: "Share"

### What Does NOT Change
- No changes to the native `NativeVideoPlayerActivity.java` (native player has its own tooltip-like behavior via Android content descriptions)
- No changes to tooltip component itself
- No changes to button behavior -- tooltips only add discoverability
- Error state buttons already have text labels, so they don't need tooltips

