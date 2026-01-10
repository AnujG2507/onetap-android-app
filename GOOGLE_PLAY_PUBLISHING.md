# OneTap - Google Play Store Publishing Guide

This guide covers two monetization strategies for publishing OneTap on Google Play Store.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Strategy A: Paid App (One-Time Purchase)](#strategy-a-paid-app-one-time-purchase)
3. [Strategy B: Free with Ads + Ad-Free Upgrade](#strategy-b-free-with-ads--ad-free-upgrade)
4. [Common Steps for Both Strategies](#common-steps-for-both-strategies)
5. [Post-Launch Checklist](#post-launch-checklist)

---

## Prerequisites

### Developer Account Setup

1. **Create Google Play Developer Account**
   - Go to [Google Play Console](https://play.google.com/console)
   - Pay one-time $25 registration fee
   - Complete identity verification (can take 24-48 hours)
   - Set up your developer profile (name, email, website)

2. **Merchant Account (Required for Paid Apps/IAP)**
   - In Play Console → Setup → Payments profile
   - Link or create Google Payments merchant account
   - Provide tax information (W-9 for US, varies by country)
   - Set up bank account for payouts

### Technical Requirements

3. **Generate Signing Key**
   ```bash
   # Generate upload keystore (keep this SAFE - you cannot recover it!)
   keytool -genkey -v -keystore onetap-upload-key.jks -keyalg RSA -keysize 2048 -validity 10000 -alias onetap-key
   
   # Store password securely - you'll need it for every release
   ```

4. **Configure App Signing**
   - In `android/app/build.gradle`, add signing config:
   ```groovy
   android {
       signingConfigs {
           release {
               storeFile file('path/to/onetap-upload-key.jks')
               storePassword 'YOUR_STORE_PASSWORD'
               keyAlias 'onetap-key'
               keyPassword 'YOUR_KEY_PASSWORD'
           }
       }
       buildTypes {
           release {
               signingConfig signingConfigs.release
               minifyEnabled true
               proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
           }
       }
   }
   ```

5. **Build Release APK/AAB**
   ```bash
   # Build the web app
   npm run build
   npx cap sync android
   
   # Open in Android Studio
   npx cap open android
   
   # In Android Studio:
   # Build → Generate Signed Bundle/APK → Android App Bundle (AAB)
   # Select your keystore, enter passwords, choose "release" variant
   ```

---

## Strategy A: Paid App (One-Time Purchase)

> **Best for:** Premium apps with no ongoing server costs, users who prefer ad-free experience upfront.

### Step 1: Prepare App for Paid Distribution

1. **Remove Any Ad Code (if present)**
   - Ensure no ad SDKs are included
   - Remove any ad-related permissions from `AndroidManifest.xml`
   - No `com.google.android.gms.ads` dependencies

2. **Update Version Info**
   - In `android/app/build.gradle`:
   ```groovy
   android {
       defaultConfig {
           versionCode 1  // Increment for each release
           versionName "1.0.0"
       }
   }
   ```

### Step 2: Create Store Listing

1. **App Information**
   - App name: "OneTap Shortcuts" (max 30 chars)
   - Short description (80 chars): "Create home screen shortcuts for any URL, video, or file instantly."
   - Full description (4000 chars): Detailed feature list, benefits, use cases

2. **Graphics Assets (Required)**
   | Asset | Size | Notes |
   |-------|------|-------|
   | App icon | 512x512 PNG | High-res, no transparency |
   | Feature graphic | 1024x500 PNG | Shown at top of listing |
   | Screenshots | Min 2, phone size | 16:9 or 9:16 aspect ratio |
   | Screenshots | Tablet (optional) | 7" and 10" tablets |

3. **Categorization**
   - Category: Tools or Productivity
   - Tags: shortcuts, launcher, utility, home screen
   - Content rating: Complete questionnaire (likely "Everyone")

### Step 3: Set Pricing

1. **Go to:** Play Console → Monetize → Products → App Pricing
2. **Select:** "Paid"
3. **Set Price:**
   - Recommended: $1.99 - $4.99 USD
   - Google takes 15% (first $1M/year) or 30% after
   - Set prices per country or use auto-conversion

4. **Pricing Tips:**
   - $1.99 = Low barrier, high volume potential
   - $2.99 = Sweet spot for utility apps
   - $4.99 = Premium positioning, expect lower volume

### Step 4: Configure Distribution

1. **Countries:** Select all or specific countries
2. **Android versions:** Set minimum to Android 8.0 (API 26)
3. **Device types:** Phone, Tablet, Chrome OS (optional)

### Step 5: Submit for Review

1. **Pre-launch checklist:**
   - [ ] App content rating completed
   - [ ] Privacy policy URL added (required for paid apps)
   - [ ] Data safety form completed
   - [ ] Target audience and content declared
   - [ ] Contact email/phone provided

2. **Upload AAB:**
   - Go to Release → Production → Create new release
   - Upload your signed `.aab` file
   - Add release notes
   - Review and roll out

3. **Review Timeline:**
   - First submission: 3-7 days
   - Updates: Usually 1-3 days
   - May require additional information

### Step 6: Post-Approval

1. **Verify listing is live** at your Play Store URL
2. **Test purchase flow** with a test account
3. **Set up Google Play Console alerts** for crashes/ANRs

---

## Strategy B: Free with Ads + Ad-Free Upgrade

> **Best for:** Maximizing downloads, users who can't/won't pay upfront, ongoing revenue.

### Step 1: Integrate AdMob

1. **Create AdMob Account**
   - Go to [AdMob](https://admob.google.com)
   - Link to your Google Play Developer account
   - Create a new app, get App ID

2. **Add Dependencies**
   In `android/app/build.gradle`:
   ```groovy
   dependencies {
       implementation 'com.google.android.gms:play-services-ads:22.6.0'
   }
   ```

3. **Configure AdMob in Manifest**
   In `AndroidManifest.xml`:
   ```xml
   <manifest>
       <application>
           <meta-data
               android:name="com.google.android.gms.ads.APPLICATION_ID"
               android:value="ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY"/>
       </application>
   </manifest>
   ```

4. **Create Ad Units in AdMob Console**
   - Banner ad (for bottom of screen)
   - Interstitial ad (between actions, use sparingly)
   - Rewarded ad (optional - watch ad for premium feature)

### Step 2: Implement Ad Display (Native Android)

1. **Create AdManager Plugin**
   
   Create `android/app/src/main/java/app/onetap/shortcuts/plugins/AdPlugin.java`:
   ```java
   package app.onetap.shortcuts.plugins;
   
   import com.getcapacitor.*;
   import com.getcapacitor.annotation.*;
   import com.google.android.gms.ads.*;
   import com.google.android.gms.ads.interstitial.*;
   
   @CapacitorPlugin(name = "AdPlugin")
   public class AdPlugin extends Plugin {
       private InterstitialAd interstitialAd;
       private boolean isAdFree = false;
       
       @PluginMethod
       public void initialize(PluginCall call) {
           getActivity().runOnUiThread(() -> {
               MobileAds.initialize(getContext(), initStatus -> {
                   call.resolve();
               });
           });
       }
       
       @PluginMethod
       public void showInterstitial(PluginCall call) {
           if (isAdFree) {
               call.resolve(new JSObject().put("shown", false));
               return;
           }
           // Load and show interstitial
           // Implementation details...
       }
       
       @PluginMethod
       public void setAdFree(PluginCall call) {
           isAdFree = call.getBoolean("adFree", false);
           call.resolve();
       }
   }
   ```

2. **Register Plugin in MainActivity**
   ```java
   public class MainActivity extends BridgeActivity {
       @Override
       protected void onCreate(Bundle savedInstanceState) {
           registerPlugin(AdPlugin.class);
           // ... existing code
       }
   }
   ```

### Step 3: Implement In-App Purchase for Ad Removal

1. **Add Billing Library**
   In `android/app/build.gradle`:
   ```groovy
   dependencies {
       implementation 'com.android.billingclient:billing:6.1.0'
   }
   ```

2. **Create Billing Plugin**
   
   Create `android/app/src/main/java/app/onetap/shortcuts/plugins/BillingPlugin.java`:
   ```java
   package app.onetap.shortcuts.plugins;
   
   import com.getcapacitor.*;
   import com.getcapacitor.annotation.*;
   import com.android.billingclient.api.*;
   import java.util.*;
   
   @CapacitorPlugin(name = "BillingPlugin")
   public class BillingPlugin extends Plugin implements PurchasesUpdatedListener {
       private BillingClient billingClient;
       private static final String PRODUCT_ID_AD_FREE = "ad_free_upgrade";
       
       @Override
       public void load() {
           billingClient = BillingClient.newBuilder(getContext())
               .setListener(this)
               .enablePendingPurchases()
               .build();
       }
       
       @PluginMethod
       public void connect(PluginCall call) {
           billingClient.startConnection(new BillingClientStateListener() {
               @Override
               public void onBillingSetupFinished(BillingResult result) {
                   if (result.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                       call.resolve();
                   } else {
                       call.reject("Billing setup failed");
                   }
               }
               
               @Override
               public void onBillingServiceDisconnected() {
                   // Retry connection
               }
           });
       }
       
       @PluginMethod
       public void purchaseAdFree(PluginCall call) {
           // Query product details and launch purchase flow
           QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder()
               .setProductList(List.of(
                   QueryProductDetailsParams.Product.newBuilder()
                       .setProductId(PRODUCT_ID_AD_FREE)
                       .setProductType(BillingClient.ProductType.INAPP)
                       .build()
               ))
               .build();
           
           billingClient.queryProductDetailsAsync(params, (result, products) -> {
               if (!products.isEmpty()) {
                   ProductDetails product = products.get(0);
                   BillingFlowParams flowParams = BillingFlowParams.newBuilder()
                       .setProductDetailsParamsList(List.of(
                           BillingFlowParams.ProductDetailsParams.newBuilder()
                               .setProductDetails(product)
                               .build()
                       ))
                       .build();
                   billingClient.launchBillingFlow(getActivity(), flowParams);
               }
           });
       }
       
       @PluginMethod
       public void checkPurchased(PluginCall call) {
           billingClient.queryPurchasesAsync(
               QueryPurchasesParams.newBuilder()
                   .setProductType(BillingClient.ProductType.INAPP)
                   .build(),
               (result, purchases) -> {
                   boolean isPurchased = purchases.stream()
                       .anyMatch(p -> p.getProducts().contains(PRODUCT_ID_AD_FREE));
                   call.resolve(new JSObject().put("purchased", isPurchased));
               }
           );
       }
       
       @Override
       public void onPurchasesUpdated(BillingResult result, List<Purchase> purchases) {
           if (result.getResponseCode() == BillingClient.BillingResponseCode.OK && purchases != null) {
               for (Purchase purchase : purchases) {
                   // Acknowledge purchase
                   if (!purchase.isAcknowledged()) {
                       AcknowledgePurchaseParams ackParams = AcknowledgePurchaseParams.newBuilder()
                           .setPurchaseToken(purchase.getPurchaseToken())
                           .build();
                       billingClient.acknowledgePurchase(ackParams, ackResult -> {
                           notifyListeners("purchaseCompleted", new JSObject().put("success", true));
                       });
                   }
               }
           }
       }
   }
   ```

3. **Create TypeScript Plugin Interface**
   
   Create `src/plugins/BillingPlugin.ts`:
   ```typescript
   import { registerPlugin } from '@capacitor/core';
   
   export interface BillingPlugin {
     connect(): Promise<void>;
     purchaseAdFree(): Promise<void>;
     checkPurchased(): Promise<{ purchased: boolean }>;
   }
   
   const Billing = registerPlugin<BillingPlugin>('BillingPlugin');
   export default Billing;
   ```

### Step 4: Create Ad-Free Purchase UI

1. **Add Settings/Upgrade Screen**
   - Show "Remove Ads - $X.XX" button
   - Check purchase status on app launch
   - Store purchase status locally (SharedPreferences) for faster checks

2. **Ad Placement Strategy (Non-Intrusive)**
   - ✅ Small banner at bottom of main screen
   - ✅ Interstitial after creating 3rd shortcut (not every time)
   - ❌ Never interrupt video playback
   - ❌ Never block app functionality

### Step 5: Create In-App Product in Play Console

1. **Go to:** Monetize → In-app products → Create product
2. **Configure:**
   - Product ID: `ad_free_upgrade` (must match code)
   - Product type: One-time purchase (not subscription)
   - Name: "Remove Ads Forever"
   - Description: "Enjoy OneTap without any advertisements"
   - Price: $1.99 - $2.99 recommended

3. **Activate the product**

### Step 6: Set App as Free + Submit

1. **Pricing:** Set to "Free"
2. **Contains ads:** Yes (declare in store listing)
3. **In-app purchases:** Yes
4. **Submit for review** (same process as paid app)

---

## Common Steps for Both Strategies

### Privacy Policy (Required)

Create and host a privacy policy that covers:
- What data is collected (minimal for this app)
- How data is used
- Third-party services (AdMob if using ads)
- Contact information

**Host at:** Your website, GitHub Pages, or a service like Termly/Iubenda

**Template sections:**
```markdown
# Privacy Policy for OneTap Shortcuts

Last updated: [DATE]

## Information We Collect
- OneTap does not collect personal information
- Shortcuts are stored locally on your device only
- [If ads] AdMob may collect advertising identifiers

## Permissions Used
- Storage: To save video/image shortcuts
- Internet: [If ads] To display advertisements

## Contact
[Your email]
```

### Data Safety Form

In Play Console → Policy → App content → Data safety:

| Question | Answer (Paid) | Answer (Free+Ads) |
|----------|---------------|-------------------|
| Collects user data? | No | Yes (via AdMob) |
| Shares data with third parties? | No | Yes (advertising) |
| Data encrypted in transit? | N/A | Yes |
| Users can request deletion? | N/A | N/A (no server data) |

### Content Rating

Complete the IARC questionnaire:
- Violence: None
- Sexual content: None
- Language: None
- Controlled substances: None
- User interaction: None (no multiplayer/chat)

**Expected rating:** Everyone / PEGI 3

### Store Listing Best Practices

1. **Title:** "OneTap - Quick Shortcuts"
2. **Icon:** Simple, recognizable, no text
3. **Screenshots:** Show key features:
   - Creating a shortcut
   - Home screen with shortcuts
   - Video playback
   - Icon customization

4. **Description Keywords:**
   - home screen shortcuts
   - quick access
   - video shortcuts
   - URL launcher
   - productivity tool

---

## Post-Launch Checklist

### Week 1
- [ ] Monitor crash reports in Play Console
- [ ] Respond to user reviews
- [ ] Check revenue/download stats
- [ ] Verify ads are serving (if applicable)
- [ ] Test purchase flow works correctly

### Month 1
- [ ] Analyze user feedback for improvements
- [ ] Plan first update based on feedback
- [ ] Monitor ANR (App Not Responding) rate
- [ ] Check policy compliance notifications

### Ongoing
- [ ] Regular updates (every 1-2 months minimum)
- [ ] Respond to all reviews (increases visibility)
- [ ] Update target SDK as Google requires
- [ ] A/B test store listing elements

---

## Revenue Comparison

| Metric | Paid ($2.99) | Free + Ads + IAP ($1.99) |
|--------|--------------|--------------------------|
| Downloads | Lower (100-1000) | Higher (1000-10000) |
| Revenue per user | $2.54 (after Google cut) | $0.05-0.20 (ads) + $1.69 (upgrade) |
| User friction | High (payment first) | Low (try before buy) |
| Ongoing work | Minimal | Ad optimization, support |
| Best for | Premium positioning | Maximum reach |

---

## Quick Command Reference

```bash
# Build release
npm run build
npx cap sync android
cd android && ./gradlew bundleRelease

# Find AAB file
ls -la android/app/build/outputs/bundle/release/

# Check signing
jarsigner -verify -verbose android/app/build/outputs/bundle/release/app-release.aab
```

---

## Support & Resources

- [Google Play Console Help](https://support.google.com/googleplay/android-developer)
- [AdMob Documentation](https://developers.google.com/admob/android/quick-start)
- [Billing Library Guide](https://developer.android.com/google/play/billing)
- [Play Policy Center](https://play.google.com/about/developer-content-policy/)
