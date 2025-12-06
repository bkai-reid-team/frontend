import { type NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

interface TrackUpdate {
  trackId: string
  detectionId: string
  timestamp: number
  bbox: { x: number; y: number; width: number; height: number }
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

    const { streamId, detections } = await request.json()

    if (!streamId || !detections) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // Get recent tracks for this stream
    const { data: recentTracks, error: tracksError } = await supabase
      .from("tracks")
      .select("*")
      .eq("stream_id", streamId)
      .gte("last_seen", new Date(Date.now() - 5000).toISOString())
      .order("last_seen", { ascending: false })

    if (tracksError) {
      console.error("[v0] Tracks query error:", tracksError)
      throw new Error("Failed to query tracks")
    }

    // Match detections to existing tracks or create new ones
    const trackUpdates = await matchDetectionsToTracks(detections, recentTracks || [])

    // Update or insert tracks
    const { data: updatedTracks, error: updateError } = await supabase
      .from("tracks")
      .upsert(trackUpdates, { onConflict: "id" })
      .select()

    if (updateError) {
      console.error("[v0] Track update error:", updateError)
      throw new Error("Failed to update tracks")
    }

    return NextResponse.json({
      success: true,
      tracks: updatedTracks,
      matched: trackUpdates.filter((t) => !t.id.startsWith("new-")).length,
      created: trackUpdates.filter((t) => t.id.startsWith("new-")).length,
    })
  } catch (error) {
    console.error("[v0] Tracking error:", error)
    return NextResponse.json({ error: "Failed to track objects" }, { status: 500 })
  }
}

// Simple tracking algorithm - in production, use DeepSORT or similar
async function matchDetectionsToTracks(detections: any[], existingTracks: any[]) {
  const updates = []
  const unmatchedDetections = [...detections]

  // Try to match each detection to an existing track
  for (const track of existingTracks) {
    let bestMatch = null
    let bestIoU = 0.3 // Minimum IoU threshold

    for (let i = 0; i < unmatchedDetections.length; i++) {
      const det = unmatchedDetections[i]
      const iou = calculateIoU(track.last_bbox, det.bbox)

      if (iou > bestIoU) {
        bestIoU = iou
        bestMatch = { detection: det, index: i }
      }
    }

    if (bestMatch) {
      // Update existing track
      updates.push({
        id: track.id,
        stream_id: track.stream_id,
        first_seen: track.first_seen,
        last_seen: new Date().toISOString(),
        last_bbox: bestMatch.detection.bbox,
        detection_count: track.detection_count + 1,
      })
      unmatchedDetections.splice(bestMatch.index, 1)
    }
  }

  // Create new tracks for unmatched detections
  for (const det of unmatchedDetections) {
    updates.push({
      id: `new-${Math.random().toString(36).substr(2, 9)}`,
      stream_id: det.streamId,
      first_seen: new Date().toISOString(),
      last_seen: new Date().toISOString(),
      last_bbox: det.bbox,
      detection_count: 1,
    })
  }

  return updates
}

// Calculate Intersection over Union for bounding boxes
function calculateIoU(
  bbox1: { x: number; y: number; width: number; height: number },
  bbox2: { x: number; y: number; width: number; height: number },
): number {
  const x1 = Math.max(bbox1.x, bbox2.x)
  const y1 = Math.max(bbox1.y, bbox2.y)
  const x2 = Math.min(bbox1.x + bbox1.width, bbox2.x + bbox2.width)
  const y2 = Math.min(bbox1.y + bbox1.height, bbox2.y + bbox2.height)

  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1)
  const area1 = bbox1.width * bbox1.height
  const area2 = bbox2.width * bbox2.height
  const union = area1 + area2 - intersection

  return intersection / union
}
