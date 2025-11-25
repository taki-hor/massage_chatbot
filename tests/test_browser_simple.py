#!/usr/bin/env python3
"""Simplified Browser Test Script"""

import json
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE_URL = "https://localhost:5000"
ARTIFACTS_DIR = Path("/home/user/massage_chatbot/artifacts")
SCREENSHOTS_DIR = ARTIFACTS_DIR / "screenshots"

ARTIFACTS_DIR.mkdir(exist_ok=True)
SCREENSHOTS_DIR.mkdir(exist_ok=True)

def run_tests():
    console_logs = []
    network_logs = []
    results = {"phase3": {}, "phase4": {}}

    print("Starting browser tests...")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox', '--disable-dev-shm-usage'])
        context = browser.new_context(ignore_https_errors=True)
        page = context.new_page()
        page.set_default_timeout(10000)

        # Capture console
        page.on("console", lambda msg: console_logs.append({
            "type": msg.type, "text": msg.text, "ts": time.time()
        }))

        # Capture network
        page.on("response", lambda r: network_logs.append({
            "url": r.url, "status": r.status, "ok": r.ok
        }))

        # === PHASE 3 ===
        print("\n=== PHASE 3: Frontend Testing ===")

        # Task 3.2: Load page
        print("[3.2] Loading page...")
        try:
            page.goto(BASE_URL, wait_until="domcontentloaded", timeout=15000)
            results["phase3"]["page_load"] = "success"
            print("  OK - Page loaded")
            page.screenshot(path=str(SCREENSHOTS_DIR / "initial_load.png"))
        except Exception as e:
            results["phase3"]["page_load"] = f"failed: {e}"
            print(f"  FAILED: {e}")

        time.sleep(1)

        # Task 3.3: Console errors
        print("[3.3] Checking console errors...")
        errors = [l for l in console_logs if l["type"] == "error"]
        results["phase3"]["console_errors"] = len(errors)
        print(f"  Found {len(errors)} console errors")

        # Task 3.4: Network errors
        print("[3.4] Checking network errors...")
        net_errors = [l for l in network_logs if not l["ok"]]
        results["phase3"]["network_errors"] = len(net_errors)
        print(f"  Found {len(net_errors)} network errors")

        # === PHASE 4 ===
        print("\n=== PHASE 4: UI Testing ===")

        # Task 4.1: Input test
        print("[4.1] Testing input field...")
        try:
            input_el = page.locator("#userInput, textarea, input[type='text']").first
            input_el.wait_for(timeout=5000)
            input_el.fill("你好")
            results["phase4"]["input_test"] = "success"
            print("  OK - Input filled")
        except Exception as e:
            results["phase4"]["input_test"] = f"failed: {e}"
            print(f"  FAILED: {e}")

        page.screenshot(path=str(SCREENSHOTS_DIR / "after_input.png"))

        # Task 4.2: Send button test
        print("[4.2] Testing send button...")
        try:
            btn = page.locator("#sendBtn, button[type='submit'], button").first
            btn.click()
            results["phase4"]["send_button_test"] = "success"
            print("  OK - Button clicked")
            time.sleep(2)
        except Exception as e:
            results["phase4"]["send_button_test"] = f"failed: {e}"
            print(f"  FAILED: {e}")

        page.screenshot(path=str(SCREENSHOTS_DIR / "after_send.png"))

        # Task 4.3: Message display
        print("[4.3] Checking message display...")
        try:
            msg_area = page.locator("#messagesArea, .messages, #chatMessages").first
            html = msg_area.inner_html()
            has_content = len(html) > 50
            results["phase4"]["message_display_test"] = "success" if has_content else "partial"
            print(f"  {'OK' if has_content else 'PARTIAL'} - Message area has content: {has_content}")
        except Exception as e:
            results["phase4"]["message_display_test"] = f"failed: {e}"
            print(f"  FAILED: {e}")

        page.screenshot(path=str(SCREENSHOTS_DIR / "final_state.png"))

        # Save page source
        with open(ARTIFACTS_DIR / "page_source.html", "w") as f:
            f.write(page.content())

        browser.close()

    # Save artifacts
    print("\n=== Saving Artifacts ===")
    with open(ARTIFACTS_DIR / "console.json", "w") as f:
        json.dump(console_logs, f, indent=2, ensure_ascii=False)
    print(f"Saved console.json ({len(console_logs)} entries)")

    with open(ARTIFACTS_DIR / "network.json", "w") as f:
        json.dump(network_logs, f, indent=2, ensure_ascii=False)
    print(f"Saved network.json ({len(network_logs)} entries)")

    with open(ARTIFACTS_DIR / "test_results.json", "w") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    print("Saved test_results.json")

    # Summary
    print("\n" + "="*50)
    print("TEST SUMMARY")
    print("="*50)
    print(f"Phase 3:")
    print(f"  Page Load: {results['phase3'].get('page_load', 'N/A')}")
    print(f"  Console Errors: {results['phase3'].get('console_errors', 'N/A')}")
    print(f"  Network Errors: {results['phase3'].get('network_errors', 'N/A')}")
    print(f"Phase 4:")
    print(f"  Input Test: {results['phase4'].get('input_test', 'N/A')}")
    print(f"  Send Button: {results['phase4'].get('send_button_test', 'N/A')}")
    print(f"  Message Display: {results['phase4'].get('message_display_test', 'N/A')}")

    return results

if __name__ == "__main__":
    run_tests()
