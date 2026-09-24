package com.streamdeck.client

import android.content.ContentProvider
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.database.Cursor
import android.database.MatrixCursor
import android.net.Uri
import android.os.Build
import android.os.ParcelFileDescriptor
import android.provider.OpenableColumns
import org.json.JSONObject
import java.io.File
import java.io.FileNotFoundException
import java.net.HttpURLConnection
import java.net.URL

/** Dernière version publiée sur GitHub. */
data class Release(val version: String, val apkUrl: String, val pageUrl: String)

/**
 * Mise à jour de l'application depuis les versions publiées sur GitHub :
 * lecture de la dernière version, téléchargement de l'APK puis ouverture de
 * l'installeur d'Android (qui demande confirmation à l'utilisateur).
 */
object Updater {
    private const val REPO = "feanor91/StreamDeck"
    const val RELEASES_PAGE = "https://github.com/$REPO/releases/latest"

    /** Appel réseau bloquant : à lancer hors du fil principal. */
    fun latest(): Release {
        val json = JSONObject(get("https://api.github.com/repos/$REPO/releases/latest"))
        val version = json.getString("tag_name").removePrefix("v")
        val assets = json.optJSONArray("assets")
        var apk = ""
        for (i in 0 until (assets?.length() ?: 0)) {
            val a = assets!!.getJSONObject(i)
            if (a.optString("name").endsWith(".apk")) apk = a.optString("browser_download_url")
        }
        return Release(version, apk, json.optString("html_url", RELEASES_PAGE))
    }

    /** > 0 si a est plus récente que b. */
    fun compare(a: String, b: String): Int {
        fun parts(v: String) = Regex("^v?(\\d+)(?:\\.(\\d+))?(?:\\.(\\d+))?").find(v.trim())
            ?.groupValues?.drop(1)?.map { it.toIntOrNull() ?: 0 } ?: listOf(0, 0, 0)
        val x = parts(a)
        val y = parts(b)
        for (i in 0..2) if (x[i] != y[i]) return x[i] - y[i]
        return 0
    }

    /** Télécharge l'APK dans le cache de l'application. [progress] reçoit 0..100 (-1 si taille inconnue). */
    fun download(context: Context, url: String, progress: (Int) -> Unit): File {
        val dir = File(context.cacheDir, "updates").apply { mkdirs() }
        dir.listFiles()?.forEach { it.delete() }
        val file = File(dir, "StreamDeck.apk")
        val conn = open(url)
        try {
            if (conn.responseCode !in 200..299) error("téléchargement refusé (${conn.responseCode})")
            val total = conn.contentLength.toLong()
            var done = 0L
            var last = -2
            conn.inputStream.use { input ->
                file.outputStream().use { out ->
                    val buf = ByteArray(64 * 1024)
                    while (true) {
                        if (Thread.currentThread().isInterrupted) error("téléchargement annulé")
                        val n = input.read(buf)
                        if (n < 0) break
                        out.write(buf, 0, n)
                        done += n
                        val pct = if (total > 0) (done * 100 / total).toInt() else -1
                        if (pct != last) {
                            last = pct
                            progress(pct)
                        }
                    }
                }
            }
        } finally {
            conn.disconnect()
        }
        return file
    }

    /** Sur Android 8+, l'utilisateur doit autoriser StreamDeck à installer des applications. */
    fun canInstall(context: Context): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.O || context.packageManager.canRequestPackageInstalls()

    fun installIntent(context: Context): Intent =
        Intent(Intent.ACTION_VIEW)
            .setDataAndType(ApkProvider.uri(context), "application/vnd.android.package-archive")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)

    private fun get(url: String): String {
        val conn = open(url, accept = "application/vnd.github+json")
        try {
            if (conn.responseCode == 404) error("aucune version publiée")
            if (conn.responseCode !in 200..299) error("GitHub a répondu ${conn.responseCode}")
            return conn.inputStream.bufferedReader().use { it.readText() }
        } finally {
            conn.disconnect()
        }
    }

    /** Ouvre la connexion en suivant les redirections (GitHub renvoie l'APK depuis un autre domaine). */
    private fun open(url: String, accept: String? = null): HttpURLConnection {
        var target = URL(url)
        repeat(5) {
            val conn = target.openConnection() as HttpURLConnection
            conn.connectTimeout = 10_000
            conn.readTimeout = 20_000
            conn.instanceFollowRedirects = false
            conn.setRequestProperty("User-Agent", "StreamDeck-Android")
            if (accept != null) conn.setRequestProperty("Accept", accept)
            val code = conn.responseCode
            if (code in 300..399) {
                val next = conn.getHeaderField("Location") ?: error("redirection sans adresse")
                conn.disconnect()
                target = URL(target, next)
            } else {
                return conn
            }
        }
        error("trop de redirections")
    }
}

/**
 * Donne à l'installeur d'Android un accès en lecture à l'APK téléchargé
 * (depuis Android 7, une adresse file:// ne peut plus être transmise à une autre application).
 */
class ApkProvider : ContentProvider() {
    companion object {
        fun uri(context: Context): Uri = Uri.parse("content://${context.packageName}.updates/StreamDeck.apk")
        private fun file(context: Context) = File(File(context.cacheDir, "updates"), "StreamDeck.apk")
    }

    override fun onCreate() = true

    override fun openFile(uri: Uri, mode: String): ParcelFileDescriptor {
        val f = file(context!!)
        if (!f.exists()) throw FileNotFoundException(uri.toString())
        return ParcelFileDescriptor.open(f, ParcelFileDescriptor.MODE_READ_ONLY)
    }

    override fun getType(uri: Uri) = "application/vnd.android.package-archive"

    override fun query(uri: Uri, projection: Array<out String>?, selection: String?, args: Array<out String>?, sort: String?): Cursor {
        val f = file(context!!)
        return MatrixCursor(arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE)).apply { addRow(arrayOf(f.name, f.length())) }
    }

    override fun insert(uri: Uri, values: ContentValues?): Uri? = null
    override fun delete(uri: Uri, selection: String?, args: Array<out String>?) = 0
    override fun update(uri: Uri, values: ContentValues?, selection: String?, args: Array<out String>?) = 0
}
