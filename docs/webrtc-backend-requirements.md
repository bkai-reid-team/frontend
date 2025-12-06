# Backend WebRTC Requirements - Tài liệu Tiếng Việt

## Tổng quan

Backend của bạn đã có implementation mẫu sử dụng `aiortc` (Python). Tài liệu này giải thích **những gì backend cần chuẩn bị** để thực hiện giao thức WebRTC streaming.

---

## 1. Dependencies (Thư viện cần thiết)

### Python Packages

```bash
pip install aiortc websockets opencv-python av numpy python-dotenv
```

**Giải thích từng package:**
- **`aiortc`**: Thư viện Python chính để xử lý WebRTC (tương đương với `RTCPeerConnection` trong browser)
- **`websockets`**: Để tạo WebSocket server (signaling channel)
- **`opencv-python`**: Đọc/encode video frames từ file hoặc camera
- **`av`** (PyAV): Convert frames sang format mà WebRTC cần (`VideoFrame`)
- **`numpy`**: Xử lý image arrays
- **`python-dotenv`**: Đọc config từ `.env`

### System Dependencies

- **ffmpeg**: Cần thiết cho `aiortc` để encode/decode video
  ```bash
  # macOS
  brew install ffmpeg
  
  # Ubuntu/Debian
  sudo apt-get install ffmpeg
  ```

---

## 2. WebRTC Signaling Flow (Luồng giao tiếp)

Backend cần xử lý **3 loại message** qua WebSocket:

### 2.1. `device_list` (Backend → Frontend)

Khi client kết nối, backend gửi danh sách devices:

```python
await ws.send(json.dumps({
    "type": "device_list",
    "devices": ["edge_device_1", "edge_device_2", ...]
}))
```

### 2.2. `webrtc_offer` (Frontend → Backend)

Frontend gửi SDP offer, backend cần:

1. **Tạo RTCPeerConnection**
2. **Tạo VideoTrack** (source video)
3. **Set remote description** (offer từ frontend)
4. **Create answer** và gửi lại

```python
async def _handle_webrtc_offer(self, ws, data):
    device_id = data.get("device_id")
    sdp = data.get("sdp")
    
    # 1. Tạo peer connection
    pc = RTCPeerConnection()
    
    # 2. Tạo video track (stream frames)
    video_track = VideoTrack(device_id, video_path, fps)
    pc.addTrack(video_track)
    
    # 3. Set remote description (offer từ frontend)
    await pc.setRemoteDescription(RTCSessionDescription(sdp["sdp"], sdp["type"]))
    
    # 4. Create và gửi answer
    answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    
    # Đợi ICE gathering hoàn thành
    while pc.iceGatheringState != "complete":
        await asyncio.sleep(0.05)
    
    # Gửi answer về frontend
    await ws.send(json.dumps({
        "type": "webrtc_answer",
        "device_id": device_id,
        "sdp": {
            "type": pc.localDescription.type,
            "sdp": pc.localDescription.sdp
        }
    }))
```

### 2.3. `webrtc_ice` (Frontend ↔ Backend)

Trao đổi ICE candidates để thiết lập kết nối P2P:

```python
async def _handle_webrtc_ice(self, ws, data):
    device_id = data.get("device_id")
    candidate = data.get("candidate")
    pc = self._peer_connections.get(device_id)
    
    # Thêm ICE candidate vào peer connection
    c = candidate_from_sdp(candidate["candidate"])
    c.sdpMid = candidate.get("sdpMid")
    c.sdpMLineIndex = candidate.get("sdpMLineIndex")
    await pc.addIceCandidate(c)
```

**Lưu ý:** Backend cũng có thể gửi ICE candidates về frontend nếu cần (trong code hiện tại, aiortc tự động embed candidates vào SDP answer).

---

## 3. Video Source (Nguồn video)

Backend cần **tạo VideoTrack** để stream frames. Có 3 cách phổ biến:

### 3.1. Từ Video File (như code hiện tại)

```python
class VideoTrack(MediaStreamTrack):
    kind = "video"
    
    def __init__(self, device_id, video_path, fps):
        super().__init__()
        self.cap = cv2.VideoCapture(video_path)
        self.frame_interval = 1.0 / fps
    
    async def recv(self):
        ok, img = self.cap.read()
        if not ok:
            # Loop hoặc return black frame
            return VideoFrame.from_ndarray(black_frame, format="bgr24")
        
        # Convert sang VideoFrame
        frame = VideoFrame.from_ndarray(img, format="bgr24")
        frame.pts = self._pts
        frame.time_base = Fraction(1, fps)
        return frame
```

### 3.2. Từ Camera (USB/IP Camera)

```python
# Thay cv2.VideoCapture(video_path) bằng:
self.cap = cv2.VideoCapture(0)  # USB camera
# hoặc
self.cap = cv2.VideoCapture("rtsp://ip:port/stream")  # IP camera
```

### 3.3. Từ Kafka/Message Queue (cho production)

```python
async def recv(self):
    # Nhận frame từ Kafka consumer
    frame_data = await kafka_consumer.get_frame(device_id)
    img = cv2.imdecode(frame_data, cv2.IMREAD_COLOR)
    return VideoFrame.from_ndarray(img, format="bgr24")
```

---

## 4. Codec & Encoding (Mã hóa video)

### 4.1. Codec Options

WebRTC hỗ trợ các codec:
- **H.264** (phổ biến nhất, hardware acceleration tốt)
- **VP8** (open source, tốt cho low latency)
- **VP9** (tốt hơn VP8 nhưng CPU cao hơn)

### 4.2. Set Codec Preference

```python
transceiver = pc.addTransceiver("video", direction="sendonly")
caps = RTCRtpSender.getCapabilities("video")

# Ưu tiên H.264
preferred = [c for c in caps.codecs if "H264" in c.mimeType]
others = [c for c in caps.codecs if "H264" not in c.mimeType]
transceiver.setCodecPreferences(preferred + others)
```

### 4.3. Bitrate Control

```python
sender = next((s for s in pc.getSenders() if s.track), None)
if sender:
    params = sender.getParameters()
    params["encodings"][0]["maxBitrate"] = 5000000  # 5 Mbps
    sender.setParameters(params)
```

---

## 5. Data Channel (Kênh dữ liệu - Optional)

Backend có thể gửi metadata qua data channel:

```python
@pc.on("datachannel")
def on_datachannel(channel):
    # Gửi frame timestamp để đo latency
    channel.send(json.dumps({
        "type": "frame_ts",
        "device_id": device_id,
        "created_at": int(time.time() * 1000)
    }))
```

---

## 6. ICE Servers (STUN/TURN)

### STUN Server (cho NAT traversal)

Frontend đã config:
```javascript
new RTCPeerConnection({
    iceServers: [{ urls: ["stun:stun.l.google.com:19302"] }]
})
```

Backend **không cần** config STUN (aiortc tự động xử lý).

### TURN Server (cho firewall/NAT khó)

Nếu STUN không đủ, cần TURN server:
- **coturn** (open source)
- **Twilio TURN** (cloud service)
- **Cloudflare TURN** (free tier)

---

## 7. Architecture Summary (Tóm tắt kiến trúc)

```
┌─────────────┐                    ┌─────────────┐
│   Frontend  │                    │   Backend   │
│  (Browser)  │                    │  (Python)   │
└──────┬──────┘                    └──────┬──────┘
       │                                   │
       │  WebSocket (Signaling)            │
       │◄─────────────────────────────────►│
       │  - device_list                    │
       │  - webrtc_offer                   │
       │  - webrtc_answer                  │
       │  - webrtc_ice                     │
       │                                   │
       │  WebRTC (Media Stream)            │
       │◄───────────────────────────────── │
       │  - RTP/SRTP packets               │
       │  - H.264/VP8 encoded video        │
       │                                   │
       │                                   │
       │  Video Source:                    │
       │  - File (cv2.VideoCapture)        │
       │  - Camera (USB/IP)                │
       │  - Kafka/Queue                    │
```

---

## 8. Checklist cho Production Backend

- [ ] **WebSocket server** để signaling
- [ ] **RTCPeerConnection** per device
- [ ] **VideoTrack** để stream frames
- [ ] **Codec configuration** (H.264/VP8)
- [ ] **Bitrate control** để quản lý bandwidth
- [ ] **Error handling** (connection drops, codec failures)
- [ ] **Resource cleanup** (close peer connections khi client disconnect)
- [ ] **TURN server** (nếu cần cho production với firewall)
- [ ] **Monitoring** (stats: bitrate, packet loss, latency)

---

## 9. Code Example (Từ mock_ws.py)

Backend hiện tại đã implement đầy đủ:

1. ✅ **WebSocket handler** (`handler()`)
2. ✅ **WebRTC offer handler** (`_handle_webrtc_offer()`)
3. ✅ **ICE candidate handler** (`_handle_webrtc_ice()`)
4. ✅ **VideoTrack** để stream từ file
5. ✅ **Codec preference** (H.264/VP8/VP9)
6. ✅ **Bitrate control**
7. ✅ **Data channel** cho metrics

**Để adapt cho production:**
- Thay `VideoTrack` đọc từ file → đọc từ camera/Kafka
- Thêm authentication/authorization
- Thêm logging/monitoring
- Thêm TURN server nếu cần

---

## 10. Testing

Để test backend:

```bash
# Start backend
python3 backend/mock_ws.py

# Frontend sẽ tự động:
# 1. Connect WebSocket
# 2. Nhận device_list
# 3. Tạo WebRTC offer cho mỗi device
# 4. Nhận answer và stream video
```

Kiểm tra logs để xem:
- WebSocket connections
- WebRTC peer connection states
- ICE gathering/connection states
- Frame sending rate

---

## Kết luận

Backend của bạn **đã có đầy đủ** implementation cơ bản. Để production-ready, chỉ cần:
1. Thay video source (file → camera/Kafka)
2. Thêm error handling & monitoring
3. Thêm TURN server nếu cần
4. Optimize codec/bitrate cho use case cụ thể


