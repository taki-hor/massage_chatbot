#!/usr/bin/env python3
"""
API 診斷腳本 - 測試各個 AI 服務的連接
"""

import os
import httpx
import asyncio
import json
from dotenv import load_dotenv
import time

# Load environment variables
load_dotenv()

# API Keys
TOGETHER_API_KEY = os.getenv('TOGETHER_API_KEY')
QWEN_API_KEY = os.getenv('QWEN_API_KEY')
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')

# Colors for output
GREEN = '\033[92m'
RED = '\033[91m'
YELLOW = '\033[93m'
BLUE = '\033[94m'
RESET = '\033[0m'

def log(message, color=RESET):
    print(f"{color}[{time.strftime('%H:%M:%S')}] {message}{RESET}")

async def test_gemini():
    """測試 Gemini API"""
    log("Testing Gemini API...", BLUE)
    
    if not GEMINI_API_KEY:
        log("❌ GEMINI_API_KEY not found in environment", RED)
        return False
    
    log(f"Using API Key: {GEMINI_API_KEY[:10]}...{GEMINI_API_KEY[-4:]}", YELLOW)
    
    # Test 1: List models
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"https://generativelanguage.googleapis.com/v1beta/models?key={GEMINI_API_KEY}"
            )
            if response.status_code == 200:
                models = response.json()
                log("✅ Successfully connected to Gemini API", GREEN)
                log(f"Available models: {len(models.get('models', []))}", GREEN)
                for model in models.get('models', [])[:3]:
                    log(f"  - {model.get('name', 'Unknown')}", GREEN)
            else:
                log(f"❌ Failed to list models: {response.status_code}", RED)
                log(f"Response: {response.text}", RED)
                return False
    except Exception as e:
        log(f"❌ Error connecting to Gemini API: {e}", RED)
        return False
    
    # Test 2: Generate content
    try:
        url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent"
        
        request_body = {
            "contents": [
                {
                    "parts": [{"text": "Say hello in one word"}]
                }
            ],
            "generationConfig": {
                "temperature": 0.9,
                "maxOutputTokens": 10
            }
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{url}?key={GEMINI_API_KEY}",
                json=request_body,
                headers={"Content-Type": "application/json"}
            )
            
            if response.status_code == 200:
                result = response.json()
                text = result['candidates'][0]['content']['parts'][0]['text']
                log(f"✅ Gemini response: {text}", GREEN)
                return True
            else:
                log(f"❌ Gemini generate failed: {response.status_code}", RED)
                log(f"Response: {response.text}", RED)
                return False
                
    except Exception as e:
        log(f"❌ Error generating with Gemini: {e}", RED)
        return False

async def test_together():
    """測試 Together API"""
    log("\nTesting Together API...", BLUE)
    
    if not TOGETHER_API_KEY:
        log("❌ TOGETHER_API_KEY not found in environment", RED)
        return False
    
    log(f"Using API Key: {TOGETHER_API_KEY[:10]}...{TOGETHER_API_KEY[-4:]}", YELLOW)
    
    try:
        url = "https://api.together.xyz/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {TOGETHER_API_KEY}",
            "Content-Type": "application/json"
        }
        
        request_body = {
            "model": "deepseek-ai/DeepSeek-V3",
            "messages": [
                {"role": "user", "content": "Say hello in one word"}
            ],
            "max_tokens": 10,
            "stream": False
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.post(url, json=request_body, headers=headers)
            
            if response.status_code == 200:
                result = response.json()
                text = result['choices'][0]['message']['content']
                log(f"✅ Together response: {text}", GREEN)
                return True
            else:
                log(f"❌ Together API failed: {response.status_code}", RED)
                log(f"Response: {response.text}", RED)
                return False
                
    except Exception as e:
        log(f"❌ Error with Together API: {e}", RED)
        return False

async def test_qwen():
    """測試 Qwen API"""
    log("\nTesting Qwen API...", BLUE)
    
    if not QWEN_API_KEY:
        log("❌ QWEN_API_KEY not found in environment", RED)
        return False
    
    log(f"Using API Key: {QWEN_API_KEY[:10]}...{QWEN_API_KEY[-4:]}", YELLOW)
    
    try:
        url = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {QWEN_API_KEY}",
            "Content-Type": "application/json"
        }
        
        request_body = {
            "model": "qwen-turbo-latest",
            "messages": [
                {"role": "user", "content": "Say hello in one word"}
            ],
            "max_tokens": 10,
            "stream": False
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.post(url, json=request_body, headers=headers)
            
            if response.status_code == 200:
                result = response.json()
                text = result['choices'][0]['message']['content']
                log(f"✅ Qwen response: {text}", GREEN)
                return True
            else:
                log(f"❌ Qwen API failed: {response.status_code}", RED)
                log(f"Response: {response.text}", RED)
                return False
                
    except Exception as e:
        log(f"❌ Error with Qwen API: {e}", RED)
        return False

async def test_local_server():
    """測試本地服務器"""
    log("\nTesting Local Server...", BLUE)
    
    try:
        # Test health endpoint
        async with httpx.AsyncClient() as client:
            response = await client.get("http://127.0.0.1:5000/health")
            if response.status_code == 200:
                data = response.json()
                log("✅ Local server is running", GREEN)
                log(f"API Keys configured: {data.get('api_keys_configured', {})}", GREEN)
            else:
                log(f"❌ Local server health check failed: {response.status_code}", RED)
                return False
                
        # Test chat endpoint with Gemini
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                "http://127.0.0.1:5000/api/chat",
                json={
                    "prompt": "Say hello",
                    "model": "gemini-2.5-flash",
                    "responseLength": "brief"
                },
                headers={"Accept": "text/event-stream"}
            )
            
            if response.status_code == 200:
                log("✅ Chat endpoint is responding", GREEN)
                # Read first few chunks
                content = await response.aread()
                log(f"Response preview: {content[:200].decode('utf-8', errors='ignore')}", YELLOW)
                return True
            else:
                log(f"❌ Chat endpoint failed: {response.status_code}", RED)
                content = await response.aread()
                log(f"Error: {content.decode('utf-8', errors='ignore')}", RED)
                return False
                
    except Exception as e:
        log(f"❌ Error testing local server: {e}", RED)
        return False

async def main():
    """運行所有測試"""
    print("="*60)
    print("🔍 API Diagnostic Tool")
    print("="*60)
    
    # Show environment
    log("Environment Variables:", BLUE)
    log(f"GEMINI_API_KEY: {'✅ Set' if GEMINI_API_KEY else '❌ Not set'}", 
        GREEN if GEMINI_API_KEY else RED)
    log(f"TOGETHER_API_KEY: {'✅ Set' if TOGETHER_API_KEY else '❌ Not set'}", 
        GREEN if TOGETHER_API_KEY else RED)
    log(f"QWEN_API_KEY: {'✅ Set' if QWEN_API_KEY else '❌ Not set'}", 
        GREEN if QWEN_API_KEY else RED)
    
    # Run tests
    results = {}
    
    if GEMINI_API_KEY:
        results['Gemini'] = await test_gemini()
    
    if TOGETHER_API_KEY:
        results['Together'] = await test_together()
    
    if QWEN_API_KEY:
        results['Qwen'] = await test_qwen()
    
    # Test local server
    results['Local Server'] = await test_local_server()
    
    # Summary
    print("\n" + "="*60)
    print("📊 Test Summary")
    print("="*60)
    for service, success in results.items():
        status = "✅ PASS" if success else "❌ FAIL"
        color = GREEN if success else RED
        log(f"{service}: {status}", color)
    
    # Recommendations
    print("\n" + "="*60)
    print("💡 Recommendations")
    print("="*60)
    
    if not all(results.values()):
        if not results.get('Gemini', True):
            print("1. Check your Gemini API Key:")
            print("   - Get a key from: https://makersuite.google.com/app/apikey")
            print("   - Make sure it's not the placeholder 'your_gemini_api_key'")
            print("   - Check if the key has the necessary permissions")
            
        if not results.get('Local Server', True):
            print("\n2. Check server logs for errors")
            print("   - Look for any error messages in the terminal where server is running")
            print("   - Check if all required packages are installed")
            print("   - Try restarting the server")
    else:
        log("✅ All tests passed! The system should be working correctly.", GREEN)

if __name__ == "__main__":
    asyncio.run(main())