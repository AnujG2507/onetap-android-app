

# Redesign PDF Viewer Header for Premium Feel

## Overview

Transform the PDF viewer header from a semi-transparent overlay to a solid, premium opaque bar that reserves dedicated space in the layout. When visible, content flows below it; when hidden, content reclaims that space smoothly.

---

## Current Implementation

| Element | Current State |
|---------|---------------|
| **Top bar** | Gradient overlay (`0xCC000000` → `0x00000000`), floats over content |
| **Close button** | Uses `android.R.drawable.ic_menu_close_clear_cancel` |
| **Open with icon** | Uses `android.R.drawable.ic_menu_share` |
| **Button backgrounds** | `android.R.drawable.dialog_holo_dark_frame` (dated) |
| **Layout** | RecyclerView fills entire screen, header overlaps content |
| **Animation** | Alpha fade + translateY |

---

## Design Goals

1. **Opaque header** with subtle elevation shadow
2. **Premium icons** - custom vector drawables matching Material Design style
3. **Content respects header space** - PDF starts below header when visible
4. **Smooth space transition** - content expands/contracts when header shows/hides
5. **Touch-friendly** - ripple feedback on buttons

---

## Implementation Plan

### 1. Create Custom Icon Drawables

**File: `native/android/app/src/main/res/drawable/ic_close_pdf.xml`**

```xml
<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="24"
    android:viewportHeight="24">
    <path
        android:fillColor="#FFFFFF"
        android:pathData="M19,6.41L17.59,5 12,10.59 6.41,5 5,6.41 10.59,12 5,17.59 6.41,19 12,13.41 17.59,19 19,17.59 13.41,12z"/>
</vector>
```

**File: `native/android/app/src/main/res/drawable/ic_open_external.xml`**

Use "open in new" icon (box with arrow) instead of share icon for "Open with":

```xml
<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="24"
    android:viewportHeight="24">
    <path
        android:fillColor="#FFFFFF"
        android:pathData="M19,19H5V5h7V3H5c-1.1,0 -2,0.9 -2,2v14c0,1.1 0.9,2 2,2h14c1.1,0 2,-0.9 2,-2v-7h-2v7zM14,3v2h3.59l-9.83,9.83 1.41,1.41L19,6.41V10h2V3h-7z"/>
</vector>
```

**File: `native/android/app/src/main/res/drawable/ripple_circle.xml`**

Circular ripple background for buttons:

```xml
<?xml version="1.0" encoding="utf-8"?>
<ripple xmlns:android="http://schemas.android.com/apk/res/android"
    android:color="@android:color/white">
    <item android:id="@android:id/mask">
        <shape android:shape="oval">
            <solid android:color="#FFFFFF"/>
        </shape>
    </item>
</ripple>
```

### 2. Update buildUI() - Layout Architecture

Change from overlay to content-aware layout:

```java
private void buildUI() {
    // Root uses LinearLayout for header + content stacking
    LinearLayout root = new LinearLayout(this);
    root.setOrientation(LinearLayout.VERTICAL);
    root.setBackgroundColor(0xFF000000);
    root.setLayoutParams(new ViewGroup.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.MATCH_PARENT
    ));
    
    // Wrapper for header space reservation
    headerSpace = new FrameLayout(this);
    headerSpace.setLayoutParams(new LinearLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.WRAP_CONTENT
    ));
    
    // Top bar - solid opaque background
    topBar = new FrameLayout(this);
    int topBarHeight = dpToPx(56);
    topBar.setLayoutParams(new FrameLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT, topBarHeight
    ));
    topBar.setBackgroundColor(0xFF1C1C1E);  // Premium dark gray
    topBar.setElevation(dpToPx(4));  // Subtle shadow
    topBar.setPadding(dpToPx(8), 0, dpToPx(8), 0);
    
    // Close button with ripple
    closeButton = new ImageButton(this);
    closeButton.setImageResource(R.drawable.ic_close_pdf);
    closeButton.setBackgroundResource(R.drawable.ripple_circle);
    closeButton.setColorFilter(0xFFFFFFFF);
    int buttonSize = dpToPx(48);
    FrameLayout.LayoutParams closeParams = new FrameLayout.LayoutParams(buttonSize, buttonSize);
    closeParams.gravity = Gravity.START | Gravity.CENTER_VERTICAL;
    closeButton.setLayoutParams(closeParams);
    closeButton.setOnClickListener(v -> exitViewer());
    topBar.addView(closeButton);
    
    // Page indicator (center) - slightly larger, bolder
    pageIndicator = new TextView(this);
    pageIndicator.setTextColor(0xDEFFFFFF);  // 87% white (Material primary text)
    pageIndicator.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
    pageIndicator.setTypeface(null, Typeface.MEDIUM);  // Medium weight
    FrameLayout.LayoutParams indicatorParams = new FrameLayout.LayoutParams(
        ViewGroup.LayoutParams.WRAP_CONTENT,
        ViewGroup.LayoutParams.WRAP_CONTENT
    );
    indicatorParams.gravity = Gravity.CENTER;
    pageIndicator.setLayoutParams(indicatorParams);
    topBar.addView(pageIndicator);
    
    // Open with button - new "open external" icon
    openWithButton = new ImageButton(this);
    openWithButton.setImageResource(R.drawable.ic_open_external);
    openWithButton.setBackgroundResource(R.drawable.ripple_circle);
    openWithButton.setColorFilter(0xFFFFFFFF);
    FrameLayout.LayoutParams openWithParams = new FrameLayout.LayoutParams(buttonSize, buttonSize);
    openWithParams.gravity = Gravity.END | Gravity.CENTER_VERTICAL;
    openWithButton.setLayoutParams(openWithParams);
    openWithButton.setOnClickListener(v -> openWithExternalApp());
    topBar.addView(openWithButton);
    
    headerSpace.addView(topBar);
    root.addView(headerSpace);
    
    // Content container (RecyclerView + overlays)
    FrameLayout contentContainer = new FrameLayout(this);
    contentContainer.setLayoutParams(new LinearLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        0,
        1f  // weight = 1 to fill remaining space
    ));
    
    // ZoomableRecyclerView
    recyclerView = new ZoomableRecyclerView(this);
    recyclerView.setLayoutParams(new FrameLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.MATCH_PARENT
    ));
    recyclerView.setBackgroundColor(0xFF1A1A1A);
    recyclerView.setHasFixedSize(false);
    recyclerView.setItemAnimator(null);
    contentContainer.addView(recyclerView);
    
    // Fast scroll overlay
    fastScrollOverlay = new FastScrollOverlay(this);
    fastScrollOverlay.setLayoutParams(new FrameLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.MATCH_PARENT
    ));
    contentContainer.addView(fastScrollOverlay);
    
    root.addView(contentContainer);
    
    // Error view (overlays entire root)
    // ... keep existing error view logic
    
    setContentView(root);
}
```

### 3. Update Show/Hide Animation

Animate the header space height instead of just alpha/translation:

```java
// Add field for header space wrapper
private FrameLayout headerSpace;
private ValueAnimator headerAnimator;

private void showTopBar() {
    if (topBar != null && !isTopBarVisible) {
        isTopBarVisible = true;
        
        // Cancel any running animation
        if (headerAnimator != null && headerAnimator.isRunning()) {
            headerAnimator.cancel();
        }
        
        int targetHeight = dpToPx(56);
        headerAnimator = ValueAnimator.ofInt(headerSpace.getHeight(), targetHeight);
        headerAnimator.setDuration(200);
        headerAnimator.setInterpolator(new DecelerateInterpolator());
        headerAnimator.addUpdateListener(animation -> {
            ViewGroup.LayoutParams params = headerSpace.getLayoutParams();
            params.height = (int) animation.getAnimatedValue();
            headerSpace.setLayoutParams(params);
        });
        headerAnimator.addListener(new AnimatorListenerAdapter() {
            @Override
            public void onAnimationStart(Animator animation) {
                topBar.setVisibility(View.VISIBLE);
                topBar.setAlpha(0f);
            }
        });
        
        // Fade in topBar
        topBar.animate()
            .alpha(1f)
            .setDuration(200)
            .start();
        
        headerAnimator.start();
        scheduleHide();
    } else if (topBar != null && isTopBarVisible) {
        scheduleHide();
    }
}

private void hideTopBar() {
    if (topBar != null && isTopBarVisible) {
        isTopBarVisible = false;
        hideHandler.removeCallbacks(hideRunnable);
        
        if (headerAnimator != null && headerAnimator.isRunning()) {
            headerAnimator.cancel();
        }
        
        // Collapse header space
        headerAnimator = ValueAnimator.ofInt(headerSpace.getHeight(), 0);
        headerAnimator.setDuration(200);
        headerAnimator.setInterpolator(new AccelerateInterpolator());
        headerAnimator.addUpdateListener(animation -> {
            ViewGroup.LayoutParams params = headerSpace.getLayoutParams();
            params.height = (int) animation.getAnimatedValue();
            headerSpace.setLayoutParams(params);
        });
        
        // Fade out topBar
        topBar.animate()
            .alpha(0f)
            .setDuration(150)
            .start();
        
        headerAnimator.start();
    }
}
```

### 4. Handle Immersive Mode with Header

Since the header is now part of the content layout (not an overlay), the immersive mode setup needs adjustment to ensure the header appears below the status bar area:

```java
private void setupImmersiveMode() {
    // Use edge-to-edge but let system bars show when header is visible
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        getWindow().setDecorFitsSystemWindows(false);
        getWindow().setStatusBarColor(0xFF1C1C1E);  // Match header
        
        // Apply window insets to header
        ViewCompat.setOnApplyWindowInsetsListener(headerSpace, (v, insets) -> {
            int topInset = insets.getInsets(WindowInsetsCompat.Type.statusBars()).top;
            topBar.setPadding(dpToPx(8), topInset, dpToPx(8), 0);
            return insets;
        });
    }
    
    // Keep content fullscreen
    // ... existing immersive setup for content area
}
```

---

## Files to Modify/Create

| File | Action |
|------|--------|
| `native/android/app/src/main/res/drawable/ic_close_pdf.xml` | Create - X close icon |
| `native/android/app/src/main/res/drawable/ic_open_external.xml` | Create - Open external icon |
| `native/android/app/src/main/res/drawable/ripple_circle.xml` | Create - Ripple background |
| `NativePdfViewerActivity.java` | Update - New layout, animations |

---

## Visual Comparison

| Aspect | Before | After |
|--------|--------|-------|
| Background | Gradient overlay | Solid `#1C1C1E` with 4dp elevation |
| Close icon | System X (dated) | Custom vector, 24dp |
| Open with icon | Share icon | "Open external" (box + arrow) |
| Button feedback | Dialog frame | Circular ripple |
| Page text | 14sp, 67% white | 15sp medium weight, 87% white |
| Content start | Behind header | Below header |
| Show/hide | Alpha + translateY | Height animation + alpha |

---

## Testing Checklist

- [ ] Header appears with solid background on PDF open
- [ ] PDF content starts below header (no overlap)
- [ ] Header collapse animation is smooth (content expands to fill)
- [ ] Header expand animation is smooth (content shrinks)
- [ ] Close button has circular ripple feedback
- [ ] Open with button has correct icon and ripple
- [ ] Auto-hide still works after 4 seconds
- [ ] Single tap toggles header visibility
- [ ] Scroll up/down shows/hides header
- [ ] Status bar color matches header when visible
- [ ] Header handles safe area insets (notch devices)

