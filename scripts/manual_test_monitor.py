#!/usr/bin/env python3
"""
智能按摩護理助手 - 手動測試調試監視器
Manual Testing Debug Monitor

功能：
- 啟動 server_qwen.py 並捕獲所有日誌
- 打開瀏覽器供手動測試
- 實時顯示 Server、Browser、ASR、TTS 的所有調試信息
- 按 Ctrl+C 停止

使用：
    python3 scripts/manual_test_monitor.py
    python3 scripts/manual_test_monitor.py --filter asr,tts  # 只顯示 ASR 和 TTS
"""

import subprocess
import threading
import time
import sys
import os
import argparse
import signal
from playwright.sync_api import sync_playwright
from datetime import datetime

class DebugMonitor:
    def __init__(self, log_filter=None):
        self.server_process = None
        self.browser = None
        self.context = None
        self.page = None
        self.running = True
        self.log_filter = log_filter or []

        # ANSI color codes
        self.COLORS = {
            'SERVER': '\033[94m',      # Blue
            'BROWSER': '\033[92m',     # Green
            'ASR': '\033[93m',         # Yellow
            'TTS': '\033[95m',         # Magenta
            'ERROR': '\033[91m',       # Red
            'WARNING': '\033[93m',     # Yellow
            'RESET': '\033[0m',        # Reset
            'BOLD': '\033[1m',         # Bold
        }

        print(f"{self.COLORS['BOLD']}{'=' * 80}{self.COLORS['RESET']}")
        print(f"{self.COLORS['BOLD']}🔍 智能按摩護理助手 - 手動測試調試監視器{self.COLORS['RESET']}")
        print(f"{self.COLORS['BOLD']}{'=' * 80}{self.COLORS['RESET']}")
        print()
        print("📋 功能說明:")
        print("  • 自動啟動 server_qwen.py 後端服務器")
        print("  • 打開瀏覽器視窗供您手動測試")
        print("  • 實時顯示所有調試日誌（Server、Browser、ASR、TTS）")
        print("  • 按 Ctrl+C 停止監視器")
        print()

        if self.log_filter:
            print(f"🔍 日誌過濾: 只顯示 {', '.join(self.log_filter).upper()}")
            print()

        print(f"{self.COLORS['BOLD']}{'-' * 80}{self.COLORS['RESET']}")
        print()

    def should_log(self, category):
        """檢查是否應該記錄此類別的日誌"""
        if not self.log_filter:
            return True
        return category.lower() in self.log_filter

    def colorize(self, category, message):
        """為日誌添加顏色"""
        color = self.COLORS.get(category, self.COLORS['RESET'])
        return f"{color}{message}{self.COLORS['RESET']}"

    def log(self, category, message):
        """統一的日誌輸出格式"""
        if not self.should_log(category):
            return

        timestamp = datetime.now().strftime("%H:%M:%S.%f")[:-3]
        category_colored = self.colorize(category, f"[{category}]")
        print(f"{category_colored} [{timestamp}] {message}")
        sys.stdout.flush()

    def start_server(self):
        """啟動 Flask 服務器並監控輸出"""
        print(f"{self.COLORS['BOLD']}🚀 正在啟動 server_qwen.py...{self.COLORS['RESET']}")

        # Determine the correct path to server_qwen.py
        # Script can be run from project root or from scripts/ directory
        script_dir = os.path.dirname(os.path.abspath(__file__))
        project_root = os.path.dirname(script_dir)

        # Try to find server_qwen.py
        server_path = None
        if os.path.exists(os.path.join(project_root, 'server_qwen.py')):
            server_path = os.path.join(project_root, 'server_qwen.py')
            cwd = project_root
        elif os.path.exists('server_qwen.py'):
            server_path = 'server_qwen.py'
            cwd = os.getcwd()
        else:
            print(f"{self.COLORS['ERROR']}❌ 找不到 server_qwen.py{self.COLORS['RESET']}")
            print(f"   請從項目根目錄運行此腳本:")
            print(f"   cd ~/ai_nurse_chatbot/chatbot_2210")
            print(f"   python3 scripts/manual_test_monitor.py")
            sys.exit(1)

        print(f"   服務器路徑: {server_path}")
        print(f"   工作目錄: {cwd}")

        self.server_process = subprocess.Popen(
            ['python3', server_path],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
            cwd=cwd
        )

        # 監控 stdout
        threading.Thread(target=self._monitor_server_output, daemon=True).start()
        # 監控 stderr
        threading.Thread(target=self._monitor_server_errors, daemon=True).start()

        print(f"{self.COLORS['BOLD']}⏳ 等待服務器啟動...{self.COLORS['RESET']}")

        # Wait for server to be ready by checking if it's listening
        max_wait = 30
        for i in range(max_wait):
            time.sleep(1)
            try:
                import socket
                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                sock.settimeout(1)
                result = sock.connect_ex(('127.0.0.1', 5000))
                sock.close()
                if result == 0:
                    print(f"{self.COLORS['BOLD']}✅ 服務器已就緒 (端口 5000 可用){self.COLORS['RESET']}")
                    time.sleep(2)  # Extra time for full initialization
                    print()
                    return
            except:
                pass

            if i % 5 == 0:
                print(f"   等待中... ({i}/{max_wait}秒)")

        print(f"{self.COLORS['WARNING']}⚠️ 服務器啟動超時，但繼續嘗試...{self.COLORS['RESET']}")
        print()

    def _monitor_server_output(self):
        """監控服務器 stdout"""
        for line in iter(self.server_process.stdout.readline, ''):
            if not line or not self.running:
                break

            line = line.strip()
            if not line:
                continue

            # 分類日誌
            if 'ASR' in line or 'speech' in line.lower() or 'transcript' in line.lower():
                self.log('ASR', line)
            elif 'TTS' in line or 'audio' in line.lower() or 'synthesis' in line.lower():
                self.log('TTS', line)
            else:
                self.log('SERVER', line)

    def _monitor_server_errors(self):
        """監控服務器 stderr"""
        for line in iter(self.server_process.stderr.readline, ''):
            if not line or not self.running:
                break

            line = line.strip()
            if not line:
                continue

            # 過濾掉一些噪音日誌
            if 'INFO:werkzeug' in line or 'INFO:httpx' in line:
                continue

            # 分類日誌
            if 'ERROR' in line or 'Exception' in line or 'Traceback' in line:
                self.log('ERROR', line)
            elif 'WARNING' in line or 'WARN' in line:
                self.log('WARNING', line)
            elif 'ASR' in line or 'speech' in line.lower() or 'transcript' in line.lower():
                self.log('ASR', line)
            elif 'TTS' in line or 'audio' in line.lower() or 'synthesis' in line.lower() or 'Edge TTS' in line:
                self.log('TTS', line)
            else:
                self.log('SERVER', line)

    def open_browser(self):
        """打開瀏覽器並監控控制台"""
        print(f"{self.COLORS['BOLD']}🌐 正在打開瀏覽器...{self.COLORS['RESET']}")

        playwright = sync_playwright().start()
        self.browser = playwright.chromium.launch(
            headless=False,
            slow_mo=50  # 稍微減慢動作以便觀察
        )

        self.context = self.browser.new_context(
            ignore_https_errors=True,
            viewport={'width': 1920, 'height': 1080}
        )

        self.page = self.context.new_page()

        # 捕獲控制台消息
        def handle_console(msg):
            if not self.running:
                return

            try:
                text = msg.text
            except:
                text = str(msg)

            # 分類日誌
            if '🎤' in text or 'Consent listening' in text or 'Voice consent' in text or 'ASR' in text:
                self.log('ASR', text)
            elif '🔊' in text or 'TTS' in text or 'audio' in text.lower() or 'Stopping TTS' in text:
                self.log('TTS', text)
            elif msg.type == 'error':
                self.log('ERROR', f"[Browser Error] {text}")
            elif msg.type == 'warning':
                self.log('WARNING', f"[Browser Warning] {text}")
            else:
                self.log('BROWSER', text)

        self.page.on("console", handle_console)

        # 捕獲頁面錯誤
        def handle_page_error(error):
            if self.running:
                self.log('ERROR', f"[Page Error] {error}")

        self.page.on("pageerror", handle_page_error)

        # 導航到應用 - 使用重試邏輯
        print(f"{self.COLORS['BOLD']}📍 正在訪問 https://127.0.0.1:5000...{self.COLORS['RESET']}")

        max_retries = 3
        for attempt in range(max_retries):
            try:
                # Longer timeout and wait for load state
                self.page.goto("https://127.0.0.1:5000", wait_until="load", timeout=30000)

                # Wait for the page to be ready
                self.page.wait_for_load_state("domcontentloaded", timeout=10000)

                # Check if page has content
                body = self.page.query_selector('body')
                if body:
                    print(f"{self.COLORS['BOLD']}✅ 頁面加載成功{self.COLORS['RESET']}")

                    # Take a screenshot to verify
                    try:
                        self.page.screenshot(path="debug_page_loaded.png")
                        print(f"{self.COLORS['BOLD']}📸 調試截圖已保存: debug_page_loaded.png{self.COLORS['RESET']}")
                    except:
                        pass

                    break
                else:
                    raise Exception("頁面主體未加載")

            except Exception as e:
                if attempt < max_retries - 1:
                    print(f"{self.COLORS['WARNING']}⚠️ 頁面加載失敗 (嘗試 {attempt + 1}/{max_retries}): {e}{self.COLORS['RESET']}")
                    print(f"   等待 2 秒後重試...")
                    time.sleep(2)
                else:
                    print(f"{self.COLORS['ERROR']}❌ 頁面加載失敗: {e}{self.COLORS['RESET']}")
                    print(f"{self.COLORS['WARNING']}⚠️ 但瀏覽器仍然打開，您可以手動刷新頁面{self.COLORS['RESET']}")

        print()
        print(f"{self.COLORS['BOLD']}{'=' * 80}{self.COLORS['RESET']}")
        print(f"{self.COLORS['BOLD']}👉 瀏覽器已打開，請開始手動測試 UI{self.COLORS['RESET']}")
        print(f"{self.COLORS['BOLD']}📊 所有調試日誌將在下方實時顯示{self.COLORS['RESET']}")
        print(f"{self.COLORS['BOLD']}⏹️  按 Ctrl+C 停止監視器{self.COLORS['RESET']}")
        print(f"{self.COLORS['BOLD']}{'=' * 80}{self.COLORS['RESET']}")
        print()

    def run(self):
        """運行監視器"""
        try:
            # 啟動服務器
            self.start_server()

            # 打開瀏覽器
            self.open_browser()

            # 保持運行直到 Ctrl+C
            while self.running:
                time.sleep(0.1)

        except KeyboardInterrupt:
            print()
            print(f"{self.COLORS['BOLD']}⏹️  收到停止信號...{self.COLORS['RESET']}")
        finally:
            self.cleanup()

    def cleanup(self):
        """清理資源"""
        print()
        print(f"{self.COLORS['BOLD']}🧹 正在清理資源...{self.COLORS['RESET']}")

        self.running = False

        # 關閉瀏覽器
        if self.page:
            try:
                self.page.close()
            except:
                pass

        if self.context:
            try:
                self.context.close()
            except:
                pass

        if self.browser:
            try:
                self.browser.close()
            except:
                pass

        # 停止服務器
        if self.server_process:
            print(f"{self.COLORS['BOLD']}🛑 正在停止服務器...{self.COLORS['RESET']}")
            self.server_process.terminate()
            try:
                self.server_process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                print(f"{self.COLORS['WARNING']}⚠️ 強制終止服務器...{self.COLORS['RESET']}")
                self.server_process.kill()

        print()
        print(f"{self.COLORS['BOLD']}{'=' * 80}{self.COLORS['RESET']}")
        print(f"{self.COLORS['BOLD']}✅ 監視器已停止{self.COLORS['RESET']}")
        print(f"{self.COLORS['BOLD']}{'=' * 80}{self.COLORS['RESET']}")

def main():
    parser = argparse.ArgumentParser(
        description='智能按摩護理助手 - 手動測試調試監視器',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
使用範例:
  python3 scripts/manual_test_monitor.py              # 顯示所有日誌
  python3 scripts/manual_test_monitor.py --filter asr # 只顯示 ASR 日誌
  python3 scripts/manual_test_monitor.py --filter asr,tts # 只顯示 ASR 和 TTS

日誌類別:
  server  - 服務器日誌
  browser - 瀏覽器控制台日誌
  asr     - 語音識別日誌
  tts     - 語音合成日誌
  error   - 錯誤日誌
  warning - 警告日誌
        """
    )

    parser.add_argument('--filter', type=str, default=None,
                       help='日誌過濾器 (例如: asr,tts 或 server,browser)')

    args = parser.parse_args()

    # 解析過濾器
    log_filter = None
    if args.filter:
        log_filter = [f.strip().lower() for f in args.filter.split(',')]

    # 設置信號處理
    monitor = DebugMonitor(log_filter=log_filter)

    def signal_handler(sig, frame):
        monitor.running = False

    signal.signal(signal.SIGINT, signal_handler)

    # 運行監視器
    monitor.run()

if __name__ == "__main__":
    main()
