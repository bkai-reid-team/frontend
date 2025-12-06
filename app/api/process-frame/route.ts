import { type NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

// Detection result interface
interface Detection {
  bbox: { x: number; y: number; width: number; height: number }
  confidence: number
  class: string
  trackId?: string
}

interface ProcessedFrame {
  frameId: string
  timestamp: number
  detections: Detection[]
  metadata: {
    fps: number
    resolution: { width: number; height: number }
  }
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          },
        },
      },
    )

    const formData = await request.formData()
    const frameBlob = formData.get("frame") as Blob
    const timestamp = Number.parseInt(formData.get("timestamp") as string)
    const streamId = formData.get("streamId") as string

    if (!frameBlob || !timestamp || !streamId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // Convert blob to base64 for processing
    const arrayBuffer = await frameBlob.arrayBuffer()
    const base64Frame = Buffer.from(arrayBuffer).toString("base64")

    // Run object detection (placeholder - in production, call YOLO API)
    const detections = await runObjectDetection(base64Frame)

    // Store detections in database
    const storedDetections = await storeDetections(supabase, streamId, timestamp, detections)

    return NextResponse.json({
      success: true,
      frameId: `frame-${timestamp}`,
      detections: storedDetections,
      processedAt: Date.now(),
    })
  } catch (error) {
    console.error("[v0] Frame processing error:", error)
    return NextResponse.json({ error: "Failed to process frame" }, { status: 500 })
  }
}

// Placeholder for YOLO detection - replace with actual model inference
async function runObjectDetection(base64Frame: string): Promise<Detection[]> {
  // In production, this would call a YOLO model API or run inference
  // For now, return mock detections with realistic structure

  // Simulate processing delay
  await new Promise((resolve) => setTimeout(resolve, 50))

  // Mock detections - in production, these come from YOLO
  const mockDetections: Detection[] = [
    {
      bbox: { x: 120, y: 80, width: 180, height: 320 },
      confidence: 0.94,
      class: "person",
      trackId: `track-${Math.random().toString(36).substr(2, 9)}`,
    },
    {
      bbox: { x: 450, y: 120, width: 160, height: 280 },
      confidence: 0.89,
      class: "person",
      trackId: `track-${Math.random().toString(36).substr(2, 9)}`,
    },
  ]

  return mockDetections
}

async function storeDetections(supabase: any, streamId: string, timestamp: number, detections: Detection[]) {
  const detectionsToStore = detections.map((det) => ({
    stream_id: streamId,
    timestamp: new Date(timestamp).toISOString(),
    bbox_x: det.bbox.x,
    bbox_y: det.bbox.y,
    bbox_width: det.bbox.width,
    bbox_height: det.bbox.height,
    confidence: det.confidence,
    class_name: det.class,
    track_id: det.trackId,
    attributes: {
      // Extract attributes from detection
      type: det.class,
      confidence: det.confidence,
    },
  }))

  const { data, error } = await supabase.from("detections").insert(detectionsToStore).select()

  if (error) {
    console.error("[v0] Database insert error:", error)
    throw new Error("Failed to store detections")
  }

  return data
}
