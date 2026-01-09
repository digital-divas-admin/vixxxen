#!/bin/bash
# Startup script for RunPod dedicated Pod
# Runs both ComfyUI and the API wrapper

echo "🚀 Starting ComfyUI + Wrapper..."

# Start ComfyUI in background (adjust path as needed)
cd /workspace/ComfyUI
python main.py --listen 0.0.0.0 --port 8188 &
COMFYUI_PID=$!

echo "⏳ Waiting for ComfyUI to start..."
sleep 10

# Wait for ComfyUI to be ready
MAX_WAIT=60
WAITED=0
while [ $WAITED -lt $MAX_WAIT ]; do
  if curl -s http://127.0.0.1:8188/system_stats > /dev/null 2>&1; then
    echo "✅ ComfyUI is ready"
    break
  fi
  sleep 2
  WAITED=$((WAITED + 2))
  echo "   Waiting... ($WAITED seconds)"
done

if [ $WAITED -ge $MAX_WAIT ]; then
  echo "❌ ComfyUI failed to start"
  exit 1
fi

# Start the wrapper
cd /app
echo "🔌 Starting API wrapper on port 3000..."
node server.js &
WRAPPER_PID=$!

echo "✅ All services running"
echo "   ComfyUI PID: $COMFYUI_PID"
echo "   Wrapper PID: $WRAPPER_PID"

# Wait for either process to exit
wait -n $COMFYUI_PID $WRAPPER_PID
EXIT_CODE=$?

echo "⚠️ A service exited with code $EXIT_CODE"
exit $EXIT_CODE
