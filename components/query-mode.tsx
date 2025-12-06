"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Search, Sparkles, Clock, User, Car, TrendingUp } from "lucide-react"

interface SearchResult {
  id: string
  type: string
  timestamp: string
  camera: string
  confidence: number
  attributes: Record<string, string>
  thumbnail: string
}

const mockResults: SearchResult[] = [
  {
    id: "1",
    type: "person",
    timestamp: "2025-01-19 14:23:15",
    camera: "Entrance",
    confidence: 0.94,
    attributes: { clothing: "blue jacket", gender: "male", age: "adult" },
    thumbnail: "/person-in-blue-jacket-entrance.jpg",
  },
  {
    id: "2",
    type: "person",
    timestamp: "2025-01-19 14:18:42",
    camera: "Lobby",
    confidence: 0.91,
    attributes: { clothing: "blue jacket", gender: "male", age: "adult" },
    thumbnail: "/person-in-blue-jacket-lobby.jpg",
  },
  {
    id: "3",
    type: "person",
    timestamp: "2025-01-19 14:12:08",
    camera: "Parking Lot",
    confidence: 0.88,
    attributes: { clothing: "blue jacket", gender: "male", age: "adult" },
    thumbnail: "/person-in-blue-jacket-parking.jpg",
  },
]

const exampleQueries = [
  "Show me all people wearing blue jackets today",
  "Find vehicles that entered in the last hour",
  "Track person ID #1234 across all cameras",
  "Show unusual activity patterns",
]

const quickStats = [
  { label: "Total Detections", value: "1,247", icon: TrendingUp, change: "+12%" },
  { label: "Active Tracks", value: "23", icon: User, change: "+3" },
  { label: "Vehicles Today", value: "156", icon: Car, change: "+8%" },
  { label: "Avg Response Time", value: "0.3s", icon: Clock, change: "-0.1s" },
]

export function QueryMode() {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)

  const handleSearch = async (searchQuery: string) => {
    setQuery(searchQuery)
    setIsSearching(true)

    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1000))

    setResults(mockResults)
    setIsSearching(false)
  }

  return (
    <div className="space-y-6">
      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {quickStats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="flex items-center gap-4 p-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <stat.icon className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-muted-foreground">{stat.label}</p>
                <div className="flex items-baseline gap-2">
                  <p className="text-2xl font-bold">{stat.value}</p>
                  <span className="text-xs font-medium text-green-600">{stat.change}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search Interface */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI-Powered Search
          </CardTitle>
          <CardDescription>Ask questions about detections in natural language</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search Input */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch(query)}
                placeholder="Ask anything... e.g., 'Show me all people wearing blue jackets'"
                className="pl-10"
              />
            </div>
            <Button onClick={() => handleSearch(query)} disabled={isSearching || !query.trim()}>
              {isSearching ? "Searching..." : "Search"}
            </Button>
          </div>

          {/* Example Queries */}
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Try these examples:</p>
            <div className="flex flex-wrap gap-2">
              {exampleQueries.map((example, i) => (
                <Badge
                  key={i}
                  variant="outline"
                  className="cursor-pointer hover:bg-accent"
                  onClick={() => handleSearch(example)}
                >
                  {example}
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Search Results */}
      {results.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Search Results</CardTitle>
            <CardDescription>Found {results.length} matching detections</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[600px] pr-4">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {results.map((result) => (
                  <Card key={result.id} className="overflow-hidden">
                    <div className="relative aspect-video">
                      <img
                        src={result.thumbnail || "/placeholder.svg"}
                        alt={`Detection ${result.id}`}
                        className="h-full w-full object-cover"
                      />
                      <Badge className="absolute right-2 top-2">{Math.round(result.confidence * 100)}%</Badge>
                    </div>
                    <CardContent className="p-4">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold capitalize">{result.type}</span>
                          <Badge variant="outline">{result.camera}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{result.timestamp}</p>
                        <div className="space-y-1 text-sm">
                          {Object.entries(result.attributes).map(([key, value]) => (
                            <div key={key} className="flex justify-between">
                              <span className="text-muted-foreground capitalize">{key}:</span>
                              <span className="font-medium">{value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
