package expo.modules.mochicallstate

import android.content.Context
import android.media.AudioManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// The phone's audio mode tells when a call is ringing or going on, without any permission.
class MochiCallStateModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("MochiCallState")

    Function("inCall") {
      val audio = appContext.reactContext?.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
      when (audio?.mode) {
        AudioManager.MODE_RINGTONE,
        AudioManager.MODE_IN_CALL,
        AudioManager.MODE_IN_COMMUNICATION -> true
        else -> false
      }
    }
  }
}
