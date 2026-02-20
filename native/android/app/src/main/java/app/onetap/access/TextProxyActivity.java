package app.onetap.access;

import android.app.Activity;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.os.Bundle;
import android.util.Log;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ImageButton;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * TextProxyActivity
 *
 * Full-screen WebView that renders markdown or checklist text shortcuts.
 * Opens via ShortcutPlugin.openTextShortcut() — slides up from bottom instantly,
 * just like the WhatsApp chooser dialog, without loading the full Capacitor app.
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
    private String shortcutId;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

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

        // Determine theme from SharedPreferences (synced from JS layer via syncTheme)
        boolean isDark = isDarkTheme();

        // Colors
        int bgColor          = isDark ? Color.parseColor("#121212") : Color.parseColor("#FFFFFF");
        int surfaceColor     = isDark ? Color.parseColor("#1E1E1E") : Color.parseColor("#F8F8F8");
        int textColor        = isDark ? Color.parseColor("#E0E0E0") : Color.parseColor("#1A1A1A");
        int mutedColor       = isDark ? Color.parseColor("#888888") : Color.parseColor("#666666");
        int dividerColor     = isDark ? Color.parseColor("#2A2A2A") : Color.parseColor("#E8E8E8");
        int iconColor        = isDark ? Color.parseColor("#CCCCCC") : Color.parseColor("#333333");

        // Apply transparent status bar for edge-to-edge feel
        Window window = getWindow();
        window.setStatusBarColor(Color.TRANSPARENT);
        window.getDecorView().setSystemUiVisibility(
            isDark ? 0 : View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
        );

        // ---- Root container ----
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(bgColor);
        root.setLayoutParams(new ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));

        // ---- Top navigation bar ----
        LinearLayout topBar = new LinearLayout(this);
        topBar.setOrientation(LinearLayout.HORIZONTAL);
        topBar.setGravity(Gravity.CENTER_VERTICAL);
        topBar.setBackgroundColor(surfaceColor);
        int barPaddingH = dp(16);
        int barPaddingV = dp(12);
        topBar.setPadding(barPaddingH, barPaddingV, barPaddingH, barPaddingV);

        LinearLayout.LayoutParams topBarParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        topBar.setLayoutParams(topBarParams);

        // Close (back) button
        TextView closeBtn = new TextView(this);
        closeBtn.setText("✕");
        closeBtn.setTextColor(iconColor);
        closeBtn.setTextSize(TypedValue.COMPLEX_UNIT_SP, 18);
        closeBtn.setPadding(0, 0, dp(12), 0);
        closeBtn.setOnClickListener(v -> finish());

        // Title
        TextView titleView = new TextView(this);
        titleView.setText(shortcutName);
        titleView.setTextColor(textColor);
        titleView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        titleView.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        titleView.setSingleLine(true);
        titleView.setEllipsize(android.text.TextUtils.TruncateAt.END);
        LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(
            0,
            LinearLayout.LayoutParams.WRAP_CONTENT,
            1f
        );
        titleView.setLayoutParams(titleParams);

        topBar.addView(closeBtn);
        topBar.addView(titleView);

        // Divider below top bar
        View divider = new View(this);
        divider.setBackgroundColor(dividerColor);
        LinearLayout.LayoutParams dividerParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            1
        );
        divider.setLayoutParams(dividerParams);

        // ---- WebView ----
        webView = new WebView(this);
        LinearLayout.LayoutParams webParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            0,
            1f
        );
        webView.setLayoutParams(webParams);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);

        webView.setWebViewClient(new WebViewClient());
        webView.addJavascriptInterface(new ChecklistBridge(), "Android");
        webView.setBackgroundColor(bgColor);

        root.addView(topBar, topBarParams);
        root.addView(divider, dividerParams);
        root.addView(webView, webParams);

        setContentView(root);

        // Build and load HTML
        String html = buildHtml(textContent, isChecklist, shortcutId, isDark);
        webView.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null);
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            finish();
        }
    }

    /** Returns true if the app is currently using dark theme (reads from JS-synced SharedPreferences). */
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

        String bg       = isDark ? "#121212" : "#FFFFFF";
        String fg       = isDark ? "#E0E0E0" : "#1A1A1A";
        String mutedFg  = isDark ? "#888888" : "#666666";
        String codeBg   = isDark ? "#1E1E1E" : "#F4F4F4";
        String accent   = "#6366f1";
        String hrColor  = isDark ? "#2A2A2A" : "#E8E8E8";

        // Inline, self-contained markdown renderer — no CDN dependency.
        // Handles: headings, bold, italic, inline code, code blocks, HR, line breaks, - [ ] / - [x] checklists.
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
            + "body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;"
            + "  padding:20px;max-width:720px;margin:0 auto;background:" + bg + ";color:" + fg + ";line-height:1.65}"
            + "h1,h2,h3{font-weight:700;margin-top:1.4em;margin-bottom:0.4em}"
            + "h1{font-size:1.5em}h2{font-size:1.25em}h3{font-size:1.1em}"
            + "p{margin:0.6em 0}"
            + "hr{border:none;border-top:1px solid " + hrColor + ";margin:1.5em 0}"
            + "code{background:" + codeBg + ";padding:2px 5px;border-radius:4px;font-size:0.88em;font-family:monospace}"
            + "pre{background:" + codeBg + ";padding:12px;border-radius:8px;overflow-x:auto}"
            + "pre code{background:none;padding:0}"
            + "strong{font-weight:700}em{font-style:italic}"
            // Checklist styles
            + ".ci{display:flex;align-items:flex-start;gap:10px;margin:10px 0;cursor:pointer}"
            + ".ci input[type=checkbox]{width:20px;height:20px;margin:0;accent-color:" + accent + ";flex-shrink:0;cursor:pointer;margin-top:2px}"
            + ".ci label{cursor:pointer;line-height:1.5;flex:1}"
            + ".ci.done label{text-decoration:line-through;opacity:0.55}"
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
