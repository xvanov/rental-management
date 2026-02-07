"use client"

import * as React from "react"
import { format } from "date-fns"
import { Calendar as CalendarIcon } from "lucide-react"
import { DateRange } from "react-day-picker"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface DateRangePickerProps {
  value?: DateRange
  onChange?: (range: DateRange | undefined) => void
  placeholder?: string
  className?: string
  align?: "start" | "center" | "end"
  disabled?: boolean
  fromLabel?: string
  toLabel?: string
  numberOfMonths?: number
}

export function DateRangePicker({
  value,
  onChange,
  placeholder = "Select date range",
  className,
  align = "start",
  disabled = false,
  fromLabel = "Start",
  toLabel = "End",
  numberOfMonths = 2,
}: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false)

  const formatDateRange = () => {
    if (!value?.from) return placeholder
    if (!value.to) return format(value.from, "MMM d, yyyy")
    return `${format(value.from, "MMM d, yyyy")} - ${format(value.to, "MMM d, yyyy")}`
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full justify-start text-left font-normal",
            !value?.from && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {formatDateRange()}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align={align}>
        <div className="p-3 border-b">
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">{fromLabel}:</span>
              <span className="font-medium">
                {value?.from ? format(value.from, "MMM d, yyyy") : "—"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">{toLabel}:</span>
              <span className="font-medium">
                {value?.to ? format(value.to, "MMM d, yyyy") : "—"}
              </span>
            </div>
          </div>
        </div>
        <Calendar
          mode="range"
          defaultMonth={value?.from}
          selected={value}
          onSelect={onChange}
          numberOfMonths={numberOfMonths}
        />
        <div className="p-3 border-t flex justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onChange?.(undefined)
            }}
          >
            Clear
          </Button>
          <Button
            size="sm"
            onClick={() => setOpen(false)}
            disabled={!value?.from || !value?.to}
          >
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
