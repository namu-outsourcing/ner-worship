'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export type BadgeTone = 'blue' | 'amber' | 'pink' | 'slate'

export interface MobileDetailBadge {
  text: string
  tone?: BadgeTone
}

export interface MobileAdminServiceItem {
  id: string
  title: string
  href?: string
  badges?: MobileDetailBadge[]
}

export interface MobileAdminDayData {
  day: number
  birthdays: string[]
  services: MobileAdminServiceItem[]
}

interface MobileAdminMonthlyCalendarProps {
  monthLabel: string
  totalServices: number
  weekDays: string[]
  cells: Array<number | null>
  dayDataByDay: Record<number, MobileAdminDayData>
  onCreateDay?: (day: number) => void
  createButtonLabel?: string
}

const badgeToneClass: Record<BadgeTone, string> = {
  blue: 'bg-blue-100 text-blue-700',
  amber: 'bg-amber-100 text-amber-700',
  pink: 'bg-pink-100 text-pink-700',
  slate: 'bg-slate-100 text-slate-600',
}

export function MobileAdminMonthlyCalendar({
  monthLabel,
  weekDays,
  cells,
  dayDataByDay,
  onCreateDay,
  createButtonLabel = '일정 등록',
}: MobileAdminMonthlyCalendarProps) {
  const dayNumbers = useMemo(
    () => cells.filter((day): day is number => day !== null),
    [cells],
  )

  const initialSelectedDay = useMemo(() => {
    const withData = dayNumbers.find((day) => {
      const data = dayDataByDay[day]
      return data && (data.services.length > 0 || data.birthdays.length > 0)
    })
    return withData || dayNumbers[0] || null
  }, [dayDataByDay, dayNumbers])

  const [selectedDay, setSelectedDay] = useState<number | null>(initialSelectedDay)

  const selectedData = selectedDay !== null ? dayDataByDay[selectedDay] : null

  return (
    <div className="space-y-2.5 md:hidden">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-700">{monthLabel}</p>
      </div>

      <div className="mx-auto grid w-full max-w-[20rem] grid-cols-7 gap-0.5">
        {weekDays.map((label) => (
          <div
            key={`mobile-admin-week-${label}`}
            className="pb-0.5 text-center text-[11px] font-semibold text-slate-500"
          >
            {label}
          </div>
        ))}

        {cells.map((day, index) => {
          if (day === null) {
            return (
              <div
                key={`mobile-admin-empty-${index}`}
                className="h-11 rounded-md border border-dashed border-slate-200 bg-slate-50/80"
              />
            )
          }

          const data = dayDataByDay[day] || { day, birthdays: [], services: [] }
          const isSelected = selectedDay === day
          const serviceCount = data.services.length
          const birthdayCount = data.birthdays.length
          const hasData = serviceCount > 0 || birthdayCount > 0

          return (
            <button
              key={`mobile-admin-day-${day}`}
              type="button"
              onClick={() => setSelectedDay(day)}
              className={`h-11 rounded-md border px-1.5 py-1 text-left transition-colors ${
                isSelected
                  ? 'border-blue-400 bg-blue-50'
                  : 'border-slate-200 bg-white hover:bg-slate-50'
              }`}
            >
              <div className="flex h-full flex-col items-start justify-start">
                <p className="text-[11px] font-semibold leading-tight text-slate-700">{day}</p>
                {hasData && <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-blue-500" />}
              </div>
            </button>
          )
        })}
      </div>

      <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-slate-700">
            {selectedDay ? `${selectedDay}일 상세` : '상세 정보'}
          </p>
          {selectedDay !== null && onCreateDay && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2 text-[11px]"
              onClick={() => onCreateDay(selectedDay)}
            >
              {createButtonLabel}
            </Button>
          )}
        </div>

        {selectedData && selectedData.birthdays.length > 0 && (
          <div className="mt-2">
            <p className="mb-1 text-[11px] font-semibold text-pink-700">생일</p>
            <div className="flex flex-wrap gap-1">
              {selectedData.birthdays.map((name, idx) => (
                <span
                  key={`birthday-${selectedData.day}-${idx}`}
                  className="rounded bg-pink-100 px-2 py-0.5 text-[11px] text-pink-700"
                >
                  {name}
                </span>
              ))}
            </div>
          </div>
        )}

        {selectedData && selectedData.services.length > 0 ? (
          <div className="mt-2 space-y-1.5">
            {selectedData.services.map((service) => {
              const content = (
                <div className="rounded-md border border-blue-100 bg-white px-2 py-2">
                  <p className="text-xs font-medium text-slate-800">{service.title}</p>
                  {service.badges && service.badges.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {service.badges.map((badge, idx) => (
                        <span
                          key={`${service.id}-badge-${idx}`}
                          className={`rounded px-1.5 py-0.5 text-[10px] ${badgeToneClass[badge.tone || 'slate']}`}
                        >
                          {badge.text}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )

              if (!service.href) {
                return <div key={service.id}>{content}</div>
              }

              return (
                <Link key={service.id} href={service.href} className="block">
                  {content}
                </Link>
              )
            })}
          </div>
        ) : (
          <p className="mt-2 text-xs text-slate-500">선택한 날짜에 일정이 없습니다.</p>
        )}
      </div>
    </div>
  )
}
