"use client"

// Client-side detection processor for real-time frame processing

export interface DetectionResult {
  id: string
  bbox: { x: number; y: number; width: number; height: number }
  confidence: number
  attributes: {
    type: string
    clothing?: string
    accessories?: string
    pose?: string
  }
  timestamp: number
  trackId: string
}

export class DetectionProcessor {
  private streamId: string
  private processingInterval: number
  private isProcessing = false

  constructor(streamId: string, processingInterval = 100) {
    this.streamId = streamId
    this.processingInterval = processingInterval
  }

  async processFrame(videoElement: HTMLVideoElement): Promise<DetectionResult[]> {
    if (this.isProcessing) {
      return []
    }

    this.isProcessing = true

    try {
      // Capture frame from video element
      const canvas = document.createElement("canvas")
      canvas.width = videoElement.videoWidth
      canvas.height = videoElement.videoHeight
      const ctx = canvas.getContext("2d")

      if (!ctx) {
        throw new Error("Failed to get canvas context")
      }

      ctx.drawImage(videoElement, 0, 0)

      // Convert to blob
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => {
            if (b) resolve(b)
            else reject(new Error("Failed to create blob"))
          },
          "image/jpeg",
          0.8,
        )
      })

      // Send to processing API
      const formData = new FormData()
      formData.append("frame", blob)
      formData.append("timestamp", Date.now().toString())
      formData.append("streamId", this.streamId)

      const response = await fetch("/api/process-frame", {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        throw new Error("Frame processing failed")
      }

      const result = await response.json()

      // Convert API response to DetectionResult format
      const detections: DetectionResult[] = result.detections.map((det: any) => ({
        id: det.id,
        bbox: {
          x: det.bbox_x,
          y: det.bbox_y,
          width: det.bbox_width,
          height: det.bbox_height,
        },
        confidence: det.confidence,
        attributes: det.attributes || { type: det.class_name },
        timestamp: new Date(det.timestamp).getTime(),
        trackId: det.track_id,
      }))

      return detections
    } catch (error) {
      console.error("[v0] Frame processing error:", error)
      return []
    } finally {
      this.isProcessing = false
    }
  }

  startProcessing(videoElement: HTMLVideoElement, onDetections: (detections: DetectionResult[]) => void): () => void {
    const interval = setInterval(async () => {
      const detections = await this.processFrame(videoElement)
      if (detections.length > 0) {
        onDetections(detections)
      }
    }, this.processingInterval)

    return () => clearInterval(interval)
  }
}
