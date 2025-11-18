# Self-Listening Bug Fix

## Problem

The wake word detector is picking up the chatbot's own TTS audio output and treating it as user speech:

```
Console Output:
🎤 Wake word listening: "而家開始幫你按摩天堂力度係骰盅"

TTS Output:
"好喇，而家開始幫您按摩肩膀，力度係適中，請放鬆身體。"
```

**The system is listening to itself!** This causes:
1. False wake word detections
2. Unintended command triggers
3. Confusion in speech recognition logs
4. Potential infinite loops

## Root Cause

The wake word detector continues running while TTS is playing, picking up audio from the speakers and treating it as microphone input.

## Solution

### 1. Stop ALL Speech Recognition During TTS

When TTS starts playing:
- ✅ Stop continuous listening (already implemented)
- ✅ Stop wake word detector (NEW - need to implement)
- ✅ Mute/pause all microphone input

When TTS finishes:
- ✅ Resume continuous listening if massage active (already implemented)
- ✅ Resume wake word detector if massage NOT active (NEW - need to implement)

### 2. Implementation Plan

#### A. Modify `playCantoneseTTS()` function

**Before TTS plays:**
```javascript
// Stop wake word detector to prevent hearing own voice
if (wakeWordDetector && wakeWordDetector.isListening) {
    wakeWordDetector.stop();
    console.log('🎤 Wake word detector paused for TTS');
}
```

**After TTS finishes:**
```javascript
// Resume wake word detector ONLY if massage is NOT active
if (!isMassageSessionActive && wakeWordDetector && !wakeWordDetector.isListening) {
    wakeWordDetector.start();
    console.log('🎤 Wake word detector resumed after TTS');
}
```

#### B. State Management Logic

```
TTS Starts:
├─ If massage active:
│  ├─ Pause continuous listening ✅ (already done)
│  └─ Wake word already stopped ✅ (stopped at massage start)
│
└─ If massage NOT active:
   ├─ Stop wake word detector ⚠️ (NEW)
   └─ Prevent self-listening

TTS Ends:
├─ If massage active:
│  ├─ Resume continuous listening ✅ (already done)
│  └─ Keep wake word stopped ✅
│
└─ If massage NOT active:
   └─ Resume wake word detector ⚠️ (NEW)
```

### 3. Edge Cases to Handle

1. **TTS interrupted by new TTS** - Ensure wake word state is preserved
2. **TTS error/timeout** - Still resume wake word detector
3. **Massage ends while TTS playing** - Handle state transition correctly
4. **Browser tab inactive** - May pause recognition automatically

## Expected Behavior After Fix

### During Massage
```
Massage Active:
├─ Wake word detector: STOPPED ✅
├─ Continuous listening: ACTIVE ✅
│
TTS Plays:
├─ Wake word detector: STOPPED ✅ (already stopped)
├─ Continuous listening: PAUSED ✅
│
TTS Ends:
├─ Wake word detector: STOPPED ✅ (stays stopped)
└─ Continuous listening: RESUMED ✅
```

### Outside Massage
```
Normal Mode:
├─ Wake word detector: ACTIVE ✅
├─ Continuous listening: STOPPED ✅
│
TTS Plays (e.g., answering a question):
├─ Wake word detector: STOPPED ⚠️ (NEW - prevent self-listen)
├─ Continuous listening: STOPPED ✅ (already stopped)
│
TTS Ends:
├─ Wake word detector: RESUMED ⚠️ (NEW)
└─ Continuous listening: STOPPED ✅ (stays stopped)
```

## Code Changes Required

### File: `static/app.js`

#### 1. Add wake word pause/resume to `playCantoneseTTS()`
- Before TTS: Stop wake word detector
- After TTS: Resume wake word detector (only if massage not active)

#### 2. Track wake word state
- Add flag to remember if wake word was active before TTS
- Restore state after TTS completes

## Testing Plan

### Test 1: Normal Q&A (No Massage)
```
User: "小狐狸"
[Wake word detected]
User: "今日天氣點樣？"
[Wake word stops before TTS]
TTS: "今日天氣晴朗..."
[Wake word resumes after TTS]
Console: NO "Wake word listening: 今日天氣..." ✅
```

### Test 2: During Massage
```
Massage starts
[Wake word stopped, continuous listening active]
User: "太大力"
[Recognized immediately]
TTS: "收到，我會輕柔啲。"
[Both wake word and continuous listening stopped during TTS]
Console: NO "Wake word listening: 收到..." ✅
[After TTS: continuous listening resumes, wake word stays stopped]
```

### Test 3: Emergency Stop
```
Massage running
User: "停止"
[Emergency stop]
TTS: "緊急停止！按摩已經立即中止。"
[Wake word stopped during TTS]
[After TTS: wake word resumes]
Console: NO "Wake word listening: 緊急停止..." ✅
```

## Success Criteria

1. ✅ Console NEVER shows wake word listening to TTS output
2. ✅ No false wake word activations during TTS
3. ✅ Wake word resumes correctly after TTS (when appropriate)
4. ✅ Continuous listening resumes correctly during massage
5. ✅ Clean state transitions with no audio feedback loops
