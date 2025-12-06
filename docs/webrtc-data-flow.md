# WebRTC Data Flow - Luồng Dữ Liệu

## Câu hỏi: Backend bắn JPEG hay gì?

**Trả lời ngắn gọn:**
- ✅ **WebSocket endpoint**: CẦN - nhưng chỉ dùng cho **signaling** (thiết lập kết nối)
- ❌ **JPEG frames**: KHÔNG - WebRTC **KHÔNG** bắn JPEG qua WebSocket
- ✅ **Video encoded (H.264/VP8)**: ĐÚNG - gửi qua **RTP/SRTP** (không qua WebSocket)

---

## 1. WebSocket Endpoint - CẦN THIẾT

### Backend cần tạo WebSocket server:

```python
# backend/mock_ws.py
server = await websockets.serve(
    self.handler,
    self.host,  # 0.0.0.0
    self.port,  # 8765
)
```

### Frontend connect:

```typescript
// hooks/use-streaming.ts
const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8765"
const ws = new WebSocket(wsUrl)
```

**✅ Đúng rồi!** Backend cần WebSocket endpoint để frontend connect.

---

## 2. WebSocket CHỈ dùng cho Signaling (KHÔNG phải video)

WebSocket **KHÔNG** dùng để stream video. Nó chỉ dùng để:

### 2.1. Exchange SDP (Session Description Protocol)

```
Frontend → Backend: webrtc_offer
Backend → Frontend: webrtc_answer
```

### 2.2. Exchange ICE Candidates

```
Frontend ↔ Backend: webrtc_ice
```

### 2.3. Device List

```
Backend → Frontend: device_list
```

**Tất cả đều là JSON messages nhỏ**, không phải video data.

---

## 3. Video Stream - Gửi qua WebRTC (RTP/SRTP)

### 3.1. Backend tạo VideoTrack

```python
# backend/mock_ws.py - VideoTrack.recv()
async def recv(self):
    ok, img = self.cap.read()  # Đọc frame từ video file
    
    # Convert sang VideoFrame (KHÔNG phải JPEG)
    frame = VideoFrame.from_ndarray(img, format="bgr24")
    frame.pts = self._pts
    frame.time_base = Fraction(1, fps)
    
    return frame  # aiortc tự động encode thành H.264/VP8
```

### 3.2. aiortc tự động encode và gửi

- **Input**: `VideoFrame` (raw BGR24)
- **Encode**: H.264 hoặc VP8 (tùy codec được chọn)
- **Transport**: RTP/SRTP packets qua UDP
- **Output**: Encoded video stream đến frontend

### 3.3. Frontend nhận MediaStream

```typescript
// hooks/use-streaming.ts
pc.ontrack = (ev) => {
    const stream = ev.streams[0]  // MediaStream từ WebRTC
    // Browser tự động decode H.264/VP8 → hiển thị video
    setMediaStreams((prev) => {
        next.set(deviceId, stream)
    })
}
```

```tsx
// components/camera-viewer.tsx
<video
    ref={(el) => {
        if (el) el.srcObject = mediaStream  // Gán MediaStream vào video element
    }}
    autoPlay
/>
```

**Browser tự động decode và render video!**

---

## 4. Sự Khác Biệt: JPEG vs WebRTC

### ❌ JPEG qua WebSocket (KHÔNG dùng cho video stream)

Trong code có `_producer_loop()` gửi JPEG:

```python
# backend/mock_ws.py - _producer_loop()
encode_ok, buf = cv2.imencode(".jpg", frame, ...)
image_base64 = base64.b64encode(buf).decode("utf-8")

message = {
    "type": "frame_update",
    "image_base64": image_base64,  # JPEG base64
    ...
}
await self._broadcast(message)  # Gửi qua WebSocket
```

**NHƯNG:** Frontend hiện tại **KHÔNG dùng** `frame_update` này cho video streaming. Nó chỉ dùng WebRTC.

### ✅ WebRTC Video Stream (ĐANG DÙNG)

```python
# VideoTrack.recv() - trả về VideoFrame
frame = VideoFrame.from_ndarray(img, format="bgr24")
return frame  # aiortc encode → RTP/SRTP → Frontend
```

**Frontend nhận qua `pc.ontrack` → MediaStream → `<video>` element**

---

## 5. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    BACKEND (Python)                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────┐         ┌──────────────────┐         │
│  │  WebSocket       │         │  RTCPeerConnection│        │
│  │  Server          │         │  (aiortc)         │        │
│  │                  │         │                   │        │
│  │  - device_list   │         │  ┌─────────────┐  │        │
│  │  - webrtc_offer  │◄───────►│  │ VideoTrack  │  │        │
│  │  - webrtc_answer │         │  │             │  │        │
│  │  - webrtc_ice    │         │  │ recv()      │  │        │
│  └──────────────────┘         │  │   ↓         │  │        │
│         │                      │  │ VideoFrame │  │        │
│         │                      │  │   ↓        │  │        │
│         │                      │  │ Encode     │  │        │
│         │                      │  │ (H.264)    │  │        │
│         │                      │  │   ↓        │  │        │
│         │                      │  │ RTP/SRTP   │  │        │
│         │                      │  └─────┬───────┘  │        │
│         │                      └────────┼──────────┘        │
│         │                               │                   │
└─────────┼───────────────────────────────┼───────────────────┘
          │                               │
          │ WebSocket                     │ WebRTC
          │ (Signaling only)              │ (Video stream)
          │ JSON messages                 │ RTP/SRTP packets
          │                               │ UDP
          │                               │
┌─────────┼───────────────────────────────┼───────────────────┐
│         │                               │                   │
│  ┌──────▼──────┐              ┌────────▼────────┐        │
│  │ WebSocket   │              │ RTCPeerConnection │        │
│  │ Client      │              │ (Browser API)     │        │
│  │             │              │                   │        │
│  │ - device_list│             │  ┌─────────────┐  │        │
│  │ - webrtc_offer│            │  │ MediaStream │  │        │
│  │ - webrtc_answer│           │  │             │  │        │
│  │ - webrtc_ice  │            │  │ Decode      │  │        │
│  └──────────────┘             │  │ (H.264)     │  │        │
│                                │  │   ↓         │  │        │
│                                │  │ VideoFrame  │  │        │
│                                │  │   ↓         │  │        │
│                                │  │ <video>     │  │        │
│                                │  └─────────────┘  │        │
│                                └───────────────────┘        │
│                                                              │
│                    FRONTEND (Browser)                       │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. Tóm Tắt

### ✅ Backend CẦN:

1. **WebSocket endpoint** (`ws://host:port`)
   - Nhận `webrtc_offer`
   - Gửi `webrtc_answer`
   - Trao đổi `webrtc_ice`
   - Gửi `device_list`

2. **RTCPeerConnection** (aiortc)
   - Tạo `VideoTrack` để stream frames
   - Encode video (H.264/VP8)
   - Gửi qua RTP/SRTP

### ❌ Backend KHÔNG CẦN:

- **Gửi JPEG qua WebSocket** cho video streaming
  - (Code có `_producer_loop` gửi JPEG nhưng frontend không dùng cho video)

### 📊 Data Flow:

```
Video File/Camera
    ↓
cv2.VideoCapture.read() → numpy array (BGR)
    ↓
VideoFrame.from_ndarray() → VideoFrame
    ↓
aiortc encode → H.264/VP8
    ↓
RTP/SRTP packets (UDP)
    ↓
Frontend RTCPeerConnection
    ↓
Browser decode → MediaStream
    ↓
<video> element → Hiển thị
```

**WebSocket chỉ dùng để "bắt tay" (signaling), không dùng để stream video!**

---

## 7. Code Reference

### Backend WebSocket Handler:
```python
# backend/mock_ws.py:84-106
async def handler(self, ws):
    await self._send_json(ws, {"type": "device_list", ...})
    async for message in ws:
        if data.get("type") == "webrtc_offer":
            await self._handle_webrtc_offer(ws, data)
        elif data.get("type") == "webrtc_ice":
            await self._handle_webrtc_ice(ws, data)
```

### Backend VideoTrack:
```python
# backend/mock_ws.py:137-182
async def recv(self):
    ok, img = self.cap.read()
    frame = VideoFrame.from_ndarray(img, format="bgr24")
    return frame  # aiortc tự động encode và gửi
```

### Frontend WebRTC:
```typescript
// hooks/use-streaming.ts:114-122
pc.ontrack = (ev) => {
    const stream = ev.streams[0]  // MediaStream từ WebRTC
    setMediaStreams((prev) => {
        next.set(deviceId, stream)
    })
}
```


