#!/usr/bin/env python3
"""
Format test logs for LLM analysis
Extracts errors with context and formats them for easy copy-paste to Claude/GPT
"""

import sys
import re
from pathlib import Path
from datetime import datetime

def extract_errors_with_context(lines, context_lines=5):
    """Extract error lines with surrounding context"""

    errors = []
    processed_lines = set()  # Avoid duplicate errors

    for i, line in enumerate(lines):
        # Skip if already processed as part of previous error's context
        if i in processed_lines:
            continue

        # Check if this is an error line
        if re.search(r'ERROR|❌|Exception|Failed|Timeout.*exceeded|\[BROWSER:error\]|503|500', line, re.IGNORECASE):
            # Extract context
            start = max(0, i - context_lines)
            end = min(len(lines), i + context_lines + 1)

            # Mark lines as processed
            for j in range(start, end):
                processed_lines.add(j)

            error_block = {
                'line_number': i + 1,
                'error_line': line.strip(),
                'context': ''.join(lines[start:end]),
                'severity': classify_severity(line)
            }
            errors.append(error_block)

    return errors

def classify_severity(line):
    """Classify error severity"""
    if 'ERROR' in line or 'Exception' in line or '500' in line:
        return 'HIGH'
    elif 'WARNING' in line or '503' in line:
        return 'MEDIUM'
    elif 'Failed' in line or '❌' in line:
        return 'HIGH'
    elif 'Timeout' in line:
        return 'MEDIUM'
    else:
        return 'LOW'

def extract_test_summary(lines):
    """Extract test pass/fail summary"""
    passes = 0
    failures = 0
    test_results = []

    for line in lines:
        if '✅' in line and '測試通過' in line:
            passes += 1
            # Extract test name
            match = re.search(r'🧪 測試: (.+)', line)
            if not match:
                match = re.search(r'✅ (.+) - 測試通過', line)
            if match:
                test_results.append(('PASS', match.group(1)))

        elif '❌' in line and '測試失敗' in line:
            failures += 1
            # Extract test name
            match = re.search(r'🧪 測試: (.+)', line)
            if not match:
                match = re.search(r'❌ (.+) - 測試失敗', line)
            if match:
                test_results.append(('FAIL', match.group(1)))

    return passes, failures, test_results

def format_for_llm(log_file, max_errors=10):
    """Extract and format logs for LLM analysis"""

    log_path = Path(log_file)
    if not log_path.exists():
        print(f"Error: Log file '{log_file}' not found")
        sys.exit(1)

    with open(log_file, 'r', encoding='utf-8', errors='ignore') as f:
        lines = f.readlines()

    # Extract errors
    errors = extract_errors_with_context(lines)

    # Extract test summary
    passes, failures, test_results = extract_test_summary(lines)

    # Generate formatted output
    print("# Test Log Analysis for LLM")
    print(f"**Generated:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"**Source:** {log_file}")
    print(f"**Total Lines:** {len(lines)}")
    print()

    print("## Summary")
    print(f"- **Tests Passed:** {passes}")
    print(f"- **Tests Failed:** {failures}")
    print(f"- **Errors Found:** {len(errors)}")
    print()

    if test_results:
        print("### Test Results")
        for status, test_name in test_results:
            emoji = '✅' if status == 'PASS' else '❌'
            print(f"- {emoji} {test_name}")
        print()

    print("---\n")

    # Show errors (limit to max_errors to avoid overwhelming)
    if errors:
        print(f"## Errors Found ({min(len(errors), max_errors)} of {len(errors)} shown)")
        print()

        for idx, err in enumerate(errors[:max_errors], 1):
            severity_emoji = {
                'HIGH': '🔴',
                'MEDIUM': '🟡',
                'LOW': '🟢'
            }.get(err['severity'], '⚪')

            print(f"### Error {idx} {severity_emoji} ({err['severity']} severity)")
            print(f"**Line:** {err['line_number']}")
            print(f"**Error:** `{err['error_line'][:200]}`")  # Truncate very long lines
            print()
            print("**Context:**")
            print("```")
            # Clean up ANSI color codes if present
            context = err['context']
            context = re.sub(r'\x1b\[[0-9;]+m', '', context)  # Remove ANSI codes
            print(context)
            print("```")
            print()

        if len(errors) > max_errors:
            print(f"*(Showing first {max_errors} errors. Total: {len(errors)} errors found)*")
            print()
    else:
        print("## ✅ No Errors Found")
        print()

    print("---\n")

    # Add context section
    print("## System Context")
    print()
    print("**Application:** AI Massage Nurse Assistant")
    print("**Tech Stack:** Python Flask backend, Vanilla JavaScript frontend")
    print("**Testing Tool:** Playwright automation")
    print("**Browser:** Chromium")
    print()

    # Add prompt for LLM
    print("---\n")
    print("## Prompt for LLM")
    print()
    print("```markdown")
    print("I'm debugging my chatbot application. I ran automated tests and found the errors above.")
    print()
    print("**Questions:**")
    print("1. What are the root causes of these errors?")
    print("2. How can I fix them?")
    print("3. Are there any patterns or common issues?")
    print("4. Please provide code examples for the fixes.")
    print()
    print("**Priority:**")
    if failures > 0:
        print(f"- {failures} test(s) failed - please focus on test failures first")
    print("- Focus on HIGH severity errors first")
    print("- Suggest both immediate fixes and long-term improvements")
    print("```")

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 format_logs_for_llm.py <log_file> [max_errors]")
        print()
        print("Examples:")
        print("  python3 format_logs_for_llm.py test_output.log")
        print("  python3 format_logs_for_llm.py test_output.log 20")
        print()
        print("Output can be piped to file:")
        print("  python3 format_logs_for_llm.py test_output.log > for_llm.md")
        sys.exit(1)

    log_file = sys.argv[1]
    max_errors = int(sys.argv[2]) if len(sys.argv) > 2 else 10

    format_for_llm(log_file, max_errors)

if __name__ == '__main__':
    main()
