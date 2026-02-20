package app.onetap.access;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.util.DisplayMetrics;
import android.util.Log;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * TextProxyActivity
 *
 * Premium bottom-sheet dialog that renders markdown or checklist text shortcuts.
 * Opens via ShortcutPlugin.openTextShortcut() — slides up from bottom as a floating
 * AlertDialog over the dimmed home screen, matching the WhatsApp chooser aesthetic.
 *
 * Intent extras:
 *   shortcut_id   - string, used for usage tracking + checklist state key
 *   shortcut_name - string, displayed in the top navigation bar
 *   text_content  - string, raw markdown or checklist text
 *   is_checklist  - boolean, whether to render as interactive checklist
 */
public class TextProxyActivity extends Activity {

    private static final String TAG = "TextProxyActivity";
    private static final String PREFS_CHECKLIST = "checklist_state";
    private static final String PREFS_SETTINGS = "app_settings";

    private WebView webView;
    private AlertDialog dialog;
    private String shortcutId;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Transparent activity window — the dialog provides all the UI
        setContentView(new View(this));

        shortcutId = getIntent().getStringExtra("shortcut_id");
        String shortcutName = getIntent().getStringExtra("shortcut_name");
        String textContent = getIntent().getStringExtra("text_content");
        boolean isChecklist = getIntent().getBooleanExtra("is_checklist", false);

        if (textContent == null) textContent = "";
        if (shortcutName == null) shortcutName = "";

        // Track usage
        if (shortcutId != null) {
            NativeUsageTracker.recordTap(this, shortcutId);
        }

        boolean isDark = isDarkTheme();
        showBottomSheet(shortcutName, textContent, isChecklist, isDark);
    }

    private void showBottomSheet(String shortcutName, String textContent, boolean isChecklist, boolean isDark) {
        // ── Colors ──────────────────────────────────────────────────────────
        int bgColor      = isDark ? Color.parseColor("#1C1C1E") : Color.WHITE;
        int textColor    = isDark ? Color.parseColor("#E0E0E0") : Color.parseColor("#1A1A1A");
        int mutedColor   = isDark ? Color.parseColor("#555555") : Color.parseColor("#CCCCCC");
        int dividerColor = isDark ? Color.parseColor("#2C2C2E") : Color.parseColor("#E8E8E8");
        int pillColor    = isDark ? Color.parseColor("#3A3A3C") : Color.parseColor("#DEDEDE");
        int accentColor  = Color.parseColor("#6366f1");

        // ── Screen height cap ────────────────────────────────────────────────
        DisplayMetrics dm = new DisplayMetrics();
        getWindowManager().getDefaultDisplay().getMetrics(dm);
        int maxWebViewHeight = (int) (dm.heightPixels * 0.65f);

        // ── Rounded top-corner background drawable ──────────────────────────
        float r = dp(20);
        GradientDrawable sheetBg = new GradientDrawable();
        sheetBg.setColor(bgColor);
        sheetBg.setCornerRadii(new float[]{r, r, r, r, 0, 0, 0, 0});

        // ── Root sheet container ─────────────────────────────────────────────
        LinearLayout sheet = new LinearLayout(this);
        sheet.setOrientation(LinearLayout.VERTICAL);
        sheet.setBackground(sheetBg);
        sheet.setLayoutParams(new ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        ));

        // ── Drag handle pill ─────────────────────────────────────────────────
        FrameLayout pillWrapper = new FrameLayout(this);
        LinearLayout.LayoutParams pillWrapperParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        pillWrapperParams.topMargin = dp(12);
        pillWrapperParams.bottomMargin = dp(4);
        pillWrapper.setLayoutParams(pillWrapperParams);

        View pill = new View(this);
        GradientDrawable pillDrawable = new GradientDrawable();
        pillDrawable.setColor(pillColor);
        pillDrawable.setCornerRadius(dp(2));
        pill.setBackground(pillDrawable);
        FrameLayout.LayoutParams pillParams = new FrameLayout.LayoutParams(dp(40), dp(4));
        pillParams.gravity = Gravity.CENTER_HORIZONTAL;
        pill.setLayoutParams(pillParams);
        pillWrapper.addView(pill);
        sheet.addView(pillWrapper, pillWrapperParams);

        // ── Title row ────────────────────────────────────────────────────────
        LinearLayout titleRow = new LinearLayout(this);
        titleRow.setOrientation(LinearLayout.HORIZONTAL);
        titleRow.setGravity(Gravity.CENTER_VERTICAL);
        titleRow.setPadding(dp(20), dp(14), dp(16), dp(14));
        LinearLayout.LayoutParams titleRowParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        titleRow.setLayoutParams(titleRowParams);

        // Shortcut name
        TextView titleView = new TextView(this);
        titleView.setText(shortcutName);
        titleView.setTextColor(textColor);
        titleView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 17);
        titleView.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        titleView.setSingleLine(true);
        titleView.setEllipsize(android.text.TextUtils.TruncateAt.END);
        LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        titleView.setLayoutParams(titleParams);

        // Close button
        TextView closeBtn = new TextView(this);
        closeBtn.setText("✕");
        closeBtn.setTextColor(mutedColor);
        closeBtn.setTextSize(TypedValue.COMPLEX_UNIT_SP, 20);
        closeBtn.setPadding(dp(8), dp(4), dp(4), dp(4));
        closeBtn.setOnClickListener(v -> dismissSheet());

        titleRow.addView(titleView);
        titleRow.addView(closeBtn);
        sheet.addView(titleRow, titleRowParams);

        // ── Divider ──────────────────────────────────────────────────────────
        View divider = new View(this);
        divider.setBackgroundColor(dividerColor);
        LinearLayout.LayoutParams dividerParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, dp(1)
        );
        sheet.addView(divider, dividerParams);

        // ── WebView (capped height) ───────────────────────────────────────────
        webView = new WebView(this);
        LinearLayout.LayoutParams webParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            maxWebViewHeight
        );
        webView.setLayoutParams(webParams);
        webView.setBackgroundColor(bgColor);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        webView.setWebViewClient(new WebViewClient());
        webView.addJavascriptInterface(new ChecklistBridge(), "Android");

        String html = buildHtml(textContent, isChecklist, shortcutId, isDark);
        webView.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null);
        sheet.addView(webView, webParams);

        // ── Build AlertDialog ────────────────────────────────────────────────
        dialog = new AlertDialog.Builder(this, android.R.style.Theme_Material_Light_Dialog)
            .setView(sheet)
            .setOnCancelListener(d -> finish())
            .create();

        Window w = dialog.getWindow();
        if (w != null) {
            w.setBackgroundDrawableResource(android.R.color.transparent);
            w.setGravity(Gravity.BOTTOM);
            w.getAttributes().windowAnimations = getTextSheetAnimStyle();
            w.setLayout(WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.WRAP_CONTENT);
            w.addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND);
            WindowManager.LayoutParams lp = w.getAttributes();
            lp.dimAmount = 0.55f;
            w.setAttributes(lp);
        }

        dialog.show();
    }

    /** Returns the resource ID of the TextSheetAnimation style for window animations. */
    private int getTextSheetAnimStyle() {
        return getResources().getIdentifier("TextSheetAnimation", "style", getPackageName());
    }

    private void dismissSheet() {
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
            dismissSheet();
        }
    }

    @Override
    protected void onDestroy() {
        if (dialog != null && dialog.isShowing()) {
            dialog.dismiss();
        }
        super.onDestroy();
    }

    /** Returns true if the app is currently using dark theme. */
    private boolean isDarkTheme() {
        SharedPreferences prefs = getSharedPreferences(PREFS_SETTINGS, MODE_PRIVATE);
        String resolvedTheme = prefs.getString("resolved_theme", "light");
        return "dark".equals(resolvedTheme);
    }

    private int dp(int value) {
        return Math.round(TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP, value,
            getResources().getDisplayMetrics()
        ));
    }

    private String buildHtml(String text, boolean isChecklist, String sid, boolean isDark) {
        // Escape text for JS template-literal embedding
        String escaped = text
                .replace("\\", "\\\\")
                .replace("`", "\\`")
                .replace("$", "\\$");

        String bg       = isDark ? "#1C1C1E" : "#FFFFFF";
        String fg       = isDark ? "#E0E0E0" : "#1A1A1A";
        String codeBg   = isDark ? "#2C2C2E" : "#F4F4F4";
        String accent   = "#6366f1";
        String hrColor  = isDark ? "#2C2C2E" : "#E8E8E8";

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

        // Checklist renderer: supports - [ ] and - [x] format
        String checklistRenderer = ""
            + "function renderChecklist(text, sid){"
            + "  var lines=text.split('\\n'),html='';"
            + "  lines.forEach(function(line,i){"
            + "    var m=line.match(/^- \\[( |x)\\] (.*)/i);"
            + "    if(m){"
            + "      var savedKey='chk_'+sid+'_'+i;"
            + "      var saved=localStorage.getItem(savedKey);"
            + "      var checked=(saved!==null)?(saved==='1'):(m[1].toLowerCase()==='x');"
            + "      html+='<div class=\"ci'+(checked?' done':'')+'\" id=\"ci'+i+'\" onclick=\"toggle('+i+')\">';"
            + "      html+='<input type=\"checkbox\" id=\"cb'+i+'\"'+(checked?' checked':'')+'>';"
            + "      html+='<label for=\"cb'+i+'\">'+escHtml(m[2])+'</label></div>';"
            + "    } else if(line.trim()!==''){"
            + "      html+='<p>'+escHtml(line)+'</p>';"
            + "    } else {"
            + "      html+='<br>';"
            + "    }"
            + "  });"
            + "  return html;"
            + "}"
            + "function toggle(i){"
            + "  var item=document.getElementById('ci'+i);"
            + "  var cb=document.getElementById('cb'+i);"
            + "  if(!item||!cb)return;"
            + "  cb.checked=!cb.checked;"
            + "  var key='chk_'+" + (sid != null ? "'" + sid.replace("'", "\\'") + "'" : "''") + "+'_'+i;"
            + "  localStorage.setItem(key,cb.checked?'1':'0');"
            + "  item.className='ci'+(cb.checked?' done':'');"
            + "  if(window.Android&&Android.saveCheckboxState)Android.saveCheckboxState(key,cb.checked);"
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
