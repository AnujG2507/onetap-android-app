package app.onetap.access;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.ColorStateList;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.graphics.drawable.ShapeDrawable;
import android.graphics.drawable.shapes.RoundRectShape;
import android.os.Bundle;
import android.util.DisplayMetrics;
import android.util.Log;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.ImageButton;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

/**
 * TextProxyActivity
 *
 * Premium centered floating dialog that renders markdown or checklist text shortcuts.
 * Matches the WhatsApp chooser aesthetic — centered card over dimmed home screen,
 * indigo accent bar, theme-aware colors synced from app settings.
 *
 * Intent extras:
 *   shortcut_id   - string, used for usage tracking + checklist state key
 *   shortcut_name - string, displayed as the dialog title
 *   text_content  - string, raw markdown or checklist text
 *   is_checklist  - boolean, whether to render as interactive checklist
 */
public class TextProxyActivity extends Activity {

    private static final String TAG = "TextProxyActivity";
    private static final String PREFS_CHECKLIST = "checklist_state";

    // App accent — primary blue (#0080FF), matches the app's design system primary color
    private static final int COLOR_ACCENT = Color.parseColor("#0080FF");

    // Theme-aware colors (set in initializeThemeColors based on resolvedTheme)
    private int colorBg;
    private int colorSurface;
    private int colorBorder;
    private int colorText;
    private int colorTextMuted;
    private int colorDivider;
    private int colorCodeBg;
    private int colorRipple;
    private boolean isDarkTheme;

    private WebView webView;
    private AlertDialog dialog;
    private String shortcutId;
    private String textContent;
    private String shortcutName;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Initialize theme-aware colors (mirrors WhatsAppProxyActivity.initializeThemeColors)
        initializeThemeColors();

        shortcutId = getIntent().getStringExtra("shortcut_id");
        shortcutName = getIntent().getStringExtra("shortcut_name");
        textContent = getIntent().getStringExtra("text_content");
        boolean isChecklist = getIntent().getBooleanExtra("is_checklist", false);

        if (textContent == null) textContent = "";
        if (shortcutName == null) shortcutName = "";

        // Track usage
        if (shortcutId != null) {
            NativeUsageTracker.recordTap(this, shortcutId);
        }

        showPremiumDialog(shortcutName, textContent, isChecklist);
    }

    /**
     * Initialize colors based on app theme setting.
     * Reads "resolvedTheme" (camelCase) — same key ShortcutPlugin.syncTheme writes.
     * Falls back to system night mode if no preference is stored.
     */
    private void initializeThemeColors() {
        SharedPreferences prefs = getSharedPreferences("app_settings", Context.MODE_PRIVATE);
        String resolvedTheme = prefs.getString("resolvedTheme", null);

        if (resolvedTheme == null) {
            // System fallback
            int nightModeFlags = getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK;
            isDarkTheme = (nightModeFlags == Configuration.UI_MODE_NIGHT_YES);
        } else {
            isDarkTheme = "dark".equals(resolvedTheme);
        }

        Log.d(TAG, "Using theme: " + (isDarkTheme ? "dark" : "light"));

        if (isDarkTheme) {
            colorBg       = Color.parseColor("#1A1A1A");
            colorSurface  = Color.parseColor("#252525");
            colorBorder   = Color.parseColor("#3A3A3A");
            colorText     = Color.parseColor("#F5F5F5");
            colorTextMuted= Color.parseColor("#9CA3AF");
            colorDivider  = Color.parseColor("#3A3A3A");
            colorCodeBg   = Color.parseColor("#2C2C2E");
            colorRipple   = Color.parseColor("#30FFFFFF");
        } else {
            colorBg       = Color.parseColor("#FFFFFF");
            colorSurface  = Color.parseColor("#FAFAFA");
            colorBorder   = Color.parseColor("#E5E5E5");
            colorText     = Color.parseColor("#1A1A1A");
            colorTextMuted= Color.parseColor("#6B7280");
            colorDivider  = Color.parseColor("#E0E0E0");
            colorCodeBg   = Color.parseColor("#F4F4F4");
            colorRipple   = Color.parseColor("#20000000");
        }
    }

    private void showPremiumDialog(String shortcutName, String textContent, boolean isChecklist) {
        // ── Screen height cap for WebView ─────────────────────────────────────
        DisplayMetrics dm = new DisplayMetrics();
        getWindowManager().getDefaultDisplay().getMetrics(dm);
        int maxWebViewHeight = (int) (dm.heightPixels * 0.60f);

        // ── Outer ScrollView ──────────────────────────────────────────────────
        ScrollView scrollView = new ScrollView(this);
        scrollView.setFillViewport(true);
        scrollView.setBackgroundColor(colorBg);

        LinearLayout mainLayout = new LinearLayout(this);
        mainLayout.setOrientation(LinearLayout.VERTICAL);
        mainLayout.setBackgroundColor(colorBg);

        // ── Indigo accent bar at top (matching WhatsApp's green bar) ──────────
        View accentBar = new View(this);
        accentBar.setBackgroundColor(COLOR_ACCENT);
        LinearLayout.LayoutParams accentParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, dpToPx(4));
        accentBar.setLayoutParams(accentParams);
        mainLayout.addView(accentBar);

        // ── Content container with padding ────────────────────────────────────
        LinearLayout contentLayout = new LinearLayout(this);
        contentLayout.setOrientation(LinearLayout.VERTICAL);
        int padding = dpToPx(20);
        contentLayout.setPadding(padding, dpToPx(16), padding, 0);

        // ── Header row: [Title (flex)] [Edit] [Share] ────────────────────────
        LinearLayout headerRow = new LinearLayout(this);
        headerRow.setOrientation(LinearLayout.HORIZONTAL);
        headerRow.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout.LayoutParams headerRowParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        headerRowParams.bottomMargin = dpToPx(4);
        headerRow.setLayoutParams(headerRowParams);

        // Title — left-aligned, flex weight
        TextView title = new TextView(this);
        title.setText(shortcutName);
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 17);
        title.setTextColor(colorText);
        title.setTypeface(null, Typeface.BOLD);
        title.setGravity(Gravity.START | Gravity.CENTER_VERTICAL);
        LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(
            0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        title.setLayoutParams(titleParams);
        headerRow.addView(title);

        // Premium icon buttons — 40dp touch targets, circular ripple (matches PDF viewer)
        int iconBtnSize = dpToPx(40);
        int rippleRes = isDarkTheme ? R.drawable.ripple_circle : R.drawable.ripple_circle_dark;

        // Edit button — indigo tinted pencil icon
        ImageButton editBtn = new ImageButton(this);
        editBtn.setImageResource(R.drawable.ic_text_edit);
        editBtn.setBackgroundResource(rippleRes);
        editBtn.setColorFilter(COLOR_ACCENT);
        editBtn.setScaleType(ImageView.ScaleType.CENTER);
        editBtn.setContentDescription("Edit");
        editBtn.setLayoutParams(new LinearLayout.LayoutParams(iconBtnSize, iconBtnSize));
        editBtn.setOnClickListener(v -> openEditInApp());
        headerRow.addView(editBtn);

        // Copy button — muted tinted clipboard icon
        ImageButton copyBtn = new ImageButton(this);
        copyBtn.setImageResource(R.drawable.ic_text_copy);
        copyBtn.setBackgroundResource(rippleRes);
        copyBtn.setColorFilter(colorTextMuted);
        copyBtn.setScaleType(ImageView.ScaleType.CENTER);
        copyBtn.setContentDescription("Copy");
        copyBtn.setLayoutParams(new LinearLayout.LayoutParams(iconBtnSize, iconBtnSize));
        copyBtn.setOnClickListener(v -> copyText());
        headerRow.addView(copyBtn);


        // Share button — muted tinted share icon (reuses existing ic_share drawable)
        ImageButton shareBtn = new ImageButton(this);
        shareBtn.setImageResource(R.drawable.ic_share);
        shareBtn.setBackgroundResource(rippleRes);
        shareBtn.setColorFilter(colorTextMuted);
        shareBtn.setScaleType(ImageView.ScaleType.CENTER);
        shareBtn.setContentDescription("Share");
        shareBtn.setLayoutParams(new LinearLayout.LayoutParams(iconBtnSize, iconBtnSize));
        shareBtn.setOnClickListener(v -> shareText());
        headerRow.addView(shareBtn);

        contentLayout.addView(headerRow);

        // ── Subtitle: type label ──────────────────────────────────────────────
        TextView subtitle = new TextView(this);
        subtitle.setText(isChecklist ? "Checklist" : "Note");
        subtitle.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        subtitle.setTextColor(colorTextMuted);
        subtitle.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams subtitleParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        subtitleParams.bottomMargin = dpToPx(14);
        subtitle.setLayoutParams(subtitleParams);
        contentLayout.addView(subtitle);

        // ── Divider ───────────────────────────────────────────────────────────
        View divider = new View(this);
        divider.setBackgroundColor(colorDivider);
        LinearLayout.LayoutParams dividerParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, dpToPx(1));
        dividerParams.bottomMargin = 0;
        divider.setLayoutParams(dividerParams);
        contentLayout.addView(divider);

        // ── WebView (capped at 60% screen height) ─────────────────────────────
        webView = new WebView(this);
        LinearLayout.LayoutParams webParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            maxWebViewHeight
        );
        webView.setLayoutParams(webParams);
        webView.setBackgroundColor(colorBg);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        webView.setWebViewClient(new WebViewClient());
        webView.addJavascriptInterface(new ChecklistBridge(), "Android");

        // Load saved checklist state from SharedPreferences (sole source of truth)
        java.util.Map<String, Boolean> savedState = new java.util.HashMap<>();
        if (isChecklist && shortcutId != null) {
            SharedPreferences checkPrefs = getSharedPreferences(PREFS_CHECKLIST, MODE_PRIVATE);
            String prefix = "chk_" + shortcutId + "_";
            for (java.util.Map.Entry<String, ?> entry : checkPrefs.getAll().entrySet()) {
                if (entry.getKey().startsWith(prefix) && entry.getValue() instanceof Boolean) {
                    savedState.put(entry.getKey(), (Boolean) entry.getValue());
                }
            }
        }
        String html = buildHtml(textContent, isChecklist, shortcutId, savedState);
        webView.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null);
        contentLayout.addView(webView, webParams);

        mainLayout.addView(contentLayout);

        // ── Done button (matching WhatsApp's Cancel button pattern) ──────────
        addDoneButton(mainLayout, isChecklist);

        scrollView.addView(mainLayout);

        // ── Build AlertDialog using the shared MessageChooserDialog style ─────
        AlertDialog.Builder builder = new AlertDialog.Builder(this, R.style.MessageChooserDialog);
        builder.setView(scrollView);
        builder.setOnCancelListener(d -> finish());
        builder.setOnDismissListener(d -> {
            if (!isFinishing()) {
                finish();
            }
        });

        dialog = builder.create();

        // Override background to respect dark/light colorBg and colorBorder
        dialog.setOnShowListener(d -> {
            if (dialog.getWindow() != null) {
                GradientDrawable bg = new GradientDrawable();
                bg.setColor(colorBg);
                bg.setCornerRadius(dpToPx(20));
                bg.setStroke(dpToPx(1), colorBorder);
                dialog.getWindow().setBackgroundDrawable(bg);
            }
        });

        dialog.show();
    }

    /**
     * Adds a "Done" close button at the bottom of the dialog,
     * matching WhatsApp's addCancelButton() pattern.
     */
    private void addDoneButton(LinearLayout parent, boolean isChecklist) {
        // Divider above button row
        View divider = new View(this);
        divider.setBackgroundColor(colorDivider);
        LinearLayout.LayoutParams dividerParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, dpToPx(1));
        parent.addView(divider, dividerParams);

        if (isChecklist) {
            // Two-column footer: [Reset] | [Done]
            LinearLayout footerRow = new LinearLayout(this);
            footerRow.setOrientation(LinearLayout.HORIZONTAL);

            // Reset button (left, accent blue)
            TextView resetBtn = new TextView(this);
            resetBtn.setText("Reset");
            resetBtn.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
            resetBtn.setTextColor(COLOR_ACCENT);
            resetBtn.setGravity(Gravity.CENTER);
            resetBtn.setPadding(dpToPx(20), dpToPx(16), dpToPx(20), dpToPx(16));
            // Ripple — rounded bottom-left only
            float[] resetRadii = new float[]{0, 0, 0, 0, 0, 0, dpToPx(20), dpToPx(20)};
            ShapeDrawable resetMask = new ShapeDrawable(new RoundRectShape(resetRadii, null, null));
            resetMask.getPaint().setColor(Color.WHITE);
            GradientDrawable resetContent = new GradientDrawable();
            resetContent.setColor(colorBg);
            RippleDrawable resetRipple = new RippleDrawable(
                ColorStateList.valueOf(colorRipple), resetContent, resetMask);
            resetBtn.setBackground(resetRipple);
            resetBtn.setClickable(true);
            resetBtn.setFocusable(true);
            resetBtn.setOnClickListener(v -> clearChecklistState());
            LinearLayout.LayoutParams resetParams = new LinearLayout.LayoutParams(
                0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
            footerRow.addView(resetBtn, resetParams);

            // Vertical divider between buttons
            View vDivider = new View(this);
            vDivider.setBackgroundColor(colorDivider);
            LinearLayout.LayoutParams vDividerParams = new LinearLayout.LayoutParams(
                dpToPx(1), ViewGroup.LayoutParams.MATCH_PARENT);
            footerRow.addView(vDivider, vDividerParams);

            // Done button (right, muted)
            TextView doneBtn = new TextView(this);
            doneBtn.setText("Done");
            doneBtn.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
            doneBtn.setTextColor(colorTextMuted);
            doneBtn.setGravity(Gravity.CENTER);
            doneBtn.setPadding(dpToPx(20), dpToPx(16), dpToPx(20), dpToPx(16));
            // Ripple — rounded bottom-right only
            float[] doneRadii = new float[]{0, 0, 0, 0, dpToPx(20), dpToPx(20), 0, 0};
            ShapeDrawable doneMask = new ShapeDrawable(new RoundRectShape(doneRadii, null, null));
            doneMask.getPaint().setColor(Color.WHITE);
            GradientDrawable doneContent = new GradientDrawable();
            doneContent.setColor(colorBg);
            RippleDrawable doneRipple = new RippleDrawable(
                ColorStateList.valueOf(colorRipple), doneContent, doneMask);
            doneBtn.setBackground(doneRipple);
            doneBtn.setClickable(true);
            doneBtn.setFocusable(true);
            doneBtn.setOnClickListener(v -> dismissDialog());
            LinearLayout.LayoutParams doneParams = new LinearLayout.LayoutParams(
                0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
            footerRow.addView(doneBtn, doneParams);

            parent.addView(footerRow, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        } else {
            // Note mode — single full-width Done button
            TextView doneBtn = new TextView(this);
            doneBtn.setText("Done");
            doneBtn.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
            doneBtn.setTextColor(colorTextMuted);
            doneBtn.setGravity(Gravity.CENTER);
            doneBtn.setPadding(dpToPx(20), dpToPx(16), dpToPx(20), dpToPx(16));
            float[] radii = new float[]{0, 0, 0, 0, dpToPx(20), dpToPx(20), dpToPx(20), dpToPx(20)};
            ShapeDrawable mask = new ShapeDrawable(new RoundRectShape(radii, null, null));
            mask.getPaint().setColor(Color.WHITE);
            GradientDrawable content = new GradientDrawable();
            content.setColor(colorBg);
            RippleDrawable ripple = new RippleDrawable(
                ColorStateList.valueOf(colorRipple), content, mask);
            doneBtn.setBackground(ripple);
            doneBtn.setClickable(true);
            doneBtn.setFocusable(true);
            doneBtn.setOnClickListener(v -> dismissDialog());
            parent.addView(doneBtn, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        }
    }

    /**
     * Opens the app and triggers the edit sheet for this shortcut.
     * Mirrors ShortcutEditProxyActivity logic — stores pending edit ID in SharedPreferences
     * so usePendingShortcutEdit hook picks it up on app launch.
     */
    private void openEditInApp() {
        if (shortcutId == null) return;
        getSharedPreferences("onetap", MODE_PRIVATE)
            .edit()
            .putString("pending_edit_shortcut_id", shortcutId)
            .apply();
        Intent intent = new Intent(this, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        startActivity(intent);
        dismissDialog();
    }

    /**
     * Opens the native Android share sheet with the raw text content.
     */
    private void shareText() {
        Intent shareIntent = new Intent(Intent.ACTION_SEND);
        shareIntent.setType("text/plain");
        shareIntent.putExtra(Intent.EXTRA_TEXT, textContent);
        shareIntent.putExtra(Intent.EXTRA_SUBJECT, shortcutName);
        startActivity(Intent.createChooser(shareIntent, null));
        dismissDialog();
    }

    /**
     * Copies the raw text content to the system clipboard and shows a Toast confirmation.
     * Does NOT dismiss the dialog so the user can continue reading after copying.
     */
    private void copyText() {
        ClipboardManager clipboard = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
        if (clipboard != null) {
            ClipData clip = ClipData.newPlainText(shortcutName, textContent);
            clipboard.setPrimaryClip(clip);
        }
        Toast.makeText(this, "Copied to clipboard", Toast.LENGTH_SHORT).show();
    }

    /**
     * Shows a confirm dialog then clears all checked states for this shortcut
     * from SharedPreferences and resets the WebView DOM.
     */
    private void clearChecklistState() {
        if (shortcutId == null) return;
        new AlertDialog.Builder(this)
            .setTitle("Reset checklist?")
            .setMessage("All checked items will be unchecked. This cannot be undone.")
            .setPositiveButton("Reset", (d, w) -> {
                SharedPreferences prefs = getSharedPreferences(PREFS_CHECKLIST, MODE_PRIVATE);
                SharedPreferences.Editor editor = prefs.edit();
                String prefix = "chk_" + shortcutId + "_";
                for (String key : new java.util.HashSet<>(prefs.getAll().keySet())) {
                    if (key.startsWith(prefix)) editor.remove(key);
                }
                editor.apply();
                if (webView != null) {
                    webView.evaluateJavascript("resetAllItems()", null);
                }
                Toast.makeText(this, "Checklist reset", Toast.LENGTH_SHORT).show();
            })
            .setNegativeButton("Cancel", null)
            .show();
    }

    private void dismissDialog() {
        if (dialog != null && dialog.isShowing()) {
            dialog.dismiss();
        }
        finish();
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            dismissDialog();
        }
    }

    @Override
    protected void onDestroy() {
        if (dialog != null && dialog.isShowing()) {
            dialog.dismiss();
        }
        super.onDestroy();
    }

    private int dpToPx(int value) {
        return Math.round(TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP, value,
            getResources().getDisplayMetrics()
        ));
    }

    /**
     * Builds the self-contained HTML for markdown or checklist rendering.
     * Uses instance color fields so dark/light mode is correctly reflected in the WebView.
     */
    private String buildHtml(String text, boolean isChecklist, String sid, java.util.Map<String, Boolean> savedState) {
        // Escape text for JS template-literal embedding
        String escaped = text
                .replace("\\", "\\\\")
                .replace("`", "\\`")
                .replace("$", "\\$");

        // Convert int colors to hex strings for CSS
        String bg      = colorToHex(colorBg);
        String fg      = colorToHex(colorText);
        String codeBg  = colorToHex(colorCodeBg);
        String hrColor = colorToHex(colorDivider);
        String accent  = "#0080FF";

        // Inline, self-contained markdown renderer — no CDN dependency.
        String inlineMarkdown = ""
            + "function simpleMarkdown(t){"
            + "  var lines=t.split('\\n'),out='';"
            + "  var inCode=false,codeBuf='';"
            + "  lines.forEach(function(l){"
            + "    if(l.startsWith('```')){"
            + "      if(inCode){out+='<pre><code>'+escHtml(codeBuf)+'</code></pre>';codeBuf='';inCode=false;}"
            + "      else inCode=true;"
            + "      return;"
            + "    }"
            + "    if(inCode){codeBuf+=l+'\\n';return;}"
            + "    if(/^### /.test(l)){out+='<h3>'+inline(l.slice(4))+'</h3>';return;}"
            + "    if(/^## /.test(l)){out+='<h2>'+inline(l.slice(3))+'</h2>';return;}"
            + "    if(/^# /.test(l)){out+='<h1>'+inline(l.slice(2))+'</h1>';return;}"
            + "    if(/^---+$/.test(l.trim())){out+='<hr>';return;}"
            + "    if(l.trim()===''){out+='<br>';return;}"
            + "    out+='<p>'+inline(l)+'</p>';"
            + "  });"
            + "  return out;"
            + "}"
            + "function inline(s){"
            + "  s=escHtml(s);"
            + "  s=s.replace(/`([^`]+)`/g,'<code>$1</code>');"
            + "  s=s.replace(/\\*\\*([^*]+)\\*\\*/g,'<strong>$1</strong>');"
            + "  s=s.replace(/\\*([^*]+)\\*/g,'<em>$1</em>');"
            + "  s=s.replace(/_([^_]+)_/g,'<em>$1</em>');"
            + "  return s;"
            + "}"
            + "function escHtml(s){"
            + "  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');"
            + "}";

        // Build savedState JSON from Java SharedPreferences — sole source of truth
        StringBuilder savedJson = new StringBuilder("{");
        for (java.util.Map.Entry<String, Boolean> e : savedState.entrySet()) {
            savedJson.append("\"").append(e.getKey()).append("\":").append(e.getValue()).append(",");
        }
        if (savedJson.length() > 1) savedJson.setLength(savedJson.length() - 1);
        savedJson.append("}");

        // Checklist renderer: supports - [ ] and - [x] format; reads from savedState (no localStorage)
        // onchange is used (not onclick on div) to avoid the double-toggle caused by label+div both firing
        String checklistRenderer = ""
            + "var savedState=" + savedJson + ";"
            + "function renderChecklist(text, sid){"
            + "  var lines=text.split('\\n'),html='';"
            + "  lines.forEach(function(line,i){"
            + "    var m=line.match(/^- \\[( |x)\\] (.*)/i);"
            + "    if(m){"
            + "      var key='chk_'+sid+'_'+i;"
            + "      var checked=(savedState[key]!==undefined)?savedState[key]:(m[1].toLowerCase()==='x');"
            + "      html+='<div class=\"ci'+(checked?' done':'')+'\" id=\"ci'+i+'\">';"
            + "      html+='<input type=\"checkbox\" id=\"cb'+i+'\"'+(checked?' checked':'')+' onchange=\"onCheck('+i+',this.checked)\">';"
            + "      html+='<label for=\"cb'+i+'\">'+escHtml(m[2])+'</label></div>';"
            + "    } else if(line.trim()!==''){"
            + "      html+='<p>'+escHtml(line)+'</p>';"
            + "    } else {"
            + "      html+='<br>';"
            + "    }"
            + "  });"
            + "  return html;"
            + "}"
            + "function onCheck(i,checked){"
            + "  var item=document.getElementById('ci'+i);"
            + "  if(!item)return;"
            + "  var key='chk_'+" + (sid != null ? "'" + sid.replace("'", "\\'") + "'" : "''") + "+'_'+i;"
            + "  savedState[key]=checked;"
            + "  item.className='ci'+(checked?' done':'');"
            + "  if(window.Android&&Android.saveCheckboxState)Android.saveCheckboxState(key,checked);"
            + "}"
            + "function resetAllItems(){"
            + "  var items=document.querySelectorAll('.ci');"
            + "  items.forEach(function(item){"
            + "    item.classList.remove('done');"
            + "    var cb=item.querySelector('input[type=checkbox]');"
            + "    if(cb)cb.checked=false;"
            + "  });"
            + "}";

        String renderCall = isChecklist
            ? "el.innerHTML=renderChecklist(rawText," + (sid != null ? "'" + sid.replace("'", "\\'") + "'" : "''") + ");"
            : "el.innerHTML=simpleMarkdown(rawText);";

        return "<!DOCTYPE html><html><head>"
            + "<meta charset='UTF-8'>"
            + "<meta name='viewport' content='width=device-width,initial-scale=1,user-scalable=no'>"
            + "<style>"
            + "html,body{margin:0;padding:0;background:" + bg + ";color:" + fg + "}"
            + "body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;"
            + "  padding:16px 20px 24px;background:" + bg + ";color:" + fg + ";line-height:1.65}"
            + "h1,h2,h3{font-weight:700;margin-top:1.2em;margin-bottom:0.3em}"
            + "h1{font-size:1.4em}h2{font-size:1.2em}h3{font-size:1.05em}"
            + "p{margin:0.5em 0}"
            + "hr{border:none;border-top:1px solid " + hrColor + ";margin:1.2em 0}"
            + "code{background:" + codeBg + ";padding:2px 5px;border-radius:4px;font-size:0.88em;font-family:monospace}"
            + "pre{background:" + codeBg + ";padding:12px;border-radius:8px;overflow-x:auto}"
            + "pre code{background:none;padding:0}"
            + "strong{font-weight:700}em{font-style:italic}"
            + ".ci{display:flex;align-items:flex-start;gap:12px;margin:12px 0;cursor:pointer}"
            + ".ci input[type=checkbox]{width:22px;height:22px;margin:0;accent-color:" + accent + ";flex-shrink:0;cursor:pointer;margin-top:1px}"
            + ".ci label{cursor:pointer;line-height:1.5;flex:1;font-size:1em}"
            + ".ci.done label{text-decoration:line-through;opacity:0.45}"
            + "</style>"
            + "</head><body>"
            + "<div id='content'></div>"
            + "<script>"
            + inlineMarkdown
            + checklistRenderer
            + "var rawText=`" + escaped + "`;"
            + "var el=document.getElementById('content');"
            + renderCall
            + "</script>"
            + "</body></html>";
    }

    /** Converts an int color to a CSS hex string (e.g. #1A1A1A) */
    private String colorToHex(int color) {
        return String.format("#%06X", (0xFFFFFF & color));
    }

    /** JS interface for checklist state persistence (SharedPreferences backup) */
    private class ChecklistBridge {
        @JavascriptInterface
        public void saveCheckboxState(String key, boolean checked) {
            getSharedPreferences(PREFS_CHECKLIST, MODE_PRIVATE)
                    .edit().putBoolean(key, checked).apply();
            Log.d(TAG, "Checkbox state saved: " + key + "=" + checked);
        }
    }
}
