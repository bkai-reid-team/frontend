"use client"

import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Clock, User, Package } from "lucide-react"

interface Detection {
  id: string
  bbox: { x: number; y: number; width: number; height: number }
  confidence: number
  attributes: {
    type: string
    clothing: string
    accessories: string
    pose: string
  }
  timestamp: number
  trackId: string
}

interface MetadataPanelProps {
  detection?: Detection
  allDetections: Detection[]
}

export function MetadataPanel({ detection, allDetections }: MetadataPanelProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border">
        <h2 className="text-lg font-semibold text-foreground">Detection Metadata</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {detection ? "Selected object details" : "Select a detection to view details"}
        </p>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {detection ? (
            <>
              {/* Selected Detection Details */}
              <Card className="p-4 bg-primary/5 border-primary/20">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">Track ID</span>
                    <Badge variant="outline" className="font-mono">
                      {detection.trackId}
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">Confidence</span>
                    <span className="text-sm font-mono text-primary">{Math.round(detection.confidence * 100)}%</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">Type</span>
                    <Badge>{detection.attributes.type}</Badge>
                  </div>

                  <div className="pt-2 border-t border-border">
                    <div className="text-xs text-muted-foreground mb-2">Attributes</div>
                    <div className="space-y-2">
                      <div>
                        <div className="text-xs text-muted-foreground">Clothing</div>
                        <div className="text-sm text-foreground">{detection.attributes.clothing}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Accessories</div>
                        <div className="text-sm text-foreground">{detection.attributes.accessories}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Pose</div>
                        <div className="text-sm text-foreground">{detection.attributes.pose}</div>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-border">
                    <div className="text-xs text-muted-foreground mb-1">Bounding Box</div>
                    <div className="text-xs font-mono text-foreground">
                      x: {Math.round(detection.bbox.x)}, y: {Math.round(detection.bbox.y)}
                      <br />
                      w: {Math.round(detection.bbox.width)}, h: {Math.round(detection.bbox.height)}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-border flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {new Date(detection.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              </Card>

              {/* Thumbnail Placeholder */}
              <Card className="p-4">
                <div className="text-xs text-muted-foreground mb-2">Object Thumbnail</div>
                <div className="aspect-[3/4] bg-muted rounded-md flex items-center justify-center">
                  <User className="h-12 w-12 text-muted-foreground" />
                </div>
              </Card>
            </>
          ) : (
            <Card className="p-6 text-center">
              <Package className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Click on a bounding box to view detection details</p>
            </Card>
          )}

          {/* All Detections List */}
          <div className="pt-4">
            <h3 className="text-sm font-medium text-foreground mb-3">Active Detections ({allDetections.length})</h3>
            <div className="space-y-2">
              {allDetections.map((det) => (
                <Card
                  key={det.id}
                  className={`p-3 cursor-pointer transition-colors ${
                    det.id === detection?.id ? "bg-primary/10 border-primary/30" : "hover:bg-muted/50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-green-500" />
                      <span className="text-sm font-mono">{det.trackId}</span>
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      {Math.round(det.confidence * 100)}%
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">{det.attributes.clothing}</div>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}
