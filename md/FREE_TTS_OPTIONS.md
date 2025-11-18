# Free High-Quality TTS Options - Comparison

## Summary

| TTS Service | Quality | Cantonese Support | Free Tier | Setup Difficulty | Recommendation |
|------------|---------|-------------------|-----------|------------------|----------------|
| **Coqui TTS** | ⭐⭐⭐ Good | ❌ Limited | ✅ Fully Free | 🔧 Medium | ⭐ Best for self-hosted |
| **gTTS (Google)** | ⭐⭐⭐⭐ Very Good | ✅ Yes (zh-yue) | ✅ Unlimited | ✅ Easy | ⭐⭐ Best quick fix |
| **pyttsx3** | ⭐⭐ OK | ✅ Depends on OS | ✅ Fully Free | ✅ Very Easy | ⚠️ Offline only, lower quality |
| **Bark (Suno AI)** | ⭐⭐⭐⭐⭐ Excellent | ⚠️ Multilingual | ✅ Fully Free | 🔧 Hard (requires GPU) | ⚠️ Slow, needs powerful hardware |
| **Edge TTS** | ⭐⭐⭐⭐⭐ Excellent | ✅ Perfect (HiuGaai) | ✅ Unlimited | ✅ Easy | ❌ Currently broken (403) |

---

## Option 1: gTTS (Google Text-to-Speech) ⭐⭐ RECOMMENDED

### Overview
- **Free Google TTS service** via unofficial API
- **No API key required**
- **Supports Cantonese** (zh-yue, zh-TW)
- **Very easy to implement**

### Pros
✅ Completely free, unlimited usage
✅ Good quality
✅ Supports Cantonese (yue)
✅ Easy installation: `pip install gTTS`
✅ Reliable (rarely blocked)
✅ Works immediately

### Cons
❌ Not officially supported (may break)
❌ Requires internet connection
❌ No voice selection (one voice per language)
❌ Slightly robotic compared to Edge TTS

### Installation
```bash
pip3 install gTTS
```

### Example Code
```python
from gtts import gTTS
import io

def synthesize_gtts(text: str, lang='zh-yue') -> bytes:
    """Synthesize using Google TTS"""
    tts = gTTS(text=text, lang=lang, slow=False)

    audio_fp = io.BytesIO()
    tts.write_to_fp(audio_fp)
    audio_fp.seek(0)

    return audio_fp.read()
```

### Cantonese Support
- `zh-yue` - Cantonese (best for HK)
- `zh-TW` - Traditional Chinese/Taiwanese Mandarin (similar)
- `zh-CN` - Simplified Chinese/Mandarin

---

## Option 2: Coqui TTS 🤖

### Overview
- **Open-source TTS engine**
- **Self-hosted, no API calls**
- **Multiple voice models available**
- **Good quality**

### Pros
✅ Fully free and open-source
✅ Self-hosted (no external dependency)
✅ Multiple languages and voices
✅ Can fine-tune models
✅ GPU acceleration support

### Cons
❌ Limited Cantonese models (mostly Mandarin)
❌ Slower than cloud TTS (CPU-intensive)
❌ Large model files (100MB+)
❌ Setup more complex
❌ May need GPU for good performance

### Installation
```bash
pip3 install TTS
```

### Example Code
```python
from TTS.api import TTS

# Initialize TTS (download model on first run)
tts = TTS(model_name="tts_models/zh-CN/baker/tacotron2-DDC-GST")

def synthesize_coqui(text: str) -> bytes:
    """Synthesize using Coqui TTS"""
    # Generate to file
    tts.tts_to_file(text=text, file_path="/tmp/output.wav")

    # Read file and return bytes
    with open("/tmp/output.wav", "rb") as f:
        return f.read()
```

### Available Chinese Models
- `tts_models/zh-CN/baker/tacotron2-DDC-GST` - Mandarin female
- `tts_models/multilingual/multi-dataset/your_tts` - Multilingual (can do Chinese)

⚠️ **No dedicated Cantonese models available** - Would need custom training

---

## Option 3: pyttsx3 (Offline TTS)

### Overview
- **Offline TTS using OS voices**
- **No internet required**
- **Uses system TTS engines**

### Pros
✅ Completely offline
✅ No API calls
✅ Very fast
✅ Easy to use

### Cons
❌ Quality depends on OS
❌ Limited voice control
❌ May not have good Cantonese voices
❌ Different voices on different OS

### Installation
```bash
pip3 install pyttsx3
```

### Example Code
```python
import pyttsx3

engine = pyttsx3.init()

def synthesize_pyttsx3(text: str):
    """Synthesize using pyttsx3"""
    engine.say(text)
    engine.runAndWait()
```

---

## Option 4: Bark (Suno AI) 🎵

### Overview
- **State-of-the-art TTS by Suno AI**
- **Multilingual, high quality**
- **Can generate music and sound effects**

### Pros
✅ Excellent quality
✅ Supports multilingual (including Chinese)
✅ Free and open-source
✅ Can do voice cloning

### Cons
❌ **Very slow** (30+ seconds for short text)
❌ **Requires GPU** (CUDA) for reasonable speed
❌ Large model downloads (2GB+)
❌ High memory usage (8GB+ RAM)
❌ Complex setup

### Installation
```bash
pip3 install git+https://github.com/suno-ai/bark.git
```

⚠️ **Not recommended unless you have powerful GPU**

---

## Option 5: Azure Cognitive Services (Official)

### Overview
- **Microsoft's official TTS API**
- **Same voices as Edge TTS (HiuGaai, etc.)**
- **Enterprise-grade**

### Pros
✅ Official, won't be blocked
✅ Same high-quality voices as Edge
✅ Reliable and supported
✅ **Free tier: 5M characters/month**

### Cons
❌ Requires Azure account
❌ Requires API key
❌ Limited free tier
❌ Costs money after free tier

### Free Tier
- 5 million characters per month
- ~150,000 words
- Enough for personal/testing use

### Cost After Free Tier
- Standard: $4 per 1M characters
- Neural: $16 per 1M characters

---

## Recommended Implementation Strategy

### Phase 1: Quick Fix (Today) - gTTS ⭐⭐⭐
**Use gTTS as immediate Edge TTS replacement**

**Why:**
- ✅ Works in 5 minutes
- ✅ Good Cantonese support
- ✅ Free and reliable
- ✅ Easy to implement

**Implementation:**
1. Install: `pip3 install gTTS`
2. Add gTTS fallback to `server_qwen.py`
3. Test and deploy

---

### Phase 2: Testing (This Week) - Coqui TTS
**Evaluate Coqui TTS for self-hosted solution**

**Why:**
- ⚙️ Learn if it meets quality requirements
- ⚙️ Test performance on your hardware
- ⚙️ Evaluate Mandarin vs Cantonese quality

**Implementation:**
1. Install Coqui TTS
2. Download Chinese models
3. Test quality and speed
4. Compare to gTTS

---

### Phase 3: Long-term (Future) - Multi-Provider
**Implement fallback chain for reliability**

```python
async def synthesize_tts(text: str, voice: str) -> bytes:
    """Multi-provider TTS with fallback chain"""

    # Try providers in order
    providers = [
        ('Edge TTS', synthesize_edge_tts),
        ('gTTS', synthesize_gtts),
        ('Coqui', synthesize_coqui),
        ('Browser Fallback', None)  # Client-side fallback
    ]

    for name, synthesizer in providers:
        try:
            if synthesizer:
                audio = await synthesizer(text, voice)
                if audio and len(audio) > 0:
                    logger.info(f"✅ TTS success with {name}")
                    return audio
        except Exception as e:
            logger.warning(f"⚠️ {name} failed: {e}")
            continue

    # All providers failed
    raise Exception("All TTS providers failed")
```

---

## Next Steps for You

### Immediate (5 minutes):
```bash
# Install gTTS
pip3 install gTTS

# I'll integrate it into server_qwen.py
```

### Short-term (30 minutes):
```bash
# Install Coqui TTS for testing
pip3 install TTS

# Test different models
# Evaluate quality vs gTTS
```

### Medium-term (Later):
- Monitor Edge TTS for fix
- Evaluate if Azure free tier is worth it
- Implement multi-provider fallback

---

## Performance Comparison (Estimated)

| Service | Speed (for 10 words) | Quality | Cantonese Accuracy |
|---------|---------------------|---------|-------------------|
| Edge TTS | ~200ms | ⭐⭐⭐⭐⭐ | Perfect (native) |
| gTTS | ~500ms | ⭐⭐⭐⭐ | Very Good |
| Coqui TTS | ~2000ms (CPU) | ⭐⭐⭐ | Fair (Mandarin model) |
| Bark | ~30000ms | ⭐⭐⭐⭐⭐ | Good (multilingual) |
| Azure | ~200ms | ⭐⭐⭐⭐⭐ | Perfect (same as Edge) |

---

## My Recommendation

**For immediate use:** **gTTS** ⭐⭐⭐
- Works now
- Good quality
- Free forever
- Cantonese support

**For testing:** **Coqui TTS** ⚙️
- See if self-hosted works for you
- Evaluate quality vs speed trade-off
- Learn if Mandarin model is acceptable

**For long-term:** **Multi-provider with Azure** 💰
- Use gTTS as primary
- Monitor Edge TTS for fixes
- Consider Azure free tier (5M chars/month)
- Keep Coqui as offline fallback

---

Shall we start with **gTTS implementation**? It's the fastest path to working TTS.
