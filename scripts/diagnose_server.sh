#!/bin/bash
# Quick diagnostic script to check if server can start

echo "========================================="
echo "🔍 Server Diagnostic Tool"
echo "========================================="
echo ""

# Check if server is already running
echo "1️⃣ Checking if server is already running..."
if lsof -Pi :5000 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo "   ⚠️  Port 5000 is already in use!"
    echo "   Process using port 5000:"
    lsof -Pi :5000 -sTCP:LISTEN
    echo ""
    echo "   To kill it:"
    echo "   pkill -f server_qwen.py"
    exit 1
else
    echo "   ✅ Port 5000 is available"
fi

echo ""
echo "2️⃣ Testing server startup..."
python3 server_qwen.py &
SERVER_PID=$!
echo "   Server PID: $SERVER_PID"

echo ""
echo "3️⃣ Waiting for server to start..."
for i in {1..30}; do
    if curl -k -s https://127.0.0.1:5000/ > /dev/null 2>&1; then
        echo "   ✅ Server is responding!"
        break
    fi
    echo -n "."
    sleep 1
done

echo ""
echo ""
echo "4️⃣ Testing HTTPS endpoint..."
RESPONSE=$(curl -k -s -o /dev/null -w "%{http_code}" https://127.0.0.1:5000/)
if [ "$RESPONSE" == "200" ]; then
    echo "   ✅ Server returns HTTP 200 OK"
else
    echo "   ⚠️  Server returns HTTP $RESPONSE"
fi

echo ""
echo "5️⃣ Stopping test server..."
kill $SERVER_PID
wait $SERVER_PID 2>/dev/null

echo ""
echo "========================================="
echo "✅ Diagnostic complete!"
echo "========================================="
echo ""
echo "If all checks passed, the manual_test_monitor.py should work."
echo "Run it with:"
echo "  python3 scripts/manual_test_monitor.py"
