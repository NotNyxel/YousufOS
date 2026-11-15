package com.nyxel.yousufos

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Prayer time: brings YousufOS to the front (over Netflix, YouTube...) for the Adhan. */
class AlarmReceiver : BroadcastReceiver() {
  companion object {
    const val EXTRA_KIND = "yousufos.alarm"
    const val SLOTS = 12

    fun pending(ctx: Context, slot: Int, kind: String?, flags: Int): PendingIntent? {
      val i = Intent(ctx, AlarmReceiver::class.java).setAction("yousufos.ALARM.$slot")
      if (kind != null) i.putExtra(EXTRA_KIND, kind)
      return PendingIntent.getBroadcast(ctx, slot, i, flags or PendingIntent.FLAG_IMMUTABLE)
    }
  }

  override fun onReceive(ctx: Context, intent: Intent) {
    val kind = intent.getStringExtra(EXTRA_KIND) ?: "adhan"
    Pip.stop()
    Bridge.player?.finishQuietly()
    val i = Intent(ctx, MainActivity::class.java)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
      .putExtra(EXTRA_KIND, kind)
    try {
      ctx.startActivity(i)
    } catch (_: Exception) {
    }
  }
}
