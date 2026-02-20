package app.onetap.access;

import android.app.Activity;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * TextProxyActivity
 *
 * Full-screen WebView that renders markdown or checklist text shortcuts.
 *
 * Intent extras:
 *   shortcut_id   - string, used for usage tracking + checklist state key
 *   text_content  - string, raw markdown or checklist text
 *   is_checklist  - boolean, whether to render as interactive checklist
 */
public class TextProxyActivity extends Activity {

    private static final String TAG = "TextProxyActivity";
    private static final String PREFS_CHECKLIST = "checklist_state";

    private WebView webView;
    private String shortcutId;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        shortcutId = getIntent().getStringExtra("shortcut_id");
        String textContent = getIntent().getStringExtra("text_content");
        boolean isChecklist = getIntent().getBooleanExtra("is_checklist", false);

        if (textContent == null) textContent = "";

        // Track usage
        if (shortcutId != null) {
            NativeUsageTracker.recordTap(this, shortcutId);
        }

        webView = new WebView(this);
        webView.setLayoutParams(new android.widget.FrameLayout.LayoutParams(
                android.widget.FrameLayout.LayoutParams.MATCH_PARENT,
                android.widget.FrameLayout.LayoutParams.MATCH_PARENT));

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);

        webView.setWebViewClient(new WebViewClient());
        webView.addJavascriptInterface(new ChecklistBridge(), "Android");

        setContentView(webView);

        // Build HTML with inline marked.js (CDN — acceptable for text shortcuts; they need network for content anyway)
        String html = buildHtml(textContent, isChecklist, shortcutId);
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

    private String buildHtml(String text, boolean isChecklist, String sid) {
        // Escape text for JS string embedding
        String escaped = text
                .replace("\\", "\\\\")
                .replace("`", "\\`")
                .replace("$", "\\$");

        // Load saved checkbox states
        SharedPreferences prefs = getSharedPreferences(PREFS_CHECKLIST, MODE_PRIVATE);

        return "<!DOCTYPE html><html><head><meta charset='UTF-8'>" +
                "<meta name='viewport' content='width=device-width,initial-scale=1,user-scalable=no'>" +
                "<style>" +
                "body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;" +
                "padding:20px;max-width:700px;margin:0 auto;background:#fff;color:#1a1a1a;line-height:1.6}" +
                "@media(prefers-color-scheme:dark){body{background:#121212;color:#e0e0e0}}" +
                "h1,h2,h3{font-weight:600;margin-top:1.2em}" +
                "hr{border:none;border-top:1px solid #ddd;margin:1.5em 0}" +
                ".checklist-item{display:flex;align-items:flex-start;gap:10px;margin:8px 0;cursor:pointer}" +
                ".checklist-item input[type=checkbox]{width:20px;height:20px;margin:0;accent-color:#6366f1;flex-shrink:0;cursor:pointer}" +
                ".checklist-item label{cursor:pointer;line-height:1.5}" +
                ".checked label{text-decoration:line-through;opacity:0.6}" +
                "</style></head><body>" +
                "<div id='content'></div>" +
                "<script src='https://cdn.jsdelivr.net/npm/marked/marked.min.js'></script>" +
                "<script>" +
                "var rawText=`" + escaped + "`;" +
                "var isChecklist=" + isChecklist + ";" +
                "var shortcutId='" + (sid != null ? sid.replace("'", "\\'") : "") + "';" +
                "function renderContent(){" +
                "  var el=document.getElementById('content');" +
                "  if(isChecklist){" +
                "    var lines=rawText.split('\\n');" +
                "    var html='';" +
                "    lines.forEach(function(line,i){" +
                "      var m=line.match(/^([☐☑])\\s*(.*)/u);" +
                "      if(m){" +
                "        var savedKey='chk_'+shortcutId+'_'+i;" +
                "        var saved=localStorage.getItem(savedKey);" +
                "        var checked=(saved!==null)?(saved==='1'):(m[1]==='☑');" +
                "        html+='<div class=\"checklist-item'+(checked?' checked':'')'\\' id=\\'item'+i+\\'\\''+" +
                "          '\\' onclick=\\'toggleCheck('+i+')\\'>'+"+
                "          '<input type=\"checkbox\" id=\"cb'+i+'\"'+(checked?' checked':'')+'>'+" +
                "          '<label for=\"cb'+i+'\">'+m[2]+'</label>'+'</div>';" +
                "      } else {" +
                "        html+='<p>'+line+'</p>';" +
                "      }" +
                "    });" +
                "    el.innerHTML=html;" +
                "  } else {" +
                "    if(window.marked){el.innerHTML=marked.parse(rawText);}" +
                "    else{el.innerText=rawText;}" +
                "  }" +
                "}" +
                "function toggleCheck(i){" +
                "  var item=document.getElementById('item'+i);" +
                "  var cb=document.getElementById('cb'+i);" +
                "  if(!item||!cb)return;" +
                "  cb.checked=!cb.checked;" +
                "  var key='chk_'+shortcutId+'_'+i;" +
                "  var val=cb.checked?'1':'0';" +
                "  localStorage.setItem(key,val);" +
                "  item.className='checklist-item'+(cb.checked?' checked':'');" +
                "  if(window.Android&&Android.saveCheckboxState){Android.saveCheckboxState(key,cb.checked);}" +
                "}" +
                "if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',renderContent);}else{renderContent();}" +
                "</script></body></html>";
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
