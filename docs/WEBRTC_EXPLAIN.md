# WebRTC Under the Hood: Technical Deep Dive

## Overview: What Changed?

### Before (JSON + HTTP/WebSocket)
- **Format**: JPEG images encoded as **base64 strings**
- **Transport**: WebSocket (TCP-based) or HTTP POST requests
- **Protocol**: Application-layer (your custom JSON messages)
- **Example payload**:
  ```json
  {
    "type": "frame_update",
    "device_id": "edge_device_1",
    "image_base64": "iVBORw0KGgoAAAANSUhEUgAA...",  // ~100-500 KB per frame
    "frame_number": 1234,
    "tracked_persons": [...]
  }
  ```

### Now (WebRTC)
- **Format**: **H.264/VP8/VP9 encoded video frames** (compressed video stream)
- **Transport**: **UDP (SRTP)** - separate from WebSocket
- **Protocol**: RTP (Real-time Transport Protocol) over SRTP (Secure RTP)
- **What's sent**: Binary RTP packets containing encoded video chunks (~1-10 KB per packet)

---

## 1. What's Actually Being Sent Through WebRTC?

### Video Path (The Actual Stream)

When you call `pc.addTrack(VideoTrack(...))` in `mock_ws.py`:

1. **Raw frames** (BGR numpy arrays from OpenCV) → `VideoFrame.from_ndarray(img, format="bgr24")`
2. **aiortc encoder** (H.264/VP8/VP9) compresses each frame:
   - **H.264**: Uses temporal/spatial compression (I-frames, P-frames, B-frames)
   - **VP8/VP9**: Similar but different algorithm
   - Output: **Compressed video bitstream** (much smaller than JPEG)
3. **RTP packetization**: Encoder splits bitstream into **RTP packets** (~1-10 KB each)
4. **SRTP encryption**: Each RTP packet is encrypted with SRTP
5. **UDP transmission**: Packets sent over UDP to client's IP/port (discovered via ICE)

**Example**: A 1920×1080 frame:
- **JPEG (base64)**: ~200-500 KB
- **H.264 (compressed)**: ~5-50 KB (depends on bitrate, motion, quality settings)

### Data Channel Path (Metrics Only)

The **data channel** (`metrics`) sends small JSON messages over WebRTC's data channel protocol (SCTP over DTLS):
- **Payload**: `{"type": "frame_ts", "created_at": 1234567890, "seq": 42}`
- **Size**: ~50-100 bytes per message
- **Purpose**: Latency measurement (not the video itself)

---

## 2. WebSocket's Role: Signaling Only

**WebSocket is ONLY for signaling** - it never carries the actual video data.

### What WebSocket Does (Signaling)

1. **Initial handshake**:
   ```
   Client → Server: {"type": "webrtc_offer", "device_id": "...", "sdp": {...}}
   ```
   - Contains: SDP (Session Description Protocol) describing what codecs client supports, ICE candidates (IP/port pairs)

2. **Server response**:
   ```
   Server → Client: {"type": "webrtc_answer", "device_id": "...", "sdp": {...}}
   ```
   - Contains: Server's SDP (chosen codec, server's ICE candidates)

3. **ICE candidate exchange** (both directions):
   ```
   Client ↔ Server: {"type": "webrtc_ice", "device_id": "...", "candidate": {...}}
   ```
   - Contains: Network addresses (IP/port) where each peer can receive UDP packets

4. **Device list**:
   ```
   Server → Client: {"type": "device_list", "devices": ["edge_device_1", ...]}
   ```

### What Happens After Signaling

Once signaling completes:
- **WebSocket connection stays open** (for future signaling, renegotiation, or control messages)
- **Video data flows over UDP** (separate connection, discovered via ICE)
- **No video data ever goes through WebSocket**

**Analogy**: WebSocket is like a phone call to exchange addresses; the actual video is like packages sent via courier (UDP) to those addresses.

---

## 3. Why WebRTC is Better: Technical Reasons

### A. Transport Protocol: UDP vs TCP

**Before (TCP/WebSocket)**:
- **Reliability**: TCP guarantees delivery (retransmits lost packets)
- **Problem**: If packet #5 is lost, TCP blocks until #5 arrives → **head-of-line blocking**
- **Result**: High latency, stuttering when network is bad

**Now (UDP/SRTP)**:
- **No blocking**: Lost packets are dropped, newer packets continue
- **Result**: Lower latency, smoother playback (you see frame N+1 even if frame N was lost)

**Trade-off**: WebRTC accepts some packet loss for lower latency (good for live video; bad for file transfer).

---

### B. Codec Efficiency: H.264 vs JPEG

**JPEG (before)**:
- **Compression**: Only spatial (within a single frame)
- **No temporal compression**: Each frame is independent
- **Size**: ~200-500 KB per frame at 1920×1080

**H.264 (WebRTC)**:
- **Temporal compression**: References previous frames (I-frames, P-frames, B-frames)
- **Spatial compression**: Better algorithms than JPEG
- **Size**: ~5-50 KB per frame (depends on bitrate, motion)
- **Result**: **5-10x smaller** for similar visual quality

**Example at 30 FPS**:
- **JPEG**: 200 KB × 30 = **6 MB/s** (48 Mbps)
- **H.264** (2 Mbps bitrate): **2 Mbps** = **0.25 MB/s**
- **Savings**: ~24x less bandwidth

---

### C. Adaptive Bitrate (Congestion Control)

**Before (JSON/HTTP)**:
- Fixed JPEG quality → fixed bandwidth usage
- Network congestion → frames stall or timeout
- No adaptation

**Now (WebRTC)**:
- **Built-in congestion control** (GCC - Google Congestion Control):
  - Monitors packet loss, RTT, jitter
  - **Automatically reduces bitrate** when network is congested
  - **Increases bitrate** when network improves
- **Result**: Smooth playback even on variable networks

**How it works**:
1. Encoder starts at high bitrate (e.g., 5 Mbps)
2. Network congestion detected (high loss/RTT) → encoder reduces to 2 Mbps
3. Network improves → encoder ramps back up to 4 Mbps
4. All **automatic** - no manual intervention needed

---

### D. Lower Latency: Multiple Factors

**1. UDP vs TCP**:
- TCP retransmission adds 100-500 ms per lost packet
- UDP drops lost packets → **0 ms added latency** (but you might see a brief glitch)

**2. No HTTP overhead**:
- HTTP headers, base64 encoding/decoding add ~10-50 ms
- WebRTC: Direct binary RTP packets → **minimal overhead**

**3. Hardware acceleration**:
- Modern browsers/GPUs can **hardware-decode H.264** (faster than software JPEG decode)
- **Result**: Lower CPU usage, faster display

**4. Jitter buffer**:
- WebRTC has built-in jitter buffer (smooths out network timing variations)
- **Result**: More consistent frame timing

**Typical latency improvement**:
- **JSON/HTTP**: 500-2000 ms
- **WebRTC**: 100-500 ms (often 2-4x better)

---

### E. Better Frame Timing & Synchronization

**Before (JSON/HTTP)**:
- Manual frame pacing (you control `setInterval` or `requestAnimationFrame`)
- Network jitter → uneven frame intervals → stuttering

**Now (WebRTC)**:
- **RTP timestamps**: Each packet has a timestamp (PTS - Presentation Time Stamp)
- **Jitter buffer**: Smooths out network timing variations
- **Playback clock**: Browser uses RTP timestamps to play frames at correct time
- **Result**: Smooth, consistent frame rate

---

## Summary: Metrics Comparison

| Metric | JSON/HTTP (Before) | WebRTC (Now) | Why Better? |
|--------|-------------------|--------------|-------------|
| **Latency** | 500-2000 ms | 100-500 ms | UDP + no HTTP overhead + hardware decode |
| **Bandwidth** | 6-48 Mbps | 1-5 Mbps | H.264 temporal compression |
| **Smoothness** | Variable (manual pacing) | Consistent (RTP timestamps) | Built-in timing/sync |
| **Adaptability** | None (fixed quality) | Automatic (congestion control) | GCC algorithm |
| **CPU Usage** | High (JPEG decode) | Lower (hardware decode) | GPU acceleration |
| **Reliability** | High (TCP retransmit) | Lower (UDP drops) | Trade-off for latency |

---

## Visual Flow Comparison

### Before (JSON/HTTP):
```
Server (Python)
  ↓ [Read frame from video/Kafka]
  ↓ [Encode as JPEG]
  ↓ [Convert to base64]
  ↓ [Wrap in JSON]
  ↓ [Send via WebSocket (TCP)]
  ↓ [Network: TCP retransmits if lost]
  ↓ [Client receives]
  ↓ [Parse JSON]
  ↓ [Decode base64]
  ↓ [Decode JPEG]
  ↓ [Display on canvas]
```
**Total latency**: ~500-2000 ms

### Now (WebRTC):
```
Server (Python/aiortc)
  ↓ [Read frame from video/Kafka]
  ↓ [Convert to VideoFrame]
  ↓ [H.264 encoder (hardware if available)]
  ↓ [RTP packetization]
  ↓ [SRTP encryption]
  ↓ [Send via UDP (direct peer-to-peer)]
  ↓ [Network: UDP (no retransmit)]
  ↓ [Client receives]
  ↓ [SRTP decryption]
  ↓ [RTP depacketization]
  ↓ [H.264 decoder (hardware)]
  ↓ [Display in <video> element]
```
**Total latency**: ~100-500 ms

**Key difference**: WebRTC uses **UDP + video codecs + hardware acceleration** instead of **TCP + JPEG + software decode**.

---

## Conclusion

WebRTC is better because:
1. **UDP** → Lower latency (no head-of-line blocking)
2. **H.264/VP8** → 5-10x better compression than JPEG
3. **Adaptive bitrate** → Smooth playback on variable networks
4. **Hardware acceleration** → Lower CPU, faster decode
5. **Built-in timing** → Smooth frame pacing

The trade-off: WebRTC is more complex (signaling, ICE, codec negotiation) but provides **significantly better performance** for real-time video streaming.

