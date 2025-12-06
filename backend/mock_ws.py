import asyncio
import base64
import json
import os
import signal
import time
from typing import List, Set

import cv2
import websockets
import numpy as np
from aiortc import RTCPeerConnection, RTCSessionDescription, MediaStreamTrack
from aiortc.sdp import candidate_from_sdp
from aiortc.rtcrtpsender import RTCRtpSender
from aiortc.contrib.media import MediaBlackhole
from websockets.server import WebSocketServerProtocol
from dotenv import load_dotenv


load_dotenv()  # load configuration from .env at project root


class MockStreamingServer:
    """Multi-device mock WebSocket streamer on a single port."""

    def __init__(
        self,
        video_paths: List[str],
        device_ids: List[str],
        host: str = "0.0.0.0",
        port: int = 8765,
        target_fps: int = 12,
        jpeg_quality: int = 75,
        loop_video: bool = True,
    ):
        if not video_paths:
            raise ValueError("video_paths must not be empty")
        if not device_ids:
            raise ValueError("device_ids must not be empty")

        # Normalize lengths: repeat last path if fewer paths than device ids
        if len(video_paths) < len(device_ids):
            last = video_paths[-1]
            video_paths = video_paths + [last] * (len(device_ids) - len(video_paths))

        self.video_paths = video_paths
        self.device_ids = device_ids
        self.host = host
        self.port = port
        self.target_fps = max(1, min(target_fps, 60))
        self.jpeg_quality = max(1, min(jpeg_quality, 100))
        self.loop_video = loop_video

        self.clients: Set[WebSocketServerProtocol] = set()
        self.stop_event = asyncio.Event()
        self._prod_tasks: List[asyncio.Task] = []
        self._peer_connections: dict[str, RTCPeerConnection] = {}
        # Data channels keyed by device id (for per-frame timestamps / metrics)
        self._data_channels: dict[str, object] = {}

    async def _send_json(self, ws: WebSocketServerProtocol, data: dict):
        try:
            await ws.send(json.dumps(data))
        except Exception:
            pass

    async def _broadcast(self, data: dict):
        if not self.clients:
            return
        message = json.dumps(data)
        await asyncio.gather(
            *[self._safe_send(ws, message) for ws in list(self.clients)],
            return_exceptions=True,
        )

    async def _safe_send(self, ws: WebSocketServerProtocol, message: str):
        try:
            await ws.send(message)
        except Exception:
            # Drop dead connections
            if ws in self.clients:
                self.clients.remove(ws)

    async def handler(self, ws: WebSocketServerProtocol):
        self.clients.add(ws)
        try:
            # Initial device list (all devices)
            await self._send_json(ws, {"type": "device_list", "devices": self.device_ids})

            # Handle messages (subscribe_device, etc.) to keep parity with real server
            async for message in ws:
                try:
                    data = json.loads(message)
                    if data.get("type") == "subscribe_device":
                        # No-op for mock; producer loop is broadcasting to all clients
                        pass
                    elif data.get("type") == "webrtc_offer":
                        await self._handle_webrtc_offer(ws, data)
                    elif data.get("type") == "webrtc_ice":
                        await self._handle_webrtc_ice(ws, data)
                except Exception:
                    # ignore malformed messages in mock
                    pass
        finally:
            if ws in self.clients:
                self.clients.remove(ws)

    async def _handle_webrtc_offer(self, ws: WebSocketServerProtocol, data: dict):
        device_id = data.get("device_id")
        sdp = data.get("sdp")
        if not device_id or not sdp:
            return

        pc = RTCPeerConnection()
        self._peer_connections[device_id] = pc

        @pc.on("datachannel")
        def on_datachannel(channel):
            # Store data channel for this device so we can send per-frame timestamps
            self._data_channels[device_id] = channel

        # Track that periodically pushes frames from the corresponding video
        class VideoTrack(MediaStreamTrack):
            kind = "video"

            def __init__(self, server: "MockStreamingServer", dev_id: str, vpath: str, fps: int):
                super().__init__()
                self.server = server
                self.dev_id = dev_id
                self.cap = cv2.VideoCapture(vpath)
                self.frame_interval = 1.0 / max(1, fps)
                self.last_time = time.perf_counter()
                self._pts = 0
                self._time_base_num = 1
                self._time_base_den = max(1, fps)

            async def recv(self):
                # aiortc expects VideoFrame, convert using av if available; for simplicity,
                # send black frames if conversion not available.
                import av
                from av import VideoFrame

                ok, img = self.cap.read()
                if not ok:
                    if self.server.loop_video:
                        self.cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                        ok, img = self.cap.read()
                    if not ok:
                        await asyncio.sleep(self.frame_interval)
                        return VideoFrame.from_ndarray(
                            (255 * np.zeros((480, 640, 3), dtype=np.uint8)), format="bgr24"
                        )

                frame = VideoFrame.from_ndarray(img, format="bgr24")
                now = time.perf_counter()
                elapsed = now - self.last_time
                if elapsed < self.frame_interval:
                    await asyncio.sleep(self.frame_interval - elapsed)
                self.last_time = time.perf_counter()
                # Set pts/time_base for smoother playback
                self._pts += 1
                frame.pts = self._pts
                from fractions import Fraction
                frame.time_base = Fraction(self._time_base_num, self._time_base_den)

                # Send per-frame timestamp over data channel for latency measurement
                channel = self.server._data_channels.get(self.dev_id)
                if channel and getattr(channel, "readyState", "") == "open":
                    payload = json.dumps(
                        {
                            "type": "frame_ts",
                            "device_id": self.dev_id,
                            "created_at": int(time.time() * 1000),
                            "seq": self._pts,
                        }
                    )
                    try:
                        channel.send(payload)
                    except Exception:
                        # ignore send errors for metrics
                        pass
                return frame

        idx = self.device_ids.index(device_id) if device_id in self.device_ids else 0
        vpath = self.video_paths[idx]
        fps = self.target_fps

        # Create transceiver and prefer requested codec if available
        preferred_codec = os.getenv("MOCK_RTC_CODEC", "H264").upper()
        transceiver = pc.addTransceiver("video", direction="sendonly")
        try:
            caps = RTCRtpSender.getCapabilities("video")
            if preferred_codec in ("H264", "VP8", "VP9"):
                preferred = [c for c in caps.codecs if preferred_codec in c.mimeType]
                others = [c for c in caps.codecs if preferred_codec not in c.mimeType]
                if preferred:
                    transceiver.setCodecPreferences(preferred + others)
        except Exception:
            pass

        pc.addTrack(VideoTrack(self, device_id, vpath, fps))

        # Apply max sender bitrate if provided
        try:
            max_bps_str = os.getenv("MOCK_RTC_MAX_BITRATE", "5000000")
            max_bps = int(max_bps_str)
            if max_bps > 0:
                sender = next((s for s in pc.getSenders() if s.track and s.track.kind == "video"), None)
                if sender:
                    params = sender.getParameters()
                    if not params.get("encodings"):
                        params["encodings"] = [{}]
                    params["encodings"][0]["maxBitrate"] = max_bps
                    # aiortc setParameters is synchronous
                    sender.setParameters(params)
        except Exception:
            pass

        await pc.setRemoteDescription(RTCSessionDescription(sdp["sdp"], sdp["type"]))
        answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)

        # Wait for ICE gathering to complete so we can send a single SDP with candidates
        async def wait_ice_complete():
            while pc.iceGatheringState != "complete":
                await asyncio.sleep(0.05)

        await wait_ice_complete()

        await self._send_json(
            ws,
            {
                "type": "webrtc_answer",
                "device_id": device_id,
                "sdp": {
                    "type": pc.localDescription.type,
                    "sdp": pc.localDescription.sdp,
                },
            },
        )

    async def _handle_webrtc_ice(self, ws: WebSocketServerProtocol, data: dict):
        device_id = data.get("device_id")
        cand = data.get("candidate")
        pc = self._peer_connections.get(device_id)
        if not pc or not cand:
            return
        try:
            c = candidate_from_sdp(cand["candidate"])
            c.sdpMid = cand.get("sdpMid")
            c.sdpMLineIndex = cand.get("sdpMLineIndex")
            await pc.addIceCandidate(c)
        except Exception:
            pass

    async def _producer_loop(self, device_id: str, video_path: str):
        frame_number = 0
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            raise RuntimeError(f"Cannot open video: {video_path}")

        # Try to use video fps if present, otherwise target_fps
        video_fps = cap.get(cv2.CAP_PROP_FPS) or 0
        fps = self.target_fps if self.target_fps > 0 else (int(video_fps) or 12)
        frame_interval = 1.0 / fps

        last_time = time.perf_counter()

        while not self.stop_event.is_set():
            ok, frame = cap.read()
            if not ok:
                if self.loop_video:
                    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    continue
                else:
                    break

            # Encode JPEG
            encode_ok, buf = cv2.imencode(
                ".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, self.jpeg_quality]
            )
            if not encode_ok:
                continue
            image_base64 = base64.b64encode(buf).decode("utf-8")

            # Minimal tracked persons mock (center box)
            h, w = frame.shape[:2]
            cx, cy = w // 2, h // 2
            bw, bh = int(w * 0.2), int(h * 0.4)
            x1, y1, x2, y2 = cx - bw // 2, cy - bh // 2, cx + bw // 2, cy + bh // 2

            message = {
                "type": "frame_update",
                "device_id": device_id,
                "frame_number": frame_number,
                "tracked_persons": [
                    {
                        "person_id": 1,
                        "bbox": [float(x1), float(y1), float(x2), float(y2)],
                        "confidence": 0.95,
                        "gender": "unknown",
                        "gender_confidence": 0.5,
                    }
                ],
                "created_at": int(time.time() * 1000),
                "image_base64": image_base64,
            }

            await self._broadcast(message)

            frame_number += 1

            # pacing
            now = time.perf_counter()
            elapsed = now - last_time
            if elapsed < frame_interval:
                await asyncio.sleep(frame_interval - elapsed)
            last_time = time.perf_counter()

        cap.release()

    async def start(self):
        server = await websockets.serve(
            self.handler,
            self.host,
            self.port,
            ping_interval=20,
            ping_timeout=10,
            max_size=10 * 1024 * 1024,
            compression=None,
        )
        # Start a producer per device
        self._prod_tasks = [
            asyncio.create_task(self._producer_loop(did, vpath))
            for did, vpath in zip(self.device_ids, self.video_paths)
        ]

        # Graceful shutdown on SIGINT/SIGTERM
        loop = asyncio.get_running_loop()
        for s in (signal.SIGINT, signal.SIGTERM):
            try:
                loop.add_signal_handler(s, self.stop_event.set)
            except NotImplementedError:
                pass

        await self.stop_event.wait()
        for t in self._prod_tasks:
            t.cancel()
        for t in self._prod_tasks:
            try:
                await t
            except asyncio.CancelledError:
                pass
        server.close()
        await server.wait_closed()


async def amain():
    # Read configuration from env vars with sane defaults
    # Multiple devices are supported via comma-separated env vars
    # MOCK_DEVICE_IDS: e.g. "edge_device_1,edge_device_2"
    # MOCK_VIDEO_PATHS: e.g. "/path/a.mp4,/path/b.mp4" (if fewer than device ids, last path is reused)
    device_ids_env = os.getenv("MOCK_DEVICE_IDS")
    if device_ids_env:
        device_ids = [d.strip() for d in device_ids_env.split(",") if d.strip()]
    else:
        device_ids = [os.getenv("DEVICE_ID", "edge_device_1")]  # backward compatible

    video_paths_env = os.getenv("MOCK_VIDEO_PATHS")
    if video_paths_env:
        video_paths = [p.strip() for p in video_paths_env.split(",") if p.strip()]
    else:
        single_path = os.getenv(
            "MOCK_VIDEO_PATH",
            "/Users/vanhtran18/Documents/Study at school/ReID/Andrew Tate advice for young people _ Andrew Tate Motivation _  motivation success inspiration.mp4",
        )
        video_paths = [single_path]
    host = os.getenv("WEBSOCKET_HOST", "0.0.0.0")
    port = int(os.getenv("WEBSOCKET_PORT", "8765"))
    # Higher defaults for smoother and sharper video
    fps = int(os.getenv("MOCK_FPS", "50"))
    jpeg_q = int(os.getenv("MOCK_JPEG_QUALITY", "90"))
    loop_vid = os.getenv("MOCK_LOOP", "1") not in ("0", "false", "False")

    server = MockStreamingServer(
        video_paths=video_paths,
        device_ids=device_ids,
        host=host,
        port=port,
        target_fps=fps,
        jpeg_quality=jpeg_q,
        loop_video=loop_vid,
    )
    print(
        f"[mock-ws] Serving on ws://{host}:{port} with devices: {device_ids}\n"
        f"           Videos: {video_paths}"
    )
    await server.start()


def main():
    asyncio.run(amain())


if __name__ == "__main__":
    main()


