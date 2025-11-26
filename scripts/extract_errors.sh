#!/bin/bash
# Extract errors from test logs for LLM analysis

LOG_FILE=$1
OUTPUT_FILE="${2:-errors_for_llm.txt}"

if [ -z "$LOG_FILE" ]; then
    echo "Usage: ./extract_errors.sh <log_file> [output_file]"
    echo "Example: ./extract_errors.sh test_output.log"
    exit 1
fi

if [ ! -f "$LOG_FILE" ]; then
    echo "Error: Log file '$LOG_FILE' not found"
    exit 1
fi

echo "🔍 Extracting errors from $LOG_FILE..."

# Create output file
cat > $OUTPUT_FILE << EOF
# Error Analysis Report
Generated: $(date)
Source: $LOG_FILE

================================================================================

EOF

# Test Failures
echo "## Test Failures" >> $OUTPUT_FILE
echo "" >> $OUTPUT_FILE
grep "❌" $LOG_FILE >> $OUTPUT_FILE 2>/dev/null || echo "(No test failures found)" >> $OUTPUT_FILE
echo "" >> $OUTPUT_FILE

# Server Errors
echo "## Server Errors" >> $OUTPUT_FILE
echo "" >> $OUTPUT_FILE
grep -E "ERROR|WARNING.*Edge TTS|503|500" $LOG_FILE | head -20 >> $OUTPUT_FILE 2>/dev/null || echo "(No server errors found)" >> $OUTPUT_FILE
echo "" >> $OUTPUT_FILE

# Timeouts
echo "## Timeouts" >> $OUTPUT_FILE
echo "" >> $OUTPUT_FILE
grep -i "timeout\|exceeded" $LOG_FILE | head -20 >> $OUTPUT_FILE 2>/dev/null || echo "(No timeouts found)" >> $OUTPUT_FILE
echo "" >> $OUTPUT_FILE

# Browser Errors
echo "## Browser Errors" >> $OUTPUT_FILE
echo "" >> $OUTPUT_FILE
grep "\[BROWSER:error\]" $LOG_FILE | head -20 >> $OUTPUT_FILE 2>/dev/null || echo "(No browser errors found)" >> $OUTPUT_FILE
echo "" >> $OUTPUT_FILE

# Summary Statistics
echo "## Summary Statistics" >> $OUTPUT_FILE
echo "" >> $OUTPUT_FILE
echo "Total Errors: $(grep -ci "error" $LOG_FILE)" >> $OUTPUT_FILE
echo "Total Warnings: $(grep -ci "warning" $LOG_FILE)" >> $OUTPUT_FILE
echo "Test Failures: $(grep -c "❌" $LOG_FILE)" >> $OUTPUT_FILE
echo "Test Passes: $(grep -c "✅" $LOG_FILE)" >> $OUTPUT_FILE

echo ""
echo "✅ Errors extracted to: $OUTPUT_FILE"
echo ""
echo "📋 Summary:"
echo "   Test Failures: $(grep -c "❌" $LOG_FILE)"
echo "   Errors: $(grep -ci "error" $LOG_FILE)"
echo "   Warnings: $(grep -ci "warning" $LOG_FILE)"
echo ""
echo "💡 Next step: Review $OUTPUT_FILE and provide context to LLM"
