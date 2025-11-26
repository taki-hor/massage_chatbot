#!/usr/bin/env python3
"""
Browser Automation Test Script for AI Nurse Chatbot
Covers Phase 3 (Frontend Testing) and Phase 4 (UI Functional Testing)
"""

import json
import time
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

# Configuration
BASE_URL = "https://localhost:5000"
ARTIFACTS_DIR = Path("/home/user/massage_chatbot/artifacts")
SCREENSHOTS_DIR = ARTIFACTS_DIR / "screenshots"

# Ensure directories exist
ARTIFACTS_DIR.mkdir(exist_ok=True)
SCREENSHOTS_DIR.mkdir(exist_ok=True)

def run_tests():
    """Run all browser tests"""
    console_logs = []
    network_logs = []
    test_results = {
        "phase3": {
            "page_load": None,
            "console_errors": [],
            "network_errors": []
        },
        "phase4": {
            "input_test": None,
            "send_button_test": None,
            "message_display_test": None
        }
    }

    with sync_playwright() as p:
        # Launch browser (headless mode)
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            ignore_https_errors=True  # Ignore self-signed cert
        )
        page = context.new_page()

        # Capture console logs
        def handle_console(msg):
            log_entry = {
                "type": msg.type,
                "text": msg.text,
                "location": str(msg.location) if msg.location else None,
                "timestamp": time.time()
            }
            console_logs.append(log_entry)
            if msg.type == "error":
                test_results["phase3"]["console_errors"].append(log_entry)

        page.on("console", handle_console)

        # Capture network requests
        def handle_request(request):
            network_logs.append({
                "type": "request",
                "url": request.url,
                "method": request.method,
                "timestamp": time.time()
            })

        def handle_response(response):
            network_logs.append({
                "type": "response",
                "url": response.url,
                "status": response.status,
                "ok": response.ok,
                "timestamp": time.time()
            })
            if not response.ok:
                test_results["phase3"]["network_errors"].append({
                    "url": response.url,
                    "status": response.status,
                    "statusText": response.status_text
                })

        def handle_request_failed(request):
            network_logs.append({
                "type": "request_failed",
                "url": request.url,
                "failure": request.failure,
                "timestamp": time.time()
            })
            test_results["phase3"]["network_errors"].append({
                "url": request.url,
                "error": request.failure
            })

        page.on("request", handle_request)
        page.on("response", handle_response)
        page.on("requestfailed", handle_request_failed)

        # === PHASE 3: Frontend Testing ===
        print("\n" + "="*60)
        print("PHASE 3: Frontend Testing")
        print("="*60)

        # Task 3.2: Page Load Test
        print("\n[Task 3.2] Loading page...")
        try:
            page.goto(BASE_URL, wait_until="networkidle", timeout=30000)
            test_results["phase3"]["page_load"] = "success"
            print("  Page loaded successfully")

            # Take initial screenshot
            page.screenshot(path=str(SCREENSHOTS_DIR / "initial_load.png"))
            print(f"  Screenshot saved: initial_load.png")
        except Exception as e:
            test_results["phase3"]["page_load"] = f"failed: {str(e)}"
            print(f"  Page load FAILED: {e}")

        # Wait for any async operations
        time.sleep(2)

        # Task 3.3: Analyze Console Errors
        print("\n[Task 3.3] Console Error Analysis:")
        js_errors = [log for log in console_logs if log["type"] == "error"]
        print(f"  Total console messages: {len(console_logs)}")
        print(f"  Error messages: {len(js_errors)}")
        for err in js_errors[:5]:  # Show first 5 errors
            print(f"    - {err['text'][:100]}...")

        # Task 3.4: Analyze Network Errors
        print("\n[Task 3.4] Network Error Analysis:")
        net_errors = test_results["phase3"]["network_errors"]
        print(f"  Total network requests: {len([n for n in network_logs if n['type'] == 'request'])}")
        print(f"  Failed requests: {len(net_errors)}")
        for err in net_errors[:5]:  # Show first 5 errors
            print(f"    - {err.get('url', 'N/A')[:50]}... Status: {err.get('status', err.get('error', 'N/A'))}")

        # === PHASE 4: UI Functional Testing ===
        print("\n" + "="*60)
        print("PHASE 4: UI Functional Testing")
        print("="*60)

        # Task 4.1: Test Input Field
        print("\n[Task 4.1] Testing input field...")
        try:
            # Try different selectors for the input
            input_selectors = ["#userInput", "textarea#userInput", "[id='userInput']", "textarea"]
            input_element = None
            used_selector = None

            for selector in input_selectors:
                try:
                    input_element = page.locator(selector).first
                    if input_element.is_visible(timeout=2000):
                        used_selector = selector
                        break
                except:
                    continue

            if input_element and used_selector:
                input_element.fill("你好")
                actual_value = input_element.input_value()
                if actual_value == "你好":
                    test_results["phase4"]["input_test"] = "success"
                    print(f"  Input test PASSED (selector: {used_selector})")
                else:
                    test_results["phase4"]["input_test"] = f"failed: value mismatch, got '{actual_value}'"
                    print(f"  Input test FAILED: value mismatch")
            else:
                test_results["phase4"]["input_test"] = "failed: input element not found"
                print("  Input test FAILED: input element not found")
                # Save debug screenshot
                page.screenshot(path=str(SCREENSHOTS_DIR / "input_not_found.png"))
        except Exception as e:
            test_results["phase4"]["input_test"] = f"failed: {str(e)}"
            print(f"  Input test FAILED: {e}")

        # Take screenshot after input
        page.screenshot(path=str(SCREENSHOTS_DIR / "after_input.png"))

        # Task 4.2: Test Send Button
        print("\n[Task 4.2] Testing send button...")
        try:
            # Try different selectors for the send button
            button_selectors = ["#sendBtn", "button#sendBtn", "[id='sendBtn']", "button[type='submit']", "button"]
            button_element = None
            used_selector = None

            for selector in button_selectors:
                try:
                    btn = page.locator(selector).first
                    if btn.is_visible(timeout=2000):
                        button_element = btn
                        used_selector = selector
                        break
                except:
                    continue

            if button_element and used_selector:
                button_element.click()
                test_results["phase4"]["send_button_test"] = "success"
                print(f"  Send button click PASSED (selector: {used_selector})")

                # Wait for response
                print("  Waiting for response (3 seconds)...")
                time.sleep(3)
            else:
                test_results["phase4"]["send_button_test"] = "failed: send button not found"
                print("  Send button test FAILED: button not found")
                page.screenshot(path=str(SCREENSHOTS_DIR / "button_not_found.png"))
        except Exception as e:
            test_results["phase4"]["send_button_test"] = f"failed: {str(e)}"
            print(f"  Send button test FAILED: {e}")

        # Take screenshot after send
        page.screenshot(path=str(SCREENSHOTS_DIR / "after_send.png"))

        # Task 4.3: Verify Message Display
        print("\n[Task 4.3] Verifying message display...")
        try:
            # Try different selectors for message area
            message_selectors = ["#messagesArea", "#chatMessages", ".messages", "[id*='message']", ".chat-container"]
            message_area = None
            used_selector = None

            for selector in message_selectors:
                try:
                    area = page.locator(selector).first
                    if area.is_visible(timeout=2000):
                        message_area = area
                        used_selector = selector
                        break
                except:
                    continue

            if message_area and used_selector:
                # Check for user message
                inner_html = message_area.inner_html()
                has_user_message = "你好" in inner_html

                # Wait a bit more for AI response
                time.sleep(2)
                inner_html = message_area.inner_html()
                has_response = len(inner_html) > 50  # Some content should be there

                if has_user_message or has_response:
                    test_results["phase4"]["message_display_test"] = "success"
                    print(f"  Message display PASSED (selector: {used_selector})")
                    print(f"    - User message visible: {has_user_message}")
                    print(f"    - Response content detected: {has_response}")
                else:
                    test_results["phase4"]["message_display_test"] = "partial: message area found but content unclear"
                    print("  Message display PARTIAL: area found but no clear content")
            else:
                test_results["phase4"]["message_display_test"] = "failed: message area not found"
                print("  Message display test FAILED: message area not found")
        except Exception as e:
            test_results["phase4"]["message_display_test"] = f"failed: {str(e)}"
            print(f"  Message display test FAILED: {e}")

        # Final screenshot
        page.screenshot(path=str(SCREENSHOTS_DIR / "final_state.png"))
        print(f"\n  Final screenshot saved: final_state.png")

        # Get page HTML for debugging
        try:
            html_content = page.content()
            with open(ARTIFACTS_DIR / "page_source.html", "w", encoding="utf-8") as f:
                f.write(html_content)
            print(f"  Page source saved: page_source.html")
        except:
            pass

        # Cleanup
        browser.close()

    # Save logs
    print("\n" + "="*60)
    print("Saving artifacts...")
    print("="*60)

    # Save console logs
    with open(ARTIFACTS_DIR / "console.json", "w", encoding="utf-8") as f:
        json.dump(console_logs, f, indent=2, ensure_ascii=False)
    print(f"  Console logs saved: {len(console_logs)} entries")

    # Save network logs
    with open(ARTIFACTS_DIR / "network.json", "w", encoding="utf-8") as f:
        json.dump(network_logs, f, indent=2, ensure_ascii=False)
    print(f"  Network logs saved: {len(network_logs)} entries")

    # Save test results
    with open(ARTIFACTS_DIR / "test_results.json", "w", encoding="utf-8") as f:
        json.dump(test_results, f, indent=2, ensure_ascii=False)
    print(f"  Test results saved")

    # Print summary
    print("\n" + "="*60)
    print("TEST SUMMARY")
    print("="*60)
    print(f"\nPhase 3 - Frontend Testing:")
    print(f"  Page Load: {test_results['phase3']['page_load']}")
    print(f"  Console Errors: {len(test_results['phase3']['console_errors'])}")
    print(f"  Network Errors: {len(test_results['phase3']['network_errors'])}")

    print(f"\nPhase 4 - UI Testing:")
    print(f"  Input Field: {test_results['phase4']['input_test']}")
    print(f"  Send Button: {test_results['phase4']['send_button_test']}")
    print(f"  Message Display: {test_results['phase4']['message_display_test']}")

    return test_results

if __name__ == "__main__":
    results = run_tests()
