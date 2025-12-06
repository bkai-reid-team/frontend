# Synchronization giữa WebRTC Video và WebSocket Metadata

## Vấn đề: Desynchronization giữa 2 kênh

### Các trường hợp có thể xảy ra:

1. **WebRTC chậm hơn WebSocket**:
   - Metadata đến trước → Frontend không có frame tương ứng → Overlays hiển thị sai
   - Network congestion trên UDP (WebRTC)
   - Encoding delay trên backend

2. **WebSocket chậm hơn WebRTC**:
   - Video frame đến trước → Không có metadata → Overlays bị thiếu
   - Backend processing delay (ReID inference)
   - Network congestion trên TCP (WebSocket)

3. **Out-of-order delivery**:
   - Packets đến không đúng thứ tự
   - Metadata của frame N+1 đến trước frame N

---

## Giải pháp

### Solution 1: Timestamp-based Synchronization ⭐ RECOMMENDED

#### Concept:
- Mỗi frame và metadata đều có **timestamp** và **sequence number**
- Frontend buffer và match theo timestamp/seq

#### Implementation:

**Backend:**

```python
# backend/mock_ws.py - VideoTrack
async def recv(self):
    ok, img = self.cap.read()
    frame = VideoFrame.from_ndarray(img, format="bgr24")
    
    # Tạo unique frame ID và timestamp
    frame_id = f"{self.dev_id}_{self._pts}"
    frame_timestamp = int(time.time() * 1000)  # milliseconds
    
    # Set metadata trong frame (nếu aiortc hỗ trợ)
    frame.pts = self._pts
    frame.time_base = Fraction(1, self._time_base_den)
    
    # Gửi frame metadata qua DataChannel (cùng kênh với video)
    channel = self.server._data_channels.get(self.dev_id)
    if channel and getattr(channel, "readyState", "") == "open":
        payload = json.dumps({
            "type": "frame_metadata",
            "device_id": self.dev_id,
            "frame_id": frame_id,
            "seq": self._pts,
            "timestamp": frame_timestamp,
            "pts": self._pts,
        })
        try:
            channel.send(payload)  # DataChannel - cùng kênh với video
        except Exception:
            pass
    
    # Gửi detections qua WebSocket (nếu có)
    if self.server.has_detections(self.dev_id, frame_timestamp):
        detections = self.server.get_detections(self.dev_id, frame_timestamp)
        await self.server._send_json(self.server.clients, {
            "type": "detections",
            "device_id": self.dev_id,
            "frame_id": frame_id,
            "seq": self._pts,
            "timestamp": frame_timestamp,
            "detections": detections,
        })
    
    self._pts += 1
    return frame
```

**Frontend:**

```typescript
// hooks/use-streaming.ts
interface FrameMetadata {
  frame_id: string
  seq: number
  timestamp: number
  pts: number
}

interface DetectionMetadata {
  frame_id: string
  seq: number
  timestamp: number
  detections: Detection[]
}

export function useStreaming() {
  // Buffer để sync
  const frameMetadataBuffer = useRef<Map<string, FrameMetadata>>(new Map())
  const detectionBuffer = useRef<Map<string, DetectionMetadata>>(new Map())
  const syncedDetections = useRef<Map<string, Detection[]>>(new Map())
  
  // Buffer size limit
  const MAX_BUFFER_SIZE = 30  // ~1 second at 30fps
  
  // DataChannel handler (cùng kênh với video)
  dc.onmessage = (ev) => {
    const msg = JSON.parse(ev.data)
    
    if (msg.type === "frame_metadata") {
      // Frame metadata từ DataChannel (đồng bộ với video)
      frameMetadataBuffer.current.set(msg.frame_id, {
        frame_id: msg.frame_id,
        seq: msg.seq,
        timestamp: msg.timestamp,
        pts: msg.pts,
      })
      
      // Try to sync với detections
      syncFrameWithDetections(msg.frame_id)
    }
  }
  
  // WebSocket handler (metadata riêng)
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data)
    
    if (data.type === "detections") {
      // Detections từ WebSocket
      detectionBuffer.current.set(data.frame_id, {
        frame_id: data.frame_id,
        seq: data.seq,
        timestamp: data.timestamp,
        detections: data.detections,
      })
      
      // Try to sync với frame
      syncFrameWithDetections(data.frame_id)
    }
  }
  
  // Sync function
  const syncFrameWithDetections = (frameId: string) => {
    const frameMeta = frameMetadataBuffer.current.get(frameId)
    const detectionMeta = detectionBuffer.current.get(frameId)
    
    if (frameMeta && detectionMeta) {
      // Match found! Store synced detections
      syncedDetections.current.set(frameId, detectionMeta.detections)
      
      // Cleanup old buffers
      cleanupBuffers(frameId)
    } else if (frameMeta) {
      // Frame arrived, but no detections yet
      // Check if detections are too old (timeout)
      const now = Date.now()
      const age = now - frameMeta.timestamp
      if (age > 500) {  // 500ms timeout
        // Detections too late, use empty array
        syncedDetections.current.set(frameId, [])
        cleanupBuffers(frameId)
      }
    }
  }
  
  // Get detections for current video frame
  const getDetectionsForCurrentFrame = (videoElement: HTMLVideoElement): Detection[] => {
    // Get current PTS from video element (if available)
    // Or use timestamp-based matching
    const currentTime = videoElement.currentTime * 1000  // ms
    
    // Find closest frame metadata
    let closestFrameId: string | null = null
    let minDiff = Infinity
    
    frameMetadataBuffer.current.forEach((meta, frameId) => {
      const diff = Math.abs(meta.timestamp - currentTime)
      if (diff < minDiff && diff < 100) {  // Within 100ms
        minDiff = diff
        closestFrameId = frameId
      }
    })
    
    if (closestFrameId) {
      return syncedDetections.current.get(closestFrameId) || []
    }
    
    return []
  }
  
  // Cleanup old buffers
  const cleanupBuffers = (currentFrameId: string) => {
    const currentSeq = frameMetadataBuffer.current.get(currentFrameId)?.seq || 0
    
    // Remove frames older than current - buffer_size
    frameMetadataBuffer.current.forEach((meta, frameId) => {
      if (meta.seq < currentSeq - MAX_BUFFER_SIZE) {
        frameMetadataBuffer.current.delete(frameId)
        detectionBuffer.current.delete(frameId)
        syncedDetections.current.delete(frameId)
      }
    })
  }
}
```

---

### Solution 2: Sequence Number Matching

#### Concept:
- Mỗi frame có sequence number tăng dần
- Metadata phải có cùng seq number với frame

#### Implementation:

```python
# Backend
class VideoTrack:
    def __init__(self):
        self.frame_seq = 0
    
    async def recv(self):
        frame = VideoFrame.from_ndarray(img, format="bgr24")
        self.frame_seq += 1
        
        # Gửi frame với seq
        channel.send(json.dumps({
            "type": "frame_seq",
            "seq": self.frame_seq,
            "timestamp": int(time.time() * 1000),
        }))
        
        # Gửi detections với cùng seq
        await ws.send(json.dumps({
            "type": "detections",
            "seq": self.frame_seq,  # Cùng seq với frame
            "detections": detections,
        }))
        
        return frame
```

```typescript
// Frontend
const frameSeqMap = new Map<number, Detection[]>()

// Match theo seq number
ws.onmessage = (event) => {
  const data = JSON.parse(event.data)
  if (data.type === "detections") {
    frameSeqMap.set(data.seq, data.detections)
  }
}

// Get detections cho frame hiện tại
const getDetections = (currentSeq: number) => {
  return frameSeqMap.get(currentSeq) || []
}
```

**Pros:** Đơn giản, không cần timestamp  
**Cons:** Khó handle out-of-order, cần biết seq của frame hiện tại

---

### Solution 3: DataChannel thay vì WebSocket riêng ⭐ BEST

#### Concept:
- Gửi metadata qua **DataChannel** (cùng kênh với video)
- Đảm bảo cùng transport, cùng latency, cùng ordering

#### Implementation:

```python
# Backend - Gửi metadata qua DataChannel
@pc.on("datachannel")
def on_datachannel(channel):
    if channel.label == "metadata":
        self._metadata_channels[device_id] = channel

# Trong VideoTrack.recv()
async def recv(self):
    frame = VideoFrame.from_ndarray(img, format="bgr24")
    frame_seq = self._pts
    
    # Gửi metadata qua DataChannel (cùng kênh với video)
    metadata_channel = self.server._metadata_channels.get(self.dev_id)
    if metadata_channel and metadata_channel.readyState == "open":
        payload = json.dumps({
            "type": "detections",
            "seq": frame_seq,
            "timestamp": int(time.time() * 1000),
            "detections": detections,  # Từ ReID processing
        })
        try:
            metadata_channel.send(payload)
        except Exception:
            pass
    
    self._pts += 1
    return frame
```

```typescript
// Frontend - Nhận metadata từ DataChannel
const metadataChannel = pc.createDataChannel("metadata", { ordered: true })

metadataChannel.onmessage = (ev) => {
  const msg = JSON.parse(ev.data)
  if (msg.type === "detections") {
    // Metadata đến cùng kênh với video → đồng bộ tự nhiên
    setDetections(msg.seq, msg.detections)
  }
}
```

**Pros:**
- ✅ Cùng transport → cùng latency
- ✅ Ordered delivery (nếu set `ordered: true`)
- ✅ Không cần sync phức tạp
- ✅ Ít overhead hơn (không cần WebSocket riêng)

**Cons:**
- Cần tạo DataChannel từ backend (không phải frontend)

---

### Solution 4: Adaptive Buffering với Timeout

#### Concept:
- Buffer cả video và metadata
- Match theo timestamp với tolerance window
- Timeout nếu metadata quá muộn

#### Implementation:

```typescript
class SynchronizedBuffer {
  private videoBuffer: Map<number, VideoFrame> = new Map()
  private metadataBuffer: Map<number, Detection[]> = new Map()
  private readonly SYNC_WINDOW_MS = 100  // 100ms tolerance
  private readonly MAX_BUFFER_SIZE = 30
  
  addVideoFrame(seq: number, timestamp: number, frame: VideoFrame) {
    this.videoBuffer.set(seq, frame)
    this.trySync(seq, timestamp)
    this.cleanup(seq)
  }
  
  addMetadata(seq: number, timestamp: number, detections: Detection[]) {
    this.metadataBuffer.set(seq, detections)
    this.trySync(seq, timestamp)
    this.cleanup(seq)
  }
  
  private trySync(seq: number, timestamp: number) {
    const videoFrame = this.videoBuffer.get(seq)
    const metadata = this.metadataBuffer.get(seq)
    
    if (videoFrame && metadata) {
      // Perfect match
      this.emitSynced(seq, videoFrame, metadata)
      return
    }
    
    // Try to find closest match by timestamp
    let bestMatch: { seq: number; diff: number } | null = null
    
    this.videoBuffer.forEach((frame, videoSeq) => {
      const meta = this.metadataBuffer.get(videoSeq)
      if (!meta) {
        // Check timestamp difference
        const videoTimestamp = this.getTimestamp(videoSeq)
        const diff = Math.abs(videoTimestamp - timestamp)
        
        if (diff < this.SYNC_WINDOW_MS) {
          if (!bestMatch || diff < bestMatch.diff) {
            bestMatch = { seq: videoSeq, diff }
          }
        }
      }
    })
    
    if (bestMatch) {
      const matchedMeta = this.metadataBuffer.get(bestMatch.seq)
      if (matchedMeta) {
        this.emitSynced(bestMatch.seq, this.videoBuffer.get(bestMatch.seq)!, matchedMeta)
      }
    }
  }
  
  private cleanup(currentSeq: number) {
    // Remove old entries
    const cutoff = currentSeq - this.MAX_BUFFER_SIZE
    
    this.videoBuffer.forEach((_, seq) => {
      if (seq < cutoff) this.videoBuffer.delete(seq)
    })
    
    this.metadataBuffer.forEach((_, seq) => {
      if (seq < cutoff) this.metadataBuffer.delete(seq)
    })
  }
  
  // Timeout handler - nếu metadata quá muộn
  setTimeout(() => {
    const now = Date.now()
    this.videoBuffer.forEach((frame, seq) => {
      const timestamp = this.getTimestamp(seq)
      if (now - timestamp > 500 && !this.metadataBuffer.has(seq)) {
        // Metadata quá muộn (>500ms), use empty detections
        this.emitSynced(seq, frame, [])
        this.videoBuffer.delete(seq)
      }
    })
  }, 100)  // Check every 100ms
}
```

---

## So sánh các giải pháp

| Solution | Complexity | Latency | Reliability | Recommended |
|----------|-----------|---------|------------|-------------|
| **Timestamp Sync** | Medium | Low | High | ✅ Yes |
| **Seq Number** | Low | Low | Medium | ⚠️ Limited |
| **DataChannel** | Low | Lowest | Highest | ✅✅ Best |
| **Adaptive Buffer** | High | Medium | High | ⚠️ Complex |

---

## Khuyến nghị Implementation

### Phase 1: DataChannel cho Metadata (BEST)

**Lý do:**
- Cùng transport với video → tự động đồng bộ
- Ordered delivery → không lo out-of-order
- Latency thấp nhất
- Code đơn giản nhất

**Implementation:**

```python
# Backend - Tạo metadata DataChannel
@pc.on("datachannel")
def on_datachannel(channel):
    if channel.label == "metadata":
        self._metadata_channels[device_id] = channel

# Gửi metadata cùng lúc với frame
async def recv(self):
    frame = VideoFrame.from_ndarray(img, format="bgr24")
    
    # Gửi qua DataChannel (cùng kênh với video)
    if metadata_channel:
        metadata_channel.send(json.dumps({
            "type": "detections",
            "seq": self._pts,
            "detections": detections,
        }))
    
    self._pts += 1
    return frame
```

### Phase 2: Fallback với Timestamp Sync

Nếu DataChannel không đủ, thêm timestamp-based sync:

```typescript
// Frontend - Hybrid approach
const useDataChannel = true  // Prefer DataChannel
const useTimestampSync = true  // Fallback

if (useDataChannel && metadataFromDataChannel) {
  // Use DataChannel (best)
} else if (useTimestampSync) {
  // Fallback to timestamp sync
  syncByTimestamp(frameTimestamp, detectionTimestamp)
}
```

---

## Monitoring & Debugging

### Metrics cần track:

1. **Sync delay**: Thời gian giữa video frame và metadata
2. **Buffer size**: Số lượng frames/metadata trong buffer
3. **Timeout rate**: Số lần metadata đến quá muộn
4. **Out-of-order rate**: Số lần packets đến sai thứ tự

### Debug tools:

```typescript
// Log sync stats
const syncStats = {
  totalFrames: 0,
  syncedFrames: 0,
  timeoutFrames: 0,
  avgSyncDelay: 0,
}

// Update stats
if (synced) {
  syncStats.syncedFrames++
  syncStats.avgSyncDelay = (syncStats.avgSyncDelay + delay) / 2
} else if (timeout) {
  syncStats.timeoutFrames++
}

// Display in UI
console.log(`Sync rate: ${syncStats.syncedFrames / syncStats.totalFrames * 100}%`)
```

---

## Best Practices

1. **Use DataChannel** cho metadata (cùng kênh với video)
2. **Sequence numbers** để track ordering
3. **Timestamps** để handle clock skew
4. **Buffering** với reasonable size (30 frames ~1s)
5. **Timeout** để handle missing metadata (500ms)
6. **Cleanup** old buffers để tránh memory leak
7. **Monitoring** sync metrics để detect issues

---

## Kết luận

**Khuyến nghị:**
1. ✅ **Primary**: Dùng DataChannel cho metadata (cùng kênh với video)
2. ✅ **Fallback**: Timestamp-based sync nếu cần WebSocket riêng
3. ✅ **Monitoring**: Track sync metrics để detect issues sớm

**Lợi ích:**
- Đồng bộ tự nhiên (cùng transport)
- Latency thấp
- Code đơn giản
- Reliable (ordered delivery)


