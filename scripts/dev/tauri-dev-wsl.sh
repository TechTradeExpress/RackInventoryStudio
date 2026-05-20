#!/usr/bin/env bash
# WSL2 workaround for WebKitGTK / Mesa / EGL rendering issues.
#
# Without LIBGL_ALWAYS_SOFTWARE, Mesa blocks on EGL/ZINK initialisation
# when /dev/dri is absent (typical WSL2), preventing the window from appearing.
# WEBKIT_DISABLE_DMABUF_RENDERER prevents a secondary blank-window issue in WebKit.
#
# Mesa/ZINK/EGL warnings are suppressed by LIBGL_ALWAYS_SOFTWARE (software rasteriser).
WEBKIT_DISABLE_DMABUF_RENDERER=1 LIBGL_ALWAYS_SOFTWARE=1 exec pnpm tauri dev
