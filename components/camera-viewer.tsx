"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Play, Pause, Maximize2 } from "lucide-react"

interface Detection {
  id: string
  type: string
  confidence: number
  bbox: { x: number; y: number; width: number; height: number }
  attributes: Record<string, string>
}

interface CameraViewerProps {
  cameraId: string
  camera: {
    id: string
    name: string
    location: string
    status: string
  }
  // Optional live MediaStream (WebRTC) from backend
  mediaStream?: MediaStream | null
  // Optional streaming stats for overlay
  stats?: {
    transport: "WebRTC"
    bitrateKbps?: number
    fps?: number
    rttMs?: number
    packetLossPct?: number
    width?: number
    height?: number
    jitterMs?: number
    latencyMs?: number
  } | null
}

export function CameraViewer({ cameraId, camera, mediaStream, stats }: CameraViewerProps) {
  const [isPlaying, setIsPlaying] = useState(true)
  const [detections, setDetections] = useState<Detection[]>([])

  // Mock detections that update periodically
  useEffect(() => {
    const mockDetections: Detection[] = [
      {
        id: "det-1",
        type: "person",
        confidence: 0.94,
        bbox: { x: 120, y: 80, width: 180, height: 320 },
        attributes: { clothing: "blue jacket", gender: "male", age: "adult" },
      },
      {
        id: "det-2",
        type: "person",
        confidence: 0.89,
        bbox: { x: 450, y: 120, width: 160, height: 280 },
        attributes: { clothing: "red dress", gender: "female", age: "adult" },
      },
      {
        id: "det-3",
        type: "vehicle",
        confidence: 0.96,
        bbox: { x: 700, y: 200, width: 240, height: 180 },
        attributes: { type: "sedan", color: "white" },
      },
    ]

    setDetections(mockDetections)

    const interval = setInterval(() => {
      // Randomly update detections
      setDetections((prev) =>
        prev.map((det) => ({
          ...det,
          confidence: Math.max(0.7, Math.min(0.99, det.confidence + (Math.random() - 0.5) * 0.1)),
        })),
      )
    }, 2000)

    return () => clearInterval(interval)
  }, [cameraId])

  return (
    <div className="space-y-6">
      {/* Video Feed */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{camera.name}</CardTitle>
              <CardDescription>{camera.location}</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={() => setIsPlaying(!isPlaying)}>
                {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </Button>
              <Button variant="outline" size="icon">
                <Maximize2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="relative aspect-video overflow-hidden rounded-lg bg-black flex items-center justify-center">
            {stats && (
              <div className="absolute top-2 left-2 z-10 text-xs px-2 py-1 rounded bg-black/70 text-white space-y-0.5">
                <div className="font-semibold">{stats.transport}</div>
                {typeof stats.bitrateKbps === "number" && (
                  <div>Bitrate: {Math.round(stats.bitrateKbps)} kbps</div>
                )}
                {typeof stats.fps === "number" && <div>FPS: {Math.round(stats.fps)}</div>}
                {typeof stats.latencyMs === "number" && (
                  <div>Latency: {Math.round(stats.latencyMs)} ms</div>
                )}
                {typeof stats.rttMs === "number" && (
                  <div>RTT: {Math.round(stats.rttMs)} ms</div>
                )}
                {typeof stats.packetLossPct === "number" && (
                  <div>Loss: {stats.packetLossPct.toFixed(1)}%</div>
                )}
                {typeof stats.width === "number" &&
                  typeof stats.height === "number" && (
                    <div>
                      Res: {stats.width}×{stats.height}
                    </div>
                  )}
              </div>
            )}
            {/* Live WebRTC video if available, otherwise placeholder image */}
            {mediaStream ? (
              <video
                className="h-full w-full object-contain"
                autoPlay
                playsInline
                muted
                ref={(el) => {
                  if (el && el.srcObject !== mediaStream) {
                    el.srcObject = mediaStream
                  }
                }}
              />
            ) : (
              <img
                src="/security-camera-feed-parking-lot-view.jpg"
                alt="Camera feed"
                className="h-full w-full object-contain"
              />
            )}

            {/* Detection overlays */}
            {isPlaying &&
              detections.map((detection) => (
                <div
                  key={detection.id}
                  className="absolute border-2 border-primary"
                  style={{
                    left: `${(detection.bbox.x / 1280) * 100}%`,
                    top: `${(detection.bbox.y / 720) * 100}%`,
                    width: `${(detection.bbox.width / 1280) * 100}%`,
                    height: `${(detection.bbox.height / 720) * 100}%`,
                  }}
                >
                  <div className="absolute -top-6 left-0 flex items-center gap-1 rounded bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                    {detection.type}
                    <span className="opacity-75">{Math.round(detection.confidence * 100)}%</span>
                  </div>
                </div>
              ))}

            {/* Status overlay */}
            <div className="absolute bottom-4 left-4 flex items-center gap-2 rounded-lg bg-black/60 px-3 py-2 backdrop-blur-sm">
              <div className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
              <span className="text-sm font-medium text-white">LIVE</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Detection Details */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {detections.map((detection) => (
          <Card key={detection.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base capitalize">{detection.type}</CardTitle>
                <Badge variant="secondary">{Math.round(detection.confidence * 100)}%</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                {Object.entries(detection.attributes).map(([key, value]) => (
                  <div key={key} className="flex justify-between">
                    <span className="text-muted-foreground capitalize">{key}:</span>
                    <span className="font-medium">{value}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
