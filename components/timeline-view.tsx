"use client"

import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Clock, MapPin } from "lucide-react"

interface TimelineEvent {
  timestamp: string
  bbox: { x: number; y: number; width: number; height: number }
  confidence: number
  location?: string
}

interface TimelineViewProps {
  trackId: string
  events: TimelineEvent[]
  duration?: string
}

export function TimelineView({ trackId, events, duration }: TimelineViewProps) {
  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString()
  }

  return (
    <Card className="p-4">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Track Timeline</h3>
            <p className="text-xs text-muted-foreground font-mono">{trackId}</p>
          </div>
          {duration && (
            <Badge variant="secondary" className="text-xs">
              {duration}
            </Badge>
          )}
        </div>

        {/* Timeline */}
        <ScrollArea className="h-96">
          <div className="space-y-4 pr-4">
            {events.map((event, index) => (
              <div key={index} className="relative pl-6 pb-4 border-l-2 border-border last:border-l-0">
                {/* Timeline dot */}
                <div className="absolute left-0 top-0 -translate-x-[9px] h-4 w-4 rounded-full bg-primary border-4 border-background" />

                {/* Event content */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {formatTime(event.timestamp)}
                  </div>

                  <div className="text-xs space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Confidence:</span>
                      <Badge variant="outline" className="text-xs">
                        {Math.round(event.confidence * 100)}%
                      </Badge>
                    </div>

                    {event.location && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <MapPin className="h-3 w-3" />
                        {event.location}
                      </div>
                    )}

                    <div className="text-muted-foreground">
                      Position: ({event.bbox.x}, {event.bbox.y})
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        {/* Stats */}
        <div className="pt-4 border-t border-border grid grid-cols-2 gap-4 text-xs">
          <div>
            <span className="text-muted-foreground">Total Events</span>
            <p className="text-lg font-semibold text-foreground">{events.length}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Avg Confidence</span>
            <p className="text-lg font-semibold text-foreground">
              {Math.round((events.reduce((sum, e) => sum + e.confidence, 0) / events.length) * 100)}%
            </p>
          </div>
        </div>
      </div>
    </Card>
  )
}
