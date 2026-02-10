

# Generate OneTap Logo and Apply as Favicon/App Icon

## What We'll Do

1. **Generate a logo** using the Nano banana pro AI image model (higher quality) with a prompt for a clean, modern app icon representing "one tap" / quick access
2. **Save the logo** to `public/logo.png`
3. **Update `index.html`** to use the new logo as the favicon instead of the old `favicon.ico`
4. **Update meta tags** (og:image, twitter:image) to reference the new logo

## Technical Details

- **Model**: `google/gemini-3-pro-image-preview` (best quality for logos)
- **Prompt direction**: Minimal, modern app icon — a single tap/finger gesture or a lightning bolt on a blue (#2563eb) circle, flat design, no text, transparent-friendly
- **Output**: PNG saved to `public/logo.png`
- **Files changed**:
  - `public/logo.png` (new)
  - `index.html` (update favicon and meta image references)

## What This Does NOT Cover

- Android adaptive icon (`ic_launcher`) — that requires specific mipmap assets in multiple densities, which must be generated separately using Android Studio's Image Asset tool
- The generated logo can serve as the **source image** for that process

