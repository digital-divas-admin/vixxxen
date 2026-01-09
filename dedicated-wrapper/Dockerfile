# ComfyUI RunPod-Compatible Wrapper
#
# This Dockerfile adds the API wrapper to an existing ComfyUI setup.
# For RunPod deployment, this runs alongside ComfyUI.
#
# Build: docker build -t comfyui-wrapper .
# Run: docker run -p 3000:3000 -e COMFYUI_HOST=host.docker.internal comfyui-wrapper

FROM node:20-slim

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy application code
COPY server.js ./

# Environment variables (can be overridden at runtime)
ENV PORT=3000
ENV COMFYUI_HOST=127.0.0.1
ENV COMFYUI_PORT=8188

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["node", "server.js"]
