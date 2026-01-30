package app.onetap.shortcuts;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.LayerDrawable;
import android.graphics.drawable.RippleDrawable;
import android.graphics.drawable.ShapeDrawable;
import android.graphics.drawable.shapes.RoundRectShape;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.HapticFeedbackConstants;
import android.view.View;
import android.view.ViewGroup;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONException;

import java.io.UnsupportedEncodingException;
import java.net.URLEncoder;

/**
 * WhatsAppProxyActivity - Handles WhatsApp shortcuts with multiple quick messages.
 * 
 * Philosophy:
 * - Never auto-send messages
 * - For single/zero messages, the shortcut goes directly to WhatsApp (no proxy needed)
 * - For multiple messages, this proxy shows a native dialog for instant selection
 * - All messages are drafts requiring user's final tap in WhatsApp
 * 
 * Intent extras:
 * - phone_number: The phone number to message
 * - quick_messages: JSON array of message strings
 * - contact_name: Display name for the chooser UI
 */
public class WhatsAppProxyActivity extends Activity {
    private static final String TAG = "WhatsAppProxyActivity";
    
    public static final String EXTRA_PHONE_NUMBER = "phone_number";
    public static final String EXTRA_QUICK_MESSAGES = "quick_messages";
    public static final String EXTRA_CONTACT_NAME = "contact_name";
    public static final String EXTRA_SHORTCUT_ID = "shortcut_id";
    
    // Premium color palette (matching app design system)
    private static final int COLOR_PRIMARY = Color.parseColor("#0080FF");
    private static final int COLOR_PRIMARY_LIGHT = Color.parseColor("#E6F2FF");
    private static final int COLOR_PRIMARY_BORDER = Color.parseColor("#B3D9FF");
    private static final int COLOR_WHATSAPP = Color.parseColor("#25D366");
    private static final int COLOR_BG = Color.parseColor("#FFFFFF");
    private static final int COLOR_SURFACE = Color.parseColor("#FAFAFA");
    private static final int COLOR_BORDER = Color.parseColor("#E5E5E5");
    private static final int COLOR_TEXT = Color.parseColor("#1A1A1A");
    private static final int COLOR_TEXT_MUTED = Color.parseColor("#6B7280");
    private static final int COLOR_DIVIDER = Color.parseColor("#E0E0E0");
    private static final int COLOR_RIPPLE = Color.parseColor("#20000000");
    
    private AlertDialog dialog;
    
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        Intent intent = getIntent();
        String phoneNumber = intent.getStringExtra(EXTRA_PHONE_NUMBER);
        String messagesJson = intent.getStringExtra(EXTRA_QUICK_MESSAGES);
        String contactName = intent.getStringExtra(EXTRA_CONTACT_NAME);
        String shortcutId = intent.getStringExtra(EXTRA_SHORTCUT_ID);
        
        Log.d(TAG, "WhatsApp proxy opened: phone=" + phoneNumber + ", hasMessages=" + (messagesJson != null) + ", shortcutId=" + shortcutId);
        
        // Track the usage event if we have a shortcut ID
        if (shortcutId != null && !shortcutId.isEmpty()) {
            NativeUsageTracker.recordTap(this, shortcutId);
            Log.d(TAG, "Recorded tap for WhatsApp shortcut: " + shortcutId);
        }
        
        if (phoneNumber == null || phoneNumber.isEmpty()) {
            Log.e(TAG, "No phone number provided");
            finish();
            return;
        }
        
        // Parse messages
        String[] messages = parseMessages(messagesJson);
        
        if (messages.length <= 1) {
            // Shouldn't happen (proxy is only for multiple messages), but handle gracefully
            String message = messages.length == 1 ? messages[0] : null;
            openWhatsApp(phoneNumber, message);
            finish();
            return;
        }
        
        // Show premium dialog directly
        showPremiumMessageChooserDialog(phoneNumber, messages, contactName);
    }
    
    private String[] parseMessages(String messagesJson) {
        if (messagesJson == null || messagesJson.isEmpty()) {
            return new String[0];
        }
        
        try {
            JSONArray jsonArray = new JSONArray(messagesJson);
            String[] result = new String[jsonArray.length()];
            for (int i = 0; i < jsonArray.length(); i++) {
                result[i] = jsonArray.getString(i);
            }
            return result;
        } catch (JSONException e) {
            Log.e(TAG, "Failed to parse messages JSON", e);
            return new String[0];
        }
    }
    
    private void showPremiumMessageChooserDialog(String phoneNumber, String[] messages, String contactName) {
        ScrollView scrollView = new ScrollView(this);
        scrollView.setFillViewport(true);
        scrollView.setBackgroundColor(COLOR_BG);
        
        LinearLayout mainLayout = new LinearLayout(this);
        mainLayout.setOrientation(LinearLayout.VERTICAL);
        mainLayout.setBackgroundColor(COLOR_BG);
        
        // WhatsApp green accent bar at top
        View accentBar = new View(this);
        accentBar.setBackgroundColor(COLOR_WHATSAPP);
        LinearLayout.LayoutParams accentParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, dpToPx(4));
        accentBar.setLayoutParams(accentParams);
        mainLayout.addView(accentBar);
        
        // Content container with padding
        LinearLayout contentLayout = new LinearLayout(this);
        contentLayout.setOrientation(LinearLayout.VERTICAL);
        int padding = dpToPx(20);
        contentLayout.setPadding(padding, dpToPx(16), padding, padding);
        
        // Header section
        addHeaderSection(contentLayout, contactName);
        
        // Open Chat card (primary action)
        addOpenChatCard(contentLayout, phoneNumber);
        
        // Divider with "Quick messages" text
        addDividerSection(contentLayout);
        
        // Message cards
        for (int i = 0; i < messages.length; i++) {
            addMessageCard(contentLayout, phoneNumber, messages[i], i == messages.length - 1);
        }
        
        // Cancel button
        addCancelButton(contentLayout);
        
        mainLayout.addView(contentLayout);
        scrollView.addView(mainLayout);
        
        // Create dialog with premium styling
        AlertDialog.Builder builder = new AlertDialog.Builder(this, R.style.MessageChooserDialog);
        builder.setView(scrollView);
        builder.setOnCancelListener(d -> finish());
        builder.setOnDismissListener(d -> {
            if (!isFinishing()) {
                finish();
            }
        });
        
        dialog = builder.create();
        
        // Additional window styling
        dialog.setOnShowListener(d -> {
            if (dialog.getWindow() != null) {
                GradientDrawable background = new GradientDrawable();
                background.setColor(COLOR_BG);
                background.setCornerRadius(dpToPx(20));
                background.setStroke(dpToPx(1), COLOR_BORDER);
                dialog.getWindow().setBackgroundDrawable(background);
            }
        });
        
        dialog.show();
    }
    
    private void addHeaderSection(LinearLayout parent, String contactName) {
        // Title
        TextView title = new TextView(this);
        String titleText = contactName != null && !contactName.isEmpty() 
            ? "Message " + contactName 
            : "Choose a message";
        title.setText(titleText);
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 20);
        title.setTextColor(COLOR_TEXT);
        title.setTypeface(null, Typeface.BOLD);
        title.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        titleParams.bottomMargin = dpToPx(4);
        title.setLayoutParams(titleParams);
        parent.addView(title);
        
        // Subtitle
        TextView subtitle = new TextView(this);
        subtitle.setText("Choose an option");
        subtitle.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        subtitle.setTextColor(COLOR_TEXT_MUTED);
        subtitle.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams subtitleParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        subtitleParams.bottomMargin = dpToPx(20);
        subtitle.setLayoutParams(subtitleParams);
        parent.addView(subtitle);
    }
    
    private void addOpenChatCard(LinearLayout parent, String phoneNumber) {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.HORIZONTAL);
        card.setPadding(dpToPx(16), dpToPx(14), dpToPx(16), dpToPx(14));
        card.setGravity(Gravity.CENTER_VERTICAL);
        card.setClickable(true);
        card.setFocusable(true);
        
        // Premium background with ripple
        card.setBackground(createRippleDrawable(COLOR_PRIMARY_LIGHT, COLOR_PRIMARY_BORDER, dpToPx(12)));
        
        // Left content
        LinearLayout leftContent = new LinearLayout(this);
        leftContent.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams leftParams = new LinearLayout.LayoutParams(
            0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        leftContent.setLayoutParams(leftParams);
        
        TextView cardTitle = new TextView(this);
        cardTitle.setText("Open chat");
        cardTitle.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        cardTitle.setTextColor(COLOR_PRIMARY);
        cardTitle.setTypeface(null, Typeface.BOLD);
        leftContent.addView(cardTitle);
        
        TextView cardSubtitle = new TextView(this);
        cardSubtitle.setText("Start typing a new message");
        cardSubtitle.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        cardSubtitle.setTextColor(COLOR_TEXT_MUTED);
        LinearLayout.LayoutParams cardSubtitleParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        cardSubtitleParams.topMargin = dpToPx(2);
        cardSubtitle.setLayoutParams(cardSubtitleParams);
        leftContent.addView(cardSubtitle);
        
        card.addView(leftContent);
        
        // Arrow icon (chevron right)
        TextView arrow = new TextView(this);
        arrow.setText("→");
        arrow.setTextSize(TypedValue.COMPLEX_UNIT_SP, 18);
        arrow.setTextColor(COLOR_PRIMARY);
        card.addView(arrow);
        
        card.setOnClickListener(v -> {
            v.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY);
            dismissDialog();
            openWhatsApp(phoneNumber, null);
        });
        
        LinearLayout.LayoutParams cardParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        cardParams.bottomMargin = dpToPx(16);
        card.setLayoutParams(cardParams);
        parent.addView(card);
    }
    
    private void addDividerSection(LinearLayout parent) {
        LinearLayout dividerLayout = new LinearLayout(this);
        dividerLayout.setOrientation(LinearLayout.HORIZONTAL);
        dividerLayout.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout.LayoutParams dividerLayoutParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        dividerLayoutParams.bottomMargin = dpToPx(16);
        dividerLayout.setLayoutParams(dividerLayoutParams);
        
        View leftLine = new View(this);
        leftLine.setBackgroundColor(COLOR_DIVIDER);
        LinearLayout.LayoutParams lineParams = new LinearLayout.LayoutParams(0, dpToPx(1), 1f);
        leftLine.setLayoutParams(lineParams);
        dividerLayout.addView(leftLine);
        
        TextView dividerText = new TextView(this);
        dividerText.setText("  Quick messages  ");
        dividerText.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        dividerText.setTextColor(COLOR_TEXT_MUTED);
        dividerLayout.addView(dividerText);
        
        View rightLine = new View(this);
        rightLine.setBackgroundColor(COLOR_DIVIDER);
        rightLine.setLayoutParams(new LinearLayout.LayoutParams(0, dpToPx(1), 1f));
        dividerLayout.addView(rightLine);
        
        parent.addView(dividerLayout);
    }
    
    private void addMessageCard(LinearLayout parent, String phoneNumber, String message, boolean isLast) {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.HORIZONTAL);
        card.setPadding(dpToPx(16), dpToPx(14), dpToPx(16), dpToPx(14));
        card.setClickable(true);
        card.setFocusable(true);
        
        // Create layered background with left accent bar
        card.setBackground(createMessageCardBackground());
        
        // Message text
        TextView messageText = new TextView(this);
        String displayMessage = message.length() > 80 
            ? message.substring(0, 77) + "..." 
            : message;
        messageText.setText("\"" + displayMessage + "\"");
        messageText.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        messageText.setTextColor(COLOR_TEXT);
        messageText.setMaxLines(3);
        messageText.setEllipsize(android.text.TextUtils.TruncateAt.END);
        messageText.setPadding(dpToPx(8), 0, 0, 0); // Space for accent bar
        card.addView(messageText);
        
        card.setOnClickListener(v -> {
            v.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY);
            dismissDialog();
            openWhatsApp(phoneNumber, message);
        });
        
        LinearLayout.LayoutParams cardParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        if (!isLast) {
            cardParams.bottomMargin = dpToPx(10);
        }
        card.setLayoutParams(cardParams);
        parent.addView(card);
    }
    
    private void addCancelButton(LinearLayout parent) {
        TextView cancelButton = new TextView(this);
        cancelButton.setText("Cancel");
        cancelButton.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        cancelButton.setTextColor(COLOR_TEXT_MUTED);
        cancelButton.setGravity(Gravity.CENTER);
        cancelButton.setPadding(dpToPx(16), dpToPx(16), dpToPx(16), dpToPx(8));
        cancelButton.setClickable(true);
        cancelButton.setFocusable(true);
        
        // Subtle ripple effect
        float[] radii = new float[8];
        for (int i = 0; i < 8; i++) radii[i] = dpToPx(8);
        RoundRectShape roundRectShape = new RoundRectShape(radii, null, null);
        ShapeDrawable maskDrawable = new ShapeDrawable(roundRectShape);
        RippleDrawable ripple = new RippleDrawable(
            ColorStateList.valueOf(COLOR_RIPPLE),
            null,
            maskDrawable
        );
        cancelButton.setBackground(ripple);
        
        cancelButton.setOnClickListener(v -> {
            v.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY);
            dismissDialog();
            finish();
        });
        
        LinearLayout.LayoutParams cancelParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        cancelParams.topMargin = dpToPx(8);
        cancelButton.setLayoutParams(cancelParams);
        parent.addView(cancelButton);
    }
    
    private RippleDrawable createRippleDrawable(int backgroundColor, int borderColor, int cornerRadius) {
        // Content drawable (background)
        GradientDrawable contentDrawable = new GradientDrawable();
        contentDrawable.setColor(backgroundColor);
        contentDrawable.setCornerRadius(cornerRadius);
        contentDrawable.setStroke(dpToPx(1), borderColor);
        
        // Mask for ripple bounds
        float[] radii = new float[8];
        for (int i = 0; i < 8; i++) radii[i] = cornerRadius;
        RoundRectShape roundRectShape = new RoundRectShape(radii, null, null);
        ShapeDrawable maskDrawable = new ShapeDrawable(roundRectShape);
        
        return new RippleDrawable(
            ColorStateList.valueOf(COLOR_RIPPLE),
            contentDrawable,
            maskDrawable
        );
    }
    
    private RippleDrawable createMessageCardBackground() {
        int cornerRadius = dpToPx(12);
        
        // Base background
        GradientDrawable baseDrawable = new GradientDrawable();
        baseDrawable.setColor(COLOR_BG);
        baseDrawable.setCornerRadius(cornerRadius);
        baseDrawable.setStroke(dpToPx(1), COLOR_BORDER);
        
        // Left accent bar
        GradientDrawable accentDrawable = new GradientDrawable();
        accentDrawable.setColor(COLOR_PRIMARY);
        float[] accentRadii = {cornerRadius, cornerRadius, 0, 0, 0, 0, cornerRadius, cornerRadius};
        accentDrawable.setCornerRadii(accentRadii);
        
        // Combine layers
        LayerDrawable layerDrawable = new LayerDrawable(new android.graphics.drawable.Drawable[]{baseDrawable, accentDrawable});
        layerDrawable.setLayerWidth(1, dpToPx(3));
        layerDrawable.setLayerGravity(1, Gravity.LEFT);
        
        // Mask for ripple bounds
        float[] radii = new float[8];
        for (int i = 0; i < 8; i++) radii[i] = cornerRadius;
        RoundRectShape roundRectShape = new RoundRectShape(radii, null, null);
        ShapeDrawable maskDrawable = new ShapeDrawable(roundRectShape);
        
        return new RippleDrawable(
            ColorStateList.valueOf(COLOR_RIPPLE),
            layerDrawable,
            maskDrawable
        );
    }
    
    private void dismissDialog() {
        if (dialog != null && dialog.isShowing()) {
            dialog.dismiss();
        }
    }
    
    private void openWhatsApp(String phoneNumber, String message) {
        String cleanNumber = phoneNumber.replaceAll("[^0-9]", "");
        String url = "https://wa.me/" + cleanNumber;
        
        if (message != null && !message.isEmpty()) {
            try {
                url += "?text=" + URLEncoder.encode(message, "UTF-8");
            } catch (UnsupportedEncodingException e) {
                Log.w(TAG, "Failed to encode message", e);
            }
        }
        
        Intent whatsappIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        whatsappIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        
        try {
            startActivity(whatsappIntent);
            Log.d(TAG, "Opened WhatsApp" + (message != null ? " with message" : " (chat only)"));
        } catch (Exception e) {
            Log.e(TAG, "Failed to open WhatsApp", e);
        }
        
        finish();
    }
    
    private int dpToPx(int dp) {
        return (int) TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP, dp, getResources().getDisplayMetrics());
    }
    
    @Override
    protected void onDestroy() {
        dismissDialog();
        super.onDestroy();
    }
}
