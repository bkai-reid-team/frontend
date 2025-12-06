import { type NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

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

    const { queryVector, limit = 10, threshold = 0.7 } = await request.json()

    if (!queryVector || !Array.isArray(queryVector)) {
      return NextResponse.json({ error: "Invalid query vector" }, { status: 400 })
    }

    // Use pgvector to find similar feature vectors
    const { data: similarVectors, error: vectorError } = await supabase.rpc("search_similar_vectors", {
      query_embedding: queryVector,
      match_threshold: threshold,
      match_count: limit,
    })

    if (vectorError) {
      console.error("[v0] Vector search error:", vectorError)
      throw new Error("Failed to search vectors")
    }

    // Get full detection details for matching vectors
    const detectionIds = similarVectors.map((v: any) => v.detection_id)

    const { data: detections, error: detectionsError } = await supabase
      .from("detections")
      .select("*")
      .in("id", detectionIds)

    if (detectionsError) {
      console.error("[v0] Detections query error:", detectionsError)
      throw new Error("Failed to fetch detections")
    }

    // Combine results with similarity scores
    const results = detections.map((det: any) => {
      const vectorMatch = similarVectors.find((v: any) => v.detection_id === det.id)
      return {
        ...det,
        similarity: vectorMatch?.similarity || 0,
      }
    })

    // Sort by similarity
    results.sort((a, b) => b.similarity - a.similarity)

    return NextResponse.json({
      success: true,
      results,
      count: results.length,
    })
  } catch (error) {
    console.error("[v0] Search error:", error)
    return NextResponse.json({ error: "Failed to search similar detections" }, { status: 500 })
  }
}
