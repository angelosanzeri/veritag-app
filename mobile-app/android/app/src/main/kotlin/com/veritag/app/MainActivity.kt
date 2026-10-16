package com.veritag.app

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.nfc.NdefMessage
import android.nfc.NfcAdapter
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

/// Receives ArtTrust tags dispatched by the OS (the manifest routes our
/// external-type NDEF record here — never to a browser: the record is data,
/// not a URI) and hands the payload to Dart over the `veritag/nfc` channel.
/// The same channel lets Dart hand a link to the OS (`openUrl`): a Private
/// View or a studio-visit page in the browser, a vCard into Contacts.
class MainActivity : FlutterActivity() {
    private var channel: MethodChannel? = null
    private var pendingPayload: String? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        pendingPayload = payloadFrom(intent) ?: pendingPayload
        channel = MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "veritag/nfc").also {
            it.setMethodCallHandler { call, result ->
                when (call.method) {
                    "takeLaunchPayload" -> {
                        result.success(pendingPayload)
                        pendingPayload = null
                    }
                    "openUrl" -> result.success(openUrl(call.arguments as? String))
                    else -> result.notImplemented()
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        val payload = payloadFrom(intent) ?: return
        val ch = channel
        if (ch != null) ch.invokeMethod("tag", payload) else pendingPayload = payload
    }

    /// Open an http(s) link with whatever the OS picks; false if nothing can.
    private fun openUrl(url: String?): Boolean {
        val uri = url?.let { Uri.parse(it) } ?: return false
        if (uri.scheme != "https" && uri.scheme != "http") return false
        return try {
            startActivity(Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            true
        } catch (e: ActivityNotFoundException) {
            false
        }
    }

    /// Extract the ArtTrust record payload (`v1;u=…;c=…;m=…`) from an NFC
    /// dispatch intent; null for anything that isn't ours.
    private fun payloadFrom(intent: Intent?): String? {
        if (intent?.action != NfcAdapter.ACTION_NDEF_DISCOVERED) return null
        @Suppress("DEPRECATION")
        val messages = intent.getParcelableArrayExtra(NfcAdapter.EXTRA_NDEF_MESSAGES) ?: return null
        for (raw in messages) {
            val msg = raw as? NdefMessage ?: continue
            for (record in msg.records) {
                if (record.type?.toString(Charsets.US_ASCII) == "arttrust.com:t") {
                    return record.payload?.toString(Charsets.US_ASCII)
                }
            }
        }
        return null
    }
}
