# Troubleshooting: Empty Browser Page

## Problem

When running `python3 scripts/manual_test_monitor.py`, the browser opens but shows an **empty/blank page**.

---

## Quick Fix

### Step 1: Kill Existing Server

```bash
pkill -f server_qwen.py
```

### Step 2: Run Diagnostic

```bash
./scripts/diagnose_server.sh
```

This will check:
- ✅ Is port 5000 available?
- ✅ Does server start properly?
- ✅ Does server respond to HTTPS requests?

### Step 3: Try Manual Test Monitor Again

```bash
python3 scripts/manual_test_monitor.py
```

---

## Detailed Troubleshooting

### Issue 1: Server Already Running

**Symptom:**
- Script starts but page is blank
- Or error: "Address already in use"

**Check:**
```bash
lsof -i :5000
```

**Fix:**
```bash
# Kill all server_qwen.py processes
pkill -f server_qwen.py

# Or kill specific PID
kill <PID>

# Then try again
python3 scripts/manual_test_monitor.py
```

---

### Issue 2: Server Not Starting

**Symptom:**
- Browser opens but shows "ERR_CONNECTION_REFUSED"
- Or blank page with no content

**Check Server Logs:**

Start server manually to see errors:
```bash
python3 server_qwen.py
```

Look for errors like:
- Missing dependencies
- Port already in use
- SSL certificate issues
- Import errors

**Common Fixes:**

1. **Missing Dependencies:**
   ```bash
   pip3 install -r requirements.txt
   ```

2. **SSL Certificate Issues:**
   Check if `cert.pem` and `key.pem` exist:
   ```bash
   ls -la cert.pem key.pem
   ```

   If missing, regenerate:
   ```bash
   openssl req -x509 -newkey rsa:4096 -nodes -out cert.pem -keyout key.pem -days 365
   ```

3. **Server Path Not Found (FIXED in v2):**
   ```
   [SERVER] python3: can't open file 'server_qwen.py': [Errno 2] No such file or directory
   ```

   **Cause:** Script couldn't find `server_qwen.py` when run from `scripts/` directory.

   **Fix:** The monitor now automatically detects the correct path:
   - Calculates project root directory
   - Searches for `server_qwen.py` in project root
   - Sets correct working directory
   - Shows clear error if file not found

   **Status:** ✅ Fixed! The monitor now works from any directory.

---

### Issue 3: Browser Opens Too Fast

**Symptom:**
- Browser opens before server is ready
- Page is blank initially
- Refreshing the page works

**Fix:**

The updated `manual_test_monitor.py` now:
- Waits for port 5000 to be listening (up to 30 seconds)
- Retries page load up to 3 times
- Takes a screenshot (`debug_page_loaded.png`) to verify

**Manual Workaround:**

1. Wait 5-10 seconds after browser opens
2. Press `F5` to refresh the page
3. Page should load

---

### Issue 4: HTTPS Certificate Warning

**Symptom:**
- Browser shows "Your connection is not private"
- Page doesn't load automatically

**Fix:**

The script already uses `ignore_https_errors=True`, but if you see this:

1. Click "Advanced"
2. Click "Proceed to 127.0.0.1 (unsafe)"
3. Page should load

---

### Issue 5: Playwright Not Installed

**Symptom:**
- Error: "ModuleNotFoundError: No module named 'playwright'"

**Fix:**
```bash
pip3 install playwright
playwright install chromium
```

---

### Issue 6: Display Issues (WSL)

**Symptom:**
- Error: "Could not find a display"
- Running in WSL without X server

**Fix:**

**Option A: Use X Server**
1. Install VcXsrv or Xming on Windows
2. Start X server
3. In WSL:
   ```bash
   export DISPLAY=:0
   python3 scripts/manual_test_monitor.py
   ```

**Option B: Use Headless Tester Instead**

If you can't use X server, use the automated tester:
```bash
python3 scripts/nurse_assistant_tester.py --headless
```

Screenshots will be saved to `screenshots_*/` directory.

---

## Verification Steps

### Step 1: Check Server is Running

After starting the monitor, in a new terminal:

```bash
curl -k https://127.0.0.1:5000/
```

**Expected:** HTML content

**If Error:**
- Server not started yet (wait a bit)
- Server crashed (check logs)
- Port blocked by firewall

### Step 2: Check Browser Screenshot

The monitor saves `debug_page_loaded.png`. Check it:

```bash
# In WSL, open with Windows
explorer.exe debug_page_loaded.png

# Or copy to Windows
cp debug_page_loaded.png /mnt/c/Users/YourName/Desktop/
```

**What to Look For:**
- ✅ Page has UI elements (buttons, input boxes)
- ❌ Completely blank/white
- ❌ "Connection refused" error
- ❌ "Not found" error

### Step 3: Check Browser Console

In the browser window that opened:
1. Press `F12` to open DevTools
2. Go to "Console" tab
3. Look for errors (red text)

**Common Errors:**
- `Failed to load resource` → Server not responding
- `net::ERR_CONNECTION_REFUSED` → Server not started
- `Mixed Content` → HTTP/HTTPS mismatch

---

## Step-by-Step Debug Process

1. **Kill all existing servers:**
   ```bash
   pkill -f server_qwen.py
   ```

2. **Run diagnostic script:**
   ```bash
   ./scripts/diagnose_server.sh
   ```

3. **If diagnostic passes, try monitor:**
   ```bash
   python3 scripts/manual_test_monitor.py
   ```

4. **Watch terminal output:**
   - Look for: `✅ 服務器已就緒 (端口 5000 可用)`
   - Look for: `✅ 頁面加載成功`
   - Look for: `📸 調試截圖已保存`

5. **If page is blank:**
   - Wait 5 seconds
   - Press `F5` to refresh
   - Check `debug_page_loaded.png`

6. **If still blank:**
   - Check browser DevTools console (F12)
   - Check server logs in terminal
   - Try accessing https://127.0.0.1:5000 in a regular browser

---

## Alternative: Manual Testing Without Monitor

If the monitor doesn't work, you can manually start server and browser:

### Terminal 1: Start Server
```bash
python3 server_qwen.py
```

### Terminal 2: Monitor Logs
```bash
# Watch server output
tail -f server_qwen.py.log

# Or just watch the terminal where server is running
```

### Browser:
1. Open Chrome/Edge
2. Navigate to `https://127.0.0.1:5000`
3. Accept certificate warning
4. Test manually
5. Check browser console (F12) for JavaScript logs

---

## Still Having Issues?

### Collect Debug Information

1. **Server startup log:**
   ```bash
   python3 server_qwen.py > server_debug.log 2>&1
   ```

2. **Port status:**
   ```bash
   lsof -i :5000 > port_status.txt
   ```

3. **Screenshot:**
   - The `debug_page_loaded.png` file

4. **Browser console:**
   - F12 → Console tab → Right-click → "Save as..."

### Common Root Causes

| Symptom | Likely Cause | Solution |
|---------|-------------|----------|
| Blank white page | Server not started | Wait longer or restart |
| "Not Secure" warning | HTTPS certificate | Click "Proceed" |
| Connection refused | Port 5000 blocked | Check firewall |
| Page loads then crashes | JavaScript error | Check browser console |
| Monitor hangs at startup | Server won't start | Check server_debug.log |

---

## Updated Monitor Features

The `manual_test_monitor.py` has been updated with:

✅ **Better Server Detection**
- Checks if port 5000 is actually listening
- Waits up to 30 seconds for server to be ready
- Shows progress every 5 seconds

✅ **Page Load Retry**
- Tries up to 3 times to load the page
- 30-second timeout per attempt
- 2-second delay between retries

✅ **Verification Screenshot**
- Automatically saves `debug_page_loaded.png`
- Helps verify if page actually loaded
- Shows exactly what the browser sees

✅ **Better Error Messages**
- Clear indication of what failed
- Suggestion to manually refresh (F5)
- Instructions for manual recovery

---

## Success Indicators

When everything works correctly, you'll see:

```
🚀 正在啟動 server_qwen.py...
⏳ 等待服務器啟動...
✅ 服務器已就緒 (端口 5000 可用)

🌐 正在打開瀏覽器...
📍 正在訪問 https://127.0.0.1:5000...
✅ 頁面加載成功
📸 調試截圖已保存: debug_page_loaded.png

================================================================================
👉 瀏覽器已打開，請開始手動測試 UI
📊 所有調試日誌將在下方實時顯示
⏹️  按 Ctrl+C 停止監視器
================================================================================

[SERVER] [16:30:45.123] Starting Flask application...
[BROWSER] [16:30:47.456] Page loaded successfully
```

Then you can start testing manually!

---

## Quick Reference

| Command | Purpose |
|---------|---------|
| `pkill -f server_qwen.py` | Kill existing server |
| `./scripts/diagnose_server.sh` | Run diagnostics |
| `python3 scripts/manual_test_monitor.py` | Start monitor |
| `F5` | Refresh browser page |
| `F12` | Open browser DevTools |
| `Ctrl+C` | Stop monitor |
| `explorer.exe debug_page_loaded.png` | View screenshot (WSL) |

---

Need more help? Check the screenshot `debug_page_loaded.png` and browser console (F12) for specific errors!
