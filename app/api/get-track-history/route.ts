import { type NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url)
    const trackId = searchParams.get("trackId")

    if (!trackId) {
      return NextResponse.json({ error: "Track ID is required" }, { status: 400 })
    }

    // Get track information
    const { data: track, error: trackError } = await supabase.from("tracks").select("*").eq("id", trackId).single()

    if (trackError) {
      console.error("[v0] Track query error:", trackError)
      throw new Error("Failed to fetch track")
    }

    // Get all detections for this track
    const { data: detections, error: detectionsError } = await supabase
      .from("detections")
      .select("*")
      .eq("track_id", trackId)
      .order("timestamp", { ascending: true })

    if (detectionsError) {
      console.error("[v0] Detections query error:", detectionsError)
      throw new Error("Failed to fetch track detections")
    }

    // Calculate track statistics
    const duration = new Date(track.last_seen).getTime() - new Date(track.first_seen).getTime()
    const avgConfidence = detections.reduce((sum, det) => sum + det.confidence, 0) / detections.length

    return NextResponse.json({
      success: true,
      track: {
        ...track,
        duration,
        avgConfidence,
      },
      detections,
      timeline: detections.map((det) => ({
        timestamp: det.timestamp,
        bbox: {
          x: det.bbox_x,
          y: det.bbox_y,
          width: det.bbox_width,
          height: det.bbox_height,
        },
        confidence: det.confidence,
      })),
    })
  } catch (error) {
    console.error("[v0] Track history error:", error)
    return NextResponse.json({ error: "Failed to get track history" }, { status: 500 })
  }
}
