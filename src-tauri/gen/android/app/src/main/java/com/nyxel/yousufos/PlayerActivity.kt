package com.nyxel.yousufos

import android.content.Context
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.TypedValue
import android.view.Gravity
import android.view.KeyEvent
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.MimeTypes
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.TrackSelectionOverride
import androidx.media3.common.Tracks
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.ui.PlayerView
import org.json.JSONArray
import org.json.JSONObject

object Media {
  const val UA = "YousufOS (Android TV)"

  fun headers(o: JSONObject?): Map<String, String> {
    val m = HashMap<String, String>()
    o?.keys()?.forEach { k -> m[k] = o.optString(k) }
    return m
  }

  fun sourceFactory(ctx: Context, headers: Map<String, String>, userAgent: String?): DefaultMediaSourceFactory {
    val http = DefaultHttpDataSource.Factory()
      .setUserAgent(if (userAgent.isNullOrEmpty()) UA else userAgent)
      .setAllowCrossProtocolRedirects(true)
      .setConnectTimeoutMs(15000)
      .setReadTimeoutMs(20000)
      .setDefaultRequestProperties(headers)
    return DefaultMediaSourceFactory(DefaultDataSource.Factory(ctx, http))
  }

  fun subtitleMime(url: String): String {
    val path = Uri.parse(url).path?.lowercase() ?: ""
    return when {
      path.endsWith(".srt") || path.endsWith(".subrip") -> MimeTypes.APPLICATION_SUBRIP
      path.endsWith(".ass") || path.endsWith(".ssa") -> MimeTypes.TEXT_SSA
      path.endsWith(".ttml") || path.endsWith(".xml") -> MimeTypes.APPLICATION_TTML
      else -> MimeTypes.TEXT_VTT
    }
  }
}

/**
 * The YousufOS video player: Jellyfin, Live TV, cameras and downloads. It
 * reports to the interface with the same events as the laptop's player
 * (media-progress, media-closed, player-closed, media-key).
 */
class PlayerActivity : ComponentActivity() {
  private lateinit var req: JSONObject
  private lateinit var player: ExoPlayer
  private lateinit var view: PlayerView
  private lateinit var label: TextView
  private lateinit var toast: TextView
  private val handler = Handler(Looper.getMainLooper())
  private var pid = 0
  private var live = false
  private var okToApp = false
  private var channel = 0
  private var channels = JSONArray()
  private var entries = JSONArray()
  private var started = 0L
  private var failed = false
  private var reported = false
  private var tracksAppliedFor = -1
  private var lastEmit = 0L

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    req = JSONObject(intent.getStringExtra("req") ?: "{}")
    pid = req.optInt("pid")
    live = req.optString("kind") == "live"
    okToApp = req.optBoolean("okToApp", false)
    started = System.currentTimeMillis()
    Bridge.player = this
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    WindowCompat.setDecorFitsSystemWindows(window, false)
    WindowInsetsControllerCompat(window, window.decorView).hide(WindowInsetsCompat.Type.systemBars())

    val headers = Media.headers(req.optJSONObject("headers"))
    player = ExoPlayer.Builder(this).setMediaSourceFactory(Media.sourceFactory(this, headers, req.optString("userAgent"))).build()
    view = PlayerView(this).apply {
      player = this@PlayerActivity.player
      setShutterBackgroundColor(Color.BLACK)
      setBackgroundColor(Color.BLACK)
      controllerShowTimeoutMs = 4000
      setShowSubtitleButton(true)
      keepScreenOn = true
      if (live) {
        setShowFastForwardButton(false)
        setShowRewindButton(false)
      }
    }
    label = overlayText(26f, Gravity.TOP or Gravity.START)
    toast = overlayText(22f, Gravity.TOP or Gravity.CENTER_HORIZONTAL)
    val root = FrameLayout(this).apply {
      setBackgroundColor(Color.BLACK)
      addView(view, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
      addView(label, FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP or Gravity.START).apply { setMargins(60, 50, 60, 0) })
      addView(toast, FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP or Gravity.CENTER_HORIZONTAL).apply { setMargins(0, 50, 0, 0) })
    }
    setContentView(root)

    player.addListener(object : Player.Listener {
      override fun onPlayerError(error: PlaybackException) {
        failed = true
        if (live) {
          showToast(getString2("This channel isn't working right now. Try another."), 5000)
        } else {
          showToast(getString2("Can't play this."), 3000)
          handler.postDelayed({ close() }, 2500)
        }
      }

      override fun onPlaybackStateChanged(state: Int) {
        if (state == Player.STATE_ENDED && !live) close()
        if (state == Player.STATE_READY) progress(force = true)
      }

      override fun onIsPlayingChanged(isPlaying: Boolean) = progress(force = true)

      override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
        tracksAppliedFor = -1
        progress(force = true)
      }

      override fun onTracksChanged(tracks: Tracks) = applyTracks(tracks)
    })

    if (live) {
      channels = req.optJSONArray("entries") ?: JSONArray()
      channel = req.optInt("index", 0).coerceIn(0, (channels.length() - 1).coerceAtLeast(0))
      playChannel()
    } else {
      entries = req.optJSONArray("entries") ?: JSONArray()
      val items = (0 until entries.length()).map { i -> mediaItem(entries.getJSONObject(i)) }
      val first = entries.optJSONObject(0)
      val startMs = ((first?.optDouble("start", 0.0) ?: 0.0).coerceAtLeast(0.0) * 1000).toLong()
      player.setMediaItems(items, 0, startMs)
      player.prepare()
      player.playWhenReady = first?.optBoolean("pause", false) != true
      if (req.optBoolean("audioOnly")) view.useArtwork = true
    }
    tick()
  }

  private fun getString2(s: String) = s

  private fun overlayText(size: Float, g: Int) = TextView(this).apply {
    setTextSize(TypedValue.COMPLEX_UNIT_SP, size)
    setTextColor(Color.WHITE)
    setShadowLayer(8f, 0f, 2f, Color.BLACK)
    setBackgroundColor(0xB3000000.toInt())
    setPadding(36, 18, 36, 18)
    gravity = g
    alpha = 0f
  }

  private fun mediaItem(e: JSONObject): MediaItem {
    val b = MediaItem.Builder().setUri(e.optString("url").trim())
      .setMediaMetadata(MediaMetadata.Builder().setTitle(e.optString("title")).build())
    val subs = e.optJSONArray("sub_files")
    if (subs != null && subs.length() > 0) {
      b.setSubtitleConfigurations((0 until subs.length()).map { i ->
        val u = subs.getString(i)
        MediaItem.SubtitleConfiguration.Builder(Uri.parse(u)).setMimeType(Media.subtitleMime(u)).setLanguage("und").build()
      })
    }
    return b.build()
  }

  /** Audio and subtitle choices from Jellyfin (mpv numbering: 1 = first track of that kind). */
  private fun applyTracks(tracks: Tracks) {
    if (live) return
    val idx = player.currentMediaItemIndex
    if (tracksAppliedFor == idx || tracks.groups.isEmpty()) return
    tracksAppliedFor = idx
    val e = entries.optJSONObject(idx) ?: return
    val params = player.trackSelectionParameters.buildUpon()
    val audio = tracks.groups.filter { it.type == C.TRACK_TYPE_AUDIO }
    val text = tracks.groups.filter { it.type == C.TRACK_TYPE_TEXT }
    if (!e.isNull("aid")) {
      val a = e.optInt("aid", 0) - 1
      if (a in audio.indices) params.setOverrideForType(TrackSelectionOverride(audio[a].mediaTrackGroup, 0))
    }
    if (!e.isNull("sid")) {
      val s = e.optInt("sid", 0)
      if (s <= 0) params.setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true)
      else if (s - 1 in text.indices) {
        params.setTrackTypeDisabled(C.TRACK_TYPE_TEXT, false)
        params.setOverrideForType(TrackSelectionOverride(text[s - 1].mediaTrackGroup, 0))
      }
    }
    player.trackSelectionParameters = params.build()
  }

  // ------------------------------------------------------------- live TV
  private fun playChannel() {
    val c = channels.optJSONObject(channel) ?: return
    failed = false
    player.setMediaItem(MediaItem.Builder().setUri(c.optString("url").trim())
      .setMediaMetadata(MediaMetadata.Builder().setTitle(c.optString("name")).build()).build())
    player.prepare()
    player.playWhenReady = true
    showLabel("${channel + 1}  ${c.optString("name")}")
    Bridge.emit("player-channel", JSONObject().put("index", channel).put("name", c.optString("name")).toString())
  }

  private fun zap(step: Int) {
    if (channels.length() < 2) return
    channel = (channel + step + channels.length()) % channels.length()
    playChannel()
  }

  // ------------------------------------------------------------- overlays
  private fun showLabel(s: String) {
    label.text = s
    label.animate().cancel()
    label.alpha = 1f
    label.animate().alpha(0f).setStartDelay(3500).setDuration(600).start()
  }

  private fun showToast(s: String, ms: Long) {
    toast.text = s
    toast.animate().cancel()
    toast.alpha = 1f
    toast.animate().alpha(0f).setStartDelay(ms).setDuration(500).start()
  }

  // ------------------------------------------------------------- progress
  private val ticker = Runnable { tick() }
  private fun tick() {
    progress(force = false)
    handler.postDelayed(ticker, 1000)
  }

  private fun state(): JSONObject {
    val dur = player.duration
    return JSONObject()
      .put("pos", player.currentPosition.coerceAtLeast(0) / 1000.0)
      .put("duration", if (dur == C.TIME_UNSET) 0.0 else dur / 1000.0)
      .put("paused", !player.playWhenReady)
      .put("index", player.currentMediaItemIndex)
      .put("pid", pid)
  }

  private fun progress(force: Boolean) {
    if (live || !::player.isInitialized) return
    val now = System.currentTimeMillis()
    if (!force && now - lastEmit < 1000) return
    lastEmit = now
    Bridge.emit("media-progress", state().toString())
  }

  // ------------------------------------------------------------- commands from the interface
  fun command(args: JSONArray) {
    when (args.optString(0)) {
      "quit" -> close()
      "seek" -> player.seekTo((args.optString(1).toDoubleOrNull() ?: 0.0).times(1000).toLong())
      "set" -> if (args.optString(1) == "pause") player.playWhenReady = args.optString(2) != "yes"
      "cycle" -> if (args.optString(1) == "pause") player.playWhenReady = !player.playWhenReady
      "show-text" -> showToast(args.optString(1), args.optString(2).toLongOrNull() ?: 3000)
    }
    progress(force = true)
  }

  // ------------------------------------------------------------- remote
  override fun dispatchKeyEvent(event: KeyEvent): Boolean {
    val code = event.keyCode
    val down = event.action == KeyEvent.ACTION_DOWN
    val controls = view.isControllerFullyVisible
    when (code) {
      KeyEvent.KEYCODE_BACK, KeyEvent.KEYCODE_ESCAPE, KeyEvent.KEYCODE_BUTTON_B -> {
        if (down) {
          if (controls) view.hideController() else close()
        }
        return true
      }
      KeyEvent.KEYCODE_CHANNEL_UP, KeyEvent.KEYCODE_PAGE_UP -> {
        if (down) if (live) zap(-1) else player.seekToPreviousMediaItem()
        return true
      }
      KeyEvent.KEYCODE_CHANNEL_DOWN, KeyEvent.KEYCODE_PAGE_DOWN -> {
        if (down) if (live) zap(1) else if (player.hasNextMediaItem()) player.seekToNextMediaItem()
        return true
      }
      KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE, KeyEvent.KEYCODE_BUTTON_X -> {
        if (down) player.playWhenReady = !player.playWhenReady
        return true
      }
      KeyEvent.KEYCODE_MEDIA_FAST_FORWARD -> {
        if (down && !live) player.seekTo(player.currentPosition + 30_000)
        return true
      }
      KeyEvent.KEYCODE_MEDIA_REWIND -> {
        if (down && !live) player.seekTo((player.currentPosition - 10_000).coerceAtLeast(0))
        return true
      }
      KeyEvent.KEYCODE_INFO, KeyEvent.KEYCODE_MENU -> {
        if (down) {
          if (live) channels.optJSONObject(channel)?.let { showLabel("${channel + 1}  ${it.optString("name")}") }
          view.showController()
        }
        return true
      }
    }
    if (!controls) {
      when (code) {
        KeyEvent.KEYCODE_DPAD_UP, KeyEvent.KEYCODE_DPAD_DOWN -> {
          if (down) {
            if (live) zap(if (code == KeyEvent.KEYCODE_DPAD_UP) -1 else 1) else view.showController()
          }
          return true
        }
        KeyEvent.KEYCODE_DPAD_LEFT, KeyEvent.KEYCODE_DPAD_RIGHT -> {
          if (down) {
            if (live) view.showController()
            else {
              val step = if (code == KeyEvent.KEYCODE_DPAD_RIGHT) 10_000 else -10_000
              player.seekTo((player.currentPosition + step).coerceAtLeast(0))
              showToast(fmt(player.currentPosition) + " / " + fmt(player.duration), 1200)
            }
          }
          return true
        }
        KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER, KeyEvent.KEYCODE_NUMPAD_ENTER, KeyEvent.KEYCODE_BUTTON_A -> {
          if (down && event.repeatCount == 0) {
            // Jellyfin decides (skip the intro, or pause).
            if (okToApp) Bridge.emit("media-key", JSONObject().put("key", "ok").put("pid", pid).toString())
            else {
              player.playWhenReady = !player.playWhenReady
              view.showController()
            }
          }
          return true
        }
      }
    }
    return super.dispatchKeyEvent(event)
  }

  private fun fmt(ms: Long): String {
    if (ms == C.TIME_UNSET || ms < 0) return "--:--"
    val s = ms / 1000
    return if (s >= 3600) "%d:%02d:%02d".format(s / 3600, s / 60 % 60, s % 60) else "%d:%02d".format(s / 60, s % 60)
  }

  // ------------------------------------------------------------- closing
  private fun report() {
    if (reported) return
    reported = true
    val error = failed && System.currentTimeMillis() - started < 20_000
    if (live) Bridge.emit("player-closed", JSONObject().put("error", error).put("index", channel).toString())
    else Bridge.emit("media-closed", JSONObject().put("error", error).put("state", state()).toString())
  }

  private fun close() {
    if (isFinishing) return
    report()
    finish()
  }

  /** Replaced by another video or stopped for the Adhan. */
  fun finishQuietly() = close()

  override fun onStop() {
    super.onStop()
    // Home pressed, or another app opened over the player: stop playing.
    if (!isFinishing) close()
  }

  override fun onDestroy() {
    handler.removeCallbacksAndMessages(null)
    report()
    if (Bridge.player === this) Bridge.player = null
    player.release()
    super.onDestroy()
  }
}
