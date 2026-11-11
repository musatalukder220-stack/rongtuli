package com.rongtuli.photoeditor;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.res.AssetManager;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.Log;
import android.view.Gravity;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import android.widget.FrameLayout;
import android.widget.TextView;
import android.widget.Toast;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * RongTuli for Android: one screen with a web view that shows the web app packed into the APK (assets/www).
 *
 * What this class adds to the plain web view:
 *   - every request for https://appassets.androidplatform.net/... is answered from assets/www. A real https address
 *     is used so that the page may keep projects on the phone (IndexedDB) and run its AI helper. Any other address
 *     is refused, except the sticker search (api.openverse.org and the pictures it returns) and the update check
 *     (UPDATE_URL below — change it to the address of your latest.json).
 *   - "choose a file" buttons of the page open the phone's file picker
 *   - saving and sharing: the page hands the file over in pieces (object "RTAndroid" in the page, class Bridge here);
 *     pictures go to Pictures/RongTuli, project files to Download/RongTuli
 *   - the Back button closes the top-most thing in the page before it leaves the app
 *   - if the web view runs out of memory it is started again instead of closing the app
 */
public class MainActivity extends Activity {
    static final String TAG = "RongTuli";
    static final String HOST = "appassets.androidplatform.net";
    static final String START = "https://" + HOST + "/index.html";
    private static final int REQ_FILE = 41, REQ_STORAGE = 42;

    private FrameLayout root;
    private WebView web;
    private ValueCallback<Uri[]> fileCallback;

    @Override protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        root = new FrameLayout(this);
        root.setBackgroundColor(0xFF101010);
        setContentView(root);
        cleanCache();
        try {
            makeWeb();
        } catch (Throwable e) {
            // no usable "Android System WebView" on this phone (missing, switched off, or being updated right now)
            Log.e(TAG, "no web view", e);
            TextView t = new TextView(this);
            t.setTextColor(0xFFEEEEEE);
            t.setTextSize(16);
            t.setGravity(Gravity.CENTER);
            t.setPadding(48, 48, 48, 48);
            t.setText("RongTuli needs \u201cAndroid System WebView\u201d.\n\nUpdate it (and Chrome) in the Play Store, then open the app again.");
            root.addView(t, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        }
    }

    private void makeWeb() {
        web = new WebView(this);
        web.setBackgroundColor(0xFF101010);
        web.setOverScrollMode(WebView.OVER_SCROLL_NEVER);
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setTextZoom(100);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setMediaPlaybackRequiresUserGesture(true);
        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) WebView.setWebContentsDebuggingEnabled(true);
        web.addJavascriptInterface(new Bridge(), "RTAndroid");
        web.setWebViewClient(new Client());
        web.setWebChromeClient(new Chrome());
        root.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        web.loadUrl(START);
        // look for a newer version a few seconds after the app is up (quiet when there is none)
        new Handler(Looper.getMainLooper()).postDelayed(new Runnable() { public void run() { checkUpdate(); } }, 4000);
    }

    /* ------------------------------------------------------------ the page's files */
    private static String mime(String name) {
        String n = name.toLowerCase(Locale.US);
        if (n.endsWith(".html")) return "text/html";
        if (n.endsWith(".js") || n.endsWith(".mjs")) return "text/javascript";
        if (n.endsWith(".css")) return "text/css";
        if (n.endsWith(".json") || n.endsWith(".webmanifest")) return "application/json";
        if (n.endsWith(".wasm")) return "application/wasm";
        if (n.endsWith(".png")) return "image/png";
        if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
        if (n.endsWith(".svg")) return "image/svg+xml";
        if (n.endsWith(".txt")) return "text/plain";
        return "application/octet-stream";
    }
    /** the address where latest.json lives (its host), so the update check may go out */
    private static boolean isUpdateHost(Uri u) {
        try {
            if (UPDATE_URL.contains("OWNER/GISTID")) return false;
            return u.getHost() != null && u.getHost().equalsIgnoreCase(new URL(UPDATE_URL).getHost());
        } catch (Exception e) { return false; }
    }
    /** a picture the sticker search may load (its own address, or a known picture host, or a file name that ends in a picture ending) */
    private static boolean isPicture(Uri u) {
        String host = u.getHost();
        if (host != null) {
            String h = host.toLowerCase(Locale.US);
            if (h.equals("live.staticflickr.com") || h.endsWith(".staticflickr.com") || h.equals("upload.wikimedia.org")) return true;
        }
        String path = u.getPath();
        if (path == null) return false;
        String p = path.toLowerCase(Locale.US);
        return p.endsWith(".jpg") || p.endsWith(".jpeg") || p.endsWith(".png") || p.endsWith(".gif")
            || p.endsWith(".webp") || p.endsWith(".svg") || p.endsWith(".bmp") || p.endsWith(".avif");
    }
    private static WebResourceResponse refuse(int code, String why) {
        return new WebResourceResponse("text/plain", "UTF-8", code, why, new HashMap<String, String>(), new ByteArrayInputStream(new byte[0]));
    }

    private final class Client extends WebViewClient {
        @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri u = request.getUrl();
            if (u == null) return null;
            String scheme = u.getScheme();
            if (scheme == null || !(scheme.equals("https") || scheme.equals("http"))) return null;      // data:, blob:, about: are the web view's own business
            boolean ours = HOST.equalsIgnoreCase(u.getHost());
            boolean online = "api.openverse.org".equalsIgnoreCase(u.getHost()) || isPicture(u)            // the sticker search and the pictures it returns
                || isUpdateHost(u);                                                                        // the update check (latest.json)
            if (!ours && !online) return refuse(403, "Blocked");                                          // everything else stays offline
            if (online && !ours) return null;                                                             // let the web view fetch it
            String path = u.getPath();
            if (path == null || path.length() == 0 || path.equals("/")) path = "/index.html";
            if (path.contains("..")) return refuse(403, "Blocked");
            String name = "www" + path;
            try {
                InputStream in = getAssets().open(name, AssetManager.ACCESS_STREAMING);
                String type = mime(name);
                boolean text = type.startsWith("text/") || type.equals("application/json") || type.equals("image/svg+xml");
                WebResourceResponse r = new WebResourceResponse(type, text ? "UTF-8" : null, in);
                Map<String, String> h = new HashMap<String, String>();
                h.put("Cache-Control", "no-store");
                h.put("Access-Control-Allow-Origin", "*");
                r.setResponseHeaders(h);
                return r;
            } catch (IOException e) {
                return refuse(404, "Not Found");
            }
        }

        @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri u = request.getUrl();
            if (u != null && HOST.equalsIgnoreCase(u.getHost())) return false;
            try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception e) { Log.w(TAG, "no app for " + u); }      // a link to somewhere else: the phone's browser
            return true;
        }

        @Override public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
            // the web view's own process was closed by the phone (nearly always: out of memory). Start a fresh one;
            // the page keeps a safety copy of unsaved work and offers it on its first screen.
            Log.w(TAG, "the web view process is gone, starting again");
            if (view == web) {
                if (fileCallback != null) { fileCallback = null; }
                root.removeView(web);
                web.destroy();
                web = null;
                Toast.makeText(MainActivity.this, "The editor ran out of memory and was started again.", Toast.LENGTH_LONG).show();
                makeWeb();
            }
            return true;
        }
    }

    /* ------------------------------------------------------------ choosing files */
    private final class Chrome extends WebChromeClient {
        @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (fileCallback != null) fileCallback.onReceiveValue(null);
            fileCallback = callback;
            boolean images = false;
            String[] types = params.getAcceptTypes();
            if (types != null && types.length > 0) {
                images = true;
                for (String t : types) {
                    if (t == null || !t.trim().toLowerCase(Locale.US).startsWith("image/")) { images = false; break; }
                }
            }
            Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
            pick.addCategory(Intent.CATEGORY_OPENABLE);
            pick.setType(images ? "image/*" : "*/*");                                                    // fonts and project files have no type a phone knows
            if (params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
            try {
                startActivityForResult(Intent.createChooser(pick, images ? "Choose a picture" : "Choose a file"), REQ_FILE);
            } catch (ActivityNotFoundException e) {
                fileCallback = null;
                callback.onReceiveValue(null);
                Toast.makeText(MainActivity.this, "No app on this phone can choose files.", Toast.LENGTH_LONG).show();
            }
            return true;
        }
    }

    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request != REQ_FILE) return;
        ValueCallback<Uri[]> cb = fileCallback;
        fileCallback = null;
        if (cb == null) return;
        Uri[] out = null;
        if (result == RESULT_OK && data != null) {
            ClipData clip = data.getClipData();
            if (clip != null && clip.getItemCount() > 0) {
                out = new Uri[clip.getItemCount()];
                for (int i = 0; i < out.length; i++) out[i] = clip.getItemAt(i).getUri();
            } else if (data.getData() != null) {
                out = new Uri[] { data.getData() };
            }
        }
        cb.onReceiveValue(out);
    }

    /* ------------------------------------------------------------ Back, pause, end */
    @Override public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();      // the page closes its top-most sheet / tool / the editor
        else super.onBackPressed();
    }
    @Override protected void onPause() { super.onPause(); if (web != null) web.onPause(); }
    @Override protected void onResume() { super.onResume(); if (web != null) web.onResume(); }
    @Override protected void onDestroy() {
        if (web != null) { root.removeView(web); web.destroy(); web = null; }
        super.onDestroy();
    }
    @Override public void onRequestPermissionsResult(int request, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(request, permissions, results);
        if (request != REQ_STORAGE) return;
        boolean ok = results != null && results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED;
        Toast.makeText(this, ok ? "Thank you. Now press Save again." : "Without this permission the picture cannot be saved.", Toast.LENGTH_LONG).show();
    }

    /* ------------------------------------------------------------ saving and sharing */
    private static final class Job {
        final File file; final String name, mime;
        Job(File file, String name, String mime) { this.file = file; this.name = name; this.mime = mime; }
    }
    private static String safeName(String name) {
        String n = name == null ? "" : name.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_").trim();
        if (n.length() > 120) n = n.substring(n.length() - 120);
        if (n.length() == 0 || n.equals(".") || n.equals("..")) n = "file";
        return n;
    }
    private static void copy(InputStream in, OutputStream out) throws IOException {
        byte[] buf = new byte[65536];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        out.flush();
    }
    private static void deleteAll(File f) {
        if (f == null || !f.exists()) return;
        if (f.isDirectory()) { File[] kids = f.listFiles(); if (kids != null) for (File k : kids) deleteAll(k); }
        f.delete();
    }
    /** throw away what earlier saves and shares left behind (older than a day) */
    private void cleanCache() {
        try {
            long old = System.currentTimeMillis() - 24L * 3600 * 1000;
            for (String d : new String[] { "out", "share" }) {
                File[] kids = new File(getCacheDir(), d).listFiles();
                if (kids != null) for (File k : kids) if (k.lastModified() < old) deleteAll(k);
            }
        } catch (Exception e) { Log.w(TAG, "cleaning: " + e); }
    }

    /** The object "RTAndroid" of the page. Its methods are called on a background thread, one at a time. */
    /** the address of latest.json — change this to where you keep it (GitHub Gist, any web space, a Telegram post's raw text) */
    static final String UPDATE_URL = "https://raw.githubusercontent.com/musatalukder220-stack/rongtuli/main/latest.json";

    /** the version name typed in the package (0.9 and so on) */
    private String appVersion() {
        try { return getPackageManager().getPackageInfo(getPackageName(), 0).versionName; } catch (Exception e) { return ""; }
    }
    private static boolean isNewer(String a, String b) {                 // is a newer than b? ("0.10" is newer than "0.9")
        String[] x = String.valueOf(a).split("\\."), y = String.valueOf(b).split("\\.");
        for (int i = 0; i < Math.max(x.length, y.length); i++) {
            int p = 0, q = 0;
            try { p = i < x.length ? Integer.parseInt(x[i].trim()) : 0; } catch (Exception e) { /* 0 */ }
            try { q = i < y.length ? Integer.parseInt(y[i].trim()) : 0; } catch (Exception e) { /* 0 */ }
            if (p != q) return p > q;
        }
        return false;
    }
    /** look at latest.json; tells the page {@code rtUpdate(version, note, force)} only when it is really newer */
    private void checkUpdate() {
        if (UPDATE_URL.contains("OWNER/GISTID")) { Log.i(TAG, "update check is not set up"); return; }
        final Handler h = new Handler(Looper.getMainLooper());
        new Thread(new Runnable() {
            public void run() {
                HttpURLConnection c = null;
                try {
                    URL u = new URL(UPDATE_URL + (UPDATE_URL.indexOf('?') < 0 ? "?" : "&") + "t=" + (System.currentTimeMillis() / 60000));
                    c = (HttpURLConnection) u.openConnection();
                    c.setConnectTimeout(8000); c.setReadTimeout(8000);
                    c.setRequestProperty("Cache-Control", "no-cache");
                    if (c.getResponseCode() != 200) return;
                    ByteArrayOutputStream bo = new ByteArrayOutputStream();
                    InputStream in = c.getInputStream();
                    byte[] buf = new byte[4096];
                    int n;
                    while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
                    in.close();
                    JSONObject j = new JSONObject(bo.toString("UTF-8"));
                    final String v = j.optString("version", "");
                    if (!isNewer(v, appVersion())) return;
                    final String note = j.optString("note", ""), link = j.optString("link", "");
                    final boolean force = j.optBoolean("force", false);
                    h.post(new Runnable() {
                        public void run() {
                            try {
                                web.evaluateJavascript("window.rtUpdate && window.rtUpdate(" + JSONObject.quote(v) + "," + JSONObject.quote(note) + "," + force + "," + JSONObject.quote(link) + ")", null);
                            } catch (Exception e) { Log.w(TAG, "rtUpdate: " + e); }
                        }
                    });
                } catch (Exception e) {
                    Log.i(TAG, "update check: no answer (" + e.getMessage() + ")");        // offline is fine
                } finally { if (c != null) c.disconnect(); }
            }
        }).start();
    }

    private final class Bridge {
        private int next = 1;
        private final HashMap<Integer, Job> jobs = new HashMap<Integer, Job>();

        /** start a file; returns its number (0 or less: it did not work) */
        @JavascriptInterface public synchronized int begin(String name, String mime) {
            try {
                File dir = new File(getCacheDir(), "out");
                dir.mkdirs();
                String safe = safeName(name);
                int id = next++;
                File f = new File(dir, id + "_" + safe);
                new FileOutputStream(f, false).close();
                jobs.put(id, new Job(f, safe, mime == null || mime.length() == 0 ? "application/octet-stream" : mime));
                return id;
            } catch (Exception e) { Log.w(TAG, "begin: " + e); return -1; }
        }
        /** the next piece of the file, as base64 */
        @JavascriptInterface public synchronized boolean chunk(int id, String base64) {
            Job j = jobs.get(id);
            if (j == null || base64 == null) return false;
            try {
                FileOutputStream out = new FileOutputStream(j.file, true);
                try { out.write(Base64.decode(base64, Base64.DEFAULT)); } finally { out.close(); }
                return true;
            } catch (Exception e) { Log.w(TAG, "chunk: " + e); return false; }
        }
        /** put the file where the user finds it. Returns words for the page ("look in …"), or "!" and what went wrong. */
        @JavascriptInterface public synchronized String save(int id) {
            Job j = jobs.get(id);
            if (j == null) return "!The file was lost on the way";
            boolean image = j.mime.startsWith("image/");
            String where = "look in " + (image ? "Pictures" : "Download") + " \u203a RongTuli" + (image ? " (also in your gallery)" : "");
            try {
                if (Build.VERSION.SDK_INT >= 29) {
                    ContentResolver cr = getContentResolver();
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.MediaColumns.DISPLAY_NAME, j.name);
                    v.put(MediaStore.MediaColumns.MIME_TYPE, j.mime);
                    v.put(MediaStore.MediaColumns.RELATIVE_PATH, (image ? Environment.DIRECTORY_PICTURES : Environment.DIRECTORY_DOWNLOADS) + "/RongTuli");
                    v.put(MediaStore.MediaColumns.IS_PENDING, 1);
                    Uri table = image ? MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
                                      : MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
                    Uri item = cr.insert(table, v);
                    if (item == null) return "!The phone did not let the app create the file";
                    try {
                        OutputStream out = cr.openOutputStream(item);
                        if (out == null) throw new IOException("no way to write the file");
                        InputStream in = new FileInputStream(j.file);
                        try { copy(in, out); } finally { in.close(); out.close(); }
                    } catch (Exception e) {
                        try { cr.delete(item, null, null); } catch (Exception ignored) { /* nothing to remove */ }
                        throw e;
                    }
                    v.clear();
                    v.put(MediaStore.MediaColumns.IS_PENDING, 0);
                    cr.update(item, v, null, null);
                } else {
                    if (checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
                        runOnUiThread(new Runnable() { @Override public void run() {
                            requestPermissions(new String[] { Manifest.permission.WRITE_EXTERNAL_STORAGE }, REQ_STORAGE);
                        } });
                        return "!Allow the app to save files when the phone asks, then press Save again";      // the page sends the file again on the next try
                    }
                    File dir = new File(Environment.getExternalStoragePublicDirectory(image ? Environment.DIRECTORY_PICTURES : Environment.DIRECTORY_DOWNLOADS), "RongTuli");
                    if (!dir.isDirectory() && !dir.mkdirs()) return "!Could not make the folder " + dir.getName();
                    File out = new File(dir, j.name);
                    for (int n = 1; out.exists() && n < 1000; n++) {
                        int dot = j.name.lastIndexOf('.');
                        out = new File(dir, dot > 0 ? j.name.substring(0, dot) + " (" + n + ")" + j.name.substring(dot) : j.name + " (" + n + ")");
                    }
                    InputStream in = new FileInputStream(j.file);
                    OutputStream o = new FileOutputStream(out);
                    try { copy(in, o); } finally { in.close(); o.close(); }
                    MediaScannerConnection.scanFile(MainActivity.this, new String[] { out.getAbsolutePath() }, new String[] { j.mime }, null);
                }
                return where;
            } catch (Exception e) {
                Log.w(TAG, "save: " + e);
                return "!The phone could not save the file (" + (e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage()) + ")";
            } finally {
                jobs.remove(id);
                j.file.delete();
            }
        }
        /** open the phone's Share sheet with the file */
        @JavascriptInterface public synchronized boolean share(int id) {
            Job j = jobs.remove(id);
            if (j == null) return false;
            try {
                File dir = new File(new File(getCacheDir(), "share"), String.valueOf(id) + "_" + System.currentTimeMillis());
                if (!dir.mkdirs()) return false;
                File f = new File(dir, j.name);
                if (!j.file.renameTo(f)) {
                    InputStream in = new FileInputStream(j.file);
                    OutputStream o = new FileOutputStream(f);
                    try { copy(in, o); } finally { in.close(); o.close(); }
                    j.file.delete();
                }
                final Uri uri = new Uri.Builder().scheme("content").authority(getPackageName() + ".share").appendPath(dir.getName()).appendPath(j.name).build();
                final Intent send = new Intent(Intent.ACTION_SEND);
                send.setType(j.mime);
                send.putExtra(Intent.EXTRA_STREAM, uri);
                send.setClipData(ClipData.newRawUri(j.name, uri));
                send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                runOnUiThread(new Runnable() { @Override public void run() {
                    try { startActivity(Intent.createChooser(send, "Share")); }
                    catch (Exception e) { Toast.makeText(MainActivity.this, "No app on this phone can take this file.", Toast.LENGTH_LONG).show(); }
                } });
                return true;
            } catch (Exception e) { Log.w(TAG, "share: " + e); return false; }
        }
        /** open a web link in the phone's own browser (the update link) */
        @JavascriptInterface public void openUrl(String url) {
            try {
                Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(i);
            } catch (Exception e) { Log.w(TAG, "openUrl: " + e); }
        }
        /** back from the update page to the app */
        @JavascriptInterface public void closeUpdate() {
            runOnUiThread(new Runnable() { public void run() {
                if (web != null && web.canGoBack()) web.goBack(); else if (web != null) web.loadUrl(START);
            } });
        }
        /** do not wait a day: the page's "Check for updates" */
        @JavascriptInterface public void checkUpdateNow() { checkUpdate(); }
        /** a few facts for the page: {"app":"0.4","sdk":34,"webview":"120.0.6099.230"} */
        @JavascriptInterface public String info() {
            String app = "", wv = "";
            try { app = getPackageManager().getPackageInfo(getPackageName(), 0).versionName; } catch (Exception e) { /* unknown */ }
            try {
                if (Build.VERSION.SDK_INT >= 26) { PackageInfo p = WebView.getCurrentWebViewPackage(); if (p != null) wv = p.versionName; }
            } catch (Exception e) { /* unknown */ }
            return "{\"app\":\"" + String.valueOf(app).replaceAll("[\"\\\\]", "") + "\",\"sdk\":" + Build.VERSION.SDK_INT + ",\"webview\":\"" + String.valueOf(wv).replaceAll("[\"\\\\]", "") + "\"}";
        }
    }
}
