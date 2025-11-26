#!/usr/bin/env python3
"""
Development monitoring script that:
1. Starts server_qwen.py
2. Opens browser to 127.0.0.1:5000
3. Monitors both server logs and browser console logs
"""

import subprocess
import threading
import time
import webbrowser
import os
import sys
import argparse
from playwright.sync_api import sync_playwright
from datetime import datetime

class DevMonitor:
    def __init__(self, headless=None):
        self.server_process = None
        self.server_logs = []
        self.console_logs = []
        self.errors_detected = []

        # Auto-detect headless mode if not specified
        if headless is None:
            # Check if DISPLAY is set (X11) or if we're in WSL without display
            self.headless = not bool(os.environ.get('DISPLAY'))
        else:
            self.headless = headless

        if self.headless:
            print("🖥️  Running in headless mode (no GUI)")
        
    def start_server(self):
        """Start the Flask/Python server"""
        print("🚀 Starting server_qwen.py...")
        self.server_process = subprocess.Popen(
            ['python3', 'server_qwen.py'],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1
        )
        
        # Monitor server output in separate thread
        threading.Thread(target=self._monitor_server_output, daemon=True).start()
        threading.Thread(target=self._monitor_server_errors, daemon=True).start()
        
        # Wait for server to start
        time.sleep(2)
        
    def _monitor_server_output(self):
        """Monitor stdout from server"""
        for line in iter(self.server_process.stdout.readline, ''):
            timestamp = datetime.now().strftime("%H:%M:%S")
            log_entry = f"[{timestamp}] [SERVER] {line.strip()}"
            print(log_entry)
            self.server_logs.append(log_entry)
            
            # Detect errors
            if any(keyword in line.lower() for keyword in ['error', 'exception', 'traceback', 'failed']):
                self.errors_detected.append(('server', log_entry))
    
    def _monitor_server_errors(self):
        """Monitor stderr from server"""
        for line in iter(self.server_process.stderr.readline, ''):
            timestamp = datetime.now().strftime("%H:%M:%S")
            # Don't label all stderr as ERROR - many frameworks log INFO to stderr
            log_entry = f"[{timestamp}] [SERVER STDERR] {line.strip()}"
            print(log_entry)
            self.server_logs.append(log_entry)

            # Only flag actual errors (ERROR, WARNING, CRITICAL, Exception, Traceback)
            line_lower = line.lower()
            if any(keyword in line_lower for keyword in ['error', 'warning', 'critical', 'exception', 'traceback', 'failed']) \
               and 'info:' not in line_lower and 'debug:' not in line_lower:
                self.errors_detected.append(('server', log_entry))
    
    def open_browser_and_monitor(self):
        """Open browser and monitor console logs"""
        if self.headless:
            print("🌐 Starting browser in headless mode and monitoring console...")
        else:
            print("🌐 Opening browser and monitoring console...")

        with sync_playwright() as p:
            browser = p.chromium.launch(headless=self.headless)
            # Ignore SSL certificate errors for self-signed certificates
            context = browser.new_context(ignore_https_errors=True)
            page = context.new_page()
            
            # Capture all console messages
            def handle_console(msg):
                timestamp = datetime.now().strftime("%H:%M:%S")
                log_entry = f"[{timestamp}] [BROWSER:{msg.type}] {msg.text}"
                print(log_entry)
                self.console_logs.append(log_entry)
                
                # Detect errors
                if msg.type in ['error', 'warning']:
                    self.errors_detected.append(('browser', log_entry))
            
            page.on("console", handle_console)

            # Navigate to the app
            page.goto("https://127.0.0.1:5000")
            
            print("\n" + "="*60)
            print("✅ Monitoring active!")
            print("="*60)
            print("Press Ctrl+C to stop and generate report")
            print("="*60 + "\n")
            
            try:
                # Keep monitoring until interrupted
                page.wait_for_timeout(1000000)  # Wait indefinitely
            except KeyboardInterrupt:
                print("\n⏹️  Stopping monitoring...")
            finally:
                browser.close()
    
    def generate_report(self):
        """Generate a report of all logs for LLM analysis"""
        report = []
        report.append("=" * 80)
        report.append("DEVELOPMENT SESSION REPORT")
        report.append("=" * 80)
        report.append(f"Generated at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        report.append("")
        
        # Errors summary
        if self.errors_detected:
            report.append("\n🚨 ERRORS DETECTED:")
            report.append("-" * 80)
            for source, error in self.errors_detected:
                report.append(f"[{source.upper()}] {error}")
        else:
            report.append("\n✅ No errors detected")
        
        # Server logs
        report.append("\n\n📋 SERVER LOGS:")
        report.append("-" * 80)
        report.extend(self.server_logs[-50:])  # Last 50 lines
        
        # Browser console logs
        report.append("\n\n🌐 BROWSER CONSOLE LOGS:")
        report.append("-" * 80)
        report.extend(self.console_logs[-50:])  # Last 50 lines
        
        report.append("\n" + "=" * 80)
        
        # Save to file
        filename = f"dev_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"
        with open(filename, 'w') as f:
            f.write('\n'.join(report))
        
        print(f"\n📄 Report saved to: {filename}")
        print("\nYou can now copy this report to Claude for analysis!\n")
        
        return '\n'.join(report)
    
    def cleanup(self):
        """Stop the server"""
        if self.server_process:
            print("🛑 Stopping server...")
            self.server_process.terminate()
            self.server_process.wait()

def main():
    parser = argparse.ArgumentParser(description='Development monitoring script for AI Nurse Chatbot')
    parser.add_argument('--headless', action='store_true',
                       help='Run browser in headless mode (no GUI)')
    parser.add_argument('--no-headless', action='store_true',
                       help='Force GUI mode (requires X11/display)')

    args = parser.parse_args()

    # Determine headless mode
    headless = None
    if args.headless:
        headless = True
    elif args.no_headless:
        headless = False
    # else: auto-detect (headless=None)

    monitor = DevMonitor(headless=headless)

    try:
        # Step 1: Start server
        monitor.start_server()

        # Step 2 & 3: Open browser and monitor
        monitor.open_browser_and_monitor()

    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        # Generate report
        monitor.generate_report()

        # Cleanup
        monitor.cleanup()

if __name__ == "__main__":
    main()