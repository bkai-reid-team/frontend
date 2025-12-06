"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Filter, X } from "lucide-react"
import type { AttributeSearchParams } from "@/lib/vector-search"

interface AdvancedFiltersProps {
  onApplyFilters: (filters: AttributeSearchParams) => void
  onClearFilters: () => void
}

export function AdvancedFilters({ onApplyFilters, onClearFilters }: AdvancedFiltersProps) {
  const [filters, setFilters] = useState<AttributeSearchParams>({
    confidence: 0.7,
  })

  const handleApply = () => {
    onApplyFilters(filters)
  }

  const handleClear = () => {
    setFilters({ confidence: 0.7 })
    onClearFilters()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Filter className="h-4 w-4" />
          Advanced Filters
        </CardTitle>
        <CardDescription>Refine your search with detailed criteria</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Object Type */}
        <div className="space-y-2">
          <Label htmlFor="type" className="text-xs">
            Object Type
          </Label>
          <Select value={filters.type || ""} onValueChange={(value) => setFilters({ ...filters, type: value })}>
            <SelectTrigger id="type">
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="person">Person</SelectItem>
              <SelectItem value="vehicle">Vehicle</SelectItem>
              <SelectItem value="bicycle">Bicycle</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Clothing */}
        <div className="space-y-2">
          <Label htmlFor="clothing" className="text-xs">
            Clothing Description
          </Label>
          <Input
            id="clothing"
            placeholder="e.g., blue jacket, red shirt"
            value={filters.clothing || ""}
            onChange={(e) => setFilters({ ...filters, clothing: e.target.value })}
          />
        </div>

        {/* Accessories */}
        <div className="space-y-2">
          <Label htmlFor="accessories" className="text-xs">
            Accessories
          </Label>
          <Input
            id="accessories"
            placeholder="e.g., backpack, hat"
            value={filters.accessories || ""}
            onChange={(e) => setFilters({ ...filters, accessories: e.target.value })}
          />
        </div>

        {/* Pose */}
        <div className="space-y-2">
          <Label htmlFor="pose" className="text-xs">
            Pose/Action
          </Label>
          <Select value={filters.pose || ""} onValueChange={(value) => setFilters({ ...filters, pose: value })}>
            <SelectTrigger id="pose">
              <SelectValue placeholder="Select pose" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="walking">Walking</SelectItem>
              <SelectItem value="standing">Standing</SelectItem>
              <SelectItem value="running">Running</SelectItem>
              <SelectItem value="sitting">Sitting</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Confidence Threshold */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="confidence" className="text-xs">
              Min Confidence
            </Label>
            <span className="text-xs text-muted-foreground">{Math.round((filters.confidence || 0.7) * 100)}%</span>
          </div>
          <Slider
            id="confidence"
            min={0}
            max={1}
            step={0.05}
            value={[filters.confidence || 0.7]}
            onValueChange={([value]) => setFilters({ ...filters, confidence: value })}
          />
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-4">
          <Button onClick={handleApply} className="flex-1">
            Apply Filters
          </Button>
          <Button onClick={handleClear} variant="outline">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
