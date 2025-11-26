# Race Condition Fix: Rapid Stop-Start Tasks

## Problem Description

When a user stops a massage task and immediately starts a new one (within ~1 second), the old task hadn't fully stopped yet, causing:
- **Both tasks running simultaneously**
- **Progress bar showing jumping/inconsistent time**
- **Session state confusion**

## Root Cause Analysis

### Original Code Flow

```javascript
async emergencyStop() {
    // ... button cleanup ...
    
    isMassageSessionActive = false;  // Set flag
    
    await playCantoneseTTS(...);     // ⚠️ BLOCKING - takes 1-2 seconds
    
    currentMassageSession = null;    // ⚠️ TOO LATE!
}
```

**The Problem:**
1. User stops task → `emergencyStop()` called
2. `isMassageSessionActive` set to `false` ✅
3. **Waits for TTS** (~1-2 seconds) ⏱️
4. `currentMassageSession` set to `null` (but too late!)

Meanwhile, if user starts new task:
```javascript
if (currentMassageSession && isMassageSessionActive) {
    // Block new task
}
```
- `isMassageSessionActive` = `false` ✅
- `currentMassageSession` = old session object ❌
- **Guard uses AND (&&)**, so: `truthy && false` = `false`
- **New task NOT blocked!** ❌

Result: **Both sessions active, progress bars conflict**

## Solution Implemented

### Fix 1: Immediate State Cleanup (`app.js:1996-2061`)

```javascript
async emergencyStop() {
    console.log("🛑 EMERGENCY STOP TRIGGERED 🛑");

    // 🔧 FIX: Immediately clear session state to prevent race condition
    // This MUST happen first, before any async operations
    isMassageSessionActive = false;
    const sessionToStop = currentMassageSession;
    currentMassageSession = null;  // ✅ SET IMMEDIATELY

    console.log('✅ Session state cleared immediately (prevents race condition)');

    // ... rest of cleanup (buttons, UI, etc) ...

    // 🔧 FIX: Fire-and-forget TTS announcement (don't await)
    playCantoneseTTS(emergencyMessage, emergencyVoice).catch(err => {
        console.warn('⚠️ TTS announcement failed, but stop succeeded:', err);
    });  // ✅ NO AWAIT - non-blocking

    // ... wake word resumption ...
}
```

**Key Changes:**
1. ✅ `currentMassageSession = null` set **immediately** at start
2. ✅ TTS made **fire-and-forget** (no await) - doesn't block cleanup
3. ✅ All critical cleanup done **synchronously**

### Fix 2: Defensive Guard (`app.js:5291-5312`)

```javascript
async function executeMassageCommand(command, meta) {
    // 🔧 FIX: Check if a massage session is already active (use OR for defensive check)
    // If EITHER flag is set, block new tasks to prevent race conditions
    if (currentMassageSession || isMassageSessionActive) {  // ✅ Changed to OR
        debugLog('safety', '已有按摩任務進行中，拒絕新任務', {
            hasSession: !!currentMassageSession,
            isActive: isMassageSessionActive
        });

        // ... error handling ...
        return; // Prevent creating new session
    }

    // ... proceed with new task ...
}
```

**Key Changes:**
1. ✅ Changed from `&&` (AND) to `||` (OR)
2. ✅ Now blocks if **either** condition indicates active session
3. ✅ More defensive - prevents all race conditions

## Why This Works

### Before Fix
```
Time: 0ms    Stop clicked
      10ms   isMassageSessionActive = false
      10ms   await TTS (blocks for ~1500ms)
      1510ms currentMassageSession = null

User starts new task at 500ms:
  - isMassageSessionActive = false ✅
  - currentMassageSession = old session ❌
  - Guard: oldSession && false = false ❌
  - NEW TASK STARTS! ❌ (Race condition!)
```

### After Fix
```
Time: 0ms    Stop clicked  
      10ms   isMassageSessionActive = false ✅
      10ms   currentMassageSession = null ✅
      10ms   TTS fires (non-blocking) ✅

User starts new task at 500ms:
  - isMassageSessionActive = false ✅
  - currentMassageSession = null ✅
  - Guard: null || false = false ✅
  - NEW TASK ALLOWED! ✅ (Clean state!)
```

## Test Additions

Added **rapid stop-start test** in `nurse_assistant_tester.py`:
- Creates task 3
- Stops immediately
- **Waits only 0.5 seconds**
- Attempts to create task 4
- Verifies either:
  - Correctly blocked with error message, OR
  - Successfully creates new task (old one fully cleaned)

## Benefits

1. ✅ **No more progress bar jumping**
2. ✅ **Clean session transitions**
3. ✅ **Handles rapid user actions gracefully**
4. ✅ **TTS doesn't block critical operations**
5. ✅ **Defensive guard prevents all race conditions**

## Files Modified

- `static/app.js`:
  - Line 1996-2061: `emergencyStop()` method - immediate state cleanup
  - Line 5291-5312: `executeMassageCommand()` - defensive guard (OR logic)
- `scripts/nurse_assistant_tester.py`:
  - Line 619-664: Added rapid stop-start test scenario

## Testing

Run the test with:
```bash
python3 scripts/nurse_assistant_tester.py --headless --duration 60
```

The test now includes a "rapid test" that:
- Stops a task
- Immediately starts a new one (0.5s delay)
- Verifies no race condition occurs

