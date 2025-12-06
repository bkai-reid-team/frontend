"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Calendar, MapPin, User, ExternalLink } from "lucide-react"
import type { SearchResult } from "@/lib/vector-search"

interface ResultsGridProps {
  results: SearchResult[]
  onResultClick?: (result: SearchResult) => void
}

export function ResultsGrid({ results, onResultClick }: ResultsGridProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const handleClick = (result: SearchResult) => {
    setSelectedId(result.id)
    onResultClick?.(result)
  }

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp)
    return date.toLocaleString()
  }

  if (results.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <User className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">No results to display</p>
        </div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {results.map((result) => (
        <Card
          key={result.id}
          className={`p-4 cursor-pointer transition-all hover:shadow-lg ${
            selectedId === result.id ? "ring-2 ring-primary" : ""
          }`}
          onClick={() => handleClick(result)}
        >
          <div className="space-y-3">
            {/* Header */}
            <div className="flex items-start justify-between">
              <span className="text-xs font-mono text-muted-foreground">{result.trackId}</span>
              {result.similarity && (
                <Badge variant="secondary" className="text-xs">
                  {Math.round(result.similarity * 100)}%
                </Badge>
              )}
            </div>

            {/* Thumbnail */}
            <div className="aspect-[3/4] bg-muted rounded-md flex items-center justify-center">
              <User className="h-12 w-12 text-muted-foreground" />
            </div>

            {/* Details */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Calendar className="h-3 w-3" />
                <span className="truncate">{formatTimestamp(result.timestamp)}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3" />
                <span>Confidence: {Math.round(result.confidence * 100)}%</span>
              </div>
            </div>

            {/* Attributes */}
            {result.attributes && (
              <div className="text-xs text-foreground line-clamp-2">
                {typeof result.attributes === "string"
                  ? result.attributes
                  : Object.entries(result.attributes)
                      .map(([key, value]) => `${key}: ${value}`)
                      .join(", ")}
              </div>
            )}

            {/* Action */}
            <Button size="sm" variant="outline" className="w-full text-xs bg-transparent">
              <ExternalLink className="h-3 w-3 mr-2" />
              View Details
            </Button>
          </div>
        </Card>
      ))}
    </div>
  )
}
