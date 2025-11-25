#!/usr/bin/env python3
"""
Bug Tracker - Scans codebase for TODO, FIXME, and potential issues
"""

import os
import re
from pathlib import Path
from datetime import datetime

# Configuration
PROJECT_ROOT = Path("/home/user/massage_chatbot")
REPORTS_DIR = PROJECT_ROOT / "reports"
REPORTS_DIR.mkdir(exist_ok=True)

# File patterns to scan
SCAN_PATTERNS = ["*.py", "*.js", "*.html", "*.css"]
EXCLUDE_DIRS = ["node_modules", ".git", "__pycache__", "artifacts", "venv"]

# Markers to search for
MARKERS = {
    "TODO": r"(?:#|//|<!--)\s*TODO[:\s]*(.*?)(?:-->)?$",
    "FIXME": r"(?:#|//|<!--)\s*FIXME[:\s]*(.*?)(?:-->)?$",
    "HACK": r"(?:#|//|<!--)\s*HACK[:\s]*(.*?)(?:-->)?$",
    "BUG": r"(?:#|//|<!--)\s*BUG[:\s]*(.*?)(?:-->)?$",
    "XXX": r"(?:#|//|<!--)\s*XXX[:\s]*(.*?)(?:-->)?$",
}

# Potential issue patterns
ISSUE_PATTERNS = {
    "Hardcoded credentials": r"(password|secret|api_key|token)\s*=\s*['\"][^'\"]+['\"]",
    "Console.log in production": r"console\.(log|debug|info)\s*\(",
    "Unused import": r"^import\s+\w+\s*$",
    "Empty except": r"except\s*:\s*\n\s*pass",
    "Deprecated function": r"(eval|exec)\s*\(",
}


def scan_file(file_path):
    """Scan a single file for markers and issues"""
    results = {"markers": [], "issues": []}

    try:
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            lines = f.readlines()
    except Exception as e:
        return results

    for line_num, line in enumerate(lines, 1):
        # Check for markers
        for marker_type, pattern in MARKERS.items():
            match = re.search(pattern, line, re.IGNORECASE)
            if match:
                results["markers"].append({
                    "type": marker_type,
                    "file": str(file_path),
                    "line": line_num,
                    "content": match.group(1).strip() if match.group(1) else line.strip()
                })

        # Check for potential issues
        for issue_type, pattern in ISSUE_PATTERNS.items():
            if re.search(pattern, line, re.IGNORECASE):
                # Skip false positives
                if "example" in line.lower() or "test" in str(file_path).lower():
                    continue
                results["issues"].append({
                    "type": issue_type,
                    "file": str(file_path),
                    "line": line_num,
                    "content": line.strip()[:100]
                })

    return results


def scan_codebase():
    """Scan entire codebase"""
    all_markers = []
    all_issues = []
    files_scanned = 0

    for pattern in SCAN_PATTERNS:
        for file_path in PROJECT_ROOT.rglob(pattern):
            # Skip excluded directories
            if any(exc in str(file_path) for exc in EXCLUDE_DIRS):
                continue

            results = scan_file(file_path)
            all_markers.extend(results["markers"])
            all_issues.extend(results["issues"])
            files_scanned += 1

    return {
        "files_scanned": files_scanned,
        "markers": all_markers,
        "issues": all_issues
    }


def generate_report(results):
    """Generate BUGLIST.md report"""
    report = []
    report.append("# Bug List & Code Quality Report")
    report.append("")
    report.append(f"**Generated**: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    report.append(f"**Files Scanned**: {results['files_scanned']}")
    report.append("")
    report.append("---")
    report.append("")

    # Summary
    report.append("## Summary")
    report.append("")
    report.append(f"| Category | Count |")
    report.append(f"|----------|-------|")

    marker_counts = {}
    for m in results["markers"]:
        marker_counts[m["type"]] = marker_counts.get(m["type"], 0) + 1

    for marker_type in ["TODO", "FIXME", "HACK", "BUG", "XXX"]:
        count = marker_counts.get(marker_type, 0)
        report.append(f"| {marker_type} | {count} |")

    report.append(f"| Potential Issues | {len(results['issues'])} |")
    report.append("")
    report.append("---")
    report.append("")

    # TODO items
    todos = [m for m in results["markers"] if m["type"] == "TODO"]
    report.append("## TODO Items")
    report.append("")
    if todos:
        for item in todos[:20]:  # Limit to 20
            rel_path = item["file"].replace(str(PROJECT_ROOT) + "/", "")
            report.append(f"- **{rel_path}:{item['line']}**")
            report.append(f"  - {item['content'][:100]}")
    else:
        report.append("No TODO items found.")
    report.append("")

    # FIXME items
    fixmes = [m for m in results["markers"] if m["type"] == "FIXME"]
    report.append("## FIXME Items")
    report.append("")
    if fixmes:
        for item in fixmes[:20]:
            rel_path = item["file"].replace(str(PROJECT_ROOT) + "/", "")
            report.append(f"- **{rel_path}:{item['line']}**")
            report.append(f"  - {item['content'][:100]}")
    else:
        report.append("No FIXME items found.")
    report.append("")

    # Potential Issues
    report.append("## Potential Issues")
    report.append("")
    if results["issues"]:
        by_type = {}
        for issue in results["issues"]:
            if issue["type"] not in by_type:
                by_type[issue["type"]] = []
            by_type[issue["type"]].append(issue)

        for issue_type, items in by_type.items():
            report.append(f"### {issue_type} ({len(items)})")
            report.append("")
            for item in items[:10]:  # Limit to 10 per type
                rel_path = item["file"].replace(str(PROJECT_ROOT) + "/", "")
                report.append(f"- `{rel_path}:{item['line']}`: {item['content'][:80]}...")
            report.append("")
    else:
        report.append("No potential issues detected.")
    report.append("")

    # Priority Classification
    report.append("---")
    report.append("")
    report.append("## Priority Classification")
    report.append("")
    report.append("### P0 - Critical (Must Fix Now)")
    report.append("```")
    report.append("None identified")
    report.append("```")
    report.append("")
    report.append("### P1 - High (Fix Soon)")
    report.append("```")
    if fixmes:
        report.append(f"{len(fixmes)} FIXME items to address")
    else:
        report.append("None identified")
    report.append("```")
    report.append("")
    report.append("### P2 - Medium (Can Wait)")
    report.append("```")
    if todos:
        report.append(f"{len(todos)} TODO items for future work")
    else:
        report.append("None identified")
    report.append("```")
    report.append("")
    report.append("### P3 - Low (Nice to Have)")
    report.append("```")
    report.append("Code quality improvements as identified above")
    report.append("```")
    report.append("")

    return "\n".join(report)


def main():
    print("Bug Tracker - Scanning codebase...")
    print("")

    results = scan_codebase()

    print(f"Files scanned: {results['files_scanned']}")
    print(f"Markers found: {len(results['markers'])}")
    print(f"Potential issues: {len(results['issues'])}")
    print("")

    # Print summary
    marker_counts = {}
    for m in results["markers"]:
        marker_counts[m["type"]] = marker_counts.get(m["type"], 0) + 1

    print("Marker Summary:")
    for marker_type, count in marker_counts.items():
        print(f"  {marker_type}: {count}")
    print("")

    # Generate report
    report = generate_report(results)
    report_path = REPORTS_DIR / "BUGLIST.md"

    with open(report_path, "w", encoding="utf-8") as f:
        f.write(report)

    print(f"Report generated: {report_path}")

    return results


if __name__ == "__main__":
    main()
