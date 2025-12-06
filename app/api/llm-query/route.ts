import { type NextRequest, NextResponse } from "next/server"
import { generateText, tool } from "ai"
import { z } from "zod"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

// Define tools for the LLM to query the detection system
const detectionTools = {
  searchByAttributes: tool({
    description:
      "Search for detections by attributes like clothing, accessories, pose, or object type. Use this when the user describes what they're looking for.",
    parameters: z.object({
      type: z.string().optional().describe("Type of object (e.g., 'person', 'vehicle')"),
      clothing: z.string().optional().describe("Clothing description (e.g., 'blue jacket', 'red shirt')"),
      accessories: z.string().optional().describe("Accessories (e.g., 'backpack', 'hat')"),
      pose: z.string().optional().describe("Pose or action (e.g., 'walking', 'standing')"),
      timeRange: z
        .object({
          start: z.string().describe("Start time in ISO format"),
          end: z.string().describe("End time in ISO format"),
        })
        .optional()
        .describe("Time range to search within"),
      minConfidence: z.number().optional().describe("Minimum confidence threshold (0-1)"),
    }),
    execute: async (params) => {
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

      let query = supabase.from("detections").select("*")

      if (params.type) {
        query = query.eq("class_name", params.type)
      }
      if (params.clothing) {
        query = query.contains("attributes", { clothing: params.clothing })
      }
      if (params.accessories) {
        query = query.contains("attributes", { accessories: params.accessories })
      }
      if (params.pose) {
        query = query.contains("attributes", { pose: params.pose })
      }
      if (params.timeRange) {
        query = query.gte("timestamp", params.timeRange.start).lte("timestamp", params.timeRange.end)
      }
      if (params.minConfidence) {
        query = query.gte("confidence", params.minConfidence)
      }

      query = query.order("timestamp", { ascending: false }).limit(20)

      const { data, error } = await query

      if (error) {
        return { error: error.message, results: [] }
      }

      return {
        results: data.map((d) => ({
          id: d.id,
          timestamp: d.timestamp,
          confidence: d.confidence,
          attributes: d.attributes,
          trackId: d.track_id,
        })),
        count: data.length,
      }
    },
  }),

  getTrackDetails: tool({
    description: "Get detailed information about a specific track, including its full history and timeline.",
    parameters: z.object({
      trackId: z.string().describe("The track ID to get details for"),
    }),
    execute: async ({ trackId }) => {
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

      const { data: track, error: trackError } = await supabase.from("tracks").select("*").eq("id", trackId).single()

      if (trackError) {
        return { error: trackError.message }
      }

      const { data: detections, error: detectionsError } = await supabase
        .from("detections")
        .select("*")
        .eq("track_id", trackId)
        .order("timestamp", { ascending: true })

      if (detectionsError) {
        return { error: detectionsError.message }
      }

      const duration = new Date(track.last_seen).getTime() - new Date(track.first_seen).getTime()

      return {
        track: {
          id: track.id,
          firstSeen: track.first_seen,
          lastSeen: track.last_seen,
          duration: `${Math.round(duration / 1000)}s`,
          detectionCount: track.detection_count,
        },
        detections: detections.map((d) => ({
          timestamp: d.timestamp,
          confidence: d.confidence,
          attributes: d.attributes,
        })),
      }
    },
  }),

  getRecentActivity: tool({
    description: "Get recent detection activity, optionally filtered by time window.",
    parameters: z.object({
      minutes: z.number().optional().describe("Number of minutes to look back (default: 5)"),
      streamId: z.string().optional().describe("Filter by specific stream ID"),
    }),
    execute: async ({ minutes = 5, streamId }) => {
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

      const cutoffTime = new Date(Date.now() - minutes * 60 * 1000).toISOString()

      let query = supabase.from("detections").select("*").gte("timestamp", cutoffTime)

      if (streamId) {
        query = query.eq("stream_id", streamId)
      }

      query = query.order("timestamp", { ascending: false }).limit(50)

      const { data, error } = await query

      if (error) {
        return { error: error.message, results: [] }
      }

      // Group by track
      const trackGroups = new Map()
      data.forEach((d) => {
        if (!trackGroups.has(d.track_id)) {
          trackGroups.set(d.track_id, [])
        }
        trackGroups.get(d.track_id).push(d)
      })

      return {
        totalDetections: data.length,
        uniqueTracks: trackGroups.size,
        recentDetections: data.slice(0, 10).map((d) => ({
          timestamp: d.timestamp,
          trackId: d.track_id,
          confidence: d.confidence,
          attributes: d.attributes,
        })),
      }
    },
  }),

  getStatistics: tool({
    description: "Get statistical summary of detections over a time period.",
    parameters: z.object({
      timeRange: z
        .object({
          start: z.string().describe("Start time in ISO format"),
          end: z.string().describe("End time in ISO format"),
        })
        .optional()
        .describe("Time range for statistics (default: last hour)"),
    }),
    execute: async ({ timeRange }) => {
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

      const start = timeRange?.start || new Date(Date.now() - 60 * 60 * 1000).toISOString()
      const end = timeRange?.end || new Date().toISOString()

      const { data, error } = await supabase
        .from("detections")
        .select("*")
        .gte("timestamp", start)
        .lte("timestamp", end)

      if (error) {
        return { error: error.message }
      }

      const uniqueTracks = new Set(data.map((d) => d.track_id)).size
      const avgConfidence = data.reduce((sum, d) => sum + d.confidence, 0) / data.length

      const typeCount = data.reduce(
        (acc, d) => {
          acc[d.class_name] = (acc[d.class_name] || 0) + 1
          return acc
        },
        {} as Record<string, number>,
      )

      return {
        timeRange: { start, end },
        totalDetections: data.length,
        uniqueTracks,
        averageConfidence: avgConfidence.toFixed(2),
        detectionsByType: typeCount,
      }
    },
  }),
}

export async function POST(request: NextRequest) {
  try {
    const { query } = await request.json()

    if (!query || typeof query !== "string") {
      return NextResponse.json({ error: "Query is required" }, { status: 400 })
    }

    // Use AI SDK to process the natural language query
    const result = await generateText({
      model: "openai/gpt-4o-mini",
      system: `You are an AI assistant that helps users query a video surveillance detection system. 
      You have access to tools that can search detections by attributes, get track details, view recent activity, and get statistics.
      
      When users ask questions, use the appropriate tools to find the information they need.
      Always provide clear, concise answers based on the data returned by the tools.
      
      If the user asks about specific people or objects, use searchByAttributes.
      If they want to know about recent activity, use getRecentActivity.
      If they want statistics or summaries, use getStatistics.
      If they mention a specific track ID, use getTrackDetails.`,
      prompt: query,
      tools: detectionTools,
      maxSteps: 5,
    })

    return NextResponse.json({
      success: true,
      response: result.text,
      toolCalls: result.steps
        .filter((step) => step.toolCalls && step.toolCalls.length > 0)
        .map((step) => ({
          toolName: step.toolCalls[0].toolName,
          args: step.toolCalls[0].args,
        })),
    })
  } catch (error) {
    console.error("[v0] LLM query error:", error)
    return NextResponse.json({ error: "Failed to process query" }, { status: 500 })
  }
}
