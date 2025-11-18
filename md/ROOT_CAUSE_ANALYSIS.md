# Root Cause Analysis

This document outlines the root causes for two observed issues: 
1. Massage tasks created by voice command do not start.
2. The Edge TTS (HiuGaai) voice fails and falls back to the browser's default TTS.

---

## Issue 1: Voice-Initiated Massage Task Does Not Start

**Symptom:**
When a user issues a voice command to start a massage (e.g., "幫我按摩肩膀"), the UI correctly displays the massage confirmation panel, but the massage session itself never begins. The progress bar does not appear, and no TTS confirmation message is played.

### Code Path Analysis:

1.  **Voice Command Received:** The voice command is transcribed and sent to the backend via the `sendMessage()` function in `static/app.js`.
2.  **LLM Response & Command Parsing:** The backend LLM responds with a structured command block (e.g., `[指令分類]...`). The frontend successfully receives this and calls `parseAndExecuteCommand()`.
3.  **UI Update:** The `executeMassageCommand()` function is called, which correctly runs `addConfirmationMessage(command)`. This is why the confirmation panel appears in the UI.
4.  **Session Creation:** A new `InteractiveMassageSession` object is created, and its `start()` method is called.
5.  **TTS Attempt:** Inside `currentMassageSession.start()`, the method calls `await updateProgressWithDialogue(0, startDialogue)`, which calls `await speakNurseResponse(startDialogue)`, which finally calls `await playCantoneseTTS(startDialogue)`.
6.  **Point of Failure - Browser TTS Path:**
    - Edge TTS fails (blocked by Microsoft - see Issue 2)
    - Server returns `503` with header `X-TTS-Fallback: browser`
    - Code enters browser TTS fallback path (line 3248-3318)
    - **BUG:** `speechSynthesis.speak(utterance)` is called (line 3317), then function immediately returns (line 3320)
    - The `speechSynthesis.speak()` API is **NOT async** - it doesn't return a promise
    - The promise chain resolves **before** the speech finishes playing
    - **Additionally:** The `utterance.onerror` handler throws an error (line 3314), but this happens **after** the function has already returned, creating an unhandled promise rejection

### Root Cause:

**The browser TTS fallback path does NOT properly await speech completion.** When Edge TTS fails and the system falls back to browser TTS, the `speechSynthesis.speak()` call starts the speech but immediately returns. The `async/await` chain thinks TTS is complete and tries to start the massage session, but:
- If browser TTS fails, an unhandled promise rejection occurs
- The massage session initialization may be interrupted by the error

The issue is **NOT** that the TTS blocks execution (as originally thought), but rather that the TTS **doesn't properly complete** before the function returns.

### Conclusion:

The massage task fails to start because the browser TTS fallback (which occurs when Edge TTS is blocked) doesn't properly await speech completion. The `speechSynthesis.speak()` API is event-based, not promise-based, and the code doesn't wrap it in a promise to make it awaitable.

### Fixes Applied (2025-01-21):

✅ **Fix #1: Wrapped browser TTS in Promise (503 fallback path)** (lines 3257-3318):
```javascript
// When server returns 503 with X-TTS-Fallback: browser header
await new Promise((resolve, reject) => {
    const utterance = new SpeechSynthesisUtterance(processedText);
    // ... setup code ...

    utterance.onend = () => {
        // cleanup...
        resolve(); // ✅ Now resolves when speech finishes
    };

    utterance.onerror = (e) => {
        // cleanup...
        reject(new Error('Browser TTS failed')); // ✅ Properly rejects on error
    };

    speechSynthesis.speak(utterance);
});
```

✅ **Fix #2: Wrapped browser TTS in Promise (error/timeout fallback path)** (lines 3470-3524):
```javascript
// When TTS times out (AbortError) or encounters network errors
await new Promise((resolve, reject) => {
    const utterance = new SpeechSynthesisUtterance(cleanText);
    // ... setup code ...

    utterance.onend = () => {
        // cleanup...
        resolve(); // ✅ Now resolves when speech finishes
    };

    utterance.onerror = (e) => {
        // cleanup...
        reject(new Error('Browser TTS error fallback failed')); // ✅ Properly rejects
    };

    speechSynthesis.speak(utterance);
});
```

**Why Two Fixes Were Needed:**
There are **TWO separate browser TTS fallback paths** in the code:
1. **Normal fallback** (503 response) - when Edge TTS is unavailable
2. **Error fallback** (catch block) - when TTS times out or errors occur

Both paths had the same bug where `speechSynthesis.speak()` returned immediately without waiting. This is particularly problematic when TTS requests timeout (15-second limit), as the massage session would start before the timeout fallback completed, causing the async chain to break.

Now the massage session properly waits for browser TTS to complete in **ALL scenarios** before starting the progress timer.

---

## Issue 2: Edge TTS (HiuGaai) Fails, Falls Back to Browser TTS

**Symptom:**
The preferred Cantonese voice, HiuGaai, is not working. Instead, a different voice (often a male voice, identified as the browser's default) is used for TTS.

### Analysis:

This is not a bug but the **correct and expected behavior** of the system's TTS fallback architecture.

1.  **Edge TTS is Blocked:** As documented in **`md/TTS_SERVICE_ISSUE.md`**, the free `edge-tts` library is currently being blocked by Microsoft's servers (returning a 403 Forbidden error). This is an external issue with the service provider, not a flaw in the chatbot's code.

2.  **Fallback System Activation:** The application is designed to handle this failure gracefully. The TTS provider priority is explicitly defined in **`md/TTS_CONFIGURATION_SUMMARY.md`** and implemented in `server_qwen.py` and `static/app.js`.

3.  **The New Priority Order is:**
    1.  **Edge TTS (Server-Side):** Fails due to the block.
    2.  **Browser TTS (Client-Side):** The server detects the Edge TTS failure and sends a `503` response, instructing the browser to use its own built-in TTS engine. This is the step you are observing. The voice you hear is the best available Cantonese or Chinese voice on your local system's browser (e.g., "Danny").
    3.  **Azure TTS (Server-Side):** This is the recommended high-quality Cantonese fallback. It is only used if the browser explicitly does not support TTS, or if it's configured to be preferred.
    4.  **gTTS (Server-Side):** A final fallback that uses Mandarin, not Cantonese.

### Conclusion:

The system is working as designed. The HiuGaai voice is unavailable because the free Edge TTS service is down. The fallback to the browser's local TTS is the correct second step in the chain to ensure the user still hears a voice response.

### Recommendation:

To restore the high-quality HiuGaai Cantonese voice, the recommended solution is to configure the **Azure TTS service**. It uses the exact same voice models as Edge TTS but via an official, reliable API.

**Action:** Follow the detailed instructions in **`md/AZURE_TTS_SETUP.md`**. This involves:
1.  Creating a free Azure account.
2.  Creating a Speech Service resource to get a free API key (provides 500,000 characters/month).
3.  Adding the `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION` to your `.env` file.

Once configured, the system will automatically use Azure TTS (HiuGaai) when Edge TTS fails, providing the desired voice experience.

---

## Issue 3: AudioContext Autoplay Policy Blocking TTS Audio

**Symptom:**
After creating a massage task via voice command, no TTS audio can be heard. The browser console shows the error:
```
The AudioContext was not allowed to start. It must be resumed (or created) after a user gesture on the page.
```

### Code Path Analysis:

1. **UltraFastTTSPlayer Initialization:** The `UltraFastTTSPlayer` class creates an `AudioContext` in its constructor (line 179):
   ```javascript
   this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
   ```

2. **Browser Autoplay Policy:** Modern browsers (Chrome, Safari, Firefox) require a user gesture (click, touch, keypress) before allowing `AudioContext` to play audio. This is a security measure to prevent auto-playing audio from annoying users.

3. **Point of Failure:** When TTS audio is synthesized and playback is attempted via `_startContinuousPlayback()`, the `AudioContext` is in a "suspended" state and cannot play audio, causing silent failure.

### Root Cause:

**The AudioContext was created without checking browser autoplay policy.** When the page loads, AudioContext starts in a "suspended" state. It needs to be resumed after a user interaction before it can play audio.

Similarly, the `OptimizedAudioPlayer` class uses HTML5 `<audio>` elements which also have autoplay restrictions.

### Fixes Applied (2025-01-21):

✅ **Fix #1: AudioContext Resume on User Gesture (UltraFastTTSPlayer)** (lines 196-233):
```javascript
class UltraFastTTSPlayer {
    constructor() {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        // ... other initialization ...

        // 🔧 FIX: Resume AudioContext on first user interaction
        this._setupAutoplayPolicyFix();
    }

    _setupAutoplayPolicyFix() {
        const resumeAudio = async () => {
            if (this.audioContext.state === 'suspended') {
                try {
                    await this.audioContext.resume();
                    console.log('✅ AudioContext resumed after user gesture');
                } catch (error) {
                    console.error('❌ Failed to resume AudioContext:', error);
                }
            }
        };

        // Listen for user interactions
        const events = ['click', 'touchstart', 'keydown'];
        events.forEach(event => {
            document.addEventListener(event, resumeAudio, { once: false });
        });
    }

    async _ensureAudioContextRunning() {
        // Ensure AudioContext is running before playback
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
            console.log('✅ AudioContext resumed for playback');
        }
    }
}
```

✅ **Fix #2: Check AudioContext State Before Playback** (lines 370-386):
```javascript
async _startContinuousPlayback() {
    if (this.isPlaying) return;

    // 🔧 FIX: Ensure AudioContext is running before playback
    try {
        await this._ensureAudioContextRunning();
    } catch (error) {
        console.error('❌ Cannot start playback - AudioContext failed to resume:', error);
        return;
    }

    this.isPlaying = true;
    this.nextStartTime = this.audioContext.currentTime;
    this._playbackLoop();
}
```

✅ **Fix #3: OptimizedAudioPlayer User Gesture Tracking** (lines 513-539):
```javascript
class OptimizedAudioPlayer {
    constructor() {
        // ... initialization ...
        this.userGestureReceived = false;

        // Setup autoplay policy handler for HTML5 Audio
        this._setupAutoplayHandler();
    }

    _setupAutoplayHandler() {
        const markUserGesture = () => {
            if (!this.userGestureReceived) {
                this.userGestureReceived = true;
                console.log('✅ User gesture received for audio playback');
            }
        };

        const events = ['click', 'touchstart', 'keydown'];
        events.forEach(event => {
            document.addEventListener(event, markUserGesture, { once: true });
        });
    }
}
```

✅ **Fix #4: Better Autoplay Error Handling** (lines 859-875, 792-804):
```javascript
// In _playWithBlob:
audio.play().catch(e => {
    if (e.name === 'NotAllowedError' || e.message.includes('play() request was interrupted')) {
        console.error('❌ Audio autoplay blocked by browser policy');
        reject(new Error('Autoplay blocked - user interaction required'));
    } else {
        // Handle other errors...
    }
});

// In _playWithMediaSource:
audio.play().catch(e => {
    if (e.name === 'NotAllowedError') {
        console.error('❌ MediaSource autoplay blocked by browser policy');
        reject(new Error('Autoplay blocked - user interaction required'));
    } else {
        console.warn('MediaSource auto-play failed:', e);
        reject(e);
    }
});
```

### How the Fix Works:

1. **Automatic Resume:** Both audio players now listen for user interactions (click, touch, keyboard) and automatically resume the AudioContext when detected.

2. **Pre-Playback Check:** Before starting audio playback, `_ensureAudioContextRunning()` checks if AudioContext is suspended and resumes it if needed.

3. **Clear Error Messages:** If autoplay is blocked, the error messages now clearly indicate that user interaction is required.

### Expected Behavior After Fix:

- ✅ After any user interaction (clicking consent, voice command, etc.), AudioContext will be resumed
- ✅ TTS audio will play normally after massage task creation
- ✅ Clear console logs indicate when AudioContext is resumed
- ✅ Better error messages if autoplay is still blocked for any reason

### Additional Notes:

**User Gestures That Enable Audio:**
- Clicking the consent button
- Clicking any UI button
- Using voice commands (triggers microphone permission, which counts as interaction)
- Pressing any key on the keyboard
- Touching the screen on mobile devices

Since the massage workflow requires user consent (button click or voice command "確認"), the AudioContext should always be resumed before TTS playback begins.
