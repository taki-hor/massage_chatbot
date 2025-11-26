# skill.md - AI Nurse Chatbot 工具驅動開發技能

> **目的**：讓 LLM 以標準化工具介面開發與調試本專案（app.js, index.html, server_qwen.py），可在 Ubuntu 終端啟動服務、自動化瀏覽器測試、讀取 F12 Console/Network 錯誤、模擬 UI 互動、自動修復 Bug 並記錄開發進度。

---

## 📁 檔案結構

```
ai_nurse_chatbot/
├── skill.md                          # 本文件（開發技能定義）
├── DEVELOPMENT_PROGRESS.md           # 開發進度追蹤（LLM 必讀）
├── index.html                        # 前端主頁
├── static/
│   ├── app.js                       # 前端邏輯
│   ├── styles.css                   # 樣式表
│   └── ...
├── server_qwen.py                   # 後端服務器
├── requirements.txt                 # Python 依賴
├── .env                            # 環境變數（API Keys）
├── tests/
│   ├── test_browser.py             # 瀏覽器自動化測試
│   ├── bug_tracker.py              # Bug 掃描工具
│   └── auto_debug.sh               # 一鍵調試腳本
├── artifacts/
│   ├── screenshots/                # 測試截圖
│   ├── console.log                 # Console 日誌
│   └── network.json                # Network 日誌
└── reports/
    ├── BUGLIST.md                  # Bug 清單
    └── test_results.log            # 測試結果
```

---

## 🛠️ 1. 工具介面定義（Tools API）

LLM 可調用以下標準化工具介面：

### 1.1 Shell 執行器
```json
{
  "tool": "shell.run",
  "params": {
    "cmd": "string (完整 shell 指令)",
    "cwd": "string (工作目錄，默認為 repo 根目錄)",
    "env": {"KEY": "VALUE"},
    "timeout_sec": 600
  },
  "returns": {
    "stdout": "string",
    "stderr": "string",
    "exit_code": "int"
  }
}
```

**安全閘門（CRITICAL）**：
- ❌ 禁止：`rm -rf /`, `mkfs`, `:(){ :|:& };:` (fork bomb)
- ❌ 禁止：無目錄限制的 `sudo`
- ✅ 只能在 `repo 根目錄` 內操作
- ✅ 刪除操作需明確目標路徑

### 1.2 檔案系統
```json
{
  "tool": "fs.read",
  "params": {"path": "相對路徑"},
  "returns": {"content": "string", "size": "int"}
}

{
  "tool": "fs.write",
  "params": {"path": "相對路徑", "content": "string"},
  "returns": {"success": "bool", "bytes_written": "int"}
}

{
  "tool": "fs.list",
  "params": {"path": "目錄路徑", "include_hidden": false},
  "returns": {"files": ["array of filenames"]}
}

{
  "tool": "fs.exists",
  "params": {"path": "相對路徑"},
  "returns": {"exists": "bool"}
}
```

### 1.3 瀏覽器自動化（基於 Playwright）
```json
{
  "tool": "browser.open",
  "params": {
    "url": "http://localhost:8000",
    "headless": false,
    "viewport": {"width": 1280, "height": 720}
  },
  "returns": {"page_id": "uuid"}
}

{
  "tool": "browser.console_logs",
  "params": {"page_id": "uuid", "since_timestamp": "optional"},
  "returns": {
    "logs": [
      {"level": "error|warn|info", "text": "string", "timestamp": "iso8601"}
    ]
  }
}

{
  "tool": "browser.network_logs",
  "params": {"page_id": "uuid", "filter": "failed|4xx|5xx"},
  "returns": {
    "requests": [
      {"url": "string", "status": "int", "method": "string", "error": "string"}
    ]
  }
}

{
  "tool": "browser.click",
  "params": {"page_id": "uuid", "selector": "#elementId"},
  "returns": {"success": "bool"}
}

{
  "tool": "browser.fill",
  "params": {"page_id": "uuid", "selector": "#input", "text": "content"},
  "returns": {"success": "bool"}
}

{
  "tool": "browser.screenshot",
  "params": {"page_id": "uuid", "path": "artifacts/screenshots/error.png"},
  "returns": {"path": "string"}
}

{
  "tool": "browser.evaluate",
  "params": {"page_id": "uuid", "script": "console.log(window.location)"},
  "returns": {"result": "any"}
}
```

### 1.4 進度追蹤
```json
{
  "tool": "progress.update",
  "params": {
    "task": "string (任務描述)",
    "status": "pending|in_progress|completed|failed",
    "details": "string (詳細說明)",
    "evidence": ["artifacts/screenshots/test.png"]
  }
}

{
  "tool": "progress.read",
  "returns": {
    "current_phase": "string",
    "completed_tasks": ["array"],
    "pending_tasks": ["array"],
    "blockers": ["array"]
  }
}
```

---

## 🔄 2. 標準工作流程（Workflows）

### 2.1 初始化開發環境

```python
# 1. 檢查專案結構
files = tool.fs.list("./")

# 2. 檢查必要檔案
required_files = ["index.html", "server_qwen.py", "requirements.txt"]
for file in required_files:
    if not tool.fs.exists(file):
        tool.progress.update(f"缺少檔案: {file}", "failed")
        # 建立檔案骨架（見 5.1 節）

# 3. 安裝 Python 依賴
result = tool.shell.run("pip install -r requirements.txt", timeout_sec=300)
if result.exit_code != 0:
    tool.progress.update("依賴安裝失敗", "failed", result.stderr)

# 4. 檢查環境變數
env_check = tool.fs.exists(".env")
if not env_check:
    tool.progress.update("缺少 .env 文件", "failed")
```

### 2.2 啟動服務與測試

```python
# 1. 啟動後端
result = tool.shell.run(
    "python server_qwen.py > artifacts/server.log 2>&1 &",
    cwd="."
)
tool.progress.update("後端啟動", "in_progress", f"PID: {result.stdout}")

# 等待服務就緒
time.sleep(3)

# 2. 健康檢查
health = tool.shell.run("curl -s http://localhost:8000/health")
if "healthy" in health.stdout:
    tool.progress.update("後端啟動", "completed")
else:
    tool.progress.update("後端啟動", "failed", health.stderr)
    # 讀取日誌排查錯誤
    logs = tool.fs.read("artifacts/server.log")

# 3. 啟動瀏覽器
page_id = tool.browser.open("http://localhost:8000", headless=False)

# 4. 收集 Console 錯誤
time.sleep(2)  # 等待頁面載入
console_logs = tool.browser.console_logs(page_id)
errors = [log for log in console_logs if log['level'] == 'error']

if errors:
    tool.progress.update(
        "發現 Console 錯誤",
        "failed",
        f"共 {len(errors)} 個錯誤"
    )
    # 截圖證據
    tool.browser.screenshot(page_id, "artifacts/screenshots/console_error.png")
```

### 2.3 自動化 UI 測試

```python
# 模擬用戶操作
test_cases = [
    {
        "name": "發送消息測試",
        "actions": [
            {"type": "fill", "selector": "#userInput", "text": "你好"},
            {"type": "click", "selector": "#sendBtn"},
            {"type": "wait", "duration": 2}
        ],
        "verify": {
            "selector": "#messagesArea",
            "contains": "你好"
        }
    }
]

for test in test_cases:
    tool.progress.update(f"執行測試: {test['name']}", "in_progress")
    
    for action in test['actions']:
        if action['type'] == 'fill':
            tool.browser.fill(page_id, action['selector'], action['text'])
        elif action['type'] == 'click':
            tool.browser.click(page_id, action['selector'])
        elif action['type'] == 'wait':
            time.sleep(action['duration'])
    
    # 驗證結果
    result = tool.browser.evaluate(
        page_id,
        f"document.querySelector('{test['verify']['selector']}').textContent"
    )
    
    if test['verify']['contains'] in result:
        tool.progress.update(f"測試: {test['name']}", "completed")
    else:
        tool.progress.update(f"測試: {test['name']}", "failed")
        tool.browser.screenshot(page_id, f"artifacts/screenshots/{test['name']}_failed.png")
```

---

## 🎯 3. 決策樹（Debugging Decision Tree）

### 當遇到問題時，LLM 應按此流程處理：

```
┌─────────────────────────────────────────┐
│ 1. 後端無法啟動                          │
│    → tool.fs.read("artifacts/server.log")│
│    → 解析 traceback                      │
│    → 定位錯誤行數                        │
│    → tool.fs.read(錯誤文件)              │
│    → 修正代碼                            │
│    → tool.fs.write(文件, 修正後代碼)     │
│    → 重新啟動                            │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ 2. 前端白屏 / JS 錯誤                    │
│    → tool.browser.console_logs()         │
│    → 識別錯誤類型：                      │
│       - Uncaught ReferenceError          │
│         → 檢查變數是否定義               │
│       - TypeError: Cannot read property  │
│         → 檢查物件是否存在               │
│       - CORS error                       │
│         → 檢查 server_qwen.py CORS 配置  │
│    → tool.fs.read("static/app.js")       │
│    → 修正錯誤                            │
│    → 重新載入頁面驗證                    │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ 3. API 請求失敗                          │
│    → tool.browser.network_logs(filter="failed")│
│    → 檢查：                              │
│       - 404: 端點不存在                  │
│         → 檢查 server_qwen.py 路由       │
│       - 500: 服務器錯誤                  │
│         → 讀取 server.log                │
│       - CORS: 跨域問題                   │
│         → 檢查 CORSMiddleware 配置       │
│       - Timeout: 超時                    │
│         → 檢查後端處理邏輯               │
│    → 修正對應問題                        │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ 4. 資源載入 404                          │
│    → tool.browser.network_logs(filter="404")│
│    → 檢查路徑：                          │
│       - /static/app.js → 確認文件存在    │
│       - /static/styles.css → 檢查路徑    │
│    → tool.fs.read("index.html")          │
│    → 修正 <script src="...">             │
│    → 檢查 server_qwen.py StaticFiles 配置│
└─────────────────────────────────────────┘
```

---

## 📝 4. 開發進度追蹤（DEVELOPMENT_PROGRESS.md）

### 4.1 進度文件格式

```markdown
# AI Nurse Chatbot - 開發進度追蹤

**最後更新**: 2025-10-21 14:30:00
**當前階段**: Phase 2 - 功能測試與修復

---

## 🎯 總體目標
- [ ] 後端服務穩定運行
- [ ] 前端頁面正常載入
- [ ] 核心功能（聊天、TTS）正常工作
- [ ] 無阻塞性錯誤

---

## 📊 當前狀態

### ✅ 已完成 (Completed)
- [x] 2025-10-21 14:00 - 初始化專案結構
  - 證據: `tree` 輸出顯示所有必要文件存在
  - 修改: 無

- [x] 2025-10-21 14:15 - 安裝 Python 依賴
  - 證據: `pip install` 成功，無錯誤
  - 修改: 無

### 🔄 進行中 (In Progress)
- [ ] 2025-10-21 14:20 - 修復後端 CORS 錯誤
  - 問題: Console 顯示 CORS policy 阻止請求
  - 當前操作: 檢查 `server_qwen.py` CORSMiddleware 配置
  - 阻塞因素: 無

### ⏳ 待處理 (Pending)
- [ ] 前端 UI 測試
- [ ] TTS 功能測試
- [ ] 知識庫整合測試

### ❌ 失敗/阻塞 (Blocked)
- [ ] 2025-10-21 14:10 - 後端首次啟動失敗
  - 錯誤: `ModuleNotFoundError: No module named 'fastapi'`
  - 解決方案: 安裝 requirements.txt
  - 狀態: 已解決（見「已完成」）

---

## 🐛 Bug 清單

### P0 - 阻塞性錯誤（Critical）
- 無

### P1 - 主要功能錯誤（High）
1. **CORS 錯誤阻止 API 請求**
   - 位置: `server_qwen.py` CORSMiddleware
   - 影響: 前端無法調用 `/api/chat`
   - 狀態: 調查中
   - 證據: `artifacts/screenshots/cors_error.png`

### P2 - 次要問題（Medium）
- 無

---

## 📋 測試結果

### 手動測試
| 測試項目 | 狀態 | 時間 | 備註 |
|---------|------|------|------|
| 後端啟動 | ✅ Pass | 14:15 | 健康檢查返回 200 |
| 前端載入 | ✅ Pass | 14:18 | 頁面正常顯示 |
| 發送消息 | ❌ Fail | 14:20 | CORS 錯誤 |

### 自動化測試
- 執行時間: 2025-10-21 14:25
- 結果: 1/3 通過
- 詳細報告: `reports/test_results.log`

---

## 📎 證據文件
- `artifacts/screenshots/cors_error.png` - CORS 錯誤截圖
- `artifacts/console.log` - 完整 Console 日誌
- `artifacts/server.log` - 後端服務日誌

---

## 🔍 下一步行動
1. 修復 CORS 配置（優先級: P0）
2. 重新測試 API 請求
3. 執行完整 UI 測試套件
4. 生成最終 BUGLIST.md

---

## 💡 學習與決策記錄
- **14:10** - 發現依賴未安裝，決定先執行 `pip install -r requirements.txt`
- **14:20** - CORS 錯誤出現，懷疑是 `allow_origins=["*"]` 配置問題，需要檢查 FastAPI 版本兼容性
```

### 4.2 LLM 使用進度文件的規則

1. **每次操作前必讀** `DEVELOPMENT_PROGRESS.md`
2. **每次操作後必更新**
3. **所有修改都要有證據**（截圖、日誌、diff）
4. **失敗的嘗試也要記錄**（避免重複錯誤）
5. **定期生成 BUGLIST.md 總結**

---

## 📦 5. 檔案骨架與參考實現

### 5.1 自動化測試腳本（`tests/test_browser.py`）

```python
#!/usr/bin/env python3
"""
瀏覽器自動化測試 - 基於 Playwright
用途: 自動打開頁面、收集 Console/Network 錯誤、模擬 UI 操作
"""
import asyncio
from playwright.async_api import async_playwright
import json
import os
from datetime import datetime

async def test_app():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        context = await browser.new_context()
        page = await context.new_page()
        
        # 收集日誌
        console_logs = []
        network_errors = []
        
        # 監聽 Console
        page.on("console", lambda msg: console_logs.append({
            "level": msg.type,
            "text": msg.text,
            "timestamp": datetime.now().isoformat()
        }))
        
        # 監聽頁面錯誤
        page.on("pageerror", lambda err: console_logs.append({
            "level": "error",
            "text": str(err),
            "timestamp": datetime.now().isoformat()
        }))
        
        # 監聽網絡失敗
        page.on("requestfailed", lambda req: network_errors.append({
            "url": req.url,
            "method": req.method,
            "error": req.failure
        }))
        
        try:
            print("📂 打開頁面...")
            await page.goto("http://localhost:8000")
            print("✅ 頁面載入成功")
            
            # 等待頁面完全載入
            await page.wait_for_load_state("networkidle")
            
            # 截圖
            os.makedirs("artifacts/screenshots", exist_ok=True)
            await page.screenshot(path="artifacts/screenshots/initial_load.png")
            print("📸 截圖已保存")
            
            # 測試 UI 交互
            print("\n🧪 開始 UI 測試...")
            
            # 測試 1: 輸入文字
            input_selector = "#userInput"
            if await page.query_selector(input_selector):
                await page.fill(input_selector, "測試訊息")
                print("✅ 輸入框填寫成功")
            else:
                print("❌ 找不到輸入框")
            
            # 測試 2: 點擊發送按鈕
            send_btn = "#sendBtn"
            if await page.query_selector(send_btn):
                await page.click(send_btn)
                print("✅ 發送按鈕點擊成功")
                await page.wait_for_timeout(3000)  # 等待響應
            else:
                print("❌ 找不到發送按鈕")
            
            # 檢查響應
            messages_area = "#messagesArea"
            if await page.query_selector(messages_area):
                content = await page.inner_text(messages_area)
                if "測試訊息" in content:
                    print("✅ 訊息顯示正常")
                else:
                    print("⚠️  訊息未顯示")
            
            # 保存結果
            os.makedirs("artifacts", exist_ok=True)
            with open("artifacts/console.json", "w", encoding="utf-8") as f:
                json.dump(console_logs, f, ensure_ascii=False, indent=2)
            
            with open("artifacts/network.json", "w", encoding="utf-8") as f:
                json.dump(network_errors, f, ensure_ascii=False, indent=2)
            
            # 分析錯誤
            errors = [log for log in console_logs if log['level'] == 'error']
            if errors:
                print(f"\n⚠️  發現 {len(errors)} 個 Console 錯誤:")
                for err in errors[:5]:  # 只顯示前5個
                    print(f"  - {err['text']}")
            else:
                print("\n✅ 無 Console 錯誤")
            
            if network_errors:
                print(f"\n⚠️  發現 {len(network_errors)} 個網絡錯誤:")
                for err in network_errors[:5]:
                    print(f"  - {err['url']}: {err['error']}")
            else:
                print("\n✅ 無網絡錯誤")
            
        except Exception as e:
            print(f"\n❌ 測試失敗: {e}")
            await page.screenshot(path="artifacts/screenshots/error.png")
        finally:
            await browser.close()

if __name__ == "__main__":
    asyncio.run(test_app())
```

### 5.2 一鍵調試腳本（`tests/auto_debug.sh`）

```bash
#!/bin/bash

echo "========================================="
echo "🚀 AI Nurse Chatbot - 自動化調試流程"
echo "========================================="

# 顏色定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 清理之前的進程
cleanup() {
    if [ -f .server.pid ]; then
        kill $(cat .server.pid) 2>/dev/null
        rm .server.pid
    fi
}

trap cleanup EXIT

# 1. 檢查依賴
echo -e "\n${YELLOW}1. 檢查依賴...${NC}"
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}❌ Python3 未安裝${NC}"
    exit 1
fi

if ! python3 -c "import playwright" 2>/dev/null; then
    echo -e "${YELLOW}⚠️  Playwright 未安裝，正在安裝...${NC}"
    pip3 install playwright
    playwright install chromium
fi

# 2. 啟動後端
echo -e "\n${YELLOW}2. 啟動後端服務...${NC}"
python3 server_qwen.py > artifacts/server.log 2>&1 &
echo $! > .server.pid
sleep 3

# 3. 健康檢查
echo -e "\n${YELLOW}3. 健康檢查...${NC}"
if curl -s http://localhost:8000/health > /dev/null; then
    echo -e "${GREEN}✅ 後端運行正常${NC}"
else
    echo -e "${RED}❌ 後端啟動失敗${NC}"
    cat artifacts/server.log
    exit 1
fi

# 4. 運行瀏覽器測試
echo -e "\n${YELLOW}4. 運行瀏覽器自動化測試...${NC}"
python3 tests/test_browser.py

# 5. 分析結果
echo -e "\n${YELLOW}5. 生成測試報告...${NC}"

ERROR_COUNT=$(cat artifacts/console.json | grep -o '"level": "error"' | wc -l)
NETWORK_ERROR_COUNT=$(cat artifacts/network.json | jq '. | length' 2>/dev/null || echo 0)

cat > reports/test_summary.md << EOF
# 測試摘要報告

**時間**: $(date '+%Y-%m-%d %H:%M:%S')

## 結果統計
- Console 錯誤: $ERROR_COUNT
- 網絡錯誤: $NETWORK_ERROR_COUNT

## 詳細日誌
- Console 日誌: \`artifacts/console.json\`
- 網絡日誌: \`artifacts/network.json\`
- 服務器日誌: \`artifacts/server.log\`
- 截圖: \`artifacts/screenshots/\`

## 下一步
$(if [ $ERROR_COUNT -gt 0 ] || [ $NETWORK_ERROR_COUNT -gt 0 ]; then
    echo "- [ ] 修復 Console/Network 錯誤"
    echo "- [ ] 重新運行測試"
else
    echo "- [x] 所有測試通過"
    echo "- [ ] 進入下一階段開發"
fi)
EOF

echo -e "${GREEN}✅ 報告已生成: reports/test_summary.md${NC}"

# 6. 顯示摘要
if [ $ERROR_COUNT -gt 0 ] || [ $NETWORK_ERROR_COUNT -gt 0 ]; then
    echo -e "\n${RED}⚠️  發現問題，請查看報告${NC}"
    exit 1
else
    echo -e "\n${GREEN}🎉 所有測試通過！${NC}"
    exit 0
fi
```

### 5.3 Bug 掃描工具（`tests/bug_tracker.py`）

```python
#!/usr/bin/env python3
"""
Bug 追蹤工具 - 自動掃描代碼中的 TODO/FIXME 和潛在問題
"""
import re
import os
from collections import defaultdict

def scan_file(filepath):
    """掃描單個文件"""
    issues = []
    
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            lines = f.readlines()
            
        for i, line in enumerate(lines, 1):
            # TODO/FIXME 標記
            if re.search(r'(TODO|FIXME|XXX|HACK|BUG)', line, re.IGNORECASE):
                issues.append({
                    'type': 'todo',
                    'file': filepath,
                    'line': i,
                    'content': line.strip()
                })
            
            # Console.error
            if 'console.error' in line:
                issues.append({
                    'type': 'error_handling',
                    'file': filepath,
                    'line': i,
                    'content': line.strip()
                })
            
            # 未定義變數（簡單檢測）
            if 'undefined' in line.lower() and '//' not in line:
                issues.append({
                    'type': 'undefined',
                    'file': filepath,
                    'line': i,
                    'content': line.strip()
                })
    
    except Exception as e:
        print(f"⚠️  無法讀取 {filepath}: {e}")
    
    return issues

def main():
    files_to_scan = [
        'index.html',
        'static/app.js',
        'server_qwen.py'
    ]
    
    all_issues = defaultdict(list)
    
    print("🔍 開始掃描代碼...")
    print("=" * 60)
    
    for filepath in files_to_scan:
        if os.path.exists(filepath):
            issues = scan_file(filepath)
            for issue in issues:
                all_issues[issue['type']].append(issue)
    
    # 輸出報告
    print("\n📋 掃描結果:\n")
    
    if all_issues['todo']:
        print(f"📝 待辦事項 ({len(all_issues['todo'])}):")
        for item in all_issues['todo'][:10]:  # 只顯示前10個
            print(f"  📍 {item['file']}:{item['line']}")
            print(f"     {item['content']}\n")
    
    if all_issues['error_handling']:
        print(f"⚠️  錯誤處理 ({len(all_issues['error_handling'])}):")
        for item in all_issues['error_handling'][:5]:
            print(f"  📍 {item['file']}:{item['line']}")
            print(f"     {item['content']}\n")
    
    if all_issues['undefined']:
        print(f"❓ 可能的未定義變數 ({len(all_issues['undefined'])}):")
        for item in all_issues['undefined'][:5]:
            print(f"  📍 {item['file']}:{item['line']}")
            print(f"     {item['content']}\n")
    
    # 生成 BUGLIST.md
    with open('reports/BUGLIST.md', 'w', encoding='utf-8') as f:
        f.write("# Bug 清單\n\n")
        f.write(f"**生成時間**: {os.popen('date').read().strip()}\n\n")
        
        for issue_type, items in all_issues.items():
            f.write(f"## {issue_type.upper()} ({len(items)})\n\n")
            for item in items:
                f.write(f"- [ ] `{item['file']}:{item['line']}` - {item['content']}\n")
            f.write("\n")
    
    print(f"\n✅ Bug 清單已保存到 reports/BUGLIST.md")
    print(f"📊 總計發現 {sum(len(items) for items in all_issues.values())} 個潛在問題")

if __name__ == "__main__":
    main()
```

---

## ✅ 6. 驗收標準（Definition of Done）

在宣告開發完成前，必須滿足以下條件：

### 6.1 後端服務
- [ ] `python server_qwen.py` 可成功啟動
- [ ] `/health` 端點返回 `{"status": "healthy"}`
- [ ] 無 Python traceback 錯誤
- [ ] 日誌中無 `ERROR` 級別訊息（警告可接受）

### 6.2 前端頁面
- [ ] 頁面可正常載入（無白屏）
- [ ] 無 JavaScript 錯誤（Console 乾淨）
- [ ] 無 404 資源載入錯誤
- [ ] 所有 UI 元素正確渲染

### 6.3 核心功能
- [ ] 輸入框可正常輸入
- [ ] 發送按鈕可點擊並觸發請求
- [ ] API 請求成功（無 CORS 或 500 錯誤）
- [ ] 聊天訊息正確顯示

### 6.4 文檔完整性
- [ ] `DEVELOPMENT_PROGRESS.md` 已更新
- [ ] `reports/BUGLIST.md` 已生成
- [ ] 所有證據文件已保存（截圖、日誌）
- [ ] 測試報告已生成

---

## 🎯 7. LLM 操作提示詞（Prompts）

### 7.1 System Prompt（持久化）

```
你是一個能操作工具的全端開發代理，負責開發 AI Nurse Chatbot 專案。

**核心原則**：
1. 小步快跑 - 每次只改一處，立即驗證
2. 證據驅動 - 所有決策基於實際錯誤日誌/截圖
3. 進度透明 - 每步操作更新 DEVELOPMENT_PROGRESS.md
4. 安全第一 - 遵守工具安全閘門規則

**必讀文件**（每次操作前）：
- DEVELOPMENT_PROGRESS.md（了解當前狀態）
- reports/BUGLIST.md（已知問題清單）

**工作流程**：
1. 讀取進度文件
2. 選擇下一個待處理任務
3. 使用工具執行操作
4. 收集證據（日誌/截圖）
5. 更新進度文件
6. 如遇錯誤，按決策樹處理

**禁止行為**：
- 未讀進度文件就開始操作
- 沒有證據的臆測
- 執行危險 shell 命令
- 跳過測試直接部署
```

### 7.2 開發啟動 Prompt

```
請啟動 AI Nurse Chatbot 的開發環境並完成冒煙測試：

**目標**：
1. 後端服務啟動並通過健康檢查
2. 前端頁面可正常載入
3. 發送測試訊息可得到響應
4. 生成完整的測試報告和 Bug 清單

**流程**：
1. 讀取 DEVELOPMENT_PROGRESS.md 了解當前狀態
2. 執行 tests/auto_debug.sh 自動化測試
3. 如有錯誤，按決策樹逐一修復
4. 更新進度文件記錄所有操作
5. 生成最終報告

**產出**：
- 運行中的服務（後端 + 前端）
- reports/test_summary.md
- reports/BUGLIST.md
- DEVELOPMENT_PROGRESS.md（最新狀態）
```

### 7.3 Debug Prompt

```
發現以下錯誤，請協助調試：

**錯誤描述**：
[Console Error / Network Error / Python Traceback]

**要求**：
1. 使用決策樹定位問題類型
2. 使用工具收集詳細信息（console_logs / network_logs / fs.read）
3. 提出修復方案（附帶代碼 diff）
4. 應用修復並驗證
5. 更新 DEVELOPMENT_PROGRESS.md 記錄過程
6. 如失敗，記錄失敗原因並嘗試備選方案

**禁止**：
- 直接給出未驗證的修復代碼
- 修改無關文件
- 跳過證據收集步驟
```

---

## 📚 8. 參考資料與擴展

### 8.1 快速參考
- Playwright 文檔: https://playwright.dev/python/
- FastAPI 文檔: https://fastapi.tiangolo.com/
- Edge TTS: https://github.com/rany2/edge-tts

### 8.2 常見問題

**Q: CORS 錯誤如何修復？**
A: 檢查 `server_qwen.py` 中的 `CORSMiddleware` 配置：
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 開發環境允許所有來源
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

**Q: Playwright 安裝失敗？**
A: 執行以下命令：
```bash
pip install playwright
playwright install chromium
```

**Q: 如何查看完整的後端日誌？**
A: 
```bash
tail -f artifacts/server.log
# 或
cat artifacts/server.log | grep ERROR
```

---

## 🚀 9. 快速開始

```bash
# 1. 克隆專案（如果尚未克隆）
git clone <repo-url>
cd ai_nurse_chatbot

# 2. 創建必要目錄
mkdir -p tests artifacts/{screenshots,logs} reports

# 3. 給予腳本執行權限
chmod +x tests/auto_debug.sh

# 4. 執行一鍵測試
./tests/auto_debug.sh

# 5. 查看報告
cat reports/test_summary.md
cat DEVELOPMENT_PROGRESS.md
```

---

## 📝 10. 變更歷史

| 版本 | 日期 | 變更內容 | 作者 |
|------|------|----------|------|
| 1.0.0 | 2025-10-21 | 初始版本 - 整合工具介面與實戰腳本 | LLM |

---

**END OF SKILL.MD**