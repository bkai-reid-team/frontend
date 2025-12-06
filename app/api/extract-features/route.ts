import { type NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

// Feature vector interface
interface FeatureVector {
  detectionId: string
  features: number[]
  dimension: number
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

    const { detectionId, imageData } = await request.json()

    if (!detectionId || !imageData) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // Extract feature vector from cropped detection
    const featureVector = await extractFeatures(imageData)

    // Store feature vector in database
    const { data, error } = await supabase
      .from("feature_vectors")
      .insert({
        detection_id: detectionId,
        features: featureVector.features,
        dimension: featureVector.dimension,
      })
      .select()
      .single()

    if (error) {
      console.error("[v0] Feature storage error:", error)
      throw new Error("Failed to store feature vector")
    }

    return NextResponse.json({
      success: true,
      featureId: data.id,
      dimension: featureVector.dimension,
    })
  } catch (error) {
    console.error("[v0] Feature extraction error:", error)
    return NextResponse.json({ error: "Failed to extract features" }, { status: 500 })
  }
}

// Placeholder for feature extraction - replace with actual ReID model
async function extractFeatures(imageData: string): Promise<FeatureVector> {
  // In production, this would use a ReID model (e.g., OSNet, FastReID)
  // to extract a feature vector from the cropped person image

  // Simulate processing delay
  await new Promise((resolve) => setTimeout(resolve, 30))

  // Mock 512-dimensional feature vector
  const dimension = 512
  const features = Array.from({ length: dimension }, () => Math.random() * 2 - 1)

  // Normalize the vector
  const magnitude = Math.sqrt(features.reduce((sum, val) => sum + val * val, 0))
  const normalizedFeatures = features.map((val) => val / magnitude)

  return {
    detectionId: "",
    features: normalizedFeatures,
    dimension,
  }
}
