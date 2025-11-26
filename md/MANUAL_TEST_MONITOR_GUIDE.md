# Manual Testing Debug Monitor - User Guide

## 📋 Overview

The **Manual Test Monitor** is a debugging tool that lets you manually test the UI while seeing **all** backend and frontend logs in real-time.

### What It Does

- ✅ Starts `server_qwen.py` automatically
- ✅ Opens browser for manual testing
- ✅ Displays **all debug logs** in terminal:
  - Server logs (Flask routes, requests)
  - Browser console logs (JavaScript)
  - ASR logs (Speech recognition)
  - TTS logs (Text-to-speech)
- ✅ Color-coded output for easy reading
- ✅ Runs until you press Ctrl+C

---

## 🚀 Quick Start

### Basic Usage

```bash
python3 scripts/manual_test_monitor.py
```

**What Happens:**
1. Terminal starts showing logs
2. Browser window opens automatically
3. You manually test the UI (click, speak, etc.)
4. All logs appear in terminal in real-time
5. Press `Ctrl+C` when done

### Example Output

```
================================================================================
🔍 智能按摩護理助手 - 手動測試調試監視器
================================================================================

📋 功能說明:
  • 自動啟動 server_qwen.py 後端服務器
  • 打開瀏覽器視窗供您手動測試
  • 實時顯示所有調試日誌（Server、Browser、ASR、TTS）
  • 按 Ctrl+C 停止監視器

--------------------------------------------------------------------------------

🚀 正在啟動 server_qwen.py...
⏳ 等待服務器啟動...
✅ 服務器已就緒

🌐 正在打開瀏覽器...
📍 正在訪問 https://127.0.0.1:5000...
✅ 頁面加載成功

================================================================================
👉 瀏覽器已打開，請開始手動測試 UI
📊 所有調試日誌將在下方實時顯示
⏹️  按 Ctrl+C 停止監視器
================================================================================

[SERVER] [16:30:45.123] Starting Flask application...
[BROWSER] [16:30:47.456] Page loaded successfully
[BROWSER] [16:30:50.789] 🎤 Recording started
[ASR] [16:30:52.123] Transcript: "按摩肩膀" (confidence: 0.95)
[SERVER] [16:30:52.456] POST /chat - processing message
[TTS] [16:30:53.789] TTS request: voice=zh-HK-HiuGaaiNeural, text_length=25
[BROWSER] [16:30:54.123] 🔊 Audio playback started
```

---

## 🎨 Log Categories

Logs are color-coded by category:

| Category | Color | Description | Example |
|----------|-------|-------------|---------|
| **SERVER** | 🔵 Blue | Flask server logs | `POST /chat` |
| **BROWSER** | 🟢 Green | Browser console logs | `Page loaded` |
| **ASR** | 🟡 Yellow | Speech recognition | `Transcript: "你好"` |
| **TTS** | 🟣 Magenta | Text-to-speech | `TTS synthesis starting` |
| **ERROR** | 🔴 Red | Errors | `Exception occurred` |
| **WARNING** | 🟡 Yellow | Warnings | `Connection timeout` |

---

## 🔍 Advanced Usage

### Filter Specific Logs

Only show ASR (speech recognition) logs:

```bash
python3 scripts/manual_test_monitor.py --filter asr
```

Only show ASR and TTS logs:

```bash
python3 scripts/manual_test_monitor.py --filter asr,tts
```

Only show server and errors:

```bash
python3 scripts/manual_test_monitor.py --filter server,error
```

### Available Filters

- `server` - Server logs only
- `browser` - Browser console logs only
- `asr` - Speech recognition logs only
- `tts` - Text-to-speech logs only
- `error` - Errors only
- `warning` - Warnings only

**Combine with commas:**
```bash
--filter asr,tts,error
```

---

## 📊 Common Use Cases

### 1. Debug Voice Recognition Issues

**Scenario:** Users say "確認" but it doesn't work.

**Solution:**
```bash
python3 scripts/manual_test_monitor.py --filter asr
```

**What to Look For:**
```
[ASR] [16:30:52.123] 🎤 Consent listening: "確" (confidence: 0.01)
[ASR] [16:30:52.456] 🎤 Consent listening: "確認" (confidence: 0.01)
[ASR] [16:30:52.789] 🎤 Consent listening: "確認開始" (confidence: 0.94)
[ASR] [16:30:53.123] ✅ Voice consent: CONFIRMED
```

**Analysis:**
- First two attempts: Low confidence (0.01)
- Third attempt: High confidence (0.94) → Confirmed
- Problem: Takes 3 attempts to recognize

---

### 2. Debug TTS Not Playing

**Scenario:** Response text appears but no audio plays.

**Solution:**
```bash
python3 scripts/manual_test_monitor.py --filter tts
```

**What to Look For:**
```
[TTS] [16:30:53.123] TTS request: voice=zh-HK-HiuGaaiNeural, rate=160, pitch=100
[TTS] [16:30:53.456] TTS synthesis starting: text_len=27
[TTS] [16:30:55.789] ERROR: Edge TTS failed: No audio was received
[TTS] [16:30:55.890] WARNING: Edge TTS failed
```

**Analysis:**
- TTS request sent successfully
- Synthesis started
- Edge TTS service failed (503 error)
- No audio received

---

### 3. Debug Massage Task Creation

**Scenario:** Massage command sent but task doesn't start.

**Solution:**
```bash
python3 scripts/manual_test_monitor.py
```

**What to Look For:**
```
[BROWSER] [16:30:50.123] 📤 傳送按鈕點擊
[SERVER] [16:30:50.456] POST /chat - Received message: "按摩肩膀10分鐘"
[SERVER] [16:30:51.789] Massage command detected: 部位=肩膀, 時長=10
[BROWSER] [16:30:52.123] 🛡️ Showing consent prompt
[ASR] [16:30:55.456] ✅ Voice consent: CONFIRMED
[SERVER] [16:30:55.789] Starting massage session...
[BROWSER] [16:30:56.123] 📊 Progress bar started
```

**Analysis:**
- Message sent successfully
- Server detected massage command
- Consent prompt shown
- User confirmed via voice
- Session started
- Progress bar displayed

---

### 4. Debug Race Condition (Stop-Start-Stop)

**Scenario:** Rapid stop-start causes tasks to overlap.

**Solution:**
```bash
python3 scripts/manual_test_monitor.py --filter browser,server
```

**What to Look For (Before Fix):**
```
[BROWSER] [16:30:50.123] 🛑 Stop button clicked
[SERVER] [16:30:50.456] Stopping massage session...
[BROWSER] [16:30:50.789] 📤 New task sent (too fast!)
[SERVER] [16:30:51.123] Starting new session... (old session not fully stopped!)
[BROWSER] [16:30:51.456] ⚠️ Multiple sessions active!
```

**What to Look For (After Fix):**
```
[BROWSER] [16:30:50.123] 🛑 Stop button clicked
[SERVER] [16:30:50.456] Emergency stop triggered
[SERVER] [16:30:50.457] Session state cleared immediately
[BROWSER] [16:30:50.789] 📤 New task sent
[SERVER] [16:30:51.123] ✅ Starting new session (old session fully stopped)
```

---

## 🎯 Testing Workflow

### Typical Testing Session

1. **Start Monitor:**
   ```bash
   python3 scripts/manual_test_monitor.py
   ```

2. **Wait for Browser:**
   - Browser opens automatically
   - Page loads

3. **Manual Testing:**
   - Click buttons
   - Speak voice commands
   - Create massage tasks
   - Test stop button
   - Try rapid stop-start

4. **Watch Logs:**
   - All actions logged in real-time
   - Look for errors/warnings
   - Monitor ASR confidence
   - Check TTS requests

5. **Stop When Done:**
   - Press `Ctrl+C`
   - Monitor cleans up automatically

---

## 🐛 Troubleshooting

### Browser Doesn't Open

**Problem:** Script starts but no browser window appears.

**Solution:**
- Check if you're in WSL without X server
- Try running with DISPLAY set:
  ```bash
  DISPLAY=:0 python3 scripts/manual_test_monitor.py
  ```
- Or use VNC/X11 forwarding

### Too Many Logs

**Problem:** Terminal flooded with logs.

**Solution:**
Use filters to show only relevant logs:
```bash
python3 scripts/manual_test_monitor.py --filter asr,tts
```

### Server Already Running

**Problem:** Error says port 5000 is already in use.

**Solution:**
Stop existing server first:
```bash
pkill -f server_qwen.py
# Then run monitor again
python3 scripts/manual_test_monitor.py
```

### Can't See Colors

**Problem:** Logs show weird characters instead of colors.

**Solution:**
Your terminal doesn't support ANSI colors. Use a modern terminal:
- Windows: Windows Terminal, ConEmu
- Linux: gnome-terminal, konsole
- macOS: Terminal.app, iTerm2

---

## 📝 Tips & Tricks

### Save Logs to File

```bash
python3 scripts/manual_test_monitor.py 2>&1 | tee manual_test.log
```

Now logs are saved to `manual_test.log` while also displayed on screen.

### Run in Background

```bash
python3 scripts/manual_test_monitor.py > manual_test.log 2>&1 &
```

Monitor runs in background, logs saved to file.

### Grep for Specific Patterns

```bash
python3 scripts/manual_test_monitor.py 2>&1 | grep "confidence"
```

Only show lines containing "confidence".

### Focus on Errors

```bash
python3 scripts/manual_test_monitor.py --filter error,warning
```

Only show errors and warnings.

---

## 🆚 Comparison: Manual Monitor vs Automated Tester

| Feature | **Manual Test Monitor** | **Automated Tester** |
|---------|------------------------|---------------------|
| **Purpose** | Debug while manually testing | Run automated test suite |
| **Browser** | You control it | Script controls it |
| **Test Cases** | Manual exploration | Predefined 16 tests |
| **Output** | Real-time logs | Test report + screenshots |
| **Use When** | Debugging specific issues | Regression testing |
| **Duration** | Until you press Ctrl+C | Fixed duration (60-300s) |
| **Logs** | Live streaming | Saved to report file |

**When to Use Manual Monitor:**
- 🔍 Investigating a specific bug
- 🎤 Testing voice recognition
- 🔊 Debugging TTS issues
- 🐛 Reproducing user-reported problems
- 🧪 Testing new features interactively

**When to Use Automated Tester:**
- ✅ Running regression tests
- 📊 Getting overall health status
- 📸 Capturing UI screenshots
- 🚀 CI/CD integration
- 📝 Generating test reports

---

## 🎓 Example: Debugging Consent Voice Issue

Let's walk through a real debugging session.

### Problem

User reports: "I have to say '確認' 5 times before it works!"

### Debug Session

1. **Start Monitor with ASR Filter:**
   ```bash
   python3 scripts/manual_test_monitor.py --filter asr
   ```

2. **Trigger Massage Command:**
   - You: Say "按摩肩膀10分鐘"
   - Consent prompt appears

3. **Watch Logs:**
   ```
   [ASR] [16:30:50.123] 🎤 Consent listening: "確" (confidence: 0.01)
   [ASR] [16:30:50.456] ❓ Unrecognized consent response: "確"
   [ASR] [16:30:51.123] 🎤 Consent listening: "確認" (confidence: 0.01)
   [ASR] [16:30:51.456] ❓ Unrecognized consent response: "確認"
   [ASR] [16:30:52.123] 🎤 Consent listening: "確認開" (confidence: 0.01)
   [ASR] [16:30:52.456] ❓ Unrecognized consent response: "確認開"
   [ASR] [16:30:53.123] 🎤 Consent listening: "確認開始" (confidence: 0.94)
   [ASR] [16:30:53.456] ✅ Voice consent: CONFIRMED - "確認開始"
   ```

4. **Root Cause Found:**
   - Confidence threshold too high (0.7)
   - User's first 3 attempts: confidence 0.01
   - Only 4th attempt: confidence 0.94
   - Need to lower threshold!

5. **Fix Applied:**
   - Lower confidence threshold from 0.7 to 0.3
   - Add fuzzy matching for partial words
   - Result: Now recognizes on 1st-2nd attempt

---

## 📚 Summary

**Manual Test Monitor** = Your debugging companion

- **Easy to use:** One command, opens browser, start testing
- **Comprehensive:** See everything happening behind the scenes
- **Flexible:** Filter logs by category
- **Color-coded:** Easy to spot issues
- **Real-time:** No delay, see logs as they happen

**Perfect for:**
- 🔍 Investigating bugs
- 🎤 Voice recognition debugging
- 🔊 TTS troubleshooting
- 🧪 Feature development
- 📊 Understanding system behavior

Start using it today:
```bash
python3 scripts/manual_test_monitor.py
```

Happy debugging! 🚀
