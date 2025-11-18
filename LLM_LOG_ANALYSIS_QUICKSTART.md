# LLM Log Analysis - Quick Start Guide

## 🚀 5-Minute Workflow

### Step 1: Run Tests and Save Logs (1 min)

```bash
# Automated test
python3 scripts/nurse_assistant_tester.py --headless --duration 90 2>&1 | tee test.log

# OR manual testing
python3 scripts/manual_test_monitor.py 2>&1 | tee manual.log
```

### Step 2: Extract Errors (30 seconds)

```bash
# Quick extraction
./scripts/extract_errors.sh test.log

# OR detailed formatting
python3 scripts/format_logs_for_llm.py test.log > for_claude.md
```

### Step 3: Copy to Claude/ChatGPT (30 seconds)

```bash
# View the extracted errors
cat errors_for_llm.txt

# OR view formatted output
cat for_claude.md
```

Copy the content and paste into Claude/ChatGPT.

### Step 4: Add Context (1 min)

When pasting to LLM, add this template:

```markdown
I'm debugging my AI chatbot application. Here are the test errors:

[Paste errors here from errors_for_llm.txt or for_claude.md]

**Additional Context:**
- The dropdown test fails with timeout selecting options
- TTS service returns 503 errors frequently
- Test run was in WSL2 headless mode

**Questions:**
1. What's causing the dropdown selection timeout?
2. Why are TTS requests failing with 503?
3. How can I make the tests more reliable?
4. Please provide code fixes.
```

### Step 5: Apply Fixes (2-10 min)

Follow LLM's suggestions, then re-test:

```bash
# Re-run tests
python3 scripts/nurse_assistant_tester.py --headless --duration 90 2>&1 | tee test_after_fix.log

# Compare results
diff <(grep "❌" test.log) <(grep "❌" test_after_fix.log)
```

---

## 📊 Real Example from Your Test Logs

### Actual Errors Found:

From `final_test_output.log`:

**1. Test Failure: Dropdown Selection Timeout**
```
❌ 快速參數選擇 - 測試失敗: ElementHandle.select_option: Timeout 30000ms exceeded.
```

**2. TTS 503 Errors (repeated 10+ times)**
```
[BROWSER:error] Failed to load resource: the server responded with a status of 503 (Service Unavailable)
[BROWSER:error] ❌ Play error for: 你好！我係小狐狸AI助手。歡迎嚟到知識嘅... Error: TTS request failed: 503
```

### What to Send to LLM:

```markdown
**Problem 1: Dropdown Selection Timeout**

Test: "快速參數選擇" (Quick Parameter Selection)
Error: ElementHandle.select_option: Timeout 30000ms exceeded
Details: Trying to select body part from dropdown, but options not found after 63 retries

Code:
```python
body_part_select = page.query_selector('select[name="bodyPart"]')
body_part_select.select_option(label='肩膀')  # Times out here
```

**Problem 2: Edge TTS 503 Errors**

Frequency: 10 out of 15 TTS requests
Error: "Service Unavailable" (503)
Pattern: Happens during rapid successive requests
Fallback: System falls back to browser TTS

Server logs show:
```
ERROR:server_qwen:Edge TTS failed on first chunk: No audio was received
WARNING:server_qwen:⚠️ Edge TTS failed: No audio was received
```

**Questions:**
1. How to make dropdown selection more reliable?
2. How to handle TTS rate limiting / 503 errors?
3. Should I add retry logic or use alternative TTS?
```

### Expected LLM Response:

The LLM will analyze and provide:

1. **Root Causes**
   - Dropdown: Options loaded dynamically, timing issue
   - TTS: Rate limiting from Microsoft Edge TTS service

2. **Fixes**
   - Dropdown: Wait for options to load before selecting
   - TTS: Add retry logic, implement caching

3. **Code Examples**
   ```python
   # Dropdown fix
   page.wait_for_function("""
       () => {
           const select = document.querySelector('select[name="bodyPart"]');
           return select && select.options.length > 1;
       }
   """, timeout=10000)
   ```

   ```python
   # TTS retry fix
   async def edge_tts_with_retry(text, voice, max_retries=3):
       for attempt in range(max_retries):
           try:
               # ... TTS code ...
               return audio_data
           except Exception as e:
               if attempt < max_retries - 1:
                   await asyncio.sleep(2 ** attempt)
               else:
                   raise
   ```

---

## 🎯 Pro Tips

### Tip 1: Filter Logs for Specific Issues

```bash
# Only TTS errors
grep -i "tts.*error\|503" test.log

# Only test failures
grep "❌.*測試失敗" test.log

# Only timeouts
grep -i "timeout" test.log
```

### Tip 2: Provide Screenshots

If you saved screenshots during testing:

```bash
ls screenshots_*/
# screenshots_20251024_164327/03_164338_settings_opened.png
# screenshots_20251024_164327/04_164410_quick_preset_clicked.png
```

Tell the LLM: "Screenshot `04_164410_quick_preset_clicked.png` shows the UI state when test failed"

### Tip 3: Include Relevant Code

When asking LLM, include the actual code that's failing:

```python
# From nurse_assistant_tester.py line 156
def test_quick_param_selection(self):
    """Test dropdown parameter selection"""

    # Click settings
    settings_btn = self.page.query_selector('#settingsBtn')
    settings_btn.click()

    # Select body part - THIS FAILS
    body_part_select = self.page.query_selector('select[name="bodyPart"]')
    body_part_select.select_option(label='肩膀')  # ❌ Timeout here

    # ... rest of test ...
```

### Tip 4: Iterate Based on Results

**First try:**
- Send error logs to LLM
- Get initial fix suggestions

**If fix doesn't work:**
- Run test again with fix applied
- Extract new logs
- Send to LLM: "I tried your suggestion but still getting this error: [new logs]"
- Get refined fix

---

## 📋 Checklist

Before sending logs to LLM:

- [ ] Logs are from latest test run
- [ ] Errors are extracted (not full 10000-line log)
- [ ] Included relevant code context
- [ ] Specified environment (WSL, headless, etc.)
- [ ] Identified specific failing tests
- [ ] Noted any patterns (e.g., "happens 10/15 times")
- [ ] Added screenshots if relevant
- [ ] Asked specific questions

After receiving LLM fix:

- [ ] Understood what the fix does
- [ ] Verified file paths are correct
- [ ] Applied the fix
- [ ] Ran tests again
- [ ] Compared before/after results
- [ ] Documented the fix

---

## 🔧 Common Scenarios

### Scenario 1: Test Fails Intermittently

**Extract logs:**
```bash
python3 scripts/nurse_assistant_tester.py --headless 2>&1 | tee run1.log
python3 scripts/nurse_assistant_tester.py --headless 2>&1 | tee run2.log
python3 scripts/nurse_assistant_tester.py --headless 2>&1 | tee run3.log
```

**Tell LLM:**
"This test fails 2 out of 3 times. Here are logs from 3 runs:"

### Scenario 2: Server Crashes

**Extract logs:**
```bash
# Server logs show crash
grep -A 10 "Exception\|Traceback" test.log
```

**Tell LLM:**
"Server crashed with this exception: [paste traceback]"

### Scenario 3: UI Element Not Found

**Extract logs:**
```bash
# Playwright errors
grep "ElementHandle\|Timeout.*selector" test.log
```

**Tell LLM:**
"Playwright can't find this element: `#stopBtn`. Here's the error and screenshot."

---

## 📚 Quick Reference Commands

| Task | Command |
|------|---------|
| Run test with logs | `python3 scripts/nurse_assistant_tester.py 2>&1 \| tee test.log` |
| Extract errors | `./scripts/extract_errors.sh test.log` |
| Format for LLM | `python3 scripts/format_logs_for_llm.py test.log > out.md` |
| View test failures | `grep "❌" test.log` |
| View TTS errors | `grep -i "tts.*error\|503" test.log` |
| View timeouts | `grep -i "timeout" test.log` |
| Compare runs | `diff <(grep "❌" before.log) <(grep "❌" after.log)` |

---

## ✅ Summary

**The Complete Workflow:**

```bash
# 1. Test
python3 scripts/nurse_assistant_tester.py --headless 2>&1 | tee test.log

# 2. Extract
./scripts/extract_errors.sh test.log

# 3. Review
cat errors_for_llm.txt

# 4. Send to LLM (copy-paste with context)

# 5. Apply fix
nano server_qwen.py  # Apply LLM's suggested fix

# 6. Verify
python3 scripts/nurse_assistant_tester.py --headless 2>&1 | tee test_fixed.log

# 7. Compare
diff <(grep "❌" test.log) <(grep "❌" test_fixed.log)
```

**Time Investment:**
- Initial setup: 5 minutes (one time)
- Per debugging session: 5-10 minutes
- Savings: Hours of manual debugging

**Success Rate:**
- Simple issues: 95% fixed in one iteration
- Complex issues: 2-3 iterations needed
- Edge cases: May need human analysis

---

Happy debugging! 🤖✨

For detailed guide, see: `LLM_LOG_ANALYSIS_GUIDE.md`
