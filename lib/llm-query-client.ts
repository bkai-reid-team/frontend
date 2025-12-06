"use client"

// Client-side utilities for querying the detection system via LLM

export interface QueryResponse {
  response: string
  toolCalls?: Array<{
    toolName: string
    args: any
  }>
}

export class LLMQueryClient {
  async query(naturalLanguageQuery: string): Promise<QueryResponse> {
    try {
      const response = await fetch("/api/llm-query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: naturalLanguageQuery }),
      })

      if (!response.ok) {
        throw new Error("Query failed")
      }

      const data = await response.json()
      return {
        response: data.response,
        toolCalls: data.toolCalls,
      }
    } catch (error) {
      console.error("[v0] LLM query error:", error)
      return {
        response: "Sorry, I couldn't process your query. Please try again.",
      }
    }
  }

  // Stream chat responses for interactive conversations
  async *streamChat(messages: Array<{ role: string; content: string }>) {
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages }),
      })

      if (!response.ok) {
        throw new Error("Chat failed")
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) {
        throw new Error("No response body")
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        yield chunk
      }
    } catch (error) {
      console.error("[v0] Chat stream error:", error)
      yield "Error: Failed to stream chat response"
    }
  }
}

// Example queries that users can try
export const exampleQueries = [
  "Show me all people wearing blue jackets in the last 10 minutes",
  "What's the recent activity in the stream?",
  "Find detections with backpacks",
  "Get statistics for the last hour",
  "Show me people who were standing still",
  "What types of objects have been detected today?",
]
