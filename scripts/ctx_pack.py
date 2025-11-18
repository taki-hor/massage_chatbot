#!/usr/bin/env python3
"""
LLM Context Packer - 為 LLM 打包必要的上下文
使用方法: python scripts/ctx_pack.py
"""
import re
from pathlib import Path
from datetime import datetime

def extract_sections(content, mode='context'):
    """提取標記的程式碼區塊"""
    sections = {}
    
    # 根據模式選擇要提取的標記
    if mode == 'context':
        pattern = r'# ===== LLM-CONTEXT-START: (.*?) =====\n(.*?)# ===== LLM-CONTEXT-END: \1 ====='
    elif mode == 'ref':
        pattern = r'# ===== LLM-REF-START: (.*?) =====\n(.*?)# ===== LLM-REF-END: \1 ====='
    elif mode == 'all':
        # 提取所有非 SKIP 的部分
        pattern = r'# ===== LLM-(?!SKIP).*?-START: (.*?) =====\n(.*?)# ===== LLM-.*?-END: \1 ====='
    
    matches = re.finditer(pattern, content, re.DOTALL)
    
    for match in matches:
        section_name = match.group(1)
        section_content = match.group(2)
        sections[section_name] = section_content.strip()
    
    return sections

def extract_function_signatures(content):
    """提取函數簽名"""
    signatures = []
    
    # 匹配函數定義行
    pattern = r'^(async def|def)\s+(\w+)\s*\([^)]*\).*?:'
    matches = re.finditer(pattern, content, re.MULTILINE)
    
    for match in matches:
        full_match = match.group(0)
        signatures.append(full_match)
    
    return signatures

def generate_context_file():
    """生成 LLM 上下文檔案"""
    # 讀取主檔案
    server_file = Path('server_qwen.py')
    if not server_file.exists():
        # 嘗試從 scripts 目錄的上一層找
        server_file = Path('../server_qwen.py')
        if not server_file.exists():
            print("❌ 找不到 server_qwen.py")
            print("請確保在專案根目錄執行，或將腳本放在正確位置")
            return
    
    content = server_file.read_text(encoding='utf-8')
    
    # 提取各種區塊
    context_sections = extract_sections(content, 'context')
    ref_sections = extract_sections(content, 'ref')
    
    # 生成輸出
    output = []
    output.append(f"# LLM Context - Generated at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    output.append("# 這個檔案包含了 LLM 需要的核心上下文\n")
    
    # 添加基本信息
    output.append("## 📋 專案概述")
    output.append("- 專案：小狐狸AI助手")
    output.append("- 核心功能：多模型聊天 API + TTS")
    output.append("- 穩定模型：Gemini, Together, Qwen, DeepSeek")
    output.append("- 注意：AI 模型相關代碼已穩定，請勿修改\n")
    
    # 添加 CONTEXT 區塊
    if context_sections:
        output.append("## 🎯 核心上下文")
        for name, content in context_sections.items():
            output.append(f"\n### {name}")
            output.append("```python")
            output.append(content)
            output.append("```")
    
    # 添加 REF 區塊（顯示函數簽名）
    if ref_sections:
        output.append("\n## 📚 函數參考")
        for name, content in ref_sections.items():
            output.append(f"\n### {name}")
            output.append("```python")
            # 使用新的函數提取
            signatures = extract_function_signatures(content)
            if signatures:
                for sig in signatures:
                    output.append(sig)
            else:
                # 如果新方法失敗，使用舊方法
                functions = re.findall(r'(async def|def) .*?:\n(?:    """.*?""")?', content, re.DOTALL)
                for func in functions:
                    output.append(func.strip())
            output.append("```")
    
    # 添加可修改區域提示
    output.append("\n## ✏️ 可安全修改的區域")
    output.append("- 新增 API 路由（在現有路由之後）")
    output.append("- 添加新的擴展功能（不影響核心）")
    output.append("- 修改日誌、監控等輔助功能")
    output.append("- 更新配置參數")
    
    # 寫入檔案
    output_file = Path('llm_context.md')
    # 修正：先 join 再計算長度
    output_text = '\n'.join(output)
    output_file.write_text(output_text, encoding='utf-8')
    
    print(f"✅ 已生成 {output_file}")
    print(f"📄 檔案大小: {len(output_text)} 字元")
    print(f"📦 包含 {len(context_sections)} 個 CONTEXT 區塊, {len(ref_sections)} 個 REF 區塊")
    
    # 如果沒有找到任何區塊，提供幫助
    if not context_sections and not ref_sections:
        print("\n⚠️  沒有找到任何標記的區塊！")
        print("請先在 server_qwen.py 中添加區塊標記，例如：")
        print("# ===== LLM-CONTEXT-START: IMPORTS =====")
        print("# your code here")
        print("# ===== LLM-CONTEXT-END: IMPORTS =====")

if __name__ == "__main__":
    generate_context_file()