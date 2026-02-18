
# Wire PDFProxyActivity to V2 Viewer

## Change

One-line change in `PDFProxyActivity.java` (line 94):

Replace:
```java
Intent viewerIntent = new Intent(this, NativePdfViewerActivity.class);
```

With:
```java
Intent viewerIntent = new Intent(this, NativePdfViewerV2Activity.class);
```

## What This Does

- All PDF opens (both shortcut taps and external "Open with") will now launch the V2 viewer
- V1 activity remains fully intact and can be switched back by reverting this single line
- No other files change

## Risk

Zero. The V1 code is untouched. If V2 has issues on-device, revert this one line to restore V1.
