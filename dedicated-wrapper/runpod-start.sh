#!/bin/bash
# =============================================================================
# RunPod Dedicated GPU Startup Script
# =============================================================================
# This script starts ComfyUI and the API wrapper on a RunPod dedicated pod.
# Models should already exist on the network volume at /workspace/ComfyUI
#
# Usage: ./runpod-start.sh
# Or set as RunPod's Docker Command
# =============================================================================

set -e  # Exit on error

# Configuration
COMFYUI_DIR="${COMFYUI_DIR:-/workspace/ComfyUI}"
WRAPPER_DIR="${WRAPPER_DIR:-/workspace/wrapper}"
COMFYUI_PORT="${COMFYUI_PORT:-8188}"
WRAPPER_PORT="${PORT:-3000}"
MAX_WAIT="${MAX_WAIT:-120}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

echo ""
echo "=============================================="
echo "  🚀 Vixxxen Dedicated GPU Startup"
echo "=============================================="
echo ""

# -----------------------------------------------------------------------------
# Check Prerequisites
# -----------------------------------------------------------------------------
log_info "Checking prerequisites..."

if [ ! -d "$COMFYUI_DIR" ]; then
    log_error "ComfyUI directory not found at $COMFYUI_DIR"
    log_error "Make sure your network volume is mounted and ComfyUI is installed"
    exit 1
fi

if [ ! -f "$COMFYUI_DIR/main.py" ]; then
    log_error "ComfyUI main.py not found - installation may be incomplete"
    exit 1
fi

log_success "ComfyUI found at $COMFYUI_DIR"

# Check for models (basic sanity check)
if [ -d "$COMFYUI_DIR/models/unet" ]; then
    UNET_COUNT=$(ls -1 "$COMFYUI_DIR/models/unet"/*.safetensors 2>/dev/null | wc -l)
    log_info "Found $UNET_COUNT UNET model(s)"
fi

if [ -d "$COMFYUI_DIR/models/loras" ]; then
    LORA_COUNT=$(ls -1 "$COMFYUI_DIR/models/loras"/*.safetensors 2>/dev/null | wc -l)
    log_info "Found $LORA_COUNT LoRA model(s)"
fi

# Check/Install Node.js
if ! command -v node &> /dev/null; then
    log_warn "Node.js not found, installing..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - > /dev/null 2>&1
    apt-get install -y nodejs > /dev/null 2>&1
    if command -v node &> /dev/null; then
        log_success "Node.js installed: $(node --version)"
    else
        log_error "Failed to install Node.js"
        exit 1
    fi
else
    log_info "Node.js found: $(node --version)"
fi

# -----------------------------------------------------------------------------
# Setup Wrapper (if not already set up)
# -----------------------------------------------------------------------------
log_info "Setting up API wrapper..."

mkdir -p "$WRAPPER_DIR"

# Copy wrapper files if they don't exist or are outdated
if [ ! -f "$WRAPPER_DIR/server.js" ] || [ ! -f "$WRAPPER_DIR/package.json" ]; then
    log_info "Wrapper not found, setting up..."

    # Check if we have the files in /app (from Docker) or need to download
    if [ -f "/app/server.js" ]; then
        cp /app/server.js "$WRAPPER_DIR/"
        cp /app/package.json "$WRAPPER_DIR/"
        log_success "Copied wrapper from /app"
    else
        log_warn "Wrapper files not found - downloading from repo..."
        cd "$WRAPPER_DIR"
        curl -sO https://raw.githubusercontent.com/digital-divas-admin/vixxxen/main/dedicated-wrapper/server.js
        curl -sO https://raw.githubusercontent.com/digital-divas-admin/vixxxen/main/dedicated-wrapper/package.json
        log_success "Downloaded wrapper files"
    fi
fi

# Install npm dependencies
cd "$WRAPPER_DIR"
if [ ! -d "node_modules" ]; then
    log_info "Installing wrapper dependencies..."
    npm install --production --silent
    log_success "Dependencies installed"
else
    log_info "Wrapper dependencies already installed"
fi

# -----------------------------------------------------------------------------
# Start ComfyUI
# -----------------------------------------------------------------------------
log_info "Starting ComfyUI on port $COMFYUI_PORT..."

cd "$COMFYUI_DIR"

# Activate venv if it exists
if [ -f "venv/bin/activate" ]; then
    source venv/bin/activate
    log_info "Activated Python venv"
fi

# Start ComfyUI
python main.py --listen 0.0.0.0 --port $COMFYUI_PORT --preview-method auto &
COMFYUI_PID=$!

log_info "ComfyUI starting (PID: $COMFYUI_PID)"

# -----------------------------------------------------------------------------
# Wait for ComfyUI to be Ready
# -----------------------------------------------------------------------------
log_info "Waiting for ComfyUI to be ready (max ${MAX_WAIT}s)..."

WAITED=0
INTERVAL=3

while [ $WAITED -lt $MAX_WAIT ]; do
    if curl -s "http://127.0.0.1:$COMFYUI_PORT/system_stats" > /dev/null 2>&1; then
        log_success "ComfyUI is ready! (took ${WAITED}s)"
        break
    fi

    # Check if process is still running
    if ! kill -0 $COMFYUI_PID 2>/dev/null; then
        log_error "ComfyUI process died unexpectedly"
        exit 1
    fi

    sleep $INTERVAL
    WAITED=$((WAITED + INTERVAL))

    # Show progress every 15 seconds
    if [ $((WAITED % 15)) -eq 0 ]; then
        log_info "Still waiting... ($WAITED seconds)"
    fi
done

if [ $WAITED -ge $MAX_WAIT ]; then
    log_error "ComfyUI failed to start within ${MAX_WAIT} seconds"
    kill $COMFYUI_PID 2>/dev/null
    exit 1
fi

# -----------------------------------------------------------------------------
# Start Wrapper
# -----------------------------------------------------------------------------
log_info "Starting API wrapper on port $WRAPPER_PORT..."

cd "$WRAPPER_DIR"

export PORT=$WRAPPER_PORT
export COMFYUI_HOST="127.0.0.1"
export COMFYUI_PORT=$COMFYUI_PORT

node server.js &
WRAPPER_PID=$!

# Wait a moment and check it started
sleep 2
if ! kill -0 $WRAPPER_PID 2>/dev/null; then
    log_error "Wrapper failed to start"
    kill $COMFYUI_PID 2>/dev/null
    exit 1
fi

# Verify wrapper is responding
sleep 1
if curl -s "http://127.0.0.1:$WRAPPER_PORT/health" > /dev/null 2>&1; then
    log_success "Wrapper is ready!"
else
    log_warn "Wrapper started but health check not responding yet"
fi

# -----------------------------------------------------------------------------
# Running
# -----------------------------------------------------------------------------
echo ""
echo "=============================================="
log_success "All services running!"
echo "=============================================="
echo ""
echo "  ComfyUI:  http://0.0.0.0:$COMFYUI_PORT (PID: $COMFYUI_PID)"
echo "  Wrapper:  http://0.0.0.0:$WRAPPER_PORT (PID: $WRAPPER_PID)"
echo ""
echo "  API Endpoints:"
echo "    POST /run          - Submit generation job"
echo "    POST /warmup       - Pre-load models"
echo "    GET  /status/:id   - Check job status"
echo "    GET  /health       - Health check"
echo ""
echo "=============================================="
echo ""

# -----------------------------------------------------------------------------
# Warmup: Pre-load Qwen Model
# -----------------------------------------------------------------------------
log_info "Warming up Qwen model (this saves time for the first user)..."

# Run warmup in background so we can start monitoring
(
    sleep 5  # Give services a moment to stabilize

    WARMUP_RESPONSE=$(curl -s -X POST "http://127.0.0.1:$WRAPPER_PORT/warmup" \
        -H "Content-Type: application/json" \
        -d '{"model": "qwen"}' \
        --max-time 330)

    if echo "$WARMUP_RESPONSE" | grep -q '"success":true'; then
        LOAD_TIME=$(echo "$WARMUP_RESPONSE" | grep -o '"loadTimeSeconds":[0-9]*' | grep -o '[0-9]*')
        echo -e "${GREEN}[OK]${NC} Qwen model loaded and ready! (took ${LOAD_TIME}s)"
    else
        echo -e "${YELLOW}[WARN]${NC} Warmup may have failed: $WARMUP_RESPONSE"
    fi
) &
WARMUP_PID=$!

log_info "Warmup running in background (PID: $WARMUP_PID)"
echo ""

# -----------------------------------------------------------------------------
# Handle Shutdown
# -----------------------------------------------------------------------------
cleanup() {
    echo ""
    log_warn "Shutting down..."
    kill $WRAPPER_PID 2>/dev/null
    kill $COMFYUI_PID 2>/dev/null
    log_info "Goodbye!"
    exit 0
}

trap cleanup SIGTERM SIGINT

# -----------------------------------------------------------------------------
# Monitor Processes
# -----------------------------------------------------------------------------
log_info "Monitoring processes (Ctrl+C to stop)..."

while true; do
    # Check if ComfyUI is still running
    if ! kill -0 $COMFYUI_PID 2>/dev/null; then
        log_error "ComfyUI process died!"
        kill $WRAPPER_PID 2>/dev/null
        exit 1
    fi

    # Check if wrapper is still running
    if ! kill -0 $WRAPPER_PID 2>/dev/null; then
        log_error "Wrapper process died!"
        kill $COMFYUI_PID 2>/dev/null
        exit 1
    fi

    sleep 10
done
