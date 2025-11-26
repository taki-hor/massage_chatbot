# Azure TTS Setup - Get Cantonese Voice (HiuGaai) Working 🎤

## Why Azure TTS?

- ✅ **Same voices as Edge TTS** (HiuGaai, HiuMaan, WanLung - all Cantonese)
- ✅ **Official Microsoft API** (won't be blocked like Edge TTS)
- ✅ **Free tier:** 5 million characters/month
- ✅ **After free tier:** $4 per 1 million characters (very affordable)
- ✅ **Reliable** and supported

---

## Step 1: Create Azure Account (5 minutes)

### 1.1 Sign Up for Azure

Go to: https://azure.microsoft.com/free/

- Click "Start free"
- Sign in with Microsoft account (or create one)
- Provide payment info (required even for free tier, **but you won't be charged unless you upgrade**)
- Verify phone number

### 1.2 Create Speech Service Resource

1. Go to Azure Portal: https://portal.azure.com
2. Click "**Create a resource**"
3. Search for "**Speech**"
4. Click "**Speech**" by Microsoft
5. Click "**Create**"

### 1.3 Configure Resource

Fill in:
- **Subscription:** Your subscription name
- **Resource group:** Create new → Enter "ai-nurse-chatbot-rg"
- **Region:** **East Asia** (Hong Kong) or **Southeast Asia** (Singapore) - closest to you
- **Name:** "ai-nurse-tts" (or any unique name)
- **Pricing tier:** **Free F0** (500K chars free/month, then Standard S0)

Click "**Review + create**" → "**Create**"

Wait 1-2 minutes for deployment.

### 1.4 Get API Keys

1. After deployment, click "**Go to resource**"
2. In left menu, click "**Keys and Endpoint**"
3. You'll see:
   - **KEY 1:** `abc123...` ← Copy this
   - **KEY 2:** `xyz789...` ← Backup key
   - **Location/Region:** `eastasia` or `southeastasia` ← Copy this

---

## Step 2: Configure Your Application (2 minutes)

### 2.1 Add to .env File

Open `/home/europa/ai_nurse_chatbot_20102025/.env` and add:

```bash
# Azure Cognitive Services TTS
AZURE_SPEECH_KEY=<YOUR_KEY_1_HERE>
AZURE_SPEECH_REGION=<YOUR_REGION_HERE>
```

**Example:**
```bash
AZURE_SPEECH_KEY=abc123def456ghi789
AZURE_SPEECH_REGION=eastasia
```

### 2.2 Test Azure TTS

Run test script:
```bash
cd /home/europa/ai_nurse_chatbot_20102025
python3 test_azure_tts.py
```

**Expected output:**
```
Testing Azure TTS with HiuGaai voice...
✅ Success! Generated 15234 bytes
💾 Saved to: /tmp/azure_tts_test.wav
🎤 Play this file to verify Cantonese voice!
```

If you see this, Azure TTS is working! ✅

---

## Step 3: Integration (Already Done)

I've already integrated Azure TTS into your server. The fallback chain is now:

```
1. Edge TTS (HiuGaai) ← Will fail (blocked)
    ↓
2. Azure TTS (HiuGaai) ← Will work! ✅ CANTONESE
    ↓
3. gTTS (Mandarin) ← Fallback if Azure fails
    ↓
4. Browser TTS ← Last resort
```

---

## Step 4: Restart Server

```bash
# Kill old server
pkill -f "python3 server_qwen.py"

# Start new server
python3 server_qwen.py
```

Server will now use Azure TTS → **You'll hear Cantonese (HiuGaai)!** 🎤

---

## Pricing

### Free Tier (F0)
- **500,000 characters/month** free
- About 150,000 words
- Enough for testing and light use

### Standard Tier (S0) - After Free Tier
- **$4 per 1 million characters**
- About $1.33 per 300,000 words
- Very affordable

### Example Usage:

**Typical massage session:**
- Start: "而家開始幫你按摩" (9 chars)
- Pause: "按摩已經暫停" (6 chars)
- Feedback: "收到，我會小心啲" (8 chars)
- Total: ~25 chars per session

**With free tier:**
- 500,000 chars ÷ 25 chars = **20,000 sessions/month**
- More than enough!

---

## Troubleshooting

### Error: "Invalid API key"
- Double-check `.env` file has correct `AZURE_SPEECH_KEY`
- Make sure no extra spaces or quotes
- Try KEY 2 if KEY 1 doesn't work

### Error: "Invalid region"
- Check `.env` has correct `AZURE_SPEECH_REGION`
- Common regions: `eastasia`, `southeastasia`, `eastus`
- Must match your Azure resource region

### Error: "Quota exceeded"
- You've used 500K chars this month
- Either wait for next month or upgrade to S0 tier
- Check usage: Azure Portal → Your resource → Metrics

### Still not working?
1. Verify `.env` file is saved
2. Restart server completely
3. Check server logs for specific error
4. Run `python3 test_azure_tts.py` to isolate issue

---

## Alternative: Increase Free Tier

If you need more than 500K chars/month:

### Option 1: Use Standard Tier (Pay-as-you-go)
- Automatically charged after 500K chars
- $4 per 1M chars (~$0.004 per 1000 chars)
- Very affordable for most use cases

### Option 2: Create Multiple Resources
- Create multiple Speech Service resources
- Each gets 500K free chars
- Switch between them manually
- (Not recommended, violates fair use)

---

## Monitoring Usage

### Check Current Usage:

1. Go to Azure Portal: https://portal.azure.com
2. Navigate to your Speech Service resource
3. Click "**Metrics**" in left menu
4. Select metric: "**Characters Translated**"
5. Set time range: "**Last 30 days**"

You'll see a graph of your usage.

---

## Summary

### Setup Steps:
1. ✅ Create Azure account
2. ✅ Create Speech Service resource (Free F0 tier)
3. ✅ Copy API key and region
4. ✅ Add to `.env` file
5. ✅ Test with `python3 test_azure_tts.py`
6. ✅ Restart server
7. ✅ **Hear Cantonese voice!** 🎤

### What You Get:
- ✅ **HiuGaai Cantonese voice** (same as Edge TTS)
- ✅ **500,000 characters/month free**
- ✅ **Reliable** (official Microsoft API)
- ✅ **Fast** (similar speed to Edge TTS)
- ✅ **Multiple voices** (HiuGaai, HiuMaan, WanLung, Danny, etc.)

### Cost After Free Tier:
- **$4 per 1 million characters**
- For typical usage: **$1-5/month**
- Much cheaper than losing users due to wrong language!

---

**Go ahead and set up Azure - it's the fastest way to get Cantonese working!** 🚀

Let me know when you have the API key and region, and I'll verify the integration is working.
