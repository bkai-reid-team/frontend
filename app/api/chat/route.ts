import type { NextRequest } from "next/server"
import { streamText } from "ai"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { z } from "zod"
import { tool } from "ai"

// Reusable detection search tool
const createDetectionTools = (supabase: any) => ({
  searchDetections: tool({
    description: "Search for detections in the video stream based on various criteria",
    parameters: z.object({
      query: z.string().describe("Natural language description of what to search for"),
      timeWindow: z.number().optional().describe("Time window in minutes to search (default: 60)"),
    }),
    execute: async ({ query, timeWindow = 60 }) => {
      const cutoffTime = new Date(Date.now() - timeWindow * 60 * 1000).toISOString()

      const { data, error } = await supabase
        .from("detections")
        .select("*")
        .gte("timestamp", cutoffTime)
        .order("timestamp", { ascending: false })
        .limit(20)

      if (error) {
        return { error: error.message, results: [] }
      }

      return {
        results: data.map((d: any) => ({
          id: d.id,
          timestamp: d.timestamp,
          type: d.class_name,
          confidence: d.confidence,
          attributes: d.attributes,
          trackId: d.track_id,
        })),
        count: data.length,
      }
    },
  }),
})

export async function POST(request: NextRequest) {
  try {
    const { messages } = await request.json()

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

    const tools = createDetectionTools(supabase)

    const result = streamText({
      model: "openai/gpt-4o-mini",
      system: `You are a helpful AI assistant for a video surveillance detection system.
      You can help users search for and analyze detections from video streams.
      
      When users ask about what's happening in the video, use the searchDetections tool to find relevant information.
      Provide clear, concise answers based on the detection data.`,
      messages,
      tools,
      maxSteps: 5,
    })

    return result.toDataStreamResponse()
  } catch (error) {
    console.error("[v0] Chat error:", error)
    return new Response("Failed to process chat", { status: 500 })
  }
}
