package com.nyxel.yousufos

import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.webkit.WebView
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

// The YousufOS home screen on Android TV. The interface is the same web app as
// on the laptop; this activity adds what only Android can do (see Bridge.kt):
// the TV remote's extra buttons, installed apps, the video player, updates
// and bringing YousufOS to the front at prayer time.
class MainActivity : TauriActivity() {
  // Back is handled by the interface (it knows which screen is open).
  override val handleBackNavigation: Boolean = false

  var web: WebView? = null
    private set

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    Bridge.main = this
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    fullScreen()
    handleIntent(intent, starting = true)
  }

  override fun onWebViewCreate(webView: WebView) {
    web = webView
    webView.addJavascriptInterface(JsApi(this), "YousufAndroid")
    webView.settings.mediaPlaybackRequiresUserGesture = false
    webView.isFocusable = true
    webView.isFocusableInTouchMode = true
    webView.requestFocus()
  }

  override fun onWindowFocusChanged(hasFocus: Boolean) {
    super.onWindowFocusChanged(hasFocus)
    if (hasFocus) {
      fullScreen()
      web?.requestFocus()
    }
  }

  override fun onResume() {
    super.onResume()
    Bridge.main = this
    Bridge.emit("android-resume", "{}")
  }

  override fun onPause() {
    super.onPause()
    Bridge.emit("android-pause", "{}")
  }

  override fun onDestroy() {
    if (Bridge.main === this) Bridge.main = null
    super.onDestroy()
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    handleIntent(intent, starting = false)
  }

  private fun handleIntent(intent: Intent?, starting: Boolean) {
    if (intent == null) return
    val alarm = intent.getStringExtra(AlarmReceiver.EXTRA_KIND)
    when {
      alarm != null -> Bridge.emit("android-alarm", "{\"kind\":${org.json.JSONObject.quote(alarm)}}")
      // The remote's Home button while YousufOS is already open: go to the home page.
      !starting && intent.hasCategory(Intent.CATEGORY_HOME) -> Bridge.emit("go-home", "{}")
    }
  }

  private fun fullScreen() {
    WindowCompat.setDecorFitsSystemWindows(window, false)
    WindowInsetsControllerCompat(window, window.decorView).apply {
      hide(WindowInsetsCompat.Type.systemBars())
      systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
    }
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
      @Suppress("DEPRECATION")
      window.decorView.systemUiVisibility = (View.SYSTEM_UI_FLAG_FULLSCREEN or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY)
    }
  }

  // Remote buttons the web view doesn't pass to the page become the keys the
  // interface already understands (the same ones a game controller sends).
  override fun dispatchKeyEvent(event: KeyEvent): Boolean {
    val key = Keys.forLauncher(event.keyCode)
    if (key != null) {
      if (event.action == KeyEvent.ACTION_DOWN) Bridge.emit("gamepad-key", org.json.JSONObject.quote(key))
      return true
    }
    return super.dispatchKeyEvent(event)
  }
}

object Keys {
  /** Remote button -> key name for the interface (null: let the web view have it). */
  fun forLauncher(code: Int): String? = when (code) {
    KeyEvent.KEYCODE_BACK, KeyEvent.KEYCODE_BUTTON_B -> "GoBack"
    // OK: sent as Enter so every web view version behaves the same.
    KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_BUTTON_A, KeyEvent.KEYCODE_NUMPAD_ENTER -> "Enter"
    KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE, KeyEvent.KEYCODE_MEDIA_PLAY, KeyEvent.KEYCODE_MEDIA_PAUSE, KeyEvent.KEYCODE_BUTTON_X -> "x"
    KeyEvent.KEYCODE_BUTTON_Y -> "y"
    KeyEvent.KEYCODE_CHANNEL_UP, KeyEvent.KEYCODE_BUTTON_L1, KeyEvent.KEYCODE_MEDIA_PREVIOUS -> "PageUp"
    KeyEvent.KEYCODE_CHANNEL_DOWN, KeyEvent.KEYCODE_BUTTON_R1, KeyEvent.KEYCODE_MEDIA_NEXT -> "PageDown"
    KeyEvent.KEYCODE_MENU, KeyEvent.KEYCODE_INFO, KeyEvent.KEYCODE_GUIDE, KeyEvent.KEYCODE_BUTTON_START -> "ContextMenu"
    KeyEvent.KEYCODE_PROG_RED -> "ColorRed"
    KeyEvent.KEYCODE_PROG_GREEN -> "ColorGreen"
    KeyEvent.KEYCODE_PROG_YELLOW -> "ColorYellow"
    KeyEvent.KEYCODE_PROG_BLUE -> "ColorBlue"
    KeyEvent.KEYCODE_TV, KeyEvent.KEYCODE_LAST_CHANNEL -> "ColorRed"
    else -> null
  }

  /** Phone remote button name -> Android key code. */
  fun fromRemote(name: String): Int? = when (name) {
    "up" -> KeyEvent.KEYCODE_DPAD_UP
    "down" -> KeyEvent.KEYCODE_DPAD_DOWN
    "left" -> KeyEvent.KEYCODE_DPAD_LEFT
    "right" -> KeyEvent.KEYCODE_DPAD_RIGHT
    "ok" -> KeyEvent.KEYCODE_DPAD_CENTER
    "back" -> KeyEvent.KEYCODE_BACK
    "playpause" -> KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE
    "menu" -> KeyEvent.KEYCODE_MENU
    "y" -> KeyEvent.KEYCODE_BUTTON_Y
    "prev" -> KeyEvent.KEYCODE_CHANNEL_UP
    "next" -> KeyEvent.KEYCODE_CHANNEL_DOWN
    else -> null
  }
}
