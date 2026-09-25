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
import android.provider.Settings
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
import android.widget.Toast
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import java.util.concurrent.Future

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
    private var download: Future<*>? = null
    private var installAfterPermission = false
    private var updateDialog: AlertDialog? = null
    private var lastUpdateCheck = 0L

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
        checkForUpdate(manual = false)
    }

    override fun onResume() {
        super.onResume()
        // Retour au premier plan après un long moment : nouvelle recherche de mise à jour.
        if (lastUpdateCheck != 0L && System.currentTimeMillis() - lastUpdateCheck > RECHECK_AFTER) checkForUpdate(manual = false)
        // Retour des réglages « Installer des applis inconnues » : on reprend l'installation.
        if (installAfterPermission && Updater.canInstall(this)) {
            installAfterPermission = false
            install()
        }
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

    // --- Mises à jour (versions publiées sur GitHub) --------------------------------------

    /** Recherche à chaque lancement : la fenêtre de mise à jour s'affiche d'elle-même. */
    private fun checkForUpdate(manual: Boolean) {
        if (updateDialog?.isShowing == true || download?.isDone == false) return
        lastUpdateCheck = System.currentTimeMillis()
        if (manual) toast("Recherche de mise à jour…")
        io.execute {
            val result = runCatching { Updater.latest() }
            main.post {
                if (isFinishing) return@post
                val current = BuildConfigCompat.versionName(this)
                result.onSuccess { r ->
                    when {
                        Updater.compare(r.version, current) <= 0 -> if (manual) toast("StreamDeck est à jour (version $current).")
                        !manual && prefs.getString("update_skipped", null) == r.version -> Unit
                        else -> offerUpdate(r, current)
                    }
                }.onFailure { e ->
                    if (manual) offerDownloadPage("Impossible de vérifier les mises à jour (${e.message}).")
                }
            }
        }
    }

    private fun offerUpdate(r: Release, current: String) {
        if (r.apkUrl.isBlank()) return offerDownloadPage("La version ${r.version} est disponible, mais sans application Android.")
        if (updateDialog?.isShowing == true) return
        updateDialog = dialog()
            .setTitle("Mise à jour disponible")
            .setMessage("StreamDeck ${r.version} est disponible (version installée : $current).\n\nL'installation ne modifie pas vos réglages.")
            .setPositiveButton("Installer") { _, _ -> startDownload(r) }
            .setNeutralButton("Ignorer cette version") { _, _ -> prefs.edit().putString("update_skipped", r.version).apply() }
            .setNegativeButton("Plus tard", null)
            .show()
    }

    private fun startDownload(r: Release) {
        val progress = dialog()
            .setTitle("Téléchargement de StreamDeck ${r.version}")
            .setMessage("Préparation…")
            .setCancelable(false)
            .setNegativeButton("Annuler") { _, _ -> download?.cancel(true) }
            .show()
        download = io.submit(Runnable {
            val result = runCatching {
                Updater.download(this, r.apkUrl) { pct ->
                    main.post { progress.setMessage(if (pct >= 0) "$pct %" else "Téléchargement en cours…") }
                }
            }
            main.post {
                if (isFinishing) return@post
                progress.dismiss()
                if (download?.isCancelled == true) return@post
                result.onSuccess { install() }
                    .onFailure { e -> offerDownloadPage("Téléchargement impossible (${e.message}).") }
            }
        })
    }

    private fun install() {
        if (!Updater.canInstall(this)) {
            installAfterPermission = true
            dialog()
                .setTitle("Autorisation nécessaire")
                .setMessage("Pour installer la mise à jour, autorisez StreamDeck à installer des applications, puis revenez dans StreamDeck.")
                .setPositiveButton("Ouvrir les réglages") { _, _ ->
                    startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:$packageName")))
                }
                .setNegativeButton("Annuler") { _, _ -> installAfterPermission = false }
                .show()
            return
        }
        runCatching { startActivity(Updater.installIntent(this)) }
            .onFailure { e -> offerDownloadPage("Impossible d'ouvrir l'installeur (${e.message}).") }
    }

    /** Solution de repli : télécharger l'APK depuis le navigateur. */
    private fun offerDownloadPage(message: String) {
        dialog()
            .setTitle("Mise à jour")
            .setMessage(message)
            .setPositiveButton("Page de téléchargement") { _, _ ->
                runCatching { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(Updater.RELEASES_PAGE))) }
            }
            .setNegativeButton("Fermer", null)
            .show()
    }

    private fun dialog() = AlertDialog.Builder(this, android.R.style.Theme_Material_Dialog_Alert)

    private fun toast(message: String) = Toast.makeText(this, message, Toast.LENGTH_SHORT).show()

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

        @JavascriptInterface
        fun checkUpdate() {
            main.post { checkForUpdate(manual = true) }
        }
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

/** Retour au premier plan après ce délai : nouvelle recherche de mise à jour. */
private const val RECHECK_AFTER = 30 * 60_000L

private object BuildConfigCompat {
    fun versionName(activity: Activity): String = runCatching {
        activity.packageManager.getPackageInfo(activity.packageName, 0).versionName ?: ""
    }.getOrDefault("")
}
