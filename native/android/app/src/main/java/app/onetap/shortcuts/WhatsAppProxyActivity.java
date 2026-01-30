package app.onetap.shortcuts;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import android.util.TypedValue;
import android.view.Gravity;
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
        
        // Show native dialog directly - no app launch needed!
        showMessageChooserDialog(phoneNumber, messages, contactName);
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
    
    private void showMessageChooserDialog(String phoneNumber, String[] messages, String contactName) {
        // Build dialog content programmatically for better control
        ScrollView scrollView = new ScrollView(this);
        scrollView.setFillViewport(true);
        
        LinearLayout mainLayout = new LinearLayout(this);
        mainLayout.setOrientation(LinearLayout.VERTICAL);
        int padding = dpToPx(20);
        mainLayout.setPadding(padding, padding, padding, padding);
        
        // Title
        TextView title = new TextView(this);
        title.setText(contactName != null && !contactName.isEmpty() 
            ? "💬 Message for " + contactName 
            : "💬 Choose message");
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 18);
        title.setTextColor(Color.parseColor("#1a1a1a"));
        title.setTypeface(null, android.graphics.Typeface.BOLD);
        LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        titleParams.bottomMargin = dpToPx(16);
        title.setLayoutParams(titleParams);
        mainLayout.addView(title);
        
        // Open Chat option
        LinearLayout openChatOption = createOptionCard(
            "📱 Open chat",
            "Start fresh, type your own message"
        );
        openChatOption.setOnClickListener(v -> {
            dismissDialog();
            openWhatsApp(phoneNumber, null);
        });
        LinearLayout.LayoutParams openChatParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        openChatParams.bottomMargin = dpToPx(12);
        openChatOption.setLayoutParams(openChatParams);
        mainLayout.addView(openChatOption);
        
        // Divider with text
        LinearLayout dividerLayout = new LinearLayout(this);
        dividerLayout.setOrientation(LinearLayout.HORIZONTAL);
        dividerLayout.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout.LayoutParams dividerLayoutParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        dividerLayoutParams.bottomMargin = dpToPx(12);
        dividerLayout.setLayoutParams(dividerLayoutParams);
        
        View leftLine = new View(this);
        leftLine.setBackgroundColor(Color.parseColor("#e0e0e0"));
        LinearLayout.LayoutParams lineParams = new LinearLayout.LayoutParams(0, dpToPx(1), 1f);
        leftLine.setLayoutParams(lineParams);
        dividerLayout.addView(leftLine);
        
        TextView dividerText = new TextView(this);
        dividerText.setText("  or use a quick message  ");
        dividerText.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        dividerText.setTextColor(Color.parseColor("#888888"));
        dividerLayout.addView(dividerText);
        
        View rightLine = new View(this);
        rightLine.setBackgroundColor(Color.parseColor("#e0e0e0"));
        rightLine.setLayoutParams(new LinearLayout.LayoutParams(0, dpToPx(1), 1f));
        dividerLayout.addView(rightLine);
        
        mainLayout.addView(dividerLayout);
        
        // Message options
        for (int i = 0; i < messages.length; i++) {
            final String message = messages[i];
            LinearLayout messageOption = createMessageOptionCard(message);
            messageOption.setOnClickListener(v -> {
                dismissDialog();
                openWhatsApp(phoneNumber, message);
            });
            
            LinearLayout.LayoutParams messageParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            if (i < messages.length - 1) {
                messageParams.bottomMargin = dpToPx(8);
            }
            messageOption.setLayoutParams(messageParams);
            mainLayout.addView(messageOption);
        }
        
        scrollView.addView(mainLayout);
        
        // Create dialog
        AlertDialog.Builder builder = new AlertDialog.Builder(this, android.R.style.Theme_Material_Light_Dialog);
        builder.setView(scrollView);
        builder.setNegativeButton("Cancel", (d, w) -> {
            dismissDialog();
            finish();
        });
        builder.setOnCancelListener(d -> finish());
        builder.setOnDismissListener(d -> {
            // Only finish if dialog was dismissed without action
            if (!isFinishing()) {
                finish();
            }
        });
        
        dialog = builder.create();
        
        // Style the dialog window
        dialog.setOnShowListener(d -> {
            if (dialog.getWindow() != null) {
                GradientDrawable background = new GradientDrawable();
                background.setColor(Color.WHITE);
                background.setCornerRadius(dpToPx(16));
                dialog.getWindow().setBackgroundDrawable(background);
            }
        });
        
        dialog.show();
    }
    
    private LinearLayout createOptionCard(String titleText, String subtitleText) {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dpToPx(16), dpToPx(16), dpToPx(16), dpToPx(16));
        card.setClickable(true);
        card.setFocusable(true);
        
        // Background with rounded corners
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.parseColor("#f5f5f5"));
        bg.setCornerRadius(dpToPx(12));
        card.setBackground(bg);
        
        TextView title = new TextView(this);
        title.setText(titleText);
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        title.setTextColor(Color.parseColor("#1a1a1a"));
        title.setTypeface(null, android.graphics.Typeface.BOLD);
        card.addView(title);
        
        TextView subtitle = new TextView(this);
        subtitle.setText(subtitleText);
        subtitle.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        subtitle.setTextColor(Color.parseColor("#666666"));
        LinearLayout.LayoutParams subtitleParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        subtitleParams.topMargin = dpToPx(4);
        subtitle.setLayoutParams(subtitleParams);
        card.addView(subtitle);
        
        return card;
    }
    
    private LinearLayout createMessageOptionCard(String message) {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dpToPx(16), dpToPx(14), dpToPx(16), dpToPx(14));
        card.setClickable(true);
        card.setFocusable(true);
        
        // Background with rounded corners
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.parseColor("#f5f5f5"));
        bg.setCornerRadius(dpToPx(12));
        card.setBackground(bg);
        
        TextView messageText = new TextView(this);
        // Truncate long messages for display
        String displayMessage = message.length() > 80 
            ? message.substring(0, 77) + "..." 
            : message;
        messageText.setText("💬 \"" + displayMessage + "\"");
        messageText.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        messageText.setTextColor(Color.parseColor("#1a1a1a"));
        messageText.setMaxLines(3);
        messageText.setEllipsize(android.text.TextUtils.TruncateAt.END);
        card.addView(messageText);
        
        return card;
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
