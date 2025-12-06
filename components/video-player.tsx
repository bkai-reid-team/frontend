"use client"

import { useRef } from "react"

import { forwardRef, useEffect } from "react"

interface VideoPlayerProps {
  isPlaying: boolean
}

export const VideoPlayer = forwardRef<HTMLVideoElement, VideoPlayerProps>(({ isPlaying }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Simulate video feed with animated gradient
    let frame = 0
    let animationId: number

    const animate = () => {
      if (!isPlaying) return

      frame += 0.5

      // Create animated background
      const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height)
      gradient.addColorStop(0, `hsl(${frame % 360}, 20%, 15%)`)
      gradient.addColorStop(0.5, `hsl(${(frame + 60) % 360}, 20%, 12%)`)
      gradient.addColorStop(1, `hsl(${(frame + 120) % 360}, 20%, 10%)`)

      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // Add noise texture
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      for (let i = 0; i < imageData.data.length; i += 4) {
        const noise = Math.random() * 10
        imageData.data[i] += noise
        imageData.data[i + 1] += noise
        imageData.data[i + 2] += noise
      }
      ctx.putImageData(imageData, 0, 0)

      animationId = requestAnimationFrame(animate)
    }

    if (isPlaying) {
      animate()
    }

    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId)
      }
    }
  }, [isPlaying])

  return (
    <div className="w-full h-full bg-gradient-to-br from-gray-900 to-gray-800 relative">
      {/* Placeholder for actual video stream */}
      <video ref={ref} className="w-full h-full object-cover" autoPlay={isPlaying} muted playsInline>
        {/* In production, this would be a WebRTC stream or video source */}
        <source src="/placeholder-video.mp4" type="video/mp4" />
      </video>

      {/* Fallback grid pattern when no video */}
      <div className="absolute inset-0 opacity-10">
        <div className="grid grid-cols-8 grid-rows-6 h-full w-full">
          {Array.from({ length: 48 }).map((_, i) => (
            <div key={i} className="border border-gray-700" />
          ))}
        </div>
      </div>
    </div>
  )
})

VideoPlayer.displayName = "VideoPlayer"
