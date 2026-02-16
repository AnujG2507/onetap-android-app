

## Update `assetlinks.json` with Both Signing Keys

The `assetlinks.json` file needs to contain **both** SHA256 fingerprints so Android App Links work whether the app is sideloaded (upload key) or installed from the Play Store (Google's signing key).

### What changes

**File: `public/.well-known/assetlinks.json`**

Replace the current single fingerprint with both:

```text
Upload key:     1F:52:68:CA:4B:92:4C:D4:1B:2B:A0:44:FD:18:A6:41:C1:4F:92:A8:19:E6:5A:BC:5D:55:B1:C0:EE:D2:FE:89
Play Store key: 83:E2:D2:86:C6:80:44:BB:70:3D:81:B5:46:E6:6E:69:BE:CD:3C:4F:5F:51:BD:8A:40:51:F4:FC:2E:0B:CC:47
```

The old fingerprint (`33:0F:35:2A...`) will be removed since it doesn't match either key.

### Why both are needed

- **Upload key** -- used when you install the APK directly from your machine (sideloading / local testing)
- **Play Store signing key** -- Google re-signs your app with this key before distributing it to users via the Play Store

### Reminder

The same `assetlinks.json` must also be deployed on the **Vercel-hosted domain** (`onetapapp.in`) for App Links to verify correctly on that domain.

