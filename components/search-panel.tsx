"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { X, Search, Calendar, MapPin, User, Sparkles, Filter } from "lucide-react"
import { VectorSearchClient, type SearchResult } from "@/lib/vector-search"
import { QueryInterface } from "./query-interface"

interface SearchPanelProps {
  onClose: () => void
}

export function SearchPanel({ onClose }: SearchPanelProps) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [searchClient] = useState(() => new VectorSearchClient())
  const [activeTab, setActiveTab] = useState<"manual" | "ai">("ai")

  const handleManualSearch = async () => {
    if (!query.trim()) return

    setIsSearching(true)
    try {
      // Parse query for attributes
      const searchResults = await searchClient.searchByAttributes({
        clothing: query.toLowerCase().includes("jacket") ? query : undefined,
        accessories: query.toLowerCase().includes("backpack") ? "backpack" : undefined,
        minConfidence: 0.7,
      })
      setResults(searchResults)
    } catch (error) {
      console.error("[v0] Search error:", error)
    } finally {
      setIsSearching(false)
    }
  }

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)

    if (diffMins < 60) {
      return `${diffMins}m ago`
    } else if (diffMins < 1440) {
      return `${Math.floor(diffMins / 60)}h ago`
    } else {
      return date.toLocaleDateString()
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">Search & Query</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "manual" | "ai")} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="ai" className="gap-2">
              <Sparkles className="h-3 w-3" />
              AI Query
            </TabsTrigger>
            <TabsTrigger value="manual" className="gap-2">
              <Filter className="h-3 w-3" />
              Manual Search
            </TabsTrigger>
          </TabsList>

          <TabsContent value="manual" className="space-y-3 mt-4">
            <div className="flex gap-2">
              <Input
                placeholder="Describe what you're looking for..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleManualSearch()}
                className="flex-1"
              />
              <Button onClick={handleManualSearch} disabled={isSearching}>
                <Search className="h-4 w-4" />
              </Button>
            </div>

            <div className="text-xs text-muted-foreground">Try: "person with blue jacket" or "red backpack"</div>
          </TabsContent>

          <TabsContent value="ai" className="mt-4">
            <div className="text-xs text-muted-foreground mb-3">Ask questions in natural language about detections</div>
          </TabsContent>
        </Tabs>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {activeTab === "ai" ? (
            <div className="space-y-4">
              <QueryInterface />
            </div>
          ) : (
            <>
              {/* Search Stats */}
              {results.length > 0 && (
                <Card className="p-3 bg-muted/50">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Results found</span>
                    <span className="font-semibold text-foreground">{results.length}</span>
                  </div>
                </Card>
              )}

              {/* Results */}
              <div className="space-y-3">
                {results.map((result) => (
                  <Card key={result.id} className="p-4 hover:bg-muted/50 cursor-pointer transition-colors">
                    <div className="space-y-3">
                      {/* Header */}
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-2 rounded-full bg-primary" />
                          <span className="text-sm font-mono font-medium">{result.trackId}</span>
                        </div>
                        {result.similarity && (
                          <Badge variant="secondary" className="text-xs">
                            {Math.round(result.similarity * 100)}% match
                          </Badge>
                        )}
                      </div>

                      {/* Thumbnail */}
                      <div className="aspect-[3/4] bg-muted rounded-md flex items-center justify-center">
                        <User className="h-8 w-8 text-muted-foreground" />
                      </div>

                      {/* Details */}
                      <div className="space-y-2 text-xs">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          {formatTimestamp(result.timestamp)}
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <MapPin className="h-3 w-3" />
                          Confidence: {Math.round(result.confidence * 100)}%
                        </div>
                        {result.attributes && (
                          <div className="text-foreground pt-1">
                            {typeof result.attributes === "string"
                              ? result.attributes
                              : JSON.stringify(result.attributes)}
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2 pt-2">
                        <Button size="sm" variant="outline" className="flex-1 text-xs bg-transparent">
                          View Timeline
                        </Button>
                        <Button size="sm" variant="outline" className="flex-1 text-xs bg-transparent">
                          Similar
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>

              {/* Empty state */}
              {results.length === 0 && query && !isSearching && (
                <Card className="p-8 text-center">
                  <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-sm text-muted-foreground">No results found</p>
                  <p className="text-xs text-muted-foreground mt-2">Try adjusting your search query</p>
                </Card>
              )}

              {/* Load More */}
              {results.length > 0 && (
                <Button variant="outline" className="w-full bg-transparent">
                  Load More Results
                </Button>
              )}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
