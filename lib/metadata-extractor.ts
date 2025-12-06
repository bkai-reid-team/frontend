"use client"

// Utilities for extracting and enriching detection metadata

export interface DetectionMetadata {
  type: string
  clothing?: string
  accessories?: string
  pose?: string
  colors?: string[]
  size?: "small" | "medium" | "large"
  position?: "left" | "center" | "right"
}

export class MetadataExtractor {
  // Extract metadata from detection bounding box and image
  extractFromDetection(
    bbox: { x: number; y: number; width: number; height: number },
    imageWidth: number,
    imageHeight: number,
  ): Partial<DetectionMetadata> {
    const metadata: Partial<DetectionMetadata> = {}

    // Determine size based on bbox area
    const area = bbox.width * bbox.height
    const imageArea = imageWidth * imageHeight
    const relativeSize = area / imageArea

    if (relativeSize < 0.05) {
      metadata.size = "small"
    } else if (relativeSize < 0.2) {
      metadata.size = "medium"
    } else {
      metadata.size = "large"
    }

    // Determine position
    const centerX = bbox.x + bbox.width / 2
    if (centerX < imageWidth / 3) {
      metadata.position = "left"
    } else if (centerX < (2 * imageWidth) / 3) {
      metadata.position = "center"
    } else {
      metadata.position = "right"
    }

    return metadata
  }

  // Enrich metadata with additional attributes
  enrichMetadata(baseMetadata: Partial<DetectionMetadata>, additionalData: any): DetectionMetadata {
    return {
      type: baseMetadata.type || "unknown",
      clothing: additionalData.clothing || baseMetadata.clothing,
      accessories: additionalData.accessories || baseMetadata.accessories,
      pose: additionalData.pose || baseMetadata.pose,
      colors: additionalData.colors || baseMetadata.colors || [],
      size: baseMetadata.size || "medium",
      position: baseMetadata.position || "center",
    }
  }

  // Generate searchable text from metadata
  generateSearchableText(metadata: DetectionMetadata): string {
    const parts = [
      metadata.type,
      metadata.clothing,
      metadata.accessories,
      metadata.pose,
      ...(metadata.colors || []),
      metadata.size,
      metadata.position,
    ].filter(Boolean)

    return parts.join(" ").toLowerCase()
  }
}
