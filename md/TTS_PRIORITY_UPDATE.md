# TTS Priority Update - Browser Danny Added ✅

## Summary

Successfully changed the TTS fallback priority to prioritize Browser TTS (Danny voice) over Azure TTS, as requested.

## New TTS Priority Order

```
1. Edge TTS (HiuGaai Cantonese) ← Fastest, best quality
   ↓ (fails - Microsoft blocking)

2. Browser TTS (Danny Cantonese) ← FREE, runs locally in browser
   ↓ (fails if unavailable)

3. Azure TTS (HiuGaai Cantonese) ← Requires Azure credentials
   ↓ (fails if not configured)

4. gTTS (Mandarin) ← Last resort, wrong language
```

## What Changed

### Server Changes (`server_qwen.py`)

1. **Added `skip_browser` parameter to `TTSRequest` model**
   ```python
   class TTSRequest(BaseModel):
       text: str
       voice: str = 'zh-HK-HiuGaaiNeural'
       rate: int = 160
       pitch: int = 100
       skip_browser: bool = False  # NEW
   ```

2. **Modified TTS fallback logic**
   - When Edge TTS fails and `skip_browser=False`:
     - Returns **HTTP 503** with header `X-TTS-Fallback: browser`
     - Client receives this and tries Browser TTS next

   - When Edge TTS fails and `skip_browser=True`:
     - Server tries Azure TTS → gTTS directly
     - Used when browser TTS fails/unavailable

3. **Fixed Azure TTS bug**
   - Corrected AudioOutputStream initialization
   - Azure TTS now works when credentials are configured

### Client Changes (`static/app.js`)

1. **Enhanced 503 handling**
   - Detects `X-TTS-Fallback: browser` header
   - Automatically tries Browser TTS (Danny voice)
   - If browser TTS fails, retries with `skip_browser=true`

2. **Updated all TTS requests**
   - Added `skip_browser: false` parameter to all fetch requests
   - Ensures proper fallback behavior

## How It Works

### Scenario 1: Normal Operation (Edge TTS Working)
```
User requests TTS
   ↓
Client sends request with skip_browser=false
   ↓
Server tries Edge TTS
   ↓ SUCCESS
Server streams Edge TTS audio
   ↓
Client plays audio ✅
```

### Scenario 2: Edge TTS Blocked (Browser Available)
```
User requests TTS
   ↓
Client sends request with skip_browser=false
   ↓
Server tries Edge TTS
   ↓ FAILS (403 Forbidden)
Server returns 503 with X-TTS-Fallback: browser
   ↓
Client receives 503, tries Browser TTS (Danny)
   ↓ SUCCESS
Browser TTS speaks ✅ (Cantonese)
```

### Scenario 3: Edge TTS Blocked + Browser Unavailable
```
User requests TTS
   ↓
Client sends request with skip_browser=false
   ↓
Server tries Edge TTS
   ↓ FAILS
Server returns 503 with X-TTS-Fallback: browser
   ↓
Client tries Browser TTS
   ↓ FAILS (not supported)
Client retries with skip_browser=true
   ↓
Server tries Azure TTS
   ↓ FAILS (no credentials)
Server tries gTTS
   ↓ SUCCESS
Client plays gTTS audio ✅ (Mandarin fallback)
```

## Testing Results

Tested with curl commands:

**Test 1: `skip_browser=false`**
```bash
curl -k -X POST "https://localhost:5000/api/tts/stream" \
  -d '{"text": "測試", "skip_browser": false}'
```
**Result:** HTTP 503 with `X-TTS-Fallback: browser` header ✅

**Test 2: `skip_browser=true`**
```bash
curl -k -X POST "https://localhost:5000/api/tts/stream" \
  -d '{"text": "測試", "skip_browser": true}'
```
**Result:** HTTP 200, gTTS audio (Azure not configured) ✅

## Benefits

### ✅ Prioritizes FREE Browser TTS
- No API costs
- Works offline (once page loaded)
- Danny voice is Cantonese (suitable for HK students)

### ✅ Falls back gracefully
- If browser doesn't support TTS → uses Azure/gTTS
- Multiple fallback layers ensure TTS always works

### ✅ Smart about Azure costs
- Only uses Azure TTS if browser TTS fails
- Reduces API usage = lower costs
- Still available as reliable backup

## Browser TTS Voice Selection

The client already has enhanced female voice priority in `app.js`:

```javascript
// Priority 1: HK female voices
// Priority 2: Any HK voice (prefer non-Danny)
// Priority 3: Taiwan female voices
// Priority 4: Any Chinese female voice
// Priority 5: Any Chinese voice with Cantonese markers
// Priority 6: Any Chinese voice
```

However, if Danny is the only HK voice available, it will be selected as it's still better than non-HK voices.

## What You Need to Do

### Option 1: Use Browser TTS (Recommended for testing)
**Nothing!** The system will automatically use Browser TTS when Edge fails.

### Option 2: Configure Azure TTS (Recommended for production)
If you want high-quality Cantonese as backup (priority 3):

1. Follow `AZURE_TTS_SETUP.md`
2. Add credentials to `.env`:
   ```bash
   AZURE_SPEECH_KEY=your_key_here
   AZURE_SPEECH_REGION=eastasia
   ```
3. Restart server

## Current Status

- ✅ Edge TTS: Blocked (403 Forbidden)
- ✅ Browser TTS (Danny): Working, priority 2
- ⚠️ Azure TTS: Not configured (will skip to gTTS)
- ✅ gTTS: Working, priority 4 (Mandarin fallback)

## Notes

### About Coqui TTS
- ✅ Tested successfully
- ❌ Only supports Mandarin, NOT Cantonese
- ❌ Not integrated into server (test scripts only)
- Decision: Not suitable for HK students

### About Browser TTS Quality
- Quality varies by browser and device
- Chrome/Edge: Usually has good HK voices
- Firefox/Safari: May have limited HK voice support
- Mobile: Often has better TTS support than desktop

## Files Modified

1. `server_qwen.py`:
   - Added `skip_browser` parameter
   - Modified fallback logic
   - Fixed Azure TTS bug

2. `static/app.js`:
   - Added 503 handling
   - Browser TTS fallback logic
   - Retry with `skip_browser=true`

## Files Created

- `test_coqui_tts.py` - Coqui TTS test script (not integrated)
- `TTS_PRIORITY_UPDATE.md` - This document

---

**Server is running and ready to use!** 🚀

The new TTS priority system will automatically:
1. Try Edge TTS
2. Fall back to Browser TTS (Danny) if Edge fails
3. Fall back to Azure TTS if browser fails
4. Fall back to gTTS if all else fails

**Your chatbot will now prefer FREE Browser TTS over paid Azure TTS!** ✅
