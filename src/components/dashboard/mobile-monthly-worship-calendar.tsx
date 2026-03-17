'use client'

import { useMemo, useState } from 'react'

interface MobileServiceItem {
  id: string
  title: string
  date: string
}

interface MobileCalendarCell {
  key: string
  day: number | null
  services: MobileServiceItem[]
}

interface MobileMonthlyWorshipCalendarProps {
  monthLabel: string
  totalServices: number
  weekDays: string[]
  cells: MobileCalendarCell[]
}

export function MobileMonthlyWorshipCalendar({
  monthLabel,
  weekDays,
  cells,
}: MobileMonthlyWorshipCalendarProps) {
  const dayCells = useMemo(
    () => cells.filter((cell): cell is MobileCalendarCell & { day: number } => cell.day !== null),
    [cells],
  )

  const initialSelectedDay = useMemo(() => {
    const withServices = dayCells.find((cell) => cell.services.length > 0)
    return withServices?.day || dayCells[0]?.day || null
  }, [dayCells])

  const [selectedDay, setSelectedDay] = useState<number | null>(initialSelectedDay)

  const selectedCell = useMemo(() => {
    if (selectedDay === null) return null
    return dayCells.find((cell) => cell.day === selectedDay) || null
  }, [dayCells, selectedDay])

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-700">{monthLabel}</p>
      </div>

      <div className="mx-auto grid w-full max-w-[20rem] grid-cols-7 gap-0.5">
        {weekDays.map((label) => (
          <div
            key={`mobile-week-${label}`}
            className="pb-0.5 text-center text-[11px] font-semibold text-slate-500"
          >
            {label}
          </div>
        ))}

        {cells.map((cell) => {
          if (cell.day === null) {
            return (
              <div
                key={`mobile-${cell.key}`}
                className="h-11 rounded-md border border-dashed border-slate-200 bg-slate-50/80"
              />
            )
          }

          const isSelected = selectedDay === cell.day
          const hasServices = cell.services.length > 0

          return (
            <button
              key={`mobile-${cell.key}`}
              type="button"
              onClick={() => setSelectedDay(cell.day)}
              className={`h-11 rounded-md border px-1.5 py-1 text-left transition-colors ${
                isSelected
                  ? 'border-blue-400 bg-blue-50'
                  : 'border-slate-200 bg-white hover:bg-slate-50'
              }`}
            >
              <div className="flex h-full flex-col items-start justify-start">
                <p className="text-[11px] font-semibold leading-tight text-slate-700">{cell.day}</p>
                {hasServices && <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-blue-500" />}
              </div>
            </button>
          )
        })}
      </div>

      <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-slate-700">
            {selectedCell ? `${selectedCell.day}일 상세 일정` : '상세 일정'}
          </p>
          {selectedCell && (
            <span className="rounded bg-white px-1.5 py-0.5 text-[10px] text-slate-500">
              {selectedCell.services.length}개
            </span>
          )}
        </div>
        {selectedCell && selectedCell.services.length > 0 ? (
          <div className="mt-2 space-y-1.5">
            {selectedCell.services.map((service) => (
              <div
                key={`mobile-detail-${service.id}`}
                className="rounded-md border border-blue-100 bg-white px-2 py-2 text-xs text-slate-700"
              >
                {service.title}
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-xs text-slate-500">선택한 날짜에 공개된 일정이 없습니다.</p>
        )}
      </div>
    </div>
  )
}
