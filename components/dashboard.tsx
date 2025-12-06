"use client"

import { useMemo, useState } from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Video, Search, Camera, Menu, X } from "lucide-react"
import { CameraViewer } from "@/components/camera-viewer"
import { QueryMode } from "@/components/query-mode"
import { useStreaming } from "@/hooks/use-streaming"

type ViewMode = "cameras" | "query"

const cameras = [
  { id: "cam-1", name: "Entrance", location: "Main Building", status: "active" },
  { id: "cam-2", name: "Parking Lot", location: "North Side", status: "active" },
  { id: "cam-3", name: "Lobby", location: "Ground Floor", status: "active" },
  { id: "cam-4", name: "Corridor A", location: "2nd Floor", status: "inactive" },
]

export function Dashboard() {
  const [viewMode, setViewMode] = useState<ViewMode>("query")
  const [selectedCamera, setSelectedCamera] = useState(cameras[0].id)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const {
    isConnected,
    connectionStatus,
    devices,
    mediaStreams,
    statsMap,
    manualReconnect,
  } = useStreaming()

  // Simple mapping from UI cameras to backend device IDs.
  // Adjust as needed to match your real device IDs.
  const cameraToDeviceId = useMemo<Record<string, string>>(
    () => ({
      "cam-1": "edge_device_1",
      "cam-2": "edge_device_2",
      "cam-3": "edge_device_3",
      "cam-4": "edge_device_4",
    }),
    [],
  )

  const selectedDeviceId = cameraToDeviceId[selectedCamera]

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside
        className={cn(
          "flex flex-col border-r border-sidebar-border bg-sidebar transition-all duration-300",
          sidebarOpen ? "w-64" : "w-0 overflow-hidden",
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <Video className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-semibold text-sidebar-foreground">ReID Observer</span>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 lg:hidden" onClick={() => setSidebarOpen(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <ScrollArea className="flex-1 px-3 py-4">
          <div className="space-y-6">
            {/* View Mode Selection */}
            <div className="space-y-2">
              <p className="px-3 text-xs font-medium text-sidebar-foreground/60">VIEW MODE</p>
              <nav className="space-y-1">
                <Button
                  variant={viewMode === "cameras" ? "secondary" : "ghost"}
                  className={cn(
                    "w-full justify-start gap-3",
                    viewMode === "cameras" && "bg-sidebar-accent text-sidebar-accent-foreground",
                  )}
                  onClick={() => setViewMode("cameras")}
                >
                  <Camera className="h-4 w-4" />
                  Camera Viewers
                </Button>
                <Button
                  variant={viewMode === "query" ? "secondary" : "ghost"}
                  className={cn(
                    "w-full justify-start gap-3",
                    viewMode === "query" && "bg-sidebar-accent text-sidebar-accent-foreground",
                  )}
                  onClick={() => setViewMode("query")}
                >
                  <Search className="h-4 w-4" />
                  Query Mode
                </Button>
              </nav>
            </div>

            {/* Camera List (only show when in camera mode) */}
            {viewMode === "cameras" && (
              <div className="space-y-2">
                <p className="px-3 text-xs font-medium text-sidebar-foreground/60">CAMERAS</p>
                <nav className="space-y-1">
                  {cameras.map((camera) => (
                    <Button
                      key={camera.id}
                      variant={selectedCamera === camera.id ? "secondary" : "ghost"}
                      className={cn(
                        "w-full justify-start gap-3",
                        selectedCamera === camera.id && "bg-sidebar-accent text-sidebar-accent-foreground",
                      )}
                      onClick={() => setSelectedCamera(camera.id)}
                    >
                      <div
                        className={cn(
                          "h-2 w-2 rounded-full",
                          camera.status === "active" ? "bg-green-500" : "bg-muted-foreground",
                        )}
                      />
                      <div className="flex flex-col items-start text-left">
                        <span className="text-sm font-medium">{camera.name}</span>
                        <span className="text-xs text-muted-foreground">{camera.location}</span>
                      </div>
                    </Button>
                  ))}
                </nav>
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="border-t border-sidebar-border p-4">
          <div className="flex items-center gap-3 rounded-lg bg-sidebar-accent px-3 py-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
              AD
            </div>
            <div className="flex-1 text-sm">
              <p className="font-medium text-sidebar-foreground">Admin User</p>
              <p className="text-xs text-muted-foreground">admin@example.com</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex flex-1 flex-col">
        {/* Header */}
        <header className="flex h-16 items-center justify-between border-b border-border bg-card px-6">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              className={cn("h-8 w-8", sidebarOpen && "lg:hidden")}
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              <Menu className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-lg font-semibold text-foreground">
                {viewMode === "cameras" ? "Camera Viewers" : "AI Query Mode"}
              </h1>
              <p className="text-sm text-muted-foreground">
                {viewMode === "cameras"
                  ? "Monitor live camera feeds with AI detection"
                  : "Search and analyze detections using natural language"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-1.5">
              <div
                className={cn(
                  "h-2 w-2 rounded-full",
                  connectionStatus === "connected"
                    ? "bg-green-500"
                    : connectionStatus === "connecting" || connectionStatus === "reconnecting"
                    ? "bg-yellow-500 animate-pulse"
                    : "bg-red-500",
                )}
              />
              <span className="text-sm font-medium text-foreground">
                {isConnected
                  ? "Connected to streaming backend"
                  : connectionStatus === "connecting"
                  ? "Connecting to streaming backend..."
                  : connectionStatus === "reconnecting"
                  ? "Reconnecting to streaming backend..."
                  : "Not connected"}
              </span>
            </div>
            <Button variant="outline" size="sm" onClick={manualReconnect}>
              Reconnect
            </Button>
          </div>
        </header>

        {/* Content Area */}
        <main className="flex-1 overflow-auto bg-background p-6">
          {viewMode === "cameras" ? (
            <CameraViewer
              cameraId={selectedCamera}
              camera={cameras.find((c) => c.id === selectedCamera)!}
              mediaStream={selectedDeviceId ? mediaStreams.get(selectedDeviceId) || null : null}
              stats={selectedDeviceId ? statsMap.get(selectedDeviceId) || null : null}
            />
          ) : (
            <QueryMode />
          )}
        </main>
      </div>
    </div>
  )
}
