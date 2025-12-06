"use client"

import { useState, useEffect, useRef } from "react"
import { VideoPlayer } from "./video-player"
import { DetectionOverlay } from "./detection-overlay"
import { MetadataPanel } from "./metadata-panel"
import { SearchPanel } from "./search-panel"
import { Button } from "@/components/ui/button"
import { Play, Pause, Search, Settings } from "lucide-react"
import { DetectionProcessor, type DetectionResult } from "@/lib/detection-processor"

export function StreamObserver() {
  const [isPlaying, setIsPlaying] = useState(false)
  const [detections, setDetections] = useState<DetectionResult[]>([])
  const [selectedDetection, setSelectedDetection] = useState<string | null>(null)
  const [showSearch, setShowSearch] = useState(false)
  const [fps, setFps] = useState(0)
  const videoRef = useRef<HTMLVideoElement>(null)
  const processorRef = useRef<DetectionProcessor | null>(null)

  useEffect(() => {
    const streamId = `stream-${Date.now()}`
    processorRef.current = new DetectionProcessor(streamId, 100)
  }, [])

  useEffect(() => {
    if (!isPlaying || !videoRef.current || !processorRef.current) {
      return
    }

    const stopProcessing = processorRef.current.startProcessing(videoRef.current, (newDetections) => {
      setDetections(newDetections)
      // Calculate FPS
      setFps((prev) => Math.round(prev * 0.9 + 10))
    })

    return stopProcessing
  }, [isPlaying])

  return (
    <div className="flex h-screen bg-background">
      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="border-b border-border bg-card">
          <div className="flex items-center justify-between px-6 py-4">
            <div className="flex items-center gap-4">
              <h1 className="text-xl font-semibold text-foreground">Stream Observer</h1>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                <span>Live</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowSearch(!showSearch)}>
                <Search className="h-4 w-4 mr-2" />
                Search
              </Button>
              <Button variant="outline" size="sm">
                <Settings className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </header>

        {/* Video Container */}
        <div className="flex-1 flex items-center justify-center bg-muted/20 p-6">
          <div className="relative w-full max-w-5xl aspect-video bg-black rounded-lg overflow-hidden shadow-2xl">
            <VideoPlayer isPlaying={isPlaying} ref={videoRef} />
            <DetectionOverlay detections={detections} selectedId={selectedDetection} onSelect={setSelectedDetection} />

            {/* Playback Controls */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/80 backdrop-blur-sm px-4 py-2 rounded-full">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setIsPlaying(!isPlaying)}
                className="text-white hover:text-white hover:bg-white/20"
              >
                {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </Button>
              <div className="text-xs text-white font-mono">{new Date().toLocaleTimeString()}</div>
            </div>

            {/* Stats Overlay */}
            <div className="absolute top-4 left-4 bg-black/80 backdrop-blur-sm px-3 py-2 rounded-lg">
              <div className="text-xs text-white space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">FPS:</span>
                  <span className="font-mono">{fps}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Detections:</span>
                  <span className="font-mono text-primary">{detections.length}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Sidebar */}
      <div className="w-96 border-l border-border bg-card flex flex-col">
        {showSearch ? (
          <SearchPanel onClose={() => setShowSearch(false)} />
        ) : (
          <MetadataPanel detection={detections.find((d) => d.id === selectedDetection)} allDetections={detections} />
        )}
      </div>
    </div>
  )
}
