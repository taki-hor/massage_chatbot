# Continuous Listening During Massage - Complete Solution

## Problem Statement

Currently, the chatbot requires wake word activation even during massage sessions when user feedback is expected. This creates a poor user experience:

- User feels discomfort: "太大力！" (too hard) - **NOT HEARD** ❌
- User has to say: "小狐狸" (wake word) first - **Extra step** 😤
- Then say: "太大力" - **Finally heard** ✅

This is unacceptable during massage when immediate feedback is critical for safety and comfort.

## Expected Behavior

### During Massage Session
- ✅ **Always listening** - No wake word required
- ✅ **Immediate response** - User says "太大力" → System responds instantly
- ✅ **Continuous feedback loop** - After TTS response, resume listening automatically
- ✅ **Safety commands priority** - "停止", "暫停" should work instantly

### Outside Massage Session
- ✅ **Wake word required** - Normal behavior to prevent false activations
- ✅ **Manual recording** - Hold to talk button works as usual

## Solution Architecture

### 1. Listening States

```
┌─────────────────────────────────────────────────────────┐
│                    LISTENING STATES                      │
└─────────────────────────────────────────────────────────┘

State 1: IDLE (No Massage)
├─ Wake Word Detector: ACTIVE ✅
├─ Continuous Listening: DISABLED ❌
└─ User must say wake word to activate

State 2: MASSAGE ACTIVE (Session Running)
├─ Wake Word Detector: DISABLED ❌
├─ Continuous Listening: ACTIVE ✅
├─ Auto-pause during TTS
└─ Auto-resume after TTS

State 3: MASSAGE PAUSED
├─ Wake Word Detector: DISABLED ❌
├─ Continuous Listening: DISABLED ❌
└─ Only resume/stop commands via buttons
```

### 2. Listening Lifecycle During Massage

```
Massage Start
    ↓
Stop Wake Word Detection
    ↓
Start Continuous Listening
    ↓
┌─────────────────────────────┐
│  CONTINUOUS LISTENING LOOP   │
│                              │
│  Listen for user input       │
│      ↓                       │
│  User speaks → Recognized    │
│      ↓                       │
│  Pause listening for TTS     │
│      ↓                       │
│  Play TTS response           │
│      ↓                       │
│  Auto-resume listening ✅    │
│      ↓                       │
│  (Loop continues...)         │
└─────────────────────────────┘
    ↓
Massage Ends/Stops
    ↓
Stop Continuous Listening
    ↓
Resume Wake Word Detection
```

### 3. Key Implementation Points

#### A. Massage Session Start
```javascript
async start() {
    // 1. Set session active flag
    isMassageSessionActive = true;

    // 2. Stop wake word detection (no longer needed)
    wakeWordDetector.stop();

    // 3. Start continuous listening immediately
    startContinuousMassageListening();

    // 4. Speak start message
    await speakNurseResponse(startDialogue);

    // 5. Listening auto-resumes after TTS (handled by TTS end event)
}
```

#### B. TTS Playback Handling
```javascript
async function playCantoneseTTS(text, customVoice = null) {
    // 1. Pause listening while speaking
    if (isAutoListening) {
        isAutoListening = false;
        browserRecognition.stop();
    }

    // 2. Play TTS
    await audio.play();

    // 3. On audio end, auto-resume listening if massage active
    audio.addEventListener('ended', () => {
        if (isMassageSessionActive && !currentMassageSession.isPaused) {
            // Auto-resume listening ✅
            isAutoListening = true;
            browserRecognition.start();
        }
    });
}
```

#### C. Massage Session End/Stop
```javascript
async stop() {
    // 1. Stop continuous listening
    stopContinuousMassageListening();

    // 2. Set session inactive
    isMassageSessionActive = false;

    // 3. Resume wake word detection for normal mode
    wakeWordDetector.start();
}
```

#### D. Pause Handling
```javascript
async pause() {
    this.isPaused = true;

    // Stop listening during pause
    stopContinuousMassageListening();

    // Speak pause message
    await speakNurseResponse('按摩已經暫停...');

    // Do NOT resume listening (paused state)
}

async resume() {
    this.isPaused = false;

    // Speak resume message
    await speakNurseResponse('好，而家繼續按摩。');

    // Listening auto-resumes after TTS (handled by TTS end event)
}
```

## Implementation Checklist

### Phase 1: Core Listening Management
- [ ] Ensure `startContinuousMassageListening()` is called on massage start
- [ ] Ensure wake word detector stops when massage starts
- [ ] Ensure continuous listening stops when massage ends
- [ ] Ensure wake word detector resumes when massage ends

### Phase 2: TTS Integration
- [ ] TTS automatically pauses listening before speaking
- [ ] TTS automatically resumes listening after speaking (if massage active & not paused)
- [ ] Handle TTS errors gracefully (still resume listening)

### Phase 3: Pause/Resume
- [ ] Pause stops continuous listening
- [ ] Resume re-enables continuous listening via TTS end event
- [ ] Emergency stop properly cleans up listening state

### Phase 4: Safety & Edge Cases
- [ ] Multiple TTS requests don't break listening state
- [ ] Session cleanup on page unload
- [ ] Handle browser tab inactive/active transitions
- [ ] Microphone permission errors handled gracefully

## Testing Scenarios

### Scenario 1: Basic Massage Flow
1. Start massage → **Listening active** ✅
2. Say "太大力" → **Recognized immediately** ✅
3. TTS responds → **Listening pauses** ✅
4. TTS ends → **Listening resumes** ✅
5. Say "唔夠力" → **Recognized immediately** ✅

### Scenario 2: Pause & Resume
1. Massage running → **Listening active** ✅
2. Say "暫停" → **Pauses massage** ✅
3. Listening stops (paused state) ✅
4. Say "繼續" → **Resumes massage** ✅
5. Listening resumes after resume TTS ✅

### Scenario 3: Emergency Stop
1. Massage running → **Listening active** ✅
2. Say "停止" → **Emergency stop** 🛑
3. Listening stops ✅
4. Wake word detector resumes ✅

### Scenario 4: No Wake Word Needed During Massage
1. Massage running → **Listening active** ✅
2. User says directly: "大力啲" (no wake word) ✅
3. System recognizes and adjusts ✅
4. TTS responds ✅
5. Listening auto-resumes ✅

## Expected User Experience

### Before (Current - Bad UX) ❌
```
User: [Massage running, feels too hard]
User: "太大力！"
System: [No response - wake word not detected]
User: "小狐狸！太大力！"
System: [Recognizes] "收到，我會輕柔啲。"
```

### After (Fixed - Good UX) ✅
```
User: [Massage running, feels too hard]
User: "太大力！"
System: [Immediately recognizes] "收到，我會輕柔啲。"
[Adjusts intensity automatically]
[Continues listening for next feedback]
```

## Code Changes Required

### Files to Modify
1. `static/app.js`
   - `InteractiveMassageSession.start()` - Ensure wake word stops, continuous listening starts
   - `InteractiveMassageSession.stop()` - Ensure wake word resumes
   - `InteractiveMassageSession.pause()` - Ensure listening stops
   - `InteractiveMassageSession.resume()` - Ensure listening resumes via TTS
   - `playCantoneseTTS()` - Already has auto-resume logic, verify it works
   - `startContinuousMassageListening()` - Verify implementation
   - `stopContinuousMassageListening()` - Verify cleanup

### Key Variables
- `isMassageSessionActive` - Controls whether massage is running
- `isAutoListening` - Controls whether continuous listening is active
- `currentMassageSession.isPaused` - Controls pause state

## Success Metrics

1. ✅ No wake word needed during massage session
2. ✅ Immediate feedback recognition (<500ms)
3. ✅ Automatic listening resume after TTS
4. ✅ Clean state transitions (start/pause/resume/stop)
5. ✅ No false activations when massage not running
6. ✅ User satisfaction with seamless voice interaction

## Rollback Plan

If issues occur:
1. Keep wake word detection active even during massage
2. Add visual indicator showing "Listening..." state
3. Provide manual "Push to Talk" button as fallback
