import { useCallback, useEffect, useRef, useState } from "react"

type ConnectionStatus = "connecting" | "connected" | "disconnected" | "reconnecting"

type TransportType = "webrtc" | "none"

type Stats = {
  transport: "WebRTC"
  bitrateKbps?: number
  fps?: number
  rttMs?: number
  packetLossPct?: number
  width?: number
  height?: number
  jitterMs?: number
  latencyMs?: number
}

export function useStreaming() {
  const [isConnected, setIsConnected] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected")
  const [transport, setTransport] = useState<TransportType>("none")
  const [devices, setDevices] = useState<string[]>([])
  const [mediaStreams, setMediaStreams] = useState<Map<string, MediaStream>>(new Map())
  const [statsMap, setStatsMap] = useState<Map<string, Stats>>(new Map())

  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectAttemptsRef = useRef(0)

  const maxReconnectAttempts = 10
  const baseReconnectDelay = 1000

  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map())
  const prevInboundStatsRef = useRef<
    Map<
      string,
      {
        bytesReceived: number
        timestamp: number
        packetsLost: number
        packetsReceived: number
      }
    >
  >(new Map())

  const getReconnectDelay = () => {
    return Math.min(baseReconnectDelay * Math.pow(2, reconnectAttemptsRef.current), 30000)
  }

  const cleanupConnection = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }

    if (wsRef.current) {
      wsRef.current.onopen = null
      wsRef.current.onmessage = null
      wsRef.current.onclose = null
      wsRef.current.onerror = null

      if (
        wsRef.current.readyState === WebSocket.OPEN ||
        wsRef.current.readyState === WebSocket.CONNECTING
      ) {
        wsRef.current.close(1000, "Client disconnecting")
      }
      wsRef.current = null
    }

    // Close peer connections
    peerConnections.current.forEach((pc) => {
      pc.close()
    })
    peerConnections.current.clear()
    setMediaStreams(new Map())
    setStatsMap(new Map())
  }, [])

  const startWebRTCForDevice = useCallback(
    async (deviceId: string) => {
      if (!wsRef.current || peerConnections.current.has(deviceId)) return

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: ["stun:stun.l.google.com:19302"] }],
      })
      peerConnections.current.set(deviceId, pc)

      // Data channel used by backend to send per-frame timestamps (latency measurement)
      const dc = pc.createDataChannel("metrics")
      dc.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data)
          if (
            msg &&
            msg.type === "frame_ts" &&
            msg.device_id === deviceId &&
            typeof msg.created_at === "number"
          ) {
            const latencyMs = Date.now() - msg.created_at
            setStatsMap((prev) => {
              const next = new Map(prev)
              const prevStats = next.get(deviceId) || { transport: "WebRTC" as const }
              next.set(deviceId, { ...prevStats, transport: "WebRTC", latencyMs })
              return next
            })
          }
        } catch {
          // ignore malformed metrics messages
        }
      }

      pc.ontrack = (ev) => {
        const stream = ev.streams[0]
        setMediaStreams((prev) => {
          const next = new Map(prev)
          next.set(deviceId, stream)
          return next
        })
        setTransport("webrtc")
      }

      const statsInterval = window.setInterval(async () => {
        try {
          const stats = await pc.getStats()
          let fps: number | undefined
          let rttMs: number | undefined
          let bitrateKbps: number | undefined
          let packetLossPct: number | undefined
          let width: number | undefined
          let height: number | undefined
          let jitterMs: number | undefined

          let inboundReport: any | null = null

          stats.forEach((report: any) => {
            if (report.type === "inbound-rtp" && report.kind === "video") {
              inboundReport = report
              if (typeof report.framesPerSecond === "number") fps = report.framesPerSecond
              if (typeof report.jitter === "number") {
                jitterMs = report.jitter * 1000
              }
              if (typeof report.frameWidth === "number") width = report.frameWidth
              if (typeof report.frameHeight === "number") height = report.frameHeight
            }
            if (report.type === "candidate-pair" && report.state === "succeeded") {
              if (typeof report.currentRoundTripTime === "number") {
                rttMs = report.currentRoundTripTime * 1000
              }
            }
          })

          if (inboundReport) {
            const bytesReceived = inboundReport.bytesReceived ?? 0
            const timestamp = inboundReport.timestamp ?? 0
            const packetsLost = inboundReport.packetsLost ?? 0
            const packetsReceived = inboundReport.packetsReceived ?? 0

            const prevMap = prevInboundStatsRef.current
            const prev = prevMap.get(deviceId)
            if (prev && timestamp > prev.timestamp) {
              const deltaBytes = bytesReceived - prev.bytesReceived
              const deltaTimeMs = timestamp - prev.timestamp
              if (deltaTimeMs > 0 && deltaBytes >= 0) {
                const bitsPerSecond = (deltaBytes * 8 * 1000) / deltaTimeMs
                bitrateKbps = bitsPerSecond / 1000
              }

              const deltaPacketsLost = packetsLost - prev.packetsLost
              const deltaPacketsReceived = packetsReceived - prev.packetsReceived
              const totalDeltaPackets = deltaPacketsLost + deltaPacketsReceived
              if (totalDeltaPackets > 0 && deltaPacketsLost >= 0) {
                packetLossPct = (deltaPacketsLost / totalDeltaPackets) * 100
              }
            }

            prevMap.set(deviceId, {
              bytesReceived,
              timestamp,
              packetsLost,
              packetsReceived,
            })
          }

          setStatsMap((prev) => {
            const next = new Map(prev)
            const prevStats = next.get(deviceId) || { transport: "WebRTC" as const }
            const updated: Stats = {
              ...prevStats,
              transport: "WebRTC",
            }

            // Only overwrite fields when we have fresh values; otherwise keep previous
            if (typeof fps === "number") updated.fps = fps
            if (typeof rttMs === "number") updated.rttMs = rttMs
            if (typeof bitrateKbps === "number") updated.bitrateKbps = bitrateKbps
            if (typeof packetLossPct === "number") updated.packetLossPct = packetLossPct
            if (typeof width === "number") updated.width = width
            if (typeof height === "number") updated.height = height
            if (typeof jitterMs === "number") updated.jitterMs = jitterMs

            next.set(deviceId, updated)
            return next
          })
        } catch {
          // ignore stats errors
        }
      }, 2000)

      pc.addEventListener("connectionstatechange", () => {
        if (
          pc.connectionState === "closed" ||
          pc.connectionState === "failed" ||
          pc.connectionState === "disconnected"
        ) {
          window.clearInterval(statsInterval)
        }
      })

      pc.onicecandidate = (ev) => {
        if (ev.candidate) {
          wsRef.current?.send(
            JSON.stringify({
              type: "webrtc_ice",
              device_id: deviceId,
              candidate: ev.candidate,
            }),
          )
        }
      }

      pc.addTransceiver("video", { direction: "recvonly" })
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      wsRef.current.send(
        JSON.stringify({
          type: "webrtc_offer",
          device_id: deviceId,
          sdp: pc.localDescription,
        }),
      )
    },
    [],
  )

  const connectWebSocket = useCallback(
    (isManualReconnect = false) => {
      if (
        wsRef.current &&
        (wsRef.current.readyState === WebSocket.CONNECTING ||
          wsRef.current.readyState === WebSocket.OPEN)
      ) {
        return
      }

      cleanupConnection()

      if (isManualReconnect) {
        reconnectAttemptsRef.current = 0
      }

      if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
        setConnectionStatus("disconnected")
        return
      }

      try {
        setConnectionStatus(
          reconnectAttemptsRef.current === 0 ? "connecting" : "reconnecting",
        )

        const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8765"
        const ws = new WebSocket(wsUrl)
        wsRef.current = ws

        const connectionTimeout = setTimeout(() => {
          if (ws.readyState === WebSocket.CONNECTING) {
            ws.close()
          }
        }, 10000)

        ws.onopen = () => {
          clearTimeout(connectionTimeout)
          setIsConnected(true)
          setConnectionStatus("connected")
          reconnectAttemptsRef.current = 0
        }

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data)

            switch (data.type) {
              case "device_list":
                setDevices(data.devices)
                data.devices.forEach((id: string) => {
                  startWebRTCForDevice(id)
                })
                break

              case "webrtc_answer": {
                const { device_id, sdp } = data
                const pc = peerConnections.current.get(device_id)
                if (pc) {
                  pc.setRemoteDescription(new RTCSessionDescription(sdp))
                }
                break
              }

              case "webrtc_ice": {
                const { device_id, candidate } = data
                const pc = peerConnections.current.get(device_id)
                if (pc && candidate) {
                  pc.addIceCandidate(candidate).catch(() => {})
                }
                break
              }

              default:
                break
            }
          } catch {
            // ignore parse errors
          }
        }

        ws.onclose = (event) => {
          clearTimeout(connectionTimeout)
          setIsConnected(false)
          setConnectionStatus("disconnected")

          if (event.code !== 1000 && reconnectAttemptsRef.current < maxReconnectAttempts) {
            reconnectAttemptsRef.current++
            const delay = getReconnectDelay()
            setConnectionStatus("reconnecting")
            reconnectTimeoutRef.current = setTimeout(() => {
              connectWebSocket()
            }, delay)
          }
        }

        ws.onerror = () => {
          clearTimeout(connectionTimeout)
          setIsConnected(false)
          setConnectionStatus("disconnected")
        }
      } catch {
        setConnectionStatus("disconnected")
      }
    },
    [cleanupConnection, maxReconnectAttempts, baseReconnectDelay, startWebRTCForDevice],
  )

  const manualReconnect = useCallback(() => {
    reconnectAttemptsRef.current = 0
    connectWebSocket(true)
  }, [connectWebSocket])

  useEffect(() => {
    connectWebSocket(true)
    return () => {
      cleanupConnection()
    }
  }, [connectWebSocket, cleanupConnection])

  return {
    isConnected,
    connectionStatus,
    transport,
    devices,
    mediaStreams,
    statsMap,
    reconnectAttempts: reconnectAttemptsRef.current,
    maxReconnectAttempts,
    manualReconnect,
  }
}


