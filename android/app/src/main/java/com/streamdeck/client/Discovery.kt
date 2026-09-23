package com.streamdeck.client

import android.content.Context
import android.net.ConnectivityManager
import android.net.wifi.WifiManager
import org.json.JSONObject
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.Inet4Address
import java.net.InetAddress
import java.net.SocketTimeoutException

data class DeckServer(val name: String, val host: String, val port: Int) {
    fun toJson(): JSONObject = JSONObject().put("name", name).put("host", host).put("port", port)
}

/**
 * Recherche les serveurs StreamDeck du réseau local : diffusion UDP d'un message
 * « STREAMDECK_DISCOVER » sur le port 3211, chaque PC répond avec son nom et son port HTTP.
 */
object Discovery {
    private const val PORT = 3211
    private const val MAGIC = "STREAMDECK_DISCOVER"

    fun scan(context: Context, timeoutMs: Long = 1800): List<DeckServer> {
        val wifi = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
        // Certains téléphones filtrent le trafic de diffusion sans ce verrou.
        val lock = wifi.createMulticastLock("streamdeck-discovery").apply { setReferenceCounted(false) }
        val found = LinkedHashMap<String, DeckServer>()
        try {
            lock.acquire()
            DatagramSocket().use { socket ->
                socket.broadcast = true
                socket.soTimeout = 250
                val payload = MAGIC.toByteArray()
                val targets = broadcastAddresses(context)
                val deadline = System.currentTimeMillis() + timeoutMs
                var nextSend = 0L
                var sends = 0
                val buf = ByteArray(2048)
                while (System.currentTimeMillis() < deadline) {
                    // Plusieurs envois : l'UDP ne garantit pas la livraison.
                    if (sends < 3 && System.currentTimeMillis() >= nextSend) {
                        for (addr in targets) {
                            runCatching { socket.send(DatagramPacket(payload, payload.size, addr, PORT)) }
                        }
                        sends++
                        nextSend = System.currentTimeMillis() + 500
                    }
                    try {
                        val packet = DatagramPacket(buf, buf.size)
                        socket.receive(packet)
                        val json = JSONObject(String(packet.data, 0, packet.length, Charsets.UTF_8))
                        if (json.optString("app") != "streamdeck") continue
                        val host = packet.address.hostAddress ?: continue
                        val port = json.optInt("port", 3210)
                        found["$host:$port"] = DeckServer(json.optString("name", host), host, port)
                    } catch (_: SocketTimeoutException) {
                    } catch (_: Exception) {
                    }
                }
            }
        } finally {
            runCatching { lock.release() }
        }
        return found.values.toList()
    }

    private fun broadcastAddresses(context: Context): List<InetAddress> {
        val out = mutableListOf<InetAddress>(InetAddress.getByName("255.255.255.255"))
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val props = cm.getLinkProperties(cm.activeNetwork) ?: return out
        for (la in props.linkAddresses) {
            val a = la.address as? Inet4Address ?: continue
            val prefix = la.prefixLength
            if (prefix !in 1..30) continue
            val ip = a.address.fold(0) { acc, b -> (acc shl 8) or (b.toInt() and 0xff) }
            val mask = -1 shl (32 - prefix)
            val bcast = ip or mask.inv()
            val bytes = ByteArray(4) { i -> (bcast shr (24 - 8 * i) and 0xff).toByte() }
            out.add(InetAddress.getByAddress(bytes))
        }
        return out
    }
}
