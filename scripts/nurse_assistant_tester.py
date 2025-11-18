#!/usr/bin/env python3
"""
智能按摩護理助手 - 自動化功能測試腳本
會自動測試 UI 上的所有按鈕和功能
支持截圖功能 - 可以在 WSL 無頭模式下"看到"測試過程
"""

import subprocess
import threading
import time
import os
import sys
import argparse
from playwright.sync_api import sync_playwright
from datetime import datetime

class NurseAssistantTester:
    def __init__(self, headless=False, test_duration=60, take_screenshots=False, slow_mode=False):
        self.server_process = None
        self.server_logs = []
        self.console_logs = []
        self.errors_detected = []
        self.test_results = []
        self.headless = headless
        self.test_duration = test_duration
        self.take_screenshots = take_screenshots
        self.slow_mode = slow_mode
        self.screenshot_dir = f"screenshots_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        self.screenshot_counter = 0

        # 創建截圖目錄
        if self.take_screenshots:
            os.makedirs(self.screenshot_dir, exist_ok=True)
            print(f"📸 截圖將保存到: {self.screenshot_dir}/")

        print("🏥 智能按摩護理助手 - 自動化測試工具")
        print("=" * 60)
        if self.headless:
            print("🖥️  無頭模式 (後台運行)")
            if self.take_screenshots:
                print("📸 截圖模式已啟用 - 可以看到測試過程")
        else:
            print("🖥️  GUI 模式 (可視化測試)")
            print("👁️  瀏覽器窗口將打開，您可以看到測試過程")
            if self.take_screenshots:
                print("📸 同時保存截圖以便回顧")
        if self.slow_mode:
            print("🐌 慢速模式已啟用 - 測試動作將放慢以便觀察")
        print(f"⏱️  測試時長: {test_duration} 秒")
        print("=" * 60 + "\n")
        
    def start_server(self):
        """啟動 Flask/Python 服務器"""
        print("🚀 正在啟動 server_qwen.py...")
        self.server_process = subprocess.Popen(
            ['python3', 'server_qwen.py'],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1
        )
        
        # 監控服務器輸出
        threading.Thread(target=self._monitor_server_output, daemon=True).start()
        threading.Thread(target=self._monitor_server_errors, daemon=True).start()
        
        print("⏳ 等待服務器啟動...")
        time.sleep(3)
        print("✅ 服務器已就緒\n")
        
    def _monitor_server_output(self):
        """監控 stdout"""
        for line in iter(self.server_process.stdout.readline, ''):
            if not line:
                break
            timestamp = datetime.now().strftime("%H:%M:%S")
            log_entry = f"[{timestamp}] [SERVER] {line.strip()}"
            print(log_entry)
            self.server_logs.append(log_entry)
            
            if any(keyword in line.lower() for keyword in ['error', 'exception', 'traceback', 'failed']):
                self.errors_detected.append(('server', log_entry))
    
    def _monitor_server_errors(self):
        """監控 stderr"""
        for line in iter(self.server_process.stderr.readline, ''):
            if not line:
                break
            timestamp = datetime.now().strftime("%H:%M:%S")
            log_entry = f"[{timestamp}] [SERVER STDERR] {line.strip()}"
            print(log_entry)
            self.server_logs.append(log_entry)
            
            line_lower = line.lower()
            if any(keyword in line_lower for keyword in ['error', 'warning', 'critical', 'exception', 'traceback', 'failed']) \
               and 'info:' not in line_lower and 'debug:' not in line_lower:
                self.errors_detected.append(('server', log_entry))
    
    def wait(self, seconds):
        """智能等待 - 在慢速模式下延長等待時間以便觀察"""
        if self.slow_mode:
            time.sleep(seconds * 2)  # 慢速模式下等待時間加倍
        else:
            time.sleep(seconds)

    def take_screenshot(self, page, name):
        """截圖功能 - 在 WSL 無頭模式下可以"看到"測試過程"""
        if self.take_screenshots:
            try:
                self.screenshot_counter += 1
                timestamp = datetime.now().strftime('%H%M%S')
                filename = f"{self.screenshot_dir}/{self.screenshot_counter:02d}_{timestamp}_{name}.png"
                page.screenshot(path=filename, full_page=True)
                print(f"   📸 截圖已保存: {filename}")
            except Exception as e:
                print(f"   ⚠️ 截圖失敗: {e}")
    
    def test_feature(self, name, func):
        """執行單個功能測試"""
        print(f"\n🧪 測試: {name}")
        try:
            func()
            self.test_results.append((name, '✅ 通過', None))
            print(f"   ✅ {name} - 測試通過")
            return True
        except Exception as e:
            error_msg = str(e)
            self.test_results.append((name, '❌ 失敗', error_msg))
            self.errors_detected.append(('test', f"{name}: {error_msg}"))
            print(f"   ❌ {name} - 測試失敗: {error_msg}")
            return False
    
    def run_comprehensive_tests(self, page):
        """運行全面的功能測試"""
        print("\n" + "=" * 60)
        print("🤖 開始自動化功能測試")
        print("=" * 60)

        # 等待頁面完全加載
        time.sleep(2)
        self.take_screenshot(page, "initial_page")

        # ========== 重要: 關閉音頻解鎖overlay ==========
        print("\n🔊 檢查並關閉音頻解鎖overlay...")
        try:
            unlock_btn = page.query_selector('#audioUnlockConfirmBtn')
            if unlock_btn and unlock_btn.is_visible():
                print("   ✅ 發現音頻解鎖overlay，正在點擊確認按鈕...")
                unlock_btn.click()
                time.sleep(1)
                print("   ✅ 音頻解鎖overlay已關閉")
                self.take_screenshot(page, "after_audio_unlock")
            else:
                print("   ℹ️  未發現音頻解鎖overlay（可能已自動解鎖）")
        except Exception as e:
            print(f"   ⚠️ 處理音頻解鎖overlay時出錯: {e}")
        
        # ========== 測試 1: 設置按鈕 ==========
        def test_settings_button():
            settings_btn = page.query_selector('#settingsBtn')
            if settings_btn and settings_btn.is_visible():
                settings_btn.click()
                time.sleep(1)
                self.take_screenshot(page, "settings_opened")
                # 檢查設置面板是否打開
                settings_panel = page.query_selector('#settingsPanel')
                if settings_panel and settings_panel.is_visible():
                    print("   📋 設置面板已打開")
                    # 關閉面板
                    page.keyboard.press('Escape')
                    time.sleep(0.5)
                else:
                    raise Exception("設置面板未打開")
            else:
                raise Exception("找不到設置按鈕")
        
        self.test_feature("設置按鈕", test_settings_button)
        
        # ========== 測試 2: 快速參數選擇 ==========
        def test_quick_params():
            # 選擇部位
            body_part = page.query_selector('#bodyPartSelect')
            if body_part:
                body_part.select_option('肩膀')
                time.sleep(0.5)
                print("   🎯 已選擇部位: 肩膀")
            
            # 選擇動作
            action = page.query_selector('#actionSelect')
            if action:
                action.select_option('按揉')
                time.sleep(0.5)
                print("   💆 已選擇動作: 按揉")
            
            # 選擇力度
            intensity = page.query_selector('#intensitySelect')
            if intensity:
                intensity.select_option('適中')
                time.sleep(0.5)
                print("   💪 已選擇力度: 適中")
            
            # 選擇時長
            duration = page.query_selector('#durationSelect')
            if duration:
                duration.select_option('3')
                time.sleep(0.5)
                print("   ⏱️ 已選擇時長: 3分鐘")
            
            self.take_screenshot(page, "quick_params_selected")
        
        self.test_feature("快速參數選擇", test_quick_params)
        
        # ========== 測試 3: 快速方案按鈕 ==========
        def test_quick_preset():
            preset_btn = page.query_selector('#quickPresetBtn')
            if preset_btn and preset_btn.is_visible():
                preset_btn.click()
                time.sleep(1)
                self.take_screenshot(page, "quick_preset_clicked")
                print("   ⚡ 快速方案已觸發")

                # 🔧 FIX: Close the modal to prevent blocking subsequent tests
                close_btn = page.query_selector('#closePresetModal')
                if close_btn and close_btn.is_visible():
                    close_btn.click()
                    time.sleep(0.5)
                    print("   ✅ 快速方案彈窗已關閉")
                else:
                    # Try clicking the overlay to close
                    print("   ⚠️ 找不到關閉按鈕，嘗試點擊背景關閉")
                    page.keyboard.press('Escape')
                    time.sleep(0.5)
            else:
                raise Exception("找不到快速方案按鈕")

        self.test_feature("快速方案", test_quick_preset)
        
        # ========== 測試 4: 執行按鈕 ==========
        def test_execute_button():
            execute_btn = page.query_selector('#executeManualBtn')
            if execute_btn and execute_btn.is_visible():
                execute_btn.click()
                time.sleep(2)
                self.take_screenshot(page, "execute_clicked")
                print("   ▶️ 執行按鈕已點擊")
                # 檢查是否有響應
                response_box = page.query_selector('#responseBox')
                if response_box:
                    content = response_box.inner_text()
                    print(f"   📝 響應內容: {content[:50]}...")
            else:
                raise Exception("找不到執行按鈕")
        
        self.test_feature("執行按鈕", test_execute_button)
        
        # ========== 測試 5: 語音識別選擇 ==========
        def test_asr_selection():
            settings_btn = page.query_selector('#settingsBtn')
            if settings_btn:
                settings_btn.click()
                time.sleep(1)
                
                asr_select = page.query_selector('#asrModeSelect')
                if asr_select:
                    # 測試不同的 ASR 模式
                    for mode in ['browser', 'funasr', 'whisper']:
                        try:
                            asr_select.select_option(mode)
                            time.sleep(0.5)
                            print(f"   🎤 已切換到 ASR 模式: {mode}")
                        except:
                            print(f"   ⚠️ 模式 {mode} 不可用")
                    
                    self.take_screenshot(page, "asr_selection")
                
                page.keyboard.press('Escape')
                time.sleep(0.5)
        
        self.test_feature("語音識別模式切換", test_asr_selection)
        
        # ========== 測試 6: 知識庫按鈕 ==========
        def test_knowledge_base():
            kb_btn = page.query_selector('#knowledgeBtn')
            if kb_btn and kb_btn.is_visible():
                kb_btn.click()
                time.sleep(1)
                self.take_screenshot(page, "knowledge_panel_opened")
                print("   📚 知識庫面板已打開")
                
                # 檢查知識庫面板
                kb_panel = page.query_selector('#knowledgePanel')
                if kb_panel and kb_panel.is_visible():
                    print("   ✅ 知識庫面板顯示正常")
                    # 關閉面板
                    close_btn = page.query_selector('#closeKnowledge')
                    if close_btn:
                        close_btn.click()
                        time.sleep(0.5)
            else:
                print("   ⚠️ 知識庫按鈕不可見")
        
        self.test_feature("知識庫管理", test_knowledge_base)
        
        # ========== 測試 7: 刷新統計按鈕 ==========
        def test_refresh_stats():
            settings_btn = page.query_selector('#settingsBtn')
            if settings_btn:
                settings_btn.click()
                time.sleep(1)
                
                refresh_btn = page.query_selector('#refreshStatsBtn')
                if refresh_btn and refresh_btn.is_visible():
                    refresh_btn.click()
                    time.sleep(1)
                    self.take_screenshot(page, "stats_refreshed")
                    print("   🔄 統計數據已刷新")
                
                page.keyboard.press('Escape')
                time.sleep(0.5)
        
        self.test_feature("刷新統計", test_refresh_stats)
        
        # ========== 測試 8: 測試系統按鈕 ==========
        def test_system_button():
            settings_btn = page.query_selector('#settingsBtn')
            if settings_btn:
                settings_btn.click()
                time.sleep(1)
                
                test_btn = page.query_selector('#testSystemBtn')
                if test_btn and test_btn.is_visible():
                    test_btn.click()
                    time.sleep(2)
                    self.take_screenshot(page, "system_test_triggered")
                    print("   🎪 系統測試已觸發")
                
                page.keyboard.press('Escape')
                time.sleep(0.5)
        
        self.test_feature("系統測試", test_system_button)
        
        # ========== 測試 9: 調試模式切換 ==========
        def test_debug_mode():
            settings_btn = page.query_selector('#settingsBtn')
            if settings_btn:
                settings_btn.click()
                time.sleep(1)
                
                debug_checkbox = page.query_selector('#debugMode')
                if debug_checkbox:
                    # 切換調試模式
                    debug_checkbox.check()
                    time.sleep(0.5)
                    self.take_screenshot(page, "debug_enabled")
                    print("   🔧 調試模式已啟用")
                    
                    debug_checkbox.uncheck()
                    time.sleep(0.5)
                    print("   🔧 調試模式已關閉")
                
                page.keyboard.press('Escape')
                time.sleep(0.5)
        
        self.test_feature("調試模式切換", test_debug_mode)
        
        # ========== 測試 10: 滑動條控制 ==========
        def test_sliders():
            settings_btn = page.query_selector('#settingsBtn')
            if settings_btn:
                settings_btn.click()
                time.sleep(1)
                
                # 測試信心延遲滑動條
                confidence_slider = page.query_selector('#confidenceTimeoutSlider')
                if confidence_slider:
                    confidence_slider.fill('1200')
                    time.sleep(0.5)
                    print("   🎚️ 信心延遲已設置為 1200ms")
                
                # 測試靜音超時滑動條
                silence_slider = page.query_selector('#silenceThresholdSlider')
                if silence_slider:
                    silence_slider.fill('2000')
                    time.sleep(0.5)
                    print("   🎚️ 靜音超時已設置為 2000ms")
                
                self.take_screenshot(page, "sliders_adjusted")
                page.keyboard.press('Escape')
                time.sleep(0.5)
        
        self.test_feature("滑動條控制", test_sliders)
        
        # ========== 測試 11: 喚醒詞切換 ==========
        def test_wake_word():
            settings_btn = page.query_selector('#settingsBtn')
            if settings_btn:
                settings_btn.click()
                time.sleep(1)
                
                wake_word_toggle = page.query_selector('#wakeWordToggle')
                if wake_word_toggle:
                    # 切換喚醒詞
                    is_checked = wake_word_toggle.is_checked()
                    if is_checked:
                        wake_word_toggle.uncheck()
                        time.sleep(0.5)
                        print("   🦊 喚醒詞已關閉")
                    
                    wake_word_toggle.check()
                    time.sleep(0.5)
                    self.take_screenshot(page, "wake_word_enabled")
                    print("   🦊 喚醒詞已啟用")
                
                page.keyboard.press('Escape')
                time.sleep(0.5)
        
        self.test_feature("喚醒詞功能", test_wake_word)
        
        # ========== 測試 12: 各種按鈕可見性 ==========
        def test_button_visibility():
            buttons = {
                '#startBtn': '開始錄音',
                '#stopBtn': '停止錄音',
                '#clearChatBtn': '清除對話',
                '#manualBtn': '手動輸入',
                '#calibrateMicBtn': '校準麥克風',
                '#restartWakeWordBtn': '重啟喚醒詞'
            }
            
            visible_count = 0
            for selector, name in buttons.items():
                btn = page.query_selector(selector)
                if btn:
                    is_visible = btn.is_visible()
                    print(f"   {'✅' if is_visible else '⚠️'} {name}: {'可見' if is_visible else '隱藏'}")
                    if is_visible:
                        visible_count += 1
            
            print(f"   📊 {visible_count}/{len(buttons)} 個按鈕可見")
            self.take_screenshot(page, "button_visibility_check")
        
        self.test_feature("按鈕可見性檢查", test_button_visibility)

        # ========== 測試 13: Together API 通用問題測試 ==========
        def test_together_api_general():
            # 先打開設置選擇 Together 模型
            settings_btn = page.query_selector('#settingsBtn')
            if settings_btn:
                settings_btn.click()
                time.sleep(1)

                model_select = page.query_selector('#modelSelect')
                if model_select:
                    model_select.select_option('together-mixtral')
                    time.sleep(1)
                    print("   🤖 已選擇 Together Mixtral 模型")

                page.keyboard.press('Escape')
                time.sleep(1)

            # 輸入非按摩相關的問題
            user_input = page.query_selector('#userInput')
            if user_input:
                test_question = "紅樓夢作者是誰"
                user_input.fill(test_question)
                time.sleep(0.5)
                print(f"   📝 輸入測試問題: {test_question}")

                # 點擊發送按鈕
                send_btn = page.query_selector('#sendButton')
                if send_btn and send_btn.is_visible():
                    send_btn.click()
                    print("   📤 已發送問題")

                    # 等待響應
                    time.sleep(5)
                    self.take_screenshot(page, "together_api_response")

                    # 檢查響應
                    response_box = page.query_selector('#responseBox')
                    if response_box:
                        content = response_box.inner_text()
                        print(f"   💬 收到響應: {content[:100]}...")

                        if len(content) > 0 and '思考' not in content:
                            print("   ✅ Together API 正常響應")
                        else:
                            raise Exception(f"Together API 響應異常: {content}")
                    else:
                        raise Exception("找不到響應框")
                else:
                    raise Exception("找不到發送按鈕")
            else:
                raise Exception("找不到輸入框")

        self.test_feature("Together API 通用問題", test_together_api_general)

        # ========== 測試 14: 按摩任務 UI 顯示測試 ==========
        def test_massage_task_ui():
            # 輸入按摩指令
            user_input = page.query_selector('#userInput')
            if user_input:
                massage_command = "幫我按摩肩膀10分鐘"
                user_input.fill(massage_command)
                time.sleep(0.5)
                print(f"   📝 輸入按摩指令: {massage_command}")

                # 點擊發送按鈕
                send_btn = page.query_selector('#sendButton')
                if send_btn and send_btn.is_visible():
                    send_btn.click()
                    print("   📤 已發送按摩指令")

                    # 等待響應
                    time.sleep(3)
                    self.take_screenshot(page, "massage_task_ui")

                    # 檢查響應框是否顯示任務詳情
                    response_box = page.query_selector('#responseBox')
                    if response_box:
                        content = response_box.inner_html()
                        print(f"   💬 響應內容預覽: {content[:200]}...")

                        # 檢查是否包含任務詳情關鍵字
                        has_task_details = any(keyword in content for keyword in [
                            '收到按摩指令', '部位', '動作', '力度', '時長'
                        ])

                        if has_task_details:
                            print("   ✅ UI 顯示任務詳情卡片")
                        elif '思考' in content:
                            raise Exception("UI 仍然顯示'思考中'而非任務詳情")
                        else:
                            print(f"   ⚠️ 可能顯示同意提示或其他內容")
                    else:
                        raise Exception("找不到響應框")
                else:
                    raise Exception("找不到發送按鈕")
            else:
                raise Exception("找不到輸入框")

        self.test_feature("按摩任務 UI 顯示", test_massage_task_ui)

        # ========== 測試 15: 停止任務 -> 創建新任務 -> 停止任務流程 (含快速測試) ==========
        def test_stop_create_stop_workflow():
            print("   🔄 開始測試停止-創建-停止工作流程...")

            # Step 1: 創建第一個按摩任務
            user_input = page.query_selector('#userInput')
            if user_input:
                massage_command_1 = "幫我按摩背部5分鐘"
                user_input.fill(massage_command_1)
                time.sleep(0.5)
                print(f"   📝 [任務1] 輸入按摩指令: {massage_command_1}")

                send_btn = page.query_selector('#sendButton')
                if send_btn and send_btn.is_visible():
                    send_btn.click()
                    print("   📤 [任務1] 已發送按摩指令")
                    time.sleep(2)

                    # 🔧 FIX: Handle consent prompt
                    consent_btn = page.query_selector('[data-action="agree"]')
                    if consent_btn and consent_btn.is_visible():
                        print("   ✅ [任務1] 檢測到同意提示，點擊確認...")
                        consent_btn.click()
                        time.sleep(1.5)  # Wait for consent processing

                    self.take_screenshot(page, "workflow_task1_created")

                    # 檢查任務是否創建
                    response_box = page.query_selector('#responseBox')
                    if response_box:
                        content = response_box.inner_html()
                        if any(keyword in content for keyword in ['收到按摩指令', '部位', '動作']):
                            print("   ✅ [任務1] 任務創建成功")
                        else:
                            print(f"   ⚠️ [任務1] 響應內容: {content[:100]}...")

            # Step 2: 停止第一個任務
            time.sleep(1)
            print("   🛑 [任務1] 準備停止任務...")
            stop_btn = page.query_selector('#stopTaskBtn')
            if stop_btn and stop_btn.is_visible():
                stop_btn.click()
                print("   🛑 [任務1] 點擊停止按鈕")
                time.sleep(2)
                self.take_screenshot(page, "workflow_task1_stopped")

                # 檢查停止響應
                response_box = page.query_selector('#responseBox')
                if response_box:
                    content = response_box.inner_text()
                    print(f"   📝 [任務1] 停止後響應: {content[:80]}...")
                    if '已停止' in content or '取消' in content or '終止' in content:
                        print("   ✅ [任務1] 任務已成功停止")
                    else:
                        print("   ⚠️ [任務1] 停止響應未確認")
            else:
                print("   ⚠️ [任務1] 找不到停止按鈕或按鈕不可見")

            # Step 3: 創建第二個按摩任務
            time.sleep(2)
            print("   🔄 [任務2] 創建新任務...")
            user_input = page.query_selector('#userInput')
            if user_input:
                massage_command_2 = "幫我按摩頸部8分鐘"
                user_input.fill(massage_command_2)
                time.sleep(0.5)
                print(f"   📝 [任務2] 輸入新按摩指令: {massage_command_2}")

                send_btn = page.query_selector('#sendButton')
                if send_btn and send_btn.is_visible():
                    send_btn.click()
                    print("   📤 [任務2] 已發送新按摩指令")
                    time.sleep(2)

                    # 🔧 FIX: Handle consent prompt
                    consent_btn = page.query_selector('[data-action="agree"]')
                    if consent_btn and consent_btn.is_visible():
                        print("   ✅ [任務2] 檢測到同意提示，點擊確認...")
                        consent_btn.click()
                        time.sleep(1.5)  # Wait for consent processing

                    self.take_screenshot(page, "workflow_task2_created")

                    # 檢查新任務是否創建
                    response_box = page.query_selector('#responseBox')
                    if response_box:
                        content = response_box.inner_html()
                        if any(keyword in content for keyword in ['收到按摩指令', '部位', '動作']):
                            print("   ✅ [任務2] 新任務創建成功")
                        else:
                            print(f"   ⚠️ [任務2] 響應內容: {content[:100]}...")

            # Step 4: 停止第二個任務
            time.sleep(1)
            print("   🛑 [任務2] 準備停止新任務...")
            stop_btn = page.query_selector('#stopTaskBtn')
            if stop_btn and stop_btn.is_visible():
                stop_btn.click()
                print("   🛑 [任務2] 點擊停止按鈕")
                time.sleep(2)
                self.take_screenshot(page, "workflow_task2_stopped")

                # 檢查停止響應
                response_box = page.query_selector('#responseBox')
                if response_box:
                    content = response_box.inner_text()
                    print(f"   📝 [任務2] 停止後響應: {content[:80]}...")
                    if '已停止' in content or '取消' in content or '終止' in content:
                        print("   ✅ [任務2] 新任務已成功停止")
                    else:
                        print("   ⚠️ [任務2] 停止響應未確認")
            else:
                print("   ⚠️ [任務2] 找不到停止按鈕或按鈕不可見")

            # Step 5: 🔥 RAPID TEST - 測試快速停止再開始（模擬競爭條件）
            print("\n   ⚡ [快速測試] 測試快速停止-開始場景...")
            time.sleep(1)

            # 創建第三個任務
            user_input = page.query_selector('#userInput')
            if user_input:
                massage_command_3 = "幫我按摩肩膀3分鐘"
                user_input.fill(massage_command_3)
                time.sleep(0.3)

                send_btn = page.query_selector('#sendButton')
                if send_btn and send_btn.is_visible():
                    send_btn.click()
                    print("   📤 [快速測試] 任務3已發送")
                    time.sleep(1)

                    # 🔧 FIX: Handle consent prompt
                    consent_btn = page.query_selector('[data-action="agree"]')
                    if consent_btn and consent_btn.is_visible():
                        print("   ✅ [快速測試] 檢測到同意提示，點擊確認...")
                        consent_btn.click()
                        time.sleep(0.8)  # Shorter wait for rapid test

                    # 立即停止（不等待完全載入）
                    stop_btn = page.query_selector('#stopTaskBtn')
                    if stop_btn and stop_btn.is_visible():
                        stop_btn.click()
                        print("   🛑 [快速測試] 立即停止任務3")

                        # 只等0.5秒就創建新任務（測試競爭條件）
                        time.sleep(0.5)

                        # 嘗試立即創建第四個任務
                        massage_command_4 = "幫我按摩腰部2分鐘"
                        user_input.fill(massage_command_4)
                        time.sleep(0.3)
                        send_btn.click()
                        print("   📤 [快速測試] 任務4已發送（快速切換）")
                        time.sleep(2)

                        # 檢查是否出現錯誤或正確阻止
                        response_box = page.query_selector('#responseBox')
                        if response_box:
                            content = response_box.inner_text()
                            if '已經有按摩任務進行中' in content:
                                print("   ✅ [快速測試] 正確阻止了快速切換（競爭條件已修復）")
                            elif any(keyword in content for keyword in ['收到按摩指令', '部位']):
                                print("   ✅ [快速測試] 成功創建新任務（舊任務已清理）")
                            else:
                                print(f"   ⚠️ [快速測試] 響應: {content[:100]}...")

                        self.take_screenshot(page, "workflow_rapid_test")

            print("   🎯 停止-創建-停止工作流程測試完成（含快速測試）")

        self.test_feature("停止-創建-停止任務流程", test_stop_create_stop_workflow)

        # ========== 測試 16: TTS 重疊問題測試 ==========
        def test_tts_overlap():
            """
            測試 TTS 重疊問題：
            1. 快速發送多條消息，觸發 TTS
            2. 檢查是否有多個 TTS 同時播放
            3. 驗證新消息到來時，舊 TTS 是否正確停止
            """
            print("   🔊 開始測試 TTS 重疊問題...")

            # 清空之前的 console logs
            initial_log_count = len(self.console_logs)

            # Step 1: 發送第一條消息
            user_input = page.query_selector('#userInput')
            if user_input:
                # 發送第一條較長的消息（會有較長的 TTS）
                message_1 = "你好，今天天氣怎麼樣？氣溫是多少度？"
                user_input.fill(message_1)
                time.sleep(0.3)
                print(f"   📝 [消息1] 輸入: {message_1}")

                send_btn = page.query_selector('#sendButton')
                if send_btn and send_btn.is_visible():
                    send_btn.click()
                    print("   📤 [消息1] 已發送")
                    time.sleep(1.5)  # 等待 TTS 開始

                    # 檢查 TTS 是否開始
                    speaking_indicator = page.query_selector('#speakingIndicator')
                    if speaking_indicator and speaking_indicator.is_visible():
                        print("   ✅ [消息1] TTS 開始播放（說話指示器可見）")

                    self.take_screenshot(page, "tts_test_message1")

            # Step 2: 快速發送第二條消息（測試是否停止第一條 TTS）
            time.sleep(0.5)  # 短暫延遲，模擬用戶快速打斷
            print("\n   ⚡ [快速測試] 在 TTS 播放中發送新消息...")

            if user_input:
                message_2 = "停止，告訴我現在幾點？"
                user_input.fill(message_2)
                time.sleep(0.2)
                print(f"   📝 [消息2] 輸入: {message_2}")

                # 記錄發送消息2之前的日誌數量
                logs_before_send = len(self.console_logs)

                send_btn = page.query_selector('#sendButton')
                if send_btn and send_btn.is_visible():
                    send_btn.click()
                    print("   📤 [消息2] 已發送（應該停止消息1的 TTS）")
                    time.sleep(1)

                    # 檢查 console logs 中是否有停止 TTS 的記錄
                    new_logs = self.console_logs[logs_before_send:]
                    stop_tts_found = False
                    for log in new_logs:
                        if 'Stopping TTS' in log or 'Stopping audio' in log or '⏹️' in log:
                            stop_tts_found = True
                            print(f"   ✅ [消息2] 檢測到 TTS 停止信號: {log[:80]}...")
                            break

                    if stop_tts_found:
                        print("   ✅ TTS 正確停止（無重疊）")
                    else:
                        print("   ⚠️ 未檢測到 TTS 停止信號（可能發生重疊）")
                        # 檢查詳細日誌
                        print("   📋 最近的 console logs:")
                        for log in new_logs[-10:]:
                            print(f"      {log[:100]}")

                    self.take_screenshot(page, "tts_test_message2")

            # Step 3: 再次快速發送第三條消息（雙重檢查）
            time.sleep(0.3)
            print("\n   ⚡⚡ [極速測試] 再次快速發送新消息...")

            if user_input:
                message_3 = "取消"
                user_input.fill(message_3)
                time.sleep(0.2)
                print(f"   📝 [消息3] 輸入: {message_3}")

                logs_before_send_3 = len(self.console_logs)

                send_btn = page.query_selector('#sendButton')
                if send_btn and send_btn.is_visible():
                    send_btn.click()
                    print("   📤 [消息3] 已發送")
                    time.sleep(1.5)

                    # 再次檢查停止信號
                    new_logs_3 = self.console_logs[logs_before_send_3:]
                    stop_count = sum(1 for log in new_logs_3 if 'Stopping TTS' in log or 'Stopping audio' in log or '⏹️' in log)

                    print(f"   📊 檢測到 {stop_count} 次 TTS 停止信號")

                    if stop_count >= 1:
                        print("   ✅ 多次快速消息測試通過（TTS 正確停止）")
                    else:
                        print("   ⚠️ 極速測試未檢測到停止信號")

                    self.take_screenshot(page, "tts_test_message3")

            # Step 4: 驗證最終狀態
            time.sleep(2)  # 等待所有 TTS 完成

            # 檢查是否還有 TTS 在播放
            speaking_indicator = page.query_selector('#speakingIndicator')
            if speaking_indicator:
                is_visible = speaking_indicator.is_visible()
                if not is_visible:
                    print("   ✅ 最終狀態：無 TTS 播放（說話指示器已隱藏）")
                else:
                    print("   ⚠️ 最終狀態：仍有 TTS 播放中")

            # 總結測試結果
            print("\n   🎯 TTS 重疊測試完成")
            print("   📋 測試摘要:")
            print(f"      - 發送了 3 條快速消息")
            print(f"      - 檢測到的停止信號數: {stop_count if 'stop_count' in locals() else 'N/A'}")
            print(f"      - 最終 TTS 狀態: {'已停止' if not is_visible else '仍在播放'}")

            self.take_screenshot(page, "tts_test_final")

        self.test_feature("TTS 重疊問題測試", test_tts_overlap)

        # 最終截圖
        self.take_screenshot(page, "final_state")
        
        print("\n" + "=" * 60)
        print("🎉 自動化測試完成！")
        print("=" * 60)
        
        # 顯示測試結果摘要
        self._print_test_summary()
    
    def _print_test_summary(self):
        """打印測試摘要"""
        print("\n📊 測試結果摘要:")
        print("-" * 60)
        
        passed = sum(1 for _, status, _ in self.test_results if '✅' in status)
        failed = sum(1 for _, status, _ in self.test_results if '❌' in status)
        
        for name, status, error in self.test_results:
            print(f"{status} {name}")
            if error:
                print(f"     錯誤: {error}")
        
        print("-" * 60)
        print(f"總計: {len(self.test_results)} 項測試")
        print(f"✅ 通過: {passed}")
        print(f"❌ 失敗: {failed}")
        if len(self.test_results) > 0:
            print(f"成功率: {passed/len(self.test_results)*100:.1f}%")
    
    def run_browser_tests(self):
        """打開瀏覽器並運行測試"""
        print("🌐 正在打開瀏覽器...")

        with sync_playwright() as p:
            # 配置瀏覽器啟動選項
            launch_options = {
                'headless': self.headless,
            }

            # 在慢速模式下添加 slow_mo 延遲每個操作
            if self.slow_mode and not self.headless:
                launch_options['slow_mo'] = 500  # 每個操作延遲500ms
                print("   🐌 已啟用慢動作模式 (每個操作延遲500ms)")

            browser = p.chromium.launch(**launch_options)

            # 創建瀏覽器上下文，設置視口大小為最大化
            context = browser.new_context(
                ignore_https_errors=True,
                viewport={'width': 1920, 'height': 1080}
            )
            page = context.new_page()
            
            # 捕獲控制台消息
            def handle_console(msg):
                timestamp = datetime.now().strftime("%H:%M:%S")
                try:
                    text = msg.text
                except:
                    text = str(msg)
                
                log_entry = f"[{timestamp}] [BROWSER:{msg.type}] {text}"
                print(log_entry)
                self.console_logs.append(log_entry)
                
                if msg.type in ['error', 'warning']:
                    self.errors_detected.append(('browser', log_entry))
            
            page.on("console", handle_console)
            
            # 捕獲頁面錯誤
            def handle_page_error(error):
                timestamp = datetime.now().strftime("%H:%M:%S")
                log_entry = f"[{timestamp}] [PAGE ERROR] {error}"
                print(log_entry)
                self.console_logs.append(log_entry)
                self.errors_detected.append(('page', log_entry))
            
            page.on("pageerror", handle_page_error)
            
            # 導航到應用
            print("📍 正在訪問 https://127.0.0.1:5000...")
            try:
                page.goto("https://127.0.0.1:5000", wait_until="networkidle", timeout=10000)
                print("✅ 頁面加載成功\n")
            except Exception as e:
                print(f"⚠️ 頁面加載警告: {e}\n")
            
            # 運行測試
            self.run_comprehensive_tests(page)
            
            # 等待一段時間以觀察結果
            print(f"\n⏳ 保持瀏覽器打開 {self.test_duration} 秒以觀察運行情況...")
            print("   按 Ctrl+C 提前結束\n")
            
            try:
                page.wait_for_timeout(self.test_duration * 1000)
            except KeyboardInterrupt:
                print("\n⏹️ 測試被用戶中斷")
            finally:
                browser.close()
    
    def generate_report(self):
        """生成測試報告"""
        report = []
        report.append("=" * 80)
        report.append("智能按摩護理助手 - 自動化測試報告")
        report.append("=" * 80)
        report.append(f"生成時間: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        report.append(f"測試模式: {'無頭模式' if self.headless else 'GUI模式'}")
        report.append(f"測試時長: {self.test_duration} 秒")
        report.append(f"截圖功能: {'已啟用' if self.take_screenshots else '未啟用'}")
        if self.take_screenshots:
            report.append(f"截圖目錄: {self.screenshot_dir}/")
        report.append("")
        
        # 測試結果
        report.append("\n🧪 測試結果:")
        report.append("-" * 80)
        passed = sum(1 for _, status, _ in self.test_results if '✅' in status)
        failed = sum(1 for _, status, _ in self.test_results if '❌' in status)
        
        for name, status, error in self.test_results:
            report.append(f"{status} {name}")
            if error:
                report.append(f"   錯誤: {error}")
        
        report.append("")
        report.append(f"總計測試: {len(self.test_results)}")
        report.append(f"通過: {passed}")
        report.append(f"失敗: {failed}")
        if len(self.test_results) > 0:
            report.append(f"成功率: {passed/len(self.test_results)*100:.1f}%")
        
        # 錯誤摘要
        if self.errors_detected:
            report.append(f"\n🚨 檢測到 {len(self.errors_detected)} 個錯誤:")
            report.append("-" * 80)
            for source, error in self.errors_detected:
                report.append(f"[{source.upper()}] {error}")
        else:
            report.append("\n✅ 未檢測到錯誤")
        
        # 服務器日誌
        report.append("\n\n📋 服務器日誌 (最近100行):")
        report.append("-" * 80)
        if self.server_logs:
            report.extend(self.server_logs[-100:])
        else:
            report.append("無服務器日誌")
        
        # 瀏覽器控制台日誌
        report.append("\n\n🌐 瀏覽器控制台日誌 (最近100行):")
        report.append("-" * 80)
        if self.console_logs:
            report.extend(self.console_logs[-100:])
        else:
            report.append("無瀏覽器日誌")
        
        report.append("\n" + "=" * 80)
        
        # 保存報告
        filename = f"test_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"
        with open(filename, 'w', encoding='utf-8') as f:
            f.write('\n'.join(report))
        
        print(f"\n📄 測試報告已保存: {filename}")
        
        if self.take_screenshots:
            print(f"📸 截圖已保存到: {self.screenshot_dir}/")
            print(f"   在 Windows 中查看: explorer.exe {self.screenshot_dir}/")
        
        print("\n" + "=" * 60)
        print("📊 最終統計:")
        print(f"  • 服務器日誌: {len(self.server_logs)} 行")
        print(f"  • 瀏覽器日誌: {len(self.console_logs)} 行")
        print(f"  • 檢測到的錯誤: {len(self.errors_detected)}")
        print(f"  • 測試項目: {len(self.test_results)}")
        if len(self.test_results) > 0:
            print(f"  • 測試通過率: {passed/len(self.test_results)*100:.1f}%")
        if self.take_screenshots:
            print(f"  • 保存截圖: {self.screenshot_counter} 張")
        print("=" * 60 + "\n")
        
        return '\n'.join(report)
    
    def cleanup(self):
        """清理資源"""
        if self.server_process:
            print("🛑 正在停止服務器...")
            self.server_process.terminate()
            try:
                self.server_process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                print("⚠️ 強制終止服務器...")
                self.server_process.kill()

def main():
    parser = argparse.ArgumentParser(
        description='智能按摩護理助手 - 自動化功能測試工具',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
使用範例:
  python3 nurse_assistant_tester.py                          # GUI模式,測試60秒
  python3 nurse_assistant_tester.py --slow                   # GUI慢速模式(便於觀察)
  python3 nurse_assistant_tester.py --slow --screenshots    # 慢速+截圖
  python3 nurse_assistant_tester.py --headless               # 無頭模式(自動截圖)
  python3 nurse_assistant_tester.py --duration 120           # 測試120秒
  python3 nurse_assistant_tester.py --headless --duration 30 # 快速測試

推薦用法:
  GUI測試 (看UI):
    python3 nurse_assistant_tester.py --slow                 # 慢速觀察測試過程
    python3 nurse_assistant_tester.py --slow --duration 300  # 慢速+長時間測試

  WSL無頭測試:
    python3 nurse_assistant_tester.py --headless             # 後台運行+自動截圖
    explorer.exe screenshots_*/                               # 查看截圖
        """
    )
    parser.add_argument('--headless', action='store_true',
                       help='使用無頭模式 (不顯示瀏覽器窗口)')
    parser.add_argument('--duration', type=int, default=60,
                       help='測試持續時間 (秒), 默認60秒')
    parser.add_argument('--screenshots', action='store_true',
                       help='保存測試過程截圖 (無頭模式自動啟用)')
    parser.add_argument('--slow', action='store_true',
                       help='慢速模式 - 減慢測試速度以便觀察UI變化 (僅GUI模式)')

    args = parser.parse_args()

    # 無頭模式自動啟用截圖
    take_screenshots = args.screenshots or args.headless

    tester = NurseAssistantTester(
        headless=args.headless,
        test_duration=args.duration,
        take_screenshots=take_screenshots,
        slow_mode=args.slow
    )
    
    try:
        # 啟動服務器
        tester.start_server()
        
        # 運行瀏覽器測試
        tester.run_browser_tests()
        
    except Exception as e:
        print(f"❌ 錯誤: {e}")
        import traceback
        traceback.print_exc()
    finally:
        # 生成報告
        tester.generate_report()
        
        # 清理
        tester.cleanup()

if __name__ == "__main__":
    main()