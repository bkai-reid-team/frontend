"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Loader2, Send, Sparkles } from "lucide-react"
import { LLMQueryClient, exampleQueries } from "@/lib/llm-query-client"

export function QueryInterface() {
  const [query, setQuery] = useState("")
  const [response, setResponse] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [queryClient] = useState(() => new LLMQueryClient())

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!query.trim() || isLoading) return

    setIsLoading(true)
    setResponse(null)

    try {
      const result = await queryClient.query(query)
      setResponse(result.response)
    } catch (error) {
      setResponse("Sorry, something went wrong. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleExampleClick = (example: string) => {
    setQuery(example)
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          AI Query Interface
        </CardTitle>
        <CardDescription>Ask questions about detections in natural language</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Example queries */}
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Try these examples:</p>
          <div className="flex flex-wrap gap-2">
            {exampleQueries.slice(0, 3).map((example, i) => (
              <Badge
                key={i}
                variant="outline"
                className="cursor-pointer hover:bg-accent"
                onClick={() => handleExampleClick(example)}
              >
                {example}
              </Badge>
            ))}
          </div>
        </div>

        {/* Query input */}
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask about detections..."
            disabled={isLoading}
            className="flex-1"
          />
          <Button type="submit" disabled={isLoading || !query.trim()}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>

        {/* Response */}
        {response && (
          <div className="rounded-lg bg-muted p-4">
            <p className="text-sm text-foreground whitespace-pre-wrap">{response}</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
