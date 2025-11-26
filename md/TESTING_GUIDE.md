# Testing Guide - UI Test Automation

## Overview

The `nurse_assistant_tester.py` script provides automated testing for the Nurse Assistant Chatbot with two modes:
1. **GUI Mode** - Watch the browser perform automated tests in real-time
2. **Headless Mode** - Run tests in the background with screenshots

## Quick Start

### 1. GUI Mode (Recommended for Visual Testing)

**Basic GUI testing:**
```bash
python3 scripts/nurse_assistant_tester.py
```

**Slow motion mode (easier to watch):**
```bash
python3 scripts/nurse_assistant_tester.py --slow
```

**Slow mode with longer duration:**
```bash
python3 scripts/nurse_assistant_tester.py --slow --duration 300
```

**GUI mode with screenshots:**
```bash
python3 scripts/nurse_assistant_tester.py --slow --screenshots
```

### 2. Headless Mode (For WSL/Background Testing)

**Basic headless testing:**
```bash
python3 scripts/nurse_assistant_tester.py --headless
```

**Quick test (30 seconds):**
```bash
python3 scripts/nurse_assistant_tester.py --headless --duration 30
```

**Extended test (2 minutes):**
```bash
python3 scripts/nurse_assistant_tester.py --headless --duration 120
```

## Command-Line Options

| Option | Description | Default |
|--------|-------------|---------|
| `--slow` | Slow motion mode - delays each action by 500ms for easy observation | Off |
| `--headless` | Run browser in background without displaying window | Off (GUI mode) |
| `--duration <seconds>` | How long to keep the test running | 60 seconds |
| `--screenshots` | Save screenshots during testing | Auto-enabled in headless mode |

## What Gets Tested

The automated test suite covers 16 different features:

1. ✅ **Settings Button** - Opens settings panel
2. ✅ **Quick Parameter Selection** - Body part, action, intensity, duration dropdowns
3. ✅ **Quick Preset Button** - Pre-configured massage presets
4. ✅ **Execute Button** - Manual execution of commands
5. ✅ **ASR Mode Selection** - Browser/FunASR/Whisper speech recognition modes
6. ✅ **Knowledge Base Management** - Knowledge base panel
7. ✅ **Refresh Statistics** - Statistics refresh button
8. ✅ **System Test** - System test functionality
9. ✅ **Debug Mode Toggle** - Enable/disable debug mode
10. ✅ **Slider Controls** - Confidence timeout and silence threshold sliders
11. ✅ **Wake Word Feature** - Wake word detection toggle
12. ✅ **Button Visibility** - All primary buttons visibility check
13. ✅ **Together API** - Together Mixtral model integration
14. ✅ **Massage Task UI** - Task creation and UI display
15. ✅ **Stop-Create-Stop Workflow** - Race condition testing for rapid task transitions
16. ✅ **TTS Overlap Test** - Verifies TTS properly stops when new messages arrive

## Understanding Test Results

### During Execution

Watch the terminal for real-time feedback:
- `✅` - Test passed successfully
- `❌` - Test failed (error details shown)
- `⚠️` - Warning (non-critical issue)
- `📸` - Screenshot saved
- `🔊` - TTS/audio event
- `📝` - User input simulated
- `📤` - Message sent

### After Execution

A detailed test report is automatically generated:

```
test_report_YYYYMMDD_HHMMSS.txt
```

Report contains:
- Test results summary (pass/fail counts)
- Error details with timestamps
- Server logs (last 100 lines)
- Browser console logs (last 100 lines)

### Screenshots (if enabled)

Screenshots are saved in:
```
screenshots_YYYYMMDD_HHMMSS/
```

To view screenshots in WSL:
```bash
explorer.exe screenshots_*/
```

## Example Usage Scenarios

### Scenario 1: First-time testing (watch what happens)

```bash
python3 scripts/nurse_assistant_tester.py --slow --duration 180
```

This will:
- Open a visible Chrome window
- Slow down all actions to 500ms delays
- Run tests for 3 minutes
- Let you watch every step

### Scenario 2: Debugging a specific feature

```bash
python3 scripts/nurse_assistant_tester.py --slow --screenshots --duration 120
```

This will:
- Run in slow motion
- Save screenshots of every step
- Run for 2 minutes
- Provide visual evidence of what happened

### Scenario 3: Automated CI/CD testing

```bash
python3 scripts/nurse_assistant_tester.py --headless --duration 60
```

This will:
- Run silently in the background
- Complete all tests in ~1 minute
- Save screenshots automatically
- Generate report

### Scenario 4: TTS overlap verification

```bash
python3 scripts/nurse_assistant_tester.py --slow --duration 200
```

Watch Test 16 execute:
- Sends 3 rapid messages
- Monitors console for "⏹️ Stopping TTS" signals
- Verifies no audio overlap occurs
- Screenshots captured at each step

## Tips for Visual Testing

1. **Use --slow mode** when you want to understand what's happening
2. **Increase --duration** if you want to manually interact after tests complete
3. **Watch the terminal output** - it shows every action being performed
4. **Check the browser window** - you'll see:
   - Settings panels opening/closing
   - Dropdowns being selected
   - Buttons being clicked
   - Text being typed
   - Responses appearing

## Troubleshooting

### Browser doesn't appear
- Make sure you're NOT using `--headless` flag
- Check that you have a display available (not in SSH without X forwarding)

### Tests run too fast to see
- Add `--slow` flag to enable slow motion mode
- Each action will be delayed by 500ms

### Want to interact after tests finish
- Increase `--duration` to a larger value like 300 or 600
- The browser stays open for the entire duration

### Screenshots not saving
- Add `--screenshots` flag explicitly in GUI mode
- Check that directory permissions allow file creation

## Advanced: Modifying Test Speed

If 500ms slow motion is still too fast, edit the script:

`scripts/nurse_assistant_tester.py:886`
```python
launch_options['slow_mo'] = 1000  # Change from 500 to 1000ms
```

If wait times are too short, edit:

`scripts/nurse_assistant_tester.py:101-104`
```python
def wait(self, seconds):
    if self.slow_mode:
        time.sleep(seconds * 3)  # Change from 2 to 3 (triple wait time)
    else:
        time.sleep(seconds)
```

## Support

If you encounter issues:
1. Check the generated test report file
2. Review screenshots (if enabled)
3. Look for error messages in terminal output
4. Check browser console logs in the test report

## Example Output

```
🏥 智能按摩護理助手 - 自動化測試工具
============================================================
🖥️  GUI 模式 (可視化測試)
👁️  瀏覽器窗口將打開，您可以看到測試過程
🐌 慢速模式已啟用 - 測試動作將放慢以便觀察
⏱️  測試時長: 120 秒
============================================================

🚀 正在啟動 server_qwen.py...
⏳ 等待服務器啟動...
✅ 服務器已就緒

🌐 正在打開瀏覽器...
   🐌 已啟用慢動作模式 (每個操作延遲500ms)
📍 正在訪問 https://127.0.0.1:5000...
✅ 頁面加載成功

============================================================
🤖 開始自動化功能測試
============================================================

🧪 測試: 設置按鈕
   📋 設置面板已打開
   ✅ 設置按鈕 - 測試通過

🧪 測試: 快速參數選擇
   🎯 已選擇部位: 肩膀
   💆 已選擇動作: 按揉
   💪 已選擇力度: 適中
   ⏱️ 已選擇時長: 3分鐘
   ✅ 快速參數選擇 - 測試通過

[... more tests ...]

============================================================
🎉 自動化測試完成！
============================================================

📊 測試結果摘要:
------------------------------------------------------------
✅ 通過 設置按鈕
❌ 失敗 快速參數選擇
✅ 通過 快速方案
[... results ...]
------------------------------------------------------------
總計: 16 項測試
✅ 通過: 14
❌ 失敗: 2
成功率: 87.5%

📄 測試報告已保存: test_report_20251024_170530.txt
📸 截圖已保存到: screenshots_20251024_170530/
```
