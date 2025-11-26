# TTS Service Issue - Microsoft Edge TTS Blocked (403 Forbidden)

## Problem Summary

**The TTS is not working because Microsoft is blocking the Edge TTS service with a 403 Forbidden error.**

This is **NOT a code problem** - it's a Microsoft service restriction that affects the entire `edge-tts` library.

---

## Evidence

### Test Results

All TTS voices fail with the same error:

```bash
$ python3 test_edge_tts.py

Testing: en-US-AriaNeural | Text: Hello
  ❌ Error: WSServerHandshakeError: 403, message='Invalid response status'

Testing: zh-CN-XiaoxiaoNeural | Text: 你好
  ❌ Error: WSServerHandshakeError: 403, message='Invalid response status'

Testing: zh-HK-HiuGaaiNeural | Text: 您好
  ❌ Error: WSServerHandshakeError: 403, message='Invalid response status'
```

### Root Cause

Microsoft's Edge TTS WebSocket endpoint is returning **403 Forbidden**:

```
wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1
?TrustedClientToken=6A5AA1D4EAFF4E9FB37E23D68491D6F4
```

The `TrustedClientToken` is being rejected by Microsoft's servers.

---

## Why This Happens

1. **Microsoft Token Changes**: Microsoft periodically changes/blocks the tokens used by edge-tts
2. **Service Restrictions**: Microsoft may be restricting API access to prevent abuse
3. **Regional Blocking**: Some regions may be blocked from using the service
4. **Rate Limiting**: Excessive requests may trigger blocks

---

## Client Fallback Behavior (Working as Designed)

When server TTS fails, the client **correctly falls back to browser TTS**:

```
❌ 粵語TTS錯誤: Error: Empty audio response from server
⚠️ TTS error - falling back to browser TTS
🎤 Browser TTS: Using Microsoft Danny - Chinese (Traditional, Hong Kong S.A.R.)
```

**This is why you heard a man's voice (Danny) instead of HiuGaai:**
- Server TTS failed due to Microsoft blocking
- Client used browser's built-in TTS as fallback
- Browser TTS selected "Danny" (male voice) instead of HiuGaai (female)

---

## Current Status

### What's Working ✅
- ✅ Code is correct (all validations in place)
- ✅ Network connectivity is fine (ping works, HTTPS connection works)
- ✅ Fallback to browser TTS works correctly
- ✅ Client properly handles empty audio responses

### What's NOT Working ❌
- ❌ Microsoft Edge TTS service returns 403 Forbidden
- ❌ Cannot use HiuGaai server TTS voice
- ❌ Fallback uses male voice (Danny) instead of female voice

---

## Temporary Workarounds

### Option 1: Use Browser TTS Only (Current State)
**Pros:**
- Works immediately
- No server dependency

**Cons:**
- Uses male voice (Danny) instead of HiuGaai
- Less control over voice quality

**How to accept this:**
- Just continue using the app
- Voice will be Danny (male) instead of HiuGaai (female)
- All functionality still works

---

### Option 2: Wait for edge-tts Library Update

The edge-tts library maintainers usually update the token when Microsoft blocks it.

**How to check for updates:**
```bash
pip3 install --upgrade edge-tts
python3 test_edge_tts.py  # Test if working again
```

**Then restart server:**
```bash
python3 server_qwen.py
```

---

### Option 3: Use Alternative TTS Service

Replace Edge TTS with another service:

**Alternatives:**
1. **Google Cloud Text-to-Speech** - Requires API key, costs money
2. **Azure Cognitive Services** - Microsoft's official API, requires subscription
3. **ElevenLabs** - Good quality, requires API key
4. **Coqui TTS** - Open-source, self-hosted
5. **pyttsx3** - Offline TTS, lower quality

**Implementation Required:**
- Modify `server_qwen.py` to use different TTS library
- Update client if needed
- Configure API keys/credentials

---

## Long-Term Solutions

### Solution 1: Monitor edge-tts GitHub

Check for updates: https://github.com/rany2/edge-tts

When maintainers update the token, run:
```bash
pip3 install --upgrade edge-tts
# Restart server
```

---

### Solution 2: Implement Multi-Provider TTS

Add support for multiple TTS providers with automatic fallback:

```python
# Pseudocode
async def synthesize_tts(text, voice):
    providers = [
        EdgeTTS(),
        GoogleTTS(),
        AzureTTS(),
        LocalTTS()
    ]

    for provider in providers:
        try:
            return await provider.synthesize(text, voice)
        except Exception:
            continue  # Try next provider

    raise Exception("All TTS providers failed")
```

**Benefits:**
- Resilient to single provider failures
- Always have working TTS
- Can switch providers based on quality/cost

---

### Solution 3: Cache More Aggressively

Pre-generate and cache all common TTS phrases:

```python
# Common phrases to cache
CACHE_PHRASES = [
    "您好！需要咩護理服務嗎？",
    "按摩已經暫停，您可以休息一下。",
    "緊急停止！按摩已經立即中止。",
    "收到，我會小心啲。",
    "好，而家繼續按摩。",
    # ... all massage-related phrases
]

# Pre-generate when Edge TTS is working
for phrase in CACHE_PHRASES:
    audio = await edge_tts_synthesize(phrase)
    save_to_permanent_cache(phrase, audio)
```

**Benefits:**
- Works even when Edge TTS is down
- Instant playback (no synthesis delay)
- Predictable performance

---

## Immediate Action Items

### For You (User):

**Option A: Accept Browser TTS (Easiest)**
1. Continue using the app
2. Accept male voice (Danny) instead of female (HiuGaai)
3. Wait for edge-tts library update

**Option B: Check for Updates Daily**
1. Run: `pip3 install --upgrade edge-tts`
2. Test: `python3 test_edge_tts.py`
3. If working, restart server: `python3 server_qwen.py`

**Option C: Switch to Alternative TTS**
1. Choose alternative service (Google/Azure/etc)
2. Get API credentials
3. I can help implement the integration

---

## Testing Commands

### Test if Edge TTS is working:
```bash
python3 test_edge_tts.py
```

### Expected output when working:
```
Testing: en-US-AriaNeural | Text: Hello
  ✅ Success! Chunks: 5, Size: 15234 bytes
```

### Expected output when broken (current state):
```
Testing: en-US-AriaNeural | Text: Hello
  ❌ Error: WSServerHandshakeError: 403, message='Invalid response status'
```

---

## Summary

| Issue | Status | Solution |
|-------|--------|----------|
| Empty TTS audio | ❌ Microsoft blocking Edge TTS | Wait for library update OR use alternative |
| Male voice (Danny) instead of HiuGaai | ⚠️ Fallback working correctly | Accept OR fix Edge TTS OR use alternative |
| Code problems | ✅ None - code is correct | No action needed |
| Network problems | ✅ None - connectivity fine | No action needed |
| Browser TTS fallback | ✅ Working correctly | No action needed |

---

## Recommendation

**Short-term (Today):**
- Accept browser TTS (male voice)
- App still fully functional
- Wait for edge-tts update

**Medium-term (This Week):**
- Check for edge-tts updates daily
- Test with `python3 test_edge_tts.py`
- Restart server when fixed

**Long-term (Future):**
- Implement multi-provider TTS for reliability
- Pre-cache common phrases
- Consider paid TTS service for guaranteed uptime

---

## Files for Reference

- `test_edge_tts.py` - Test script to check if Edge TTS is working
- `server_qwen.py` - Server code (correct, no issues)
- `static/app.js` - Client code with fallback (working correctly)
- `EMPTY_TTS_AUDIO_FIX.md` - Server-side validation fixes (implemented)

---

**The code is correct. This is a Microsoft service issue outside our control.**

Please choose one of the options above and let me know how you'd like to proceed.
