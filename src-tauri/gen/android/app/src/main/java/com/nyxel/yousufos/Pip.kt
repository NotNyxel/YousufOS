package com.nyxel.yousufos

import android.content.Context
import android.graphics.Color
import android.graphics.PixelFormat
import android.os.Build
import android.view.Gravity
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.TextView
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import org.json.JSONObject

/**
 * A small video window in a corner, on top of anything (cameras, the
 * doorbell, a Live TV channel while using another app). Needs "display over
 * other apps", which the install guide turns on.
 */
object Pip {
  private var wm: WindowManager? = null
  private var view: FrameLayout? = null
  private var player: ExoPlayer? = null

  val running: Boolean get() = view != null

  fun start(ctx: Context, req: JSONObject) {
    stop()
    val url = req.optString("url")
    if (url.isEmpty()) return
    val headers = Media.headers(req.optJSONObject("headers"))
    val p = ExoPlayer.Builder(ctx).setMediaSourceFactory(Media.sourceFactory(ctx, headers, req.optString("userAgent"), req.optString("proxy"))).build()
    p.volume = if (req.optBoolean("muted", false)) 0f else 1f
    p.setMediaItem(MediaItem.fromUri(url))
    p.prepare()
    p.playWhenReady = true

    val metrics = ctx.resources.displayMetrics
    val screenW = metrics.widthPixels
    // Sizes come in 1920-wide pixels like the laptop version.
    val w = (req.optInt("size", 480) * screenW / 1920).coerceIn(240, screenW / 2)
    val h = w * 9 / 16
    val pv = PlayerView(ctx).apply {
      useController = false
      resizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT
      setShutterBackgroundColor(Color.BLACK)
      player = p
    }
    val frame = FrameLayout(ctx).apply {
      setBackgroundColor(Color.BLACK)
      addView(pv, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
      val title = req.optString("title")
      if (title.isNotEmpty()) {
        addView(TextView(ctx).apply {
          text = title
          setTextColor(Color.WHITE)
          textSize = 13f
          setBackgroundColor(0x99000000.toInt())
          setPadding(16, 6, 16, 6)
        }, FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP or Gravity.START))
      }
    }
    val type = if (Build.VERSION.SDK_INT >= 26) WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY else @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE
    val lp = WindowManager.LayoutParams(w, h, type,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON,
      PixelFormat.TRANSLUCENT)
    val margin = screenW / 40
    lp.gravity = when (req.optString("corner", "br")) {
      "tl" -> Gravity.TOP or Gravity.START
      "tr" -> Gravity.TOP or Gravity.END
      "bl" -> Gravity.BOTTOM or Gravity.START
      else -> Gravity.BOTTOM or Gravity.END
    }
    lp.x = margin
    lp.y = margin
    val m = ctx.getSystemService(Context.WINDOW_SERVICE) as WindowManager
    try {
      m.addView(frame, lp)
    } catch (e: Exception) {
      p.release()
      return
    }
    p.addListener(object : Player.Listener {
      override fun onPlayerError(error: PlaybackException) {
        Bridge.emit("pip-closed", "{\"error\":true}")
        stop()
      }
    })
    wm = m
    view = frame
    player = p
    val seconds = req.optInt("seconds", 0)
    if (seconds > 0) frame.postDelayed({ if (view === frame) stop() }, seconds * 1000L)
  }

  fun stop() {
    player?.release()
    player = null
    view?.let { v -> try { wm?.removeView(v) } catch (_: Exception) {} }
    view = null
    wm = null
  }
}
