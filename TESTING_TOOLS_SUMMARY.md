# Testing Tools Summary

## 📚 Available Testing Tools

The chatbot now has **two complementary testing tools**:

---

## 1️⃣ Manual Test Monitor 🔍

**File:** `scripts/manual_test_monitor.py`

### Purpose
Debug tool for **manual testing** - shows all logs in real-time while you interact with the UI.

### Usage
```bash
# Basic usage (all logs)
python3 scripts/manual_test_monitor.py

# Show only ASR logs
python3 scripts/manual_test_monitor.py --filter asr

# Show only ASR and TTS
python3 scripts/manual_test_monitor.py --filter asr,tts
```

### What It Does
- ✅ Starts server automatically
- ✅ Opens browser for manual testing
- ✅ Shows **all debug logs** in terminal:
  - 🔵 Server logs
  - 🟢 Browser console
  - 🟡 ASR (speech recognition)
  - 🟣 TTS (text-to-speech)
  - 🔴 Errors/Warnings
- ✅ Color-coded output
- ✅ Runs until Ctrl+C

### When to Use
- 🔍 Debugging specific issues
- 🎤 Testing voice recognition
- 🔊 Troubleshooting TTS
- 🐛 Reproducing bugs
- 🧪 Developing new features

### Example Output
```
[SERVER] [16:30:45.123] Starting Flask application...
[BROWSER] [16:30:47.456] Page loaded successfully
[ASR] [16:30:52.123] Transcript: "按摩肩膀" (confidence: 0.95)
[TTS] [16:30:53.789] TTS request: voice=zh-HK-HiuGaaiNeural
```

**📖 Full Guide:** See `MANUAL_TEST_MONITOR_GUIDE.md`

---

## 2️⃣ Automated Tester 🤖

**File:** `scripts/nurse_assistant_tester.py`

### Purpose
Automated testing tool - runs **16 predefined test cases** and generates reports.

### Usage
```bash
# GUI mode (watch tests run)
python3 scripts/nurse_assistant_tester.py

# Slow motion mode (easier to watch)
python3 scripts/nurse_assistant_tester.py --slow

# Slow motion + screenshots
python3 scripts/nurse_assistant_tester.py --slow --screenshots

# Headless mode (background, auto-screenshots)
python3 scripts/nurse_assistant_tester.py --headless
```

### What It Does
- ✅ Runs 16 automated test cases
- ✅ Tests all UI features automatically
- ✅ Captures screenshots at each step
- ✅ Generates detailed test report
- ✅ Shows pass/fail for each test
- ✅ Logs all errors and warnings

### Test Cases Covered
1. Settings Button
2. Quick Parameter Selection
3. Quick Preset Button
4. Execute Button
5. ASR Mode Selection
6. Knowledge Base Management
7. Refresh Statistics
8. System Test
9. Debug Mode Toggle
10. Slider Controls
11. Wake Word Feature
12. Button Visibility Check
13. Together API Integration
14. Massage Task UI
15. Stop-Create-Stop Workflow (Race Condition)
16. TTS Overlap Prevention

### When to Use
- ✅ Regression testing
- 📊 Overall health check
- 🚀 CI/CD integration
- 📝 Generating test reports
- 📸 Capturing UI evidence

### Output Files
- `test_report_YYYYMMDD_HHMMSS.txt` - Detailed report
- `screenshots_YYYYMMDD_HHMMSS/` - Screenshots folder

**📖 Full Guide:** See `TESTING_GUIDE.md`

---

## 🆚 Quick Comparison

| Feature | Manual Monitor | Automated Tester |
|---------|---------------|------------------|
| **Control** | 👤 You control | 🤖 Script controls |
| **Purpose** | Debug specific issues | Run test suite |
| **Duration** | Until Ctrl+C | Fixed (60-300s) |
| **Output** | Real-time logs | Test report |
| **Tests** | Manual exploration | 16 predefined tests |
| **Screenshots** | Optional | Automatic |
| **Best For** | Debugging | Regression testing |

---

## 🎯 Which Tool to Use?

### Use **Manual Test Monitor** When:
- 🔍 Investigating a specific bug
- 🎤 "Voice recognition isn't working" → Use `--filter asr`
- 🔊 "TTS not playing" → Use `--filter tts`
- 🐛 "Need to see what's happening"
- 🧪 Testing new feature interactively

### Use **Automated Tester** When:
- ✅ "Did my changes break anything?"
- 📊 "What's the overall system health?"
- 🚀 Running before deployment
- 📝 Need a test report
- 📸 Need visual evidence

### Use **Both** When:
1. Run automated tester to find issues
2. Use manual monitor to debug specific failures
3. Fix the issues
4. Run automated tester again to verify

---

## 📋 Typical Workflow

### Scenario 1: Daily Development

```bash
# Morning: Check if everything works
python3 scripts/nurse_assistant_tester.py --headless

# If tests fail, debug with manual monitor
python3 scripts/manual_test_monitor.py --filter asr,tts

# Make fixes

# Verify fix
python3 scripts/nurse_assistant_tester.py --slow
```

### Scenario 2: Bug Report

**User says:** "Voice confirmation doesn't work"

```bash
# Step 1: Reproduce with debug logs
python3 scripts/manual_test_monitor.py --filter asr

# Step 2: Manually trigger the issue
# (Say massage command, watch consent logs)

# Step 3: Analyze logs
# [ASR] confidence: 0.01 → Too low!

# Step 4: Fix the code
# (Lower confidence threshold)

# Step 5: Verify with automated test
python3 scripts/nurse_assistant_tester.py --slow
```

### Scenario 3: New Feature Development

```bash
# Step 1: Develop feature with live debugging
python3 scripts/manual_test_monitor.py

# Step 2: Test interactively
# (Add console.logs, watch real-time)

# Step 3: Run full test suite
python3 scripts/nurse_assistant_tester.py

# Step 4: Check for regressions
# (Did new feature break existing tests?)
```

---

## 🔧 Advanced Tips

### Save Manual Monitor Logs

```bash
python3 scripts/manual_test_monitor.py 2>&1 | tee debug_session.log
```

Now logs are saved AND displayed.

### Run Automated Tests in CI/CD

```bash
# In your CI/CD pipeline
python3 scripts/nurse_assistant_tester.py --headless --duration 60

# Check exit code
if [ $? -eq 0 ]; then
    echo "✅ All tests passed"
else
    echo "❌ Tests failed"
    exit 1
fi
```

### Compare Test Results

```bash
# Before changes
python3 scripts/nurse_assistant_tester.py --headless > before.txt

# Make changes

# After changes
python3 scripts/nurse_assistant_tester.py --headless > after.txt

# Compare
diff before.txt after.txt
```

---

## 📚 Documentation Files

| File | Description |
|------|-------------|
| `MANUAL_TEST_MONITOR_GUIDE.md` | Complete manual monitor guide |
| `TESTING_GUIDE.md` | Complete automated tester guide |
| `TESTING_TOOLS_SUMMARY.md` | This file - overview of both tools |
| `CONSENT_VOICE_IMPROVEMENTS.md` | Voice recognition improvements |
| `test_fixes_summary.md` | Test automation fixes history |
| `tts_overlap_test_summary.md` | TTS overlap test documentation |

---

## 🚀 Quick Start Commands

```bash
# 1. Manual testing with debug logs
python3 scripts/manual_test_monitor.py

# 2. Automated testing (watch in browser)
python3 scripts/nurse_assistant_tester.py --slow

# 3. Automated testing (background)
python3 scripts/nurse_assistant_tester.py --headless

# 4. Debug voice recognition only
python3 scripts/manual_test_monitor.py --filter asr

# 5. Debug TTS only
python3 scripts/manual_test_monitor.py --filter tts

# 6. Debug ASR + TTS
python3 scripts/manual_test_monitor.py --filter asr,tts

# 7. Save all logs to file
python3 scripts/manual_test_monitor.py 2>&1 | tee debug.log
```

---

## ✅ Summary

You now have **two powerful testing tools**:

1. **Manual Test Monitor** (`manual_test_monitor.py`)
   - For debugging
   - Real-time logs
   - You control the UI

2. **Automated Tester** (`nurse_assistant_tester.py`)
   - For regression testing
   - 16 test cases
   - Script controls everything

**Use them together** for maximum effectiveness:
- Automated tests find problems
- Manual monitor helps debug them
- Fix the issues
- Automated tests verify the fix

Happy testing! 🎉
