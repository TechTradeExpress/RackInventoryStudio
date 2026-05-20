#!/usr/bin/env bash
# WSL/WebKitGTK workaround: disables DMA-BUF renderer to prevent blank window
# when Mesa/EGL has no /dev/dri access (common in WSL2 without GPU passthrough).
# Mesa/ZINK/EGL warnings may still appear at startup — they are environmental,
# not application errors, and do not affect rendering via the Wayland compositor.
WEBKIT_DISABLE_DMABUF_RENDERER=1 exec pnpm tauri dev
