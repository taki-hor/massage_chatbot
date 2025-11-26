# Self-Listening Bug Fix - Browser TTS ✅

## Problem Identified

The user correctly identified a **critical issue**: When Browser TTS (Danny) is used as a fallback, the voice recognition system was not being properly managed, which could cause:

1. **Self-listening feedback loop** - Voice recognition picking up TTS audio
2. **Recognition never resuming** - Voice recognition staying paused after TTS finishes
3. **Wake word detector not restarting** - System becomes unresponsive

## Root Cause

When the new Browser TTS fallback was implemented (priority 2), it called `speakText(cleanText)` which:
- ✅ Started Browser TTS successfully
- ❌ Did NOT wait for TTS to finish
- ❌ Did NOT resume voice recognition afterward
- ❌ Did NOT resume wake word detector

This meant voice recognition was stopped before TTS (correct), but never resumed after (broken).

## Solution Implemented

### Fixed Browser TTS Success Path (Lines 2976-3060)

**Before:**
```javascript
// Try browser TTS (priority 2: Browser Danny)
try {
    const cleanText = stripHTML(text);
    speakText(cleanText);  // ❌ Just calls and returns immediately
    return; // Browser TTS succeeded, we're done
}
```

**After:**
```javascript
// Try browser TTS (priority 2: Browser Danny)
try {
    // Use Browser TTS with proper cleanup
    if ('speechSynthesis' in window) {
        speechSynthesis.cancel(); // Stop any current speech

        const utterance = new SpeechSynthesisUtterance(processedText);
        // ... voice selection logic ...

        // ✅ Set up cleanup when browser TTS finishes
        utterance.onend = () => {
            console.log('✅ Browser TTS finished');

            // Reset UI
            if (indicator) indicator.classList.remove('active');
            setFoxState(null);
            isTTSPlaying = false;

            // ✅ Resume continuous listening if it was active
            if (wasListening && isMassageSessionActive) {
                console.log("🎤 Resuming continuous listening after Browser TTS.");
                setTimeout(() => {
                    isAutoListening = true;
                    browserRecognition.start();
                    showListeningIndicator("聆聽中...");
                }, 100);
            }

            // ✅ Resume wake word detector if it was active
            if (wasWakeWordActive && !isMassageSessionActive) {
                console.log("🎤 Resuming wake word detector after Browser TTS.");
                setTimeout(() => {
                    if (wakeWordDetector && !isMassageSessionActive) {
                        wakeWordDetector.start();
                    }
                }, 250);
            }
        };

        utterance.onerror = (e) => {
            console.error('❌ Browser TTS error:', e);
            throw new Error('Browser TTS failed');
        };

        speechSynthesis.speak(utterance);
        return; // Browser TTS started successfully
    }
}
```

### Fixed Browser TTS Error Path (Lines 3247-3348)

Also fixed the error handler's browser TTS fallback to use the same proper cleanup logic instead of calling `speakText()`.

## How Voice Recognition is Protected

### Before TTS Starts (Already Working ✅)

**Lines 2925-2938:**
```javascript
const wasListening = isAutoListening;
if (wasListening) {
    console.log("🎤 Pausing continuous listening for TTS.");
    isIntentionalStop = true;
    isAutoListening = false;
    browserRecognition.stop();  // ✅ Stops voice recognition
}

const wasWakeWordActive = wakeWordDetector && wakeWordDetector.isListening;
if (wasWakeWordActive) {
    console.log("🎤 Stopping wake word detector to prevent self-listening during TTS.");
    wakeWordDetector.stop();  // ✅ Stops wake word detection
}
```

### After Browser TTS Finishes (NOW FIXED ✅)

**Scenario 1: Continuous Listening Active (Massage Session)**
- TTS finishes → `utterance.onend` fires
- After 100ms delay → Restart `browserRecognition`
- Resume continuous listening for massage feedback

**Scenario 2: Wake Word Mode Active (Normal Chat)**
- TTS finishes → `utterance.onend` fires
- After 250ms delay → Restart `wakeWordDetector`
- System ready to listen for next wake word

### After Server TTS Finishes (Already Working ✅)

**Normal Path:** Uses "Follow-up Mode"
- TTS finishes → Enter Follow-up Mode
- Start browserRecognition for brief listening period
- If user speaks → Process command
- If no speech → browserRecognition.onend → Restart wake word detector

**Error Path:** Now properly handles cleanup
- Browser TTS finishes → Same cleanup as success path

## Complete TTS Flow with Voice Recognition

```
User triggers TTS
    ↓
🎤 STOP voice recognition (browserRecognition + wakeWordDetector)
    ↓
Try Edge TTS
    ↓ (fails)
Return 503 to client
    ↓
Client tries Browser TTS (Danny)
    ↓
🔊 Browser TTS plays (voice recognition is STOPPED)
    ↓
utterance.onend fires
    ↓
✅ RESUME voice recognition (based on what was active before)
    - If massage session → Resume continuous listening
    - If wake word mode → Resume wake word detector
```

## Testing Scenarios

### Scenario 1: Normal Wake Word Flow
```
1. Wake word detector listening ✅
2. User says "小狐狸"
3. Wake word detected → Stop wake word detector
4. Process question → Generate response
5. Try Edge TTS → Fails
6. Try Browser TTS (Danny) → SUCCESS
7. Browser TTS plays
8. ❌ OLD: Voice recognition never resumes
   ✅ NEW: Wake word detector resumes after 250ms
9. Ready for next wake word ✅
```

### Scenario 2: Massage Session Flow
```
1. Massage session active → Continuous listening ✅
2. User says "暫停"
3. Stop continuous listening
4. Process command → Generate response
5. Try Edge TTS → Fails
6. Try Browser TTS (Danny) → SUCCESS
7. Browser TTS plays "按摩已經暫停"
8. ❌ OLD: Continuous listening never resumes
   ✅ NEW: Continuous listening resumes after 100ms
9. Ready to hear next command ✅
```

### Scenario 3: Self-Listening Prevention
```
1. Browser TTS starts playing "您好！需要咩護理服務嗎？"
2. ✅ Voice recognition is STOPPED
3. Browser TTS audio plays out loud
4. ❌ OLD: If voice recognition was still on, it would hear the TTS
   ✅ NEW: Voice recognition is OFF, cannot hear itself
5. Browser TTS finishes
6. ✅ Voice recognition resumes AFTER TTS finishes
7. No feedback loop ✅
```

## Files Modified

**`static/app.js`:**
- Lines 2976-3060: Fixed Browser TTS success path with proper cleanup
- Lines 3247-3348: Fixed Browser TTS error path with proper cleanup

## What Was Already Working

The existing code already had:
- ✅ Voice recognition stopping BEFORE TTS starts (lines 2925-2938)
- ✅ Server TTS cleanup with Follow-up Mode (lines 3158-3212)
- ✅ Follow-up Mode timeout handling (lines 1111-1118)
- ✅ Wake word detector resumption in error handler (lines 3272-3285 - old code)

## What Was Broken

The Browser TTS fallback paths were missing:
- ❌ Cleanup after Browser TTS finishes
- ❌ Voice recognition resumption
- ❌ Wake word detector resumption
- ❌ UI state reset (isTTSPlaying flag)

## Current Status

✅ **FIXED** - All TTS paths now properly manage voice recognition:

| TTS Provider | Voice Recognition Management | Status |
|--------------|----------------------------|--------|
| Edge TTS | Stop → Play → Resume (Follow-up Mode) | ✅ Working |
| Browser TTS (Success) | Stop → Play → Resume | ✅ **FIXED** |
| Browser TTS (Error) | Stop → Play → Resume | ✅ **FIXED** |
| Azure TTS | Stop → Play → Resume (Follow-up Mode) | ✅ Working |
| gTTS | Stop → Play → Resume (Follow-up Mode) | ✅ Working |

## No More Self-Listening! 🎉

The voice recognition system will now:
1. ✅ Stop BEFORE any TTS plays
2. ✅ Stay stopped DURING TTS playback
3. ✅ Resume AFTER TTS finishes (with appropriate delay)
4. ✅ Never create feedback loops

**The critical bug is fixed!** 🚀
