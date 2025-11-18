# Voice Recognition During Massage - Status & Debug Guide

**Date:** 2025-10-20
**Status:** ⚠️ VOICE RECOGNITION NOT WORKING DURING MASSAGE
**Symptom:** Voice recognition works BEFORE and AFTER massage, but NOT DURING massage

---

## Current Problem Summary

### What's Happening ❌

1. **Before Massage:** Voice recognition works (can see STT output in F12 console)
2. **Massage Starts:** Voice recognition seems to stop responding
3. **During Massage:** User says "暫停", "太大力" → NO response in console, NO processing
4. **After Massage Ends:** Voice recognition works again (STT output visible in F12)

### Key Observation

The system is configured to use **continuous listening** during massage, but something is preventing it from capturing or processing voice input.

---

## What We've Already Fixed

### ✅ Fixes Applied Today

1. **Self-Listening Bug Fixed** (SELF_LISTENING_BUG_FIX_COMPLETE.md)
   - Wake word detector now stops during TTS to prevent hearing own voice
   - Resumes intelligently after TTS

2. **Console Errors Fixed** (CONSOLE_ERROR_FIXES.md)
   - "Already started" errors handled gracefully
   - "No-speech" errors logged as info instead of errors

3. **Voice Recognition Sensitivity Improved** (VOICE_RECOGNITION_SENSITIVITY_FIX.md)
   - Lowered confidence threshold from 85% to 70%
   - Added more quick commands: '停止', '太大力', '唔夠力'
   - Added real-time visual feedback

4. **Continuous Listening Recovery** (CONTINUOUS_LISTENING_RECOVERY_FIX.md)
   - Network error auto-recovery
   - "Already started" error handling
   - Multiple recovery mechanisms

5. **Continuous Listening Architecture** (CONTINUOUS_LISTENING_SOLUTION.md)
   - Wake word disabled during massage
   - Continuous listening enabled during massage
   - Auto-resume after TTS

### ✅ What's Working

- Wake word detection in normal mode
- Voice recognition before massage starts
- Voice recognition after massage ends
- TTS playback during massage
- Emergency stop button (🛑)
- Pause/Resume buttons (⏸️ ▶️)

### ❌ What's NOT Working

- **Voice recognition during active massage session**
- User commands like "暫停", "太大力" are not being heard

---

## Architecture Overview

### Voice Recognition System

The chatbot has **TWO** voice recognition modes:

#### Mode 1: Normal Mode (Wake Word)
```
User says "小狐狸" (wake word)
    ↓
Wake word detector activates
    ↓
User says command
    ↓
Processes command
```

#### Mode 2: Massage Mode (Continuous Listening)
```
Massage starts
    ↓
Wake word detector STOPS
    ↓
Continuous listening STARTS
    ↓
User says "暫停" directly (no wake word needed)
    ↓
Should process command immediately
```

**Current Issue:** Mode 2 is NOT capturing voice input during massage.

---

## Key Code Locations

### 1. Continuous Listening Start (Line 1894-1930)
**File:** `static/app.js`

```javascript
async function startContinuousMassageListening() {
    if (isAutoListening) return;
    console.log('🎤 Starting continuous listening for massage session...');

    // Stop wake word detector
    if (wakeWordDetector && wakeWordDetector.isListening) {
        wakeWordDetector.stop();
    }

    try {
        isAutoListening = true;
        browserRecognition.start();
        showListeningIndicator("聆聽中...");
        console.log('✅ Continuous listening started - ready for quick commands');
    } catch (error) {
        // Error handling...
    }
}
```

**Expected:** This should be called when massage starts.
**Check:** Look for `✅ Continuous listening started` in console during massage.

### 2. Massage Session Start (Line 1543-1568)
**File:** `static/app.js`

```javascript
async start() {
    isMassageSessionActive = true;
    console.log('🎯 Massage session started - Continuous listening enabled.');

    // ... create UI elements ...

    // Start continuous listening for the session
    startContinuousMassageListening();

    // Await the start dialogue to finish before starting progress tracking
    await updateProgressWithDialogue(0, startDialogue);

    // Start progress tracking
    this.progressInterval = setInterval(() => {
        this.checkProgress();
    }, 1000);
}
```

**Expected:** `startContinuousMassageListening()` called immediately when massage starts.

### 3. Voice Input Handler (Line 1193-1253)
**File:** `static/app.js`

```javascript
browserRecognition.onresult = (event) => {
    // ... process results ...

    // 🎤 If in auto-listening mode, process immediately
    if (isAutoListening && currentMassageSession) {
        const latestResult = event.results[event.results.length - 1];
        const transcript = latestResult[0].transcript.trim();
        const confidence = latestResult[0].confidence;

        // Show what we're hearing in real-time
        const listeningHint = document.getElementById('listeningHint');
        if (listeningHint && transcript) {
            listeningHint.textContent = `聽到: ${transcript}`;
        }

        // Process if final OR high confidence interim result
        if (latestResult.isFinal) {
            console.log(`🎤 Final result (confidence: ${confidence.toFixed(2)}): "${transcript}"`);
            currentMassageSession.processVoiceResponse(transcript);
        } else if (confidence > 0.7 && transcript.length >= 2) {
            const quickCommands = ['停', '停止', '暫停', '繼續', ...];
            if (quickCommands.some(cmd => transcript.includes(cmd))) {
                console.log(`⚡ Quick command detected: "${transcript}"`);
                currentMassageSession.processVoiceResponse(transcript);
            }
        }
    }
}
```

**Expected:** During massage, should log interim and final results.
**Check:** Look for `🎤 Final result` or `⚡ Quick command detected` in console.

### 4. Command Processing (Line 1674-1682)
**File:** `static/app.js`

```javascript
async processVoiceResponse(transcript) {
    console.log('🎤 Received voice response during massage:', transcript);
    this.userResponses.push(transcript);

    // Process the response
    await handleMidSessionResponse(transcript);

    console.log('✅ Massage response processed.');
}
```

**Expected:** Should see `🎤 Received voice response during massage:` log.

### 5. Mid-Session Response Handler (Line 1971-2030)
**File:** `static/app.js`

```javascript
async function handleMidSessionResponse(userInput) {
    const input = userInput.toLowerCase();

    // Show command recognition feedback
    showCommandRecognized(input);

    // ⏸️ Pause command (check FIRST - more specific)
    if (input.includes('暫停') || input.includes('停一停') || input.includes('休息')) {
        playCommandBeep('pause');
        if(currentMassageSession && !currentMassageSession.isPaused) {
            await currentMassageSession.pause();
        }
    }
    // 🔴 Emergency/Stop commands
    else if (input.includes('停止') || input.includes('唔要') || input.includes('緊急停止')) {
        playCommandBeep('stop');
        if(currentMassageSession) {
            currentMassageSession.emergencyStop();
        }
    }
    // ... more commands ...
}
```

**Expected:** Should match commands and execute actions.

---

## Debugging Steps for Tomorrow

### Step 1: Check If Continuous Listening Starts

**When massage starts, check console for:**
```
✅ Expected to see:
🎯 Massage session started - Continuous listening enabled.
🎤 Starting continuous listening for massage session...
🛑 Wake word listening stopped.
✅ Continuous listening started - ready for quick commands

❌ If NOT seeing these logs:
→ startContinuousMassageListening() is not being called
→ Check massage start() function execution
```

**Add debug log:**
```javascript
// In massage start() function, add:
console.log('🔍 DEBUG: About to start continuous listening');
console.log('🔍 DEBUG: isAutoListening =', isAutoListening);
console.log('🔍 DEBUG: isMassageSessionActive =', isMassageSessionActive);
startContinuousMassageListening();
console.log('🔍 DEBUG: After startContinuousMassageListening call');
```

### Step 2: Check If Recognition Is Actually Running

**During massage, try speaking and check console for:**
```
✅ Should see:
🔍 Low confidence interim: "..." (confidence: 0.XX)
🔍 Interim transcript (not a quick command): "..."
🎤 Final result (confidence: 0.XX): "..."

❌ If seeing NOTHING:
→ browserRecognition is not receiving input
→ Microphone might be blocked
→ Recognition might have stopped
```

**Add debug log in onresult:**
```javascript
browserRecognition.onresult = (event) => {
    console.log('🔍 DEBUG: onresult fired');
    console.log('🔍 DEBUG: isAutoListening =', isAutoListening);
    console.log('🔍 DEBUG: isMassageSessionActive =', isMassageSessionActive);
    console.log('🔍 DEBUG: currentMassageSession =', currentMassageSession);

    // ... rest of code ...
}
```

### Step 3: Check Recognition State

**Add periodic state checker:**
```javascript
// Add this temporarily during massage
setInterval(() => {
    if (isMassageSessionActive) {
        console.log('🔍 STATE CHECK:');
        console.log('  - isAutoListening:', isAutoListening);
        console.log('  - isMassageSessionActive:', isMassageSessionActive);
        console.log('  - browserRecognition exists:', !!browserRecognition);
        console.log('  - currentMassageSession exists:', !!currentMassageSession);
    }
}, 5000); // Every 5 seconds
```

### Step 4: Check Microphone Permissions

**In browser console, run:**
```javascript
navigator.mediaDevices.getUserMedia({ audio: true })
    .then(stream => {
        console.log('✅ Microphone permission granted');
        console.log('Stream active:', stream.active);
        stream.getTracks().forEach(track => {
            console.log('Track:', track.label, 'enabled:', track.enabled);
        });
    })
    .catch(err => {
        console.error('❌ Microphone permission denied:', err);
    });
```

### Step 5: Check Browser Recognition Configuration

**Add this debug log when initializing:**
```javascript
function initBrowserSpeechRecognition() {
    // ... existing code ...

    browserRecognition = new SpeechRecognition();
    browserRecognition.continuous = true;
    browserRecognition.interimResults = true;
    browserRecognition.lang = 'yue-Hant-HK';

    console.log('🔍 Recognition Config:');
    console.log('  - continuous:', browserRecognition.continuous);
    console.log('  - interimResults:', browserRecognition.interimResults);
    console.log('  - lang:', browserRecognition.lang);

    // ... rest of code ...
}
```

---

## Possible Root Causes

### Theory 1: Recognition Stopped but Flag Still True ⚠️

**Hypothesis:** `isAutoListening = true` but `browserRecognition` actually stopped.

**Check:**
- Console shows `✅ Continuous listening started` but no `onresult` events
- `isAutoListening` is `true` but recognition is not firing

**Possible Causes:**
- Browser silently stopped recognition (tab inactive?)
- Recognition crashed without triggering `onerror` or `onend`
- Recognition object became invalid

**Solution:**
- Add heartbeat check: Periodically restart recognition if no events received
- Add recognition.start() retry mechanism

### Theory 2: TTS Pauses Listening and Never Resumes ⚠️

**Hypothesis:** When TTS plays during massage start, listening pauses but fails to resume.

**Check:**
- Console shows `🎤 Pausing continuous listening for TTS`
- But never shows `🎤 Resuming continuous listening after TTS`

**Possible Causes:**
- TTS audio.onended never fires
- Recovery logic has a bug
- `wasListening` flag incorrect

**Solution:**
- Ensure TTS onended always fires
- Add timeout: If TTS takes >15s, force resume listening

### Theory 3: Multiple Recognition Instances Conflict ⚠️

**Hypothesis:** Both wake word and continuous listening trying to run simultaneously.

**Check:**
- Console shows both wake word and continuous listening logs during massage
- "Already started" errors appearing

**Possible Causes:**
- Wake word detector not properly stopped
- Multiple `browserRecognition.start()` calls
- Race condition between stop and start

**Solution:**
- Ensure wake word fully stops before continuous listening starts
- Add mutex/lock to prevent simultaneous starts

### Theory 4: `isMassageSessionActive` Set Incorrectly ⚠️

**Hypothesis:** Flag not set properly, so `onresult` handler skips processing.

**Check:**
```javascript
if (isAutoListening && currentMassageSession) {
    // This block never executes
}
```

**Possible Causes:**
- `isMassageSessionActive` is `false` during massage
- `currentMassageSession` is `null` during massage
- `isAutoListening` is `false` during massage

**Solution:**
- Add debug logs to check all three flags
- Ensure flags set in correct order

### Theory 5: Browser Stops Recognition When Tab Inactive ⚠️

**Hypothesis:** Browser policy stops recognition when tab loses focus.

**Check:**
- Works when tab is active/focused
- Stops working when tab loses focus or minimized

**Possible Causes:**
- Chrome/Edge policy: Pause speech recognition on inactive tabs
- Operating system audio policy

**Solution:**
- Test with tab actively focused
- Keep browser window in foreground
- Check browser console for policy warnings

---

## Diagnostic Console Commands

**Run these in browser console (F12) during massage:**

### Check Recognition State
```javascript
console.log('isAutoListening:', isAutoListening);
console.log('isMassageSessionActive:', isMassageSessionActive);
console.log('currentMassageSession:', currentMassageSession);
console.log('browserRecognition:', browserRecognition);
console.log('wakeWordDetector.isListening:', wakeWordDetector?.isListening);
```

### Manually Trigger Voice Input
```javascript
// Simulate voice input
if (currentMassageSession) {
    currentMassageSession.processVoiceResponse('暫停');
}
```

### Check Microphone
```javascript
navigator.mediaDevices.enumerateDevices()
    .then(devices => {
        devices.filter(d => d.kind === 'audioinput').forEach(d => {
            console.log('Microphone:', d.label, d.deviceId);
        });
    });
```

### Force Restart Listening
```javascript
if (isMassageSessionActive) {
    console.log('Forcing restart...');
    isAutoListening = false;
    startContinuousMassageListening();
}
```

---

## Critical Variables to Monitor

### Global Flags
```javascript
isAutoListening          // Should be TRUE during massage
isMassageSessionActive   // Should be TRUE during massage
currentMassageSession    // Should be non-null during massage
browserRecognition       // Should exist
```

### Recognition State
```javascript
browserRecognition.continuous     // Should be true
browserRecognition.interimResults // Should be true
browserRecognition.lang           // Should be 'yue-Hant-HK'
```

### Wake Word State
```javascript
wakeWordDetector.isListening  // Should be FALSE during massage
```

---

## Quick Tests

### Test A: Manual Voice Processing
```javascript
// During massage, in console:
currentMassageSession.processVoiceResponse('暫停');
// Expected: Massage should pause
// This tests if command processing works (bypassing voice recognition)
```

### Test B: Check Recognition Events
```javascript
// Before massage starts:
browserRecognition.onresult = (event) => {
    console.log('🔥 RESULT EVENT FIRED!', event);
};

browserRecognition.onerror = (event) => {
    console.log('🔥 ERROR EVENT FIRED!', event.error);
};

browserRecognition.onend = (event) => {
    console.log('🔥 END EVENT FIRED!');
};
```

### Test C: Force Start Recognition
```javascript
// During massage, if recognition seems dead:
try {
    browserRecognition.start();
    console.log('✅ Started successfully');
} catch(e) {
    console.error('❌ Failed to start:', e.message);
}
```

---

## Expected Console Log Flow

### Normal Successful Flow
```
1. User starts massage
🎯 Massage session started - Continuous listening enabled.
🎤 Starting continuous listening for massage session...
🛑 Wake word listening stopped.
✅ Continuous listening started - ready for quick commands

2. User says "太大力"
🔍 Low confidence interim: "太" (confidence: 0.01)
🔍 Low confidence interim: "太大" (confidence: 0.05)
⚡ Quick command detected (confidence: 0.75): "太大力"
🎤 Received voice response during massage: 太大力
🎤 Massage session: Using server TTS
🎤 Pausing continuous listening for TTS.

3. TTS plays
🎤 Server TTS: voice="zh-HK-HiuGaaiNeural", text="收到，我會小心啲。..."

4. TTS ends
🎤 Resuming continuous listening after TTS.
✅ Continuous listening started - ready for quick commands

5. User says "暫停"
🔍 Low confidence interim: "暫" (confidence: 0.02)
🔍 Low confidence interim: "暫停" (confidence: 0.80)
⚡ Quick command detected (confidence: 0.80): "暫停"
🎤 Received voice response during massage: 暫停
[Massage pauses]
```

---

## Next Actions Tomorrow

### Priority 1: Add Debug Logging ⭐⭐⭐
1. Add state check logs in massage start()
2. Add onresult entry log
3. Add 5-second state checker during massage
4. Test and watch console

### Priority 2: Test Recognition State ⭐⭐
1. Check if `onresult` fires at all during massage
2. Test microphone permissions
3. Try manual voice processing to isolate issue

### Priority 3: Check TTS Recovery ⭐
1. Verify TTS onended fires correctly
2. Check if listening resumes after TTS
3. Add timeout fallback if TTS hangs

### Priority 4: Test Browser Tab Focus ⭐
1. Keep browser tab focused during massage
2. Check if issue is browser policy related

---

## Files Reference

### Main File
- `static/app.js` - All voice recognition logic

### Documentation Files Created Today
1. `CONTINUOUS_LISTENING_SOLUTION.md` - Architecture design
2. `CONTINUOUS_LISTENING_IMPLEMENTATION_SUMMARY.md` - Implementation details
3. `SELF_LISTENING_BUG_FIX_COMPLETE.md` - Self-listening fix
4. `CONSOLE_ERROR_FIXES.md` - Console error handling
5. `VOICE_RECOGNITION_SENSITIVITY_FIX.md` - Sensitivity improvements
6. `CONTINUOUS_LISTENING_RECOVERY_FIX.md` - Error recovery
7. `VOICE_RECOGNITION_STATUS_AND_DEBUG_GUIDE.md` - This file

### Key Configuration
- Language: `yue-Hant-HK` (Cantonese)
- Confidence threshold: 70% (0.7)
- Continuous mode: Enabled
- Interim results: Enabled

---

## Summary

**Current Status:** Voice recognition NOT working during massage, but works before/after.

**Most Likely Cause:** One of these:
1. Recognition actually stopped but flags say it's running
2. TTS pause/resume cycle broken
3. Browser tab focus issue
4. Flag mismatch (isAutoListening vs actual state)

**Next Step:** Add comprehensive debug logging to identify which component is failing.

**Target:** Voice recognition should work continuously throughout entire massage session with no interruptions.

---

**Good luck tomorrow! Start with Priority 1 debug logging to identify the exact failure point.** 🔍
