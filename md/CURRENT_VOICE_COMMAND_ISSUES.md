# Definitive Root Cause Analysis & Solution for Voice Command Failures

This document provides a final root cause analysis for the voice-initiated massage task failure, based on detailed console logs. The previous analysis was a step in the right direction but did not fully account for the strictness of browser security policies.

---

## 1. Definitive Root Cause: Autoplay Policy vs. Voice-Only Gestures

**Symptom:** After a voice command to create a massage and a subsequent voice confirmation, the UI freezes, no audio is heard, and the massage session does not start. The console is flooded with errors, starting with `The AudioContext was not allowed to start`.

**Primary Root Cause:**
The browser's **autoplay policy** is the unmitigated, primary blocker. Modern browsers require a direct, physical user gesture (like a `click` or `touchstart`) to unlock the `AudioContext`. A programmatic call to `audioContext.resume()` is **not** considered a valid user gesture if it isn't in the direct call stack of a user-initiated event.

**The Flaw in the Voice-Only Flow:**
1.  The user gives a voice command (e.g., "幫我按摩肩膀").
2.  The consent panel appears and a special, temporary voice recognition (`consentRecognition`) starts.
3.  The user says "確認".
4.  The `onresult` event for `consentRecognition` fires. This is a callback from the browser's speech engine, **not a direct user gesture**.
5.  Inside this callback, my previous fix, `ensureAudioReadyForTTS()`, attempts to call `audioContext.resume()`.
6.  **This fails.** The browser correctly determines that this `.resume()` call was not initiated by a direct physical interaction and blocks it, throwing the `AudioContext was not allowed to start` error.

**The Cascade of Failures:**
- Because the `AudioContext` is locked, all subsequent attempts to play audio fail, including the server TTS fallback and the browser TTS fallback.
- The `InteractiveMassageSession.start()` method, which was correctly modified to be non-blocking, proceeds. However, its call to `updateProgressWithDialogue()` fails silently because no audio can be played.
- The UI freezes and becomes unresponsive due to a secondary issue: a race condition between the main `wakeWordDetector` and the temporary `consentRecognition` fighting for control of the microphone, causing a rapid loop of errors and restarts that overwhelms the browser's main thread.

### Conclusion:
The voice-only consent path is fundamentally incompatible with browser autoplay policies. No amount of programmatic fixes within an speech recognition callback can substitute for a direct, physical user click or touch to unlock the audio.

---

## 2. Root Cause: Edge TTS (HiuGaai) Not Working

This analysis remains unchanged and correct.

- **This is an external service issue.** The free `edge-tts` library is being blocked by Microsoft's servers (403 Forbidden).
- **The fallback to browser TTS is the expected behavior.** The system is correctly identifying the failure and moving to the next provider in its priority list.

---

## 3. Final Recommendations

### To Fix the Massage Task (Primary Recommendation):

The only 100% reliable solution is to **collect a physical user gesture once** before the first massage session starts.

1.  **Prompt for Audio Unlock:** A full-screen overlay now appears on load, asking the user to tap to enable audio. That gesture resumes every known `AudioContext` and resolves any pending unlock promises.
2.  **Gate Voice Consent on Unlock:** `handleConsentResponse()` awaits `ensureAudioReadyForTTS()`. If the gesture has not happened yet, the code shows a banner and waits until the user taps anywhere to finish the unlock.
3.  **Keep Voice Consent Available:** Once the gesture is recorded, voice responses like "確認" or "開始" proceed exactly as before; both server TTS and browser fallback audio are free to play.

This change guarantees that by the time the massage session starts, the browser has registered a valid user gesture and all subsequent TTS audio will play without issue.

### To Stabilize the UI and Stop Freezing:

The conflicting voice recognition loops must be fixed.

1.  **Explicitly Stop Wake Word:** Before `consentRecognition` starts listening, pause the main `wakeWordDetector` so the two recognizers never compete for the same microphone.
2.  **Guaranteed Restart:** A `finally` block in the consent handler restarts the `wakeWordDetector` whenever consent ends (unless a massage session is already in progress).

### To Restore High-Quality Cantonese TTS:

This recommendation is also unchanged.

- **Action:** Configure the **Azure TTS service** as your primary fallback. It provides the exact same high-quality HiuGaai voice model but through a stable, official API.
- **Instructions:** Follow the setup guide in **`md/AZURE_TTS_SETUP.md`**. This will resolve the voice quality issue permanently.

---

## Implementation Update

- `static/app.js` now shows the audio-unlock overlay/banner (`initAudioUnlock()` and `showTapToEnableAudioBanner()`) and resolves pending unlock promises only after a real tap or key press.
- `ensureAudioReadyForTTS()` suspends execution until the unlock happens, so voice-triggered consent waits politely for the gesture instead of failing silently.
- The consent flow pauses the wake word detector while the consent mic is active and restores it afterward, eliminating the restart storm that previously froze the UI.
