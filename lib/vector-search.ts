"use client"

// Client-side utilities for vector search operations

export interface SearchResult {
  id: string
  bbox: { x: number; y: number; width: number; height: number }
  confidence: number
  attributes: any
  timestamp: string
  trackId: string
  similarity: number
}

export interface AttributeSearchParams {
  type?: string
  clothing?: string
  accessories?: string
  pose?: string
  timeRange?: {
    start: string
    end: string
  }
  confidence?: number
  streamId?: string
}

export class VectorSearchClient {
  async searchSimilar(
    queryVector: number[],
    options: { limit?: number; threshold?: number } = {},
  ): Promise<SearchResult[]> {
    try {
      const response = await fetch("/api/search-similar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          queryVector,
          limit: options.limit || 10,
          threshold: options.threshold || 0.7,
        }),
      })

      if (!response.ok) {
        throw new Error("Search failed")
      }

      const data = await response.json()
      return this.formatResults(data.results)
    } catch (error) {
      console.error("[v0] Vector search error:", error)
      return []
    }
  }

  async searchByAttributes(params: AttributeSearchParams): Promise<SearchResult[]> {
    try {
      const response = await fetch("/api/search-by-attributes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      })

      if (!response.ok) {
        throw new Error("Attribute search failed")
      }

      const data = await response.json()
      return this.formatResults(data.results)
    } catch (error) {
      console.error("[v0] Attribute search error:", error)
      return []
    }
  }

  async getTrackHistory(trackId: string) {
    try {
      const response = await fetch(`/api/get-track-history?trackId=${trackId}`)

      if (!response.ok) {
        throw new Error("Failed to get track history")
      }

      return await response.json()
    } catch (error) {
      console.error("[v0] Track history error:", error)
      return null
    }
  }

  private formatResults(results: any[]): SearchResult[] {
    return results.map((result) => ({
      id: result.id,
      bbox: {
        x: result.bbox_x,
        y: result.bbox_y,
        width: result.bbox_width,
        height: result.bbox_height,
      },
      confidence: result.confidence,
      attributes: result.attributes,
      timestamp: result.timestamp,
      trackId: result.track_id,
      similarity: result.similarity || 1.0,
    }))
  }

  // Extract features from an image for similarity search
  async extractFeaturesFromImage(imageData: string): Promise<number[]> {
    try {
      const response = await fetch("/api/extract-features", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          detectionId: "temp",
          imageData,
        }),
      })

      if (!response.ok) {
        throw new Error("Feature extraction failed")
      }

      const data = await response.json()
      return data.features || []
    } catch (error) {
      console.error("[v0] Feature extraction error:", error)
      return []
    }
  }
}
