## ReID Stream Observer – Setup & Configuration

This project has:
- **Next.js frontend** (UI in `app/`, `components/`, `hooks/`)
- **Python WebRTC streaming backend** (in `backend/mock_ws.py`)

Everything is configured via a **single `.env` file** at the project root.

---

## 1. Prerequisites

- **Node.js** (v18+ recommended)
- **pnpm** (or npm/yarn if you prefer)
- **Python 3.10+**
- **ffmpeg** (recommended for aiortc, install via Homebrew: `brew install ffmpeg`)

---

## 2. Configuration (`.env`)

Create a file named `.env` in the `reid-stream-observer` root (same level as `package.json`) with content similar to:

```bash
# Frontend → backend WebSocket URL
NEXT_PUBLIC_WS_URL=ws://localhost:8765

# Streaming backend WebSocket host/port
WEBSOCKET_HOST=0.0.0.0
WEBSOCKET_PORT=8765

# Mock devices (IDs must match what the UI expects)
# Dashboard maps:
#   cam-1 → edge_device_1
#   cam-2 → edge_device_2
#   cam-3 → edge_device_3
#   cam-4 → edge_device_4
MOCK_DEVICE_IDS=edge_device_1,edge_device_2,edge_device_3

# Source videos used by the mock backend for each device
# If fewer paths than device IDs, the last path is reused.
MOCK_VIDEO_PATHS=/absolute/path/to/video1.mp4,/absolute/path/to/video2.mp4

# Stream quality / performance (backend)
# FPS: 1–60. Higher = smoother, more CPU/bandwidth.
MOCK_FPS=50

# JPEG quality for WebSocket frame snapshots (1–100).
# Higher = sharper, more bandwidth.
MOCK_JPEG_QUALITY=90

# Max WebRTC video bitrate in bits per second (e.g. 5000000 = 5 Mbps)
MOCK_RTC_MAX_BITRATE=5000000

# Optional: force a specific codec (H264, VP8, VP9)
# MOCK_RTC_CODEC=H264
```

Both the **frontend** (Next.js) and the **Python backend** load this same `.env` file.

---

## 3. Backend – Python WebRTC Streaming Server

From the `reid-stream-observer` directory:

```bash
cd "/Users/vanhtran18/Documents/Study at school/ReID UI/reid-stream-observer"

# Create and activate a virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install backend dependencies
pip install aiortc websockets opencv-python av numpy python-dotenv

# Ensure .env is created/edited as described above, then start the server
python3 backend/mock_ws.py
```

What this server does:
- Reads configuration from `.env`.
- Opens a WebSocket server on `WEBSOCKET_HOST:WEBSOCKET_PORT`.
- Sends a `device_list` to the browser.
- For each device:
  - Accepts `webrtc_offer` / `webrtc_ice` from the frontend.
  - Creates an `RTCPeerConnection` and sends back `webrtc_answer`.
  - Streams video frames from `MOCK_VIDEO_PATHS` to the browser via WebRTC.
- Also broadcasts JPEG `frame_update` messages (not currently used by the new UI, but kept for debugging/possible overlays).

To change quality / performance, edit `.env`:
- `MOCK_FPS`, `MOCK_JPEG_QUALITY`, `MOCK_RTC_MAX_BITRATE`, `MOCK_RTC_CODEC`, `MOCK_DEVICE_IDS`, `MOCK_VIDEO_PATHS`.

Restart `python3 backend/mock_ws.py` after changing `.env`.

---

## 4. Frontend – Next.js UI

From the same project root:

```bash
cd "/Users/vanhtran18/Documents/Study at school/ReID UI/reid-stream-observer"

# Install JS dependencies
pnpm install   # or: npm install / yarn install

# Start the dev server
pnpm dev       # or: npm run dev / yarn dev
```

The frontend:
- Uses `NEXT_PUBLIC_WS_URL` from `.env` to connect to the Python backend via WebSocket.
- Uses `hooks/use-streaming.ts` to:
  - Connect to the signaling server.
  - Maintain `RTCPeerConnection`s per device.
  - Receive WebRTC `MediaStream`s and stats.
- `components/dashboard.tsx` and `components/camera-viewer.tsx`:
  - Map UI cameras (`cam-1`, `cam-2`, ...) to backend device IDs (`edge_device_1`, etc.).
  - Display the live WebRTC video in a responsive player that fits the frame.

Open `http://localhost:3000` in your browser and:
- Go to **Camera Viewers**.
- Select `cam-1`, `cam-2`, etc. to view each device’s stream.

---

## 5. Where to change what (quick reference)

- **Single config file**: `.env`
  - WebSocket URL for frontend: `NEXT_PUBLIC_WS_URL`
  - Backend host/port: `WEBSOCKET_HOST`, `WEBSOCKET_PORT`
  - Device IDs and video sources: `MOCK_DEVICE_IDS`, `MOCK_VIDEO_PATHS`
  - Quality/performance: `MOCK_FPS`, `MOCK_JPEG_QUALITY`, `MOCK_RTC_MAX_BITRATE`, `MOCK_RTC_CODEC`

- **Backend code**: `backend/mock_ws.py`
  - WebRTC signaling & streaming logic.
  - If later you want to feed frames from **Kafka** instead of videos, this is the file to modify.

- **Frontend streaming logic**: `hooks/use-streaming.ts`
  - WebSocket connection, reconnection logic, WebRTC peer connections, stats.

- **Frontend UI**:
  - Dashboard: `components/dashboard.tsx`
  - Per-camera viewer: `components/camera-viewer.tsx`

With this setup, you configure everything from `.env`, and both the Python backend and Next.js frontend read from the same file.


