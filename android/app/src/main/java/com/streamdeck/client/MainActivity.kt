package com.streamdeck.client

import android.annotation.SuppressLint
import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.HapticFeedbackConstants
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/**
 * Une seule activité, deux écrans affichés dans la même WebView :
 *  - l'écran de connexion (assets/connect.html) : découverte des PC, saisie manuelle, récents ;
 *  - le Deck, servi par le PC (http://<pc>:3210/deck).
 */
class MainActivity : Activity() {
    private lateinit var web: WebView
    private val io = Executors.newCachedThreadPool()
    private val main = Handler(Looper.getMainLooper())
    private val prefs by lazy { getSharedPreferences("streamdeck", MODE_PRIVATE) }

    private var current: DeckServer? = null
    private var onDeck = false
    private var pendingError: String? = null
    private var autoConnect: DeckServer? = null
    @Volatile private var attempt = 0

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        web = WebView(this).apply {
            setBackgroundColor(Color.BLACK)
            overScrollMode = View.OVER_SCROLL_NEVER
            isHapticFeedbackEnabled = true
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.textZoom = 100 // la taille de police système ne doit pas casser la grille
            settings.setSupportZoom(false)
            settings.builtInZoomControls = false
            settings.mediaPlaybackRequiresUserGesture = false
            addJavascriptInterface(Bridge(), "DeckApp")
            webViewClient = Client()
        }
        setContentView(web)
        enterImmersive()
        checkWebView()

        // Reconnexion automatique au dernier PC utilisé (l'écran de connexion affiche la progression).
        if (prefs.getBoolean("auto_connect", true)) autoConnect = lastServer()
        showConnect()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) enterImmersive()
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (onDeck) {
            prefs.edit().putBoolean("auto_connect", false).apply()
            showConnect()
        } else {
            @Suppress("DEPRECATION")
            super.onBackPressed()
        }
    }

    override fun onDestroy() {
        io.shutdownNow()
        web.destroy()
        super.onDestroy()
    }

    // --- Compatibilité (Android 7 et plus) ---------------------------------------------------

    /**
     * Le Deck s'affiche via le composant WebView du système. Sur Android 7 à 9, il est fourni
     * par Google Chrome ; s'il n'a pas été mis à jour, l'affichage peut être incomplet.
     */
    private fun checkWebView() {
        val ua = runCatching { WebSettings.getDefaultUserAgent(this) }.getOrDefault("")
        val major = Regex("Chrome/(\\d+)").find(ua)?.groupValues?.get(1)?.toIntOrNull() ?: return
        if (major >= MIN_WEBVIEW) return
        val pkg = if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.P) "com.android.chrome" else "com.google.android.webview"
        val appName = if (pkg == "com.android.chrome") "Google Chrome" else "Android System WebView"
        AlertDialog.Builder(this, android.R.style.Theme_Material_Dialog_Alert)
            .setTitle("Mise à jour nécessaire")
            .setMessage(
                "Le moteur d'affichage de cet appareil est trop ancien (version $major, $MIN_WEBVIEW minimum). " +
                    "Mettez à jour « $appName » depuis le Play Store, puis relancez StreamDeck."
            )
            .setPositiveButton("Ouvrir le Play Store") { _, _ ->
                runCatching { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=$pkg"))) }
                    .onFailure {
                        startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=$pkg")))
                    }
            }
            .setNegativeButton("Continuer", null)
            .show()
    }

    // --- Plein écran ------------------------------------------------------------------------

    private fun enterImmersive() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.setDecorFitsSystemWindows(false)
            window.insetsController?.let {
                it.hide(WindowInsets.Type.systemBars())
                it.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        } else {
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility = (View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                or View.SYSTEM_UI_FLAG_FULLSCREEN
                or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN)
        }
    }

    // --- Navigation entre les deux écrans ---------------------------------------------------

    private fun showConnect(error: String? = null) {
        onDeck = false
        pendingError = error
        web.loadUrl("file:///android_asset/connect.html")
    }

    /** Vérifie que le PC répond avant d'afficher le Deck, pour donner une erreur claire. */
    private fun connect(server: DeckServer) {
        val id = ++attempt
        io.execute {
            val result = runCatching { probe(server) }
            main.post {
                if (id != attempt) return@post // tentative annulée ou remplacée
                result.onSuccess { name ->
                    val s = server.copy(name = name.ifBlank { server.name })
                    current = s
                    remember(s)
                    onDeck = true
                    web.loadUrl("http://${s.host}:${s.port}/deck?app=android")
                }.onFailure {
                    val msg = "Impossible de joindre ${server.host}:${server.port}. " +
                        "Vérifiez que StreamDeck est lancé sur le PC et que le téléphone est sur le même réseau Wi-Fi."
                    if (web.url?.startsWith("file:") == true) js("window.onConnectError(${JSONObject.quote(msg)})")
                    else showConnect(msg)
                }
            }
        }
    }

    private fun probe(server: DeckServer): String {
        val conn = URL("http://${server.host}:${server.port}/api/status").openConnection() as HttpURLConnection
        conn.connectTimeout = 2500
        conn.readTimeout = 2500
        try {
            val body = conn.inputStream.bufferedReader().use { it.readText() }
            val json = JSONObject(body)
            if (json.optString("app", "streamdeck") != "streamdeck") error("not a StreamDeck server")
            return json.optString("name", "")
        } finally {
            conn.disconnect()
        }
    }

    private fun js(code: String) = web.evaluateJavascript(code, null)

    // --- Serveurs mémorisés -----------------------------------------------------------------

    private fun recents(): JSONArray = runCatching { JSONArray(prefs.getString("recents", "[]")) }.getOrElse { JSONArray() }

    private fun lastServer(): DeckServer? {
        val o = recents().optJSONObject(0) ?: return null
        return DeckServer(o.optString("name"), o.optString("host"), o.optInt("port", 3210))
    }

    private fun remember(s: DeckServer) {
        val list = JSONArray().put(s.toJson())
        val old = recents()
        for (i in 0 until old.length()) {
            val o = old.getJSONObject(i)
            if (o.optString("host") == s.host && o.optInt("port") == s.port) continue
            if (list.length() < 5) list.put(o)
        }
        prefs.edit().putString("recents", list.toString()).putBoolean("auto_connect", true).apply()
    }

    private fun forget(host: String, port: Int) {
        val list = JSONArray()
        val old = recents()
        for (i in 0 until old.length()) {
            val o = old.getJSONObject(i)
            if (!(o.optString("host") == host && o.optInt("port") == port)) list.put(o)
        }
        prefs.edit().putString("recents", list.toString()).apply()
    }

    // --- Pont JavaScript ↔ Android ------------------------------------------------------------

    inner class Bridge {
        @JavascriptInterface
        fun getState(): String = JSONObject()
            .put("recents", recents())
            .put("error", pendingError ?: JSONObject.NULL)
            .put("autoConnect", autoConnect?.toJson() ?: JSONObject.NULL)
            .put("version", BuildConfigCompat.versionName(this@MainActivity))
            .toString()
            .also {
                pendingError = null
                autoConnect = null
            }

        @JavascriptInterface
        fun discover() {
            io.execute {
                val servers = runCatching { Discovery.scan(this@MainActivity) }.getOrDefault(emptyList())
                val json = JSONArray(servers.map { it.toJson() }).toString()
                main.post { if (!onDeck) js("window.onDiscovered($json)") }
            }
        }

        @JavascriptInterface
        fun connect(host: String, port: Int, name: String) {
            main.post { this@MainActivity.connect(DeckServer(name, host.trim(), port)) }
        }

        @JavascriptInterface
        fun cancel() {
            attempt++
        }

        @JavascriptInterface
        fun forget(host: String, port: Int) = this@MainActivity.forget(host, port)

        /** Appelé par le Deck pour revenir à l'écran de connexion. */
        @JavascriptInterface
        fun disconnect() {
            main.post {
                prefs.edit().putBoolean("auto_connect", false).apply()
                showConnect()
            }
        }

        @JavascriptInterface
        fun haptic() {
            main.post { web.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP) }
        }

        @JavascriptInterface
        fun serverName(): String = current?.name ?: ""
    }

    private inner class Client : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            val url = request.url
            val s = current
            val internal = url.scheme == "file" || (s != null && url.host == s.host && url.port == s.port)
            if (internal) return false
            runCatching { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url.toString()))) }
            return true
        }

        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
            // Seule la page principale compte : le Deck est injoignable, retour à l'écran de connexion.
            if (request.isForMainFrame && onDeck) {
                val s = current
                showConnect("Connexion perdue avec ${s?.name ?: "le PC"} (${error.description}).")
            }
        }
    }
}

/** Version minimale du moteur Chromium de la WebView (requêtes de conteneur et color-mix CSS). */
private const val MIN_WEBVIEW = 111

private object BuildConfigCompat {
    fun versionName(activity: Activity): String = runCatching {
        activity.packageManager.getPackageInfo(activity.packageName, 0).versionName ?: ""
    }.getOrDefault("")
}
