import { type NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

interface SearchQuery {
  attributes?: {
    type?: string
    clothing?: string
    accessories?: string
    pose?: string
  }
  timeRange?: {
    start: string
    end: string
  }
  confidence?: number
  streamId?: string
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

    const query: SearchQuery = await request.json()

    // Build query dynamically based on provided filters
    let dbQuery = supabase.from("detections").select("*")

    // Filter by attributes
    if (query.attributes) {
      if (query.attributes.type) {
        dbQuery = dbQuery.eq("class_name", query.attributes.type)
      }
      // For JSONB attributes, use containment operator
      if (query.attributes.clothing) {
        dbQuery = dbQuery.contains("attributes", {
          clothing: query.attributes.clothing,
        })
      }
      if (query.attributes.accessories) {
        dbQuery = dbQuery.contains("attributes", {
          accessories: query.attributes.accessories,
        })
      }
      if (query.attributes.pose) {
        dbQuery = dbQuery.contains("attributes", { pose: query.attributes.pose })
      }
    }

    // Filter by time range
    if (query.timeRange) {
      dbQuery = dbQuery.gte("timestamp", query.timeRange.start).lte("timestamp", query.timeRange.end)
    }

    // Filter by confidence
    if (query.confidence !== undefined) {
      dbQuery = dbQuery.gte("confidence", query.confidence)
    }

    // Filter by stream
    if (query.streamId) {
      dbQuery = dbQuery.eq("stream_id", query.streamId)
    }

    // Order by timestamp descending
    dbQuery = dbQuery.order("timestamp", { ascending: false }).limit(100)

    const { data: detections, error } = await dbQuery

    if (error) {
      console.error("[v0] Attribute search error:", error)
      throw new Error("Failed to search by attributes")
    }

    return NextResponse.json({
      success: true,
      results: detections,
      count: detections.length,
    })
  } catch (error) {
    console.error("[v0] Search error:", error)
    return NextResponse.json({ error: "Failed to search detections" }, { status: 500 })
  }
}
