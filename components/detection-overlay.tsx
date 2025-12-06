"use client"

interface Detection {
  id: string
  bbox: { x: number; y: number; width: number; height: number }
  confidence: number
  trackId: string
}

interface DetectionOverlayProps {
  detections: Detection[]
  selectedId: string | null
  onSelect: (id: string) => void
}

export function DetectionOverlay({ detections, selectedId, onSelect }: DetectionOverlayProps) {
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none">
      {detections.map((detection) => {
        const isSelected = detection.id === selectedId
        const scale = 1920 / 100 // Scale factor for positioning

        return (
          <g key={detection.id}>
            {/* Bounding Box */}
            <rect
              x={`${detection.bbox.x / scale}%`}
              y={`${detection.bbox.y / scale}%`}
              width={`${detection.bbox.width / scale}%`}
              height={`${detection.bbox.height / scale}%`}
              fill="none"
              stroke={isSelected ? "rgb(96, 165, 250)" : "rgb(34, 197, 94)"}
              strokeWidth={isSelected ? 3 : 2}
              className="pointer-events-auto cursor-pointer transition-all"
              onClick={() => onSelect(detection.id)}
              opacity={isSelected ? 1 : 0.8}
            />

            {/* Label */}
            <g transform={`translate(${detection.bbox.x / scale}%, ${detection.bbox.y / scale}%)`}>
              <rect
                x={0}
                y={-24}
                width={120}
                height={20}
                fill={isSelected ? "rgb(96, 165, 250)" : "rgb(34, 197, 94)"}
                opacity={0.9}
              />
              <text x={4} y={-10} fill="white" fontSize="12" fontFamily="monospace" fontWeight="600">
                {detection.trackId} • {Math.round(detection.confidence * 100)}%
              </text>
            </g>

            {/* Corner Markers */}
            {isSelected && (
              <>
                <circle
                  cx={`${detection.bbox.x / scale}%`}
                  cy={`${detection.bbox.y / scale}%`}
                  r={4}
                  fill="rgb(96, 165, 250)"
                />
                <circle
                  cx={`${(detection.bbox.x + detection.bbox.width) / scale}%`}
                  cy={`${detection.bbox.y / scale}%`}
                  r={4}
                  fill="rgb(96, 165, 250)"
                />
                <circle
                  cx={`${detection.bbox.x / scale}%`}
                  cy={`${(detection.bbox.y + detection.bbox.height) / scale}%`}
                  r={4}
                  fill="rgb(96, 165, 250)"
                />
                <circle
                  cx={`${(detection.bbox.x + detection.bbox.width) / scale}%`}
                  cy={`${(detection.bbox.y + detection.bbox.height) / scale}%`}
                  r={4}
                  fill="rgb(96, 165, 250)"
                />
              </>
            )}
          </g>
        )
      })}
    </svg>
  )
}
