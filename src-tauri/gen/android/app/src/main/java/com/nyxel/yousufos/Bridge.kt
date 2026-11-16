package com.nyxel.yousufos

import android.app.Activity
import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ResolveInfo
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.Drawable
import android.media.AudioManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Base64
import android.view.KeyEvent
import android.webkit.JavascriptInterface
import androidx.core.content.FileProvider
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File

/** Talks to the interface: events go in as window.__yaEmit(name, payload). */
object Bridge {
  @Volatile var main: MainActivity? = null
  @Volatile var player: PlayerActivity? = null

  fun emit(name: String, payloadJson: String) {
    val a = main ?: return
    a.runOnUiThread {
      a.web?.evaluateJavascript("window.__yaEmit&&window.__yaEmit(${JSONObject.quote(name)},$payloadJson)", null)
    }
  }

  /** YousufOS (or its player) in front of whatever else is on screen. */
  fun toFront(ctx: Context) {
    val i = Intent(ctx, MainActivity::class.java)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
    try {
      ctx.startActivity(i)
    } catch (_: Exception) {
    }
  }
}

/** window.YousufAndroid in the interface. Every method returns quickly; results are strings. */
class JsApi(private val act: MainActivity) {
  private val pm: PackageManager get() = act.packageManager
  private val icons = HashMap<String, String>()

  private fun ui(f: () -> Unit) = act.runOnUiThread(f)

  @JavascriptInterface
  fun info(): String {
    val pi = pm.getPackageInfo(act.packageName, 0)
    return JSONObject()
      .put("sdk", Build.VERSION.SDK_INT)
      .put("release", Build.VERSION.RELEASE)
      .put("model", "${Build.MANUFACTURER} ${Build.MODEL}".trim())
      .put("version", pi.versionName ?: "")
      .put("overlay", canDrawOverlays())
      .put("installs", if (Build.VERSION.SDK_INT >= 26) pm.canRequestPackageInstalls() else true)
      .toString()
  }

  private fun canDrawOverlays() = Build.VERSION.SDK_INT < 23 || Settings.canDrawOverlays(act)

  // ------------------------------------------------------------- apps
  private fun launchables(): List<ResolveInfo> {
    val seen = HashSet<String>()
    val out = ArrayList<ResolveInfo>()
    for (cat in listOf(Intent.CATEGORY_LEANBACK_LAUNCHER, Intent.CATEGORY_LAUNCHER)) {
      val q = Intent(Intent.ACTION_MAIN).addCategory(cat)
      @Suppress("DEPRECATION")
      for (ri in pm.queryIntentActivities(q, 0)) {
        val p = ri.activityInfo.packageName
        if (p == act.packageName || !seen.add(p)) continue
        out.add(ri)
      }
    }
    return out
  }

  /** Installed apps: [{pkg, label, tv}] (tv: made for the TV remote). */
  @JavascriptInterface
  fun apps(): String {
    val tvPkgs = HashSet<String>()
    @Suppress("DEPRECATION")
    pm.queryIntentActivities(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LEANBACK_LAUNCHER), 0)
      .forEach { tvPkgs.add(it.activityInfo.packageName) }
    val arr = JSONArray()
    for (ri in launchables()) {
      val p = ri.activityInfo.packageName
      arr.put(JSONObject().put("pkg", p).put("label", ri.loadLabel(pm).toString()).put("tv", tvPkgs.contains(p)))
    }
    return arr.toString()
  }

  /** The app's TV banner (or icon) as a data: URL; "" if there is none. */
  @JavascriptInterface
  fun appImage(pkg: String): String {
    icons[pkg]?.let { return it }
    val out = try {
      val ai = pm.getApplicationInfo(pkg, 0)
      val banner: Drawable? = pm.getApplicationBanner(ai)
        ?: pm.getLeanbackLaunchIntentForPackage(pkg)?.let { i -> pm.getActivityBanner(i) }
      val d = banner ?: pm.getApplicationIcon(ai)
      val (w, h) = if (banner != null) 320 to 180 else 192 to 192
      "data:image/png;base64," + Base64.encodeToString(png(d, w, h), Base64.NO_WRAP) + "#" + (if (banner != null) "banner" else "icon")
    } catch (_: Exception) {
      ""
    }
    icons[pkg] = out
    return out
  }

  private fun png(d: Drawable, w: Int, h: Int): ByteArray {
    val bmp = if (d is BitmapDrawable && d.bitmap != null) Bitmap.createScaledBitmap(d.bitmap, w, h, true) else {
      val b = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
      val c = Canvas(b)
      d.setBounds(0, 0, w, h)
      d.draw(c)
      b
    }
    val bos = ByteArrayOutputStream()
    bmp.compress(Bitmap.CompressFormat.PNG, 100, bos)
    return bos.toByteArray()
  }

  @JavascriptInterface
  fun launch(pkg: String): Boolean {
    val i = pm.getLeanbackLaunchIntentForPackage(pkg) ?: pm.getLaunchIntentForPackage(pkg) ?: return false
    i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    return try {
      act.startActivity(i); true
    } catch (_: Exception) {
      false
    }
  }

  @JavascriptInterface
  fun installed(pkg: String): Boolean = try {
    pm.getApplicationInfo(pkg, 0); true
  } catch (_: Exception) {
    false
  }

  /** Google Play: an app's page (pkg) or a search. */
  @JavascriptInterface
  fun store(pkg: String, query: String): Boolean {
    val market = if (pkg.isNotEmpty()) "market://details?id=$pkg" else "market://search?q=${Uri.encode(query)}&c=apps"
    val web = if (pkg.isNotEmpty()) "https://play.google.com/store/apps/details?id=$pkg" else "https://play.google.com/store/search?q=${Uri.encode(query)}&c=apps"
    for (u in listOf(market, web)) {
      try {
        act.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(u)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        return true
      } catch (_: Exception) {
      }
    }
    return false
  }

  @JavascriptInterface
  fun openUrl(url: String): Boolean = try {
    act.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); true
  } catch (_: Exception) {
    false
  }

  /** The TV's own settings ("" = main page, "overlay", "installs", "apps"). */
  @JavascriptInterface
  fun openSettings(which: String): Boolean {
    val pkgUri = Uri.parse("package:${act.packageName}")
    val intents = when (which) {
      "overlay" -> listOf(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, pkgUri), Intent(Settings.ACTION_SETTINGS))
      "installs" -> if (Build.VERSION.SDK_INT >= 26) listOf(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, pkgUri), Intent(Settings.ACTION_SECURITY_SETTINGS)) else listOf(Intent(Settings.ACTION_SECURITY_SETTINGS))
      "apps" -> listOf(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkgUri))
      "network" -> listOf(Intent(Settings.ACTION_WIFI_SETTINGS), Intent(Settings.ACTION_SETTINGS))
      "display" -> listOf(Intent(Settings.ACTION_DISPLAY_SETTINGS), Intent(Settings.ACTION_SETTINGS))
      "sound" -> listOf(Intent(Settings.ACTION_SOUND_SETTINGS), Intent(Settings.ACTION_SETTINGS))
      else -> listOf(Intent(Settings.ACTION_SETTINGS))
    }
    for (i in intents) {
      try {
        act.startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); return true
      } catch (_: Exception) {
      }
    }
    return false
  }

  // ------------------------------------------------------------- player
  /** Plays in the YousufOS player. Returns its id. */
  @JavascriptInterface
  fun play(json: String): Int {
    val id = (System.currentTimeMillis() % 1_000_000_000).toInt()
    val req = JSONObject(json).put("pid", id)
    ui {
      Bridge.player?.finishQuietly()
      act.startActivity(Intent(act, PlayerActivity::class.java).putExtra("req", req.toString()))
    }
    return id
  }

  /** mpv-style commands: quit · seek <s> absolute · set pause yes|no · cycle pause · show-text <msg> <ms> */
  @JavascriptInterface
  fun playerCommand(json: String) {
    val args = JSONArray(json)
    ui { Bridge.player?.command(args) }
  }

  @JavascriptInterface
  fun playerOpen(): Boolean = Bridge.player != null

  @JavascriptInterface
  fun pipStart(json: String): String {
    if (!canDrawOverlays()) return "overlay"
    ui { Pip.start(act.applicationContext, JSONObject(json)) }
    return ""
  }

  @JavascriptInterface
  fun pipStop() = ui { Pip.stop() }

  @JavascriptInterface
  fun pipRunning(): Boolean = Pip.running

  // ------------------------------------------------------------- remote, volume, front
  /** A phone-remote button: pressed in YousufOS or its player. */
  @JavascriptInterface
  fun key(name: String) {
    if (name == "volup" || name == "voldown") {
      volume(if (name == "volup") 1 else -1); return
    }
    if (name == "home") {
      Bridge.toFront(act); Bridge.emit("go-home", "{}"); return
    }
    val code = Keys.fromRemote(name) ?: return
    ui {
      val target: Activity = Bridge.player ?: act
      target.dispatchKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, code))
      target.dispatchKeyEvent(KeyEvent(KeyEvent.ACTION_UP, code))
    }
  }

  /** Volume up/down (shows the TV's own volume bar). Returns the level 0-100. */
  @JavascriptInterface
  fun volume(step: Int): Int {
    val am = act.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    if (step != 0) am.adjustStreamVolume(AudioManager.STREAM_MUSIC, if (step > 0) AudioManager.ADJUST_RAISE else AudioManager.ADJUST_LOWER, AudioManager.FLAG_SHOW_UI)
    val max = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC).coerceAtLeast(1)
    return am.getStreamVolume(AudioManager.STREAM_MUSIC) * 100 / max
  }

  @JavascriptInterface
  fun mute(on: Boolean) {
    val am = act.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    if (Build.VERSION.SDK_INT >= 23) am.adjustStreamVolume(AudioManager.STREAM_MUSIC, if (on) AudioManager.ADJUST_MUTE else AudioManager.ADJUST_UNMUTE, 0)
  }

  @JavascriptInterface
  fun toFront() {
    Pip.stop()
    Bridge.toFront(act)
  }

  @JavascriptInterface
  fun keepScreenOn(on: Boolean) = ui {
    if (on) act.window.addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    else act.window.clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
  }

  // ------------------------------------------------------------- prayer-time alarms
  /** [{at: epoch ms, kind}] - YousufOS comes to the front at these times. */
  @JavascriptInterface
  fun setAlarms(json: String) {
    val am = act.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    val list = JSONArray(json)
    for (i in 0 until AlarmReceiver.SLOTS) {
      val pi = AlarmReceiver.pending(act, i, null, PendingIntent.FLAG_NO_CREATE)
      if (pi != null) am.cancel(pi)
    }
    for (i in 0 until minOf(list.length(), AlarmReceiver.SLOTS)) {
      val o = list.getJSONObject(i)
      val at = o.getLong("at")
      if (at < System.currentTimeMillis()) continue
      val pi = AlarmReceiver.pending(act, i, o.optString("kind", "adhan"), PendingIntent.FLAG_UPDATE_CURRENT)!!
      try {
        if (Build.VERSION.SDK_INT >= 31 && !am.canScheduleExactAlarms()) am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
        else am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
      } catch (_: SecurityException) {
        am.set(AlarmManager.RTC_WAKEUP, at, pi)
      }
    }
  }

  // ------------------------------------------------------------- updates
  /**
   * Installs a downloaded YousufOS .apk with Android's package installer.
   * On Android 12+ (once YousufOS is its own installer, which the install
   * script sets up) it updates without asking; otherwise Android shows its
   * "Update this app?" screen.
   */
  @JavascriptInterface
  fun installApk(path: String): String {
    if (Build.VERSION.SDK_INT >= 26 && !pm.canRequestPackageInstalls()) {
      openSettings("installs")
      return "permission"
    }
    return try {
      val installer = pm.packageInstaller
      val params = android.content.pm.PackageInstaller.SessionParams(android.content.pm.PackageInstaller.SessionParams.MODE_FULL_INSTALL)
      params.setAppPackageName(act.packageName)
      if (Build.VERSION.SDK_INT >= 31) params.setRequireUserAction(android.content.pm.PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
      val id = installer.createSession(params)
      installer.openSession(id).use { session ->
        File(path).inputStream().use { input ->
          session.openWrite("YousufOS.apk", 0, File(path).length()).use { out ->
            input.copyTo(out)
            session.fsync(out)
          }
        }
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0)
        val pi = PendingIntent.getBroadcast(act, id, Intent(act, InstallReceiver::class.java), flags)
        session.commit(pi.intentSender)
      }
      ""
    } catch (e: Exception) {
      e.message ?: "install failed"
    }
  }
}

/** Android's answer to an update: asks for confirmation when needed, reports failures. */
class InstallReceiver : android.content.BroadcastReceiver() {
  override fun onReceive(ctx: Context, intent: Intent) {
    val status = intent.getIntExtra(android.content.pm.PackageInstaller.EXTRA_STATUS, -999)
    when (status) {
      android.content.pm.PackageInstaller.STATUS_PENDING_USER_ACTION -> {
        @Suppress("DEPRECATION")
        val confirm = intent.getParcelableExtra<Intent>(Intent.EXTRA_INTENT) ?: return
        confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try {
          ctx.startActivity(confirm)
        } catch (_: Exception) {
        }
      }
      android.content.pm.PackageInstaller.STATUS_SUCCESS -> {}
      else -> {
        val msg = intent.getStringExtra(android.content.pm.PackageInstaller.EXTRA_STATUS_MESSAGE) ?: "status $status"
        Bridge.emit("update-failed", JSONObject().put("error", msg).toString())
      }
    }
  }
}
