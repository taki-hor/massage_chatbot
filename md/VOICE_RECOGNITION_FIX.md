# Voice Recognition Fix - "meta is not defined" Error

## Problem History

### Initial Issue (2025-10-21 - Morning)

Voice recognition completely stopped working after TTS playback. The browser console showed:

```
Uncaught ReferenceError: meta is not defined
    at Audio.onAudioEnd (app.js:3348:21)
```

**Broken Code:**
```javascript
// ✨ NEW: Follow-up Mode - listen for a moment after speaking
if (meta.isFollowUp) {
    startFollowUpListening();
}
```

**Issues:**
1. Variable `meta` was never defined in this scope
2. Function `startFollowUpListening()` does not exist
3. The ReferenceError crashed the `onAudioEnd` callback

### First Fix Attempt (2025-10-21 - Afternoon)

Replaced with Follow-up Mode implementation:
```javascript
if (wasWakeWordActive && !isMassageSessionActive) {
    console.log("🎤 Entering Follow-up Mode listening after server TTS...");
    isFollowUpListening = true;
    try {
        browserRecognition.start();
        showListeningIndicator("...");
    } catch(e) {
        console.error("❌ Error starting follow-up listening after server TTS:", e);
        isFollowUpListening = false;
    }
}
```

**New Issues Found:**
- Follow-up Mode interfered with massage session startup
- TTS abort errors occurred during massage sessions
- Voice command to start massage task responded correctly but task didn't start properly

### Final Solution (2025-10-21 - Evening)

**REVERTED** Follow-up Mode implementation and replaced with simple wake word detector resumption:

```javascript
// Resume wake word detector if it was active before TTS (and not in massage session)
if (wasWakeWordActive && !isMassageSessionActive) {
    console.log("🎤 Resuming wake word detector after server TTS.");
    setTimeout(() => {
        if (wakeWordDetector && !isMassageSessionActive) {
            wakeWordDetector.start();
        }
    }, 250);
}
```

**Applied to:**
1. Server TTS path (Edge/Azure/gTTS) - lines 3347-3355
2. Browser TTS fallback path - lines 3268-3276

## Current Behavior

After TTS finishes playing:

1. **Massage Sessions:** Continuous listening resumes automatically (existing code works correctly)
2. **General Conversations:** Wake word detector restarts after 250ms delay
3. **No Follow-up Mode:** User must say "護理員" again for each interaction

## Why Follow-up Mode Was Removed

Follow-up Mode was causing interference with massage session initialization:
- Browser recognition was being started when it shouldn't be
- Timing conflicts between follow-up mode and massage continuous listening
- TTS abort errors during transitions

The simpler approach of just resuming the wake word detector is more stable and reliable.

## Testing

1. **Wake Word Test:**
   - Say "護理員"
   - Ask "今日天氣點樣?"
   - Wait for TTS response
   - Must say "護理員" again for next interaction (expected behavior)

2. **Massage Session Test:**
   - Say "護理員" then "幫我按摩"
   - Massage session should start correctly
   - After TTS response, say commands like "暫停", "繼續", "停止"
   - Should work without wake word (continuous listening active)

3. **Check Console:**
   - Should see: `🎤 Resuming wake word detector after server TTS.`
   - Should NOT see: `Uncaught ReferenceError: meta is not defined`
   - Should NOT see: `🎤 Entering Follow-up Mode listening...`

## Future Considerations

If Follow-up Mode is to be re-implemented in the future:
1. Must not interfere with massage session state transitions
2. Needs better detection of when it's safe to activate
3. May need separate handling for different conversation contexts
4. Consider using a queue system for recognition state changes

## Date History

- **2025-10-21 Morning:** Initial "meta is not defined" error discovered
- **2025-10-21 Afternoon:** First fix with Follow-up Mode
- **2025-10-21 Evening:** Reverted to simple wake word detector resumption
