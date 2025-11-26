# TTS Overlap Test - Test 16

## Purpose
Test whether the Text-to-Speech (TTS) system properly handles rapid successive messages without audio overlap.

## Test Scenario

### Problem Being Tested
When users send multiple messages in quick succession, there's a risk that:
1. Multiple TTS streams play simultaneously (audio overlap)
2. Previous TTS doesn't stop when a new message arrives
3. Audio queue becomes corrupted, causing playback issues

### Test Implementation (`nurse_assistant_tester.py` Lines 705-831)

## Test Steps

### Step 1: Send First Message (Long TTS)
```python
message_1 = "你好，今天天氣怎麼樣？氣溫是多少度？"
```
- Sends a longer message to ensure TTS takes time to complete
- Waits 1.5 seconds for TTS to start
- Checks for speaking indicator visibility
- Takes screenshot: `tts_test_message1.png`

**Expected Result**: TTS starts playing, speaking indicator becomes visible

### Step 2: Interrupt with Second Message (0.5s delay)
```python
message_2 = "停止，告訴我現在幾點？"
```
- Sends second message while first TTS is still playing
- **Critical timing**: Only 0.5 second delay (rapid interruption)
- Monitors console logs for TTS stop signals:
  - `"Stopping TTS"`
  - `"Stopping audio"`
  - `"⏹️"` (stop emoji)
- Takes screenshot: `tts_test_message2.png`

**Expected Result**:
- Console log shows "⏹️ Stopping TTS" or "⏹️ Stopping audio player"
- First TTS stops before second TTS starts
- No audio overlap

### Step 3: Extreme Rapid Test (0.3s delay)
```python
message_3 = "取消"
```
- Sends third message with even shorter delay (0.3 seconds)
- Tests extreme rapid-fire scenario
- Counts total TTS stop signals detected
- Takes screenshot: `tts_test_message3.png`

**Expected Result**:
- At least 1 stop signal detected
- Multiple rapid messages handled without overlap

### Step 4: Final State Verification
- Waits 2 seconds for all TTS to complete
- Checks speaking indicator visibility
- **Expected**: Speaking indicator hidden (no TTS playing)
- Takes screenshot: `tts_test_final.png`

## What We Monitor

### Console Logs Checked:
1. `⏹️ Stopping TTS` - From UltraFastTTSPlayer
2. `⏹️ Stopping audio player` - From OptimizedAudioPlayer
3. Any log containing stop emoji `⏹️`

### UI Elements Checked:
1. `#speakingIndicator` - Speaking indicator element
   - Should be visible when TTS is playing
   - Should be hidden when no TTS is active

### Screenshots Captured:
1. `tts_test_message1.png` - First message TTS started
2. `tts_test_message2.png` - After rapid second message
3. `tts_test_message3.png` - After extreme rapid third message
4. `tts_test_final.png` - Final state verification

## Success Criteria

### ✅ Test Passes If:
1. **Stop signals detected**: Console logs show TTS stopping when new messages arrive
2. **No overlap**: Each new message stops previous TTS before starting new one
3. **Clean final state**: Speaking indicator is hidden after all messages complete
4. **Multiple rapid messages**: System handles at least 3 rapid messages correctly

### ❌ Test Fails If:
1. **No stop signals**: Console logs don't show TTS stopping between messages
2. **Persistent speaking indicator**: Indicator still visible after waiting period
3. **Multiple TTS playing**: Evidence of concurrent audio playback

## Test Output Example

```
🧪 測試: TTS 重疊問題測試
   🔊 開始測試 TTS 重疊問題...
   📝 [消息1] 輸入: 你好，今天天氣怎麼樣？氣溫是多少度？
   📤 [消息1] 已發送
   ✅ [消息1] TTS 開始播放（說話指示器可見）

   ⚡ [快速測試] 在 TTS 播放中發送新消息...
   📝 [消息2] 輸入: 停止，告訴我現在幾點？
   📤 [消息2] 已發送（應該停止消息1的 TTS）
   ✅ [消息2] 檢測到 TTS 停止信號: ⏹️ Stopping TTS
   ✅ TTS 正確停止（無重疊）

   ⚡⚡ [極速測試] 再次快速發送新消息...
   📝 [消息3] 輸入: 取消
   📤 [消息3] 已發送
   📊 檢測到 2 次 TTS 停止信號
   ✅ 多次快速消息測試通過（TTS 正確停止）

   ✅ 最終狀態：無 TTS 播放（說話指示器已隱藏）

   🎯 TTS 重疊測試完成
   📋 測試摘要:
      - 發送了 3 條快速消息
      - 檢測到的停止信號數: 2
      - 最終 TTS 狀態: 已停止
   ✅ TTS 重疊問題測試 - 測試通過
```

## Related Code

### TTS Stop Functions in app.js:

**UltraFastTTSPlayer.stop()** (Line 453):
```javascript
console.log('⏹️ Stopping TTS');
```

**OptimizedAudioPlayer.stop()** (Line 928):
```javascript
console.log('⏹️ Stopping audio player');
```

### Speaking Indicator:
Located in response box, ID: `#speakingIndicator`
- Visible during TTS playback
- Hidden when no TTS is active

## Integration with Other Tests

This test (Test 16) is placed after:
- Test 15: Stop-Create-Stop Workflow (race condition test)

And before:
- Final screenshot and test summary

## Running the Test

```bash
# Run all tests including TTS overlap test
python3 scripts/nurse_assistant_tester.py --headless --duration 90

# The test will automatically run as Test 16
```

## Troubleshooting

### If test shows "未檢測到 TTS 停止信號":
1. Check if TTS is actually being triggered (response should have audio)
2. Verify console log capture is working
3. Ensure messages are being sent fast enough to interrupt TTS
4. Check browser console manually for stop signals

### If speaking indicator never hides:
1. TTS might be stuck in playing state
2. Check for JavaScript errors in console
3. Verify audio player cleanup code is running
4. Look for failed TTS requests (503 errors)

## Notes

- Test uses non-massage messages to avoid consent prompts
- Timing is crucial: delays are calibrated for typical TTS duration
- Test is network-dependent (relies on TTS service response time)
- Screenshots help debug timing-related issues
