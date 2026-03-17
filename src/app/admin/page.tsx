'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { addMonths, compareAsc, endOfMonth, format, isSameMonth, parseISO, startOfMonth } from 'date-fns'
import { ko } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { MobileAdminMonthlyCalendar, type MobileAdminDayData, type MobileDetailBadge } from '@/components/dashboard/mobile-admin-monthly-calendar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface Service {
  id: string
  date: string
  title: string
  status: string
}

interface Team {
  id: string
  name: string
}

interface AssignmentRow {
  id: string
  service_id: string
  team_id: string
  profile_id: string
  role_name: string
}

interface ProfileRef {
  id: string
  full_name: string
  birthday: string | null
}

interface AssignmentDisplay {
  id: string
  service_id: string
  team_id: string
  profile_id: string
  role_name: string
  profileName: string
}

export default function AdminPage() {
  const supabase = useMemo(() => createClient(), [])

  const [services, setServices] = useState<Service[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [profiles, setProfiles] = useState<ProfileRef[]>([])
  const [assignments, setAssignments] = useState<AssignmentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [currentMonth, setCurrentMonth] = useState(startOfMonth(new Date()))
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [selectedDate, setSelectedDate] = useState('')
  const [newServiceTitle, setNewServiceTitle] = useState('')
  const [creatingService, setCreatingService] = useState(false)

  useEffect(() => {
    let active = true

    const loadData = async () => {
      setLoading(true)

      const [servicesRes, teamsRes, profilesRes, assignmentsRes] = await Promise.all([
        supabase.from('services').select('id, title, date, status').order('date', { ascending: false }),
        supabase.from('teams').select('id, name').order('name', { ascending: true }),
        supabase.from('profiles').select('id, full_name, birthday').order('full_name', { ascending: true }),
        supabase.from('assignments').select('id, service_id, team_id, profile_id, role_name'),
      ])

      if (!active) return

      if (servicesRes.error) toast.error('예배 정보를 불러오지 못했습니다.')
      else setServices((servicesRes.data || []) as Service[])

      if (teamsRes.error) toast.error('팀 정보를 불러오지 못했습니다.')
      else setTeams((teamsRes.data || []) as Team[])

      if (profilesRes.error) toast.error('팀원 정보를 불러오지 못했습니다.')
      else setProfiles((profilesRes.data || []) as ProfileRef[])

      if (assignmentsRes.error) toast.error('배정 정보를 불러오지 못했습니다.')
      else setAssignments((assignmentsRes.data || []) as AssignmentRow[])

      if (active) setLoading(false)
    }

    void loadData()

    return () => {
      active = false
    }
  }, [supabase])

  const profileById = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles])

  const servicesInMonth = useMemo(() => {
    return services
      .filter((service) => isSameMonth(parseISO(service.date), currentMonth))
      .sort((a, b) => compareAsc(parseISO(a.date), parseISO(b.date)))
  }, [currentMonth, services])

  const serviceIdsInMonth = useMemo(() => new Set(servicesInMonth.map((service) => service.id)), [servicesInMonth])

  const assignmentsInMonth = useMemo(() => {
    return assignments.filter((assignment) => serviceIdsInMonth.has(assignment.service_id))
  }, [assignments, serviceIdsInMonth])

  const assignmentsDisplayInMonth = useMemo(() => {
    return assignmentsInMonth.map((assignment) => ({
      ...assignment,
      profileName: profileById.get(assignment.profile_id)?.full_name || '이름 없음',
    })) as AssignmentDisplay[]
  }, [assignmentsInMonth, profileById])

  const assignmentsByServiceId = useMemo(() => {
    const grouped = new Map<string, AssignmentDisplay[]>()
    assignmentsDisplayInMonth.forEach((assignment) => {
      const list = grouped.get(assignment.service_id) || []
      list.push(assignment)
      grouped.set(assignment.service_id, list)
    })
    return grouped
  }, [assignmentsDisplayInMonth])

  const assignmentsByTeamService = useMemo(() => {
    const grouped = new Map<string, AssignmentDisplay[]>()
    assignmentsDisplayInMonth.forEach((assignment) => {
      const key = `${assignment.team_id}__${assignment.service_id}`
      const list = grouped.get(key) || []
      list.push(assignment)
      grouped.set(key, list)
    })
    return grouped
  }, [assignmentsDisplayInMonth])

  const servicesByDay = useMemo(() => {
    const grouped = new Map<number, Service[]>()
    servicesInMonth.forEach((service) => {
      const day = parseISO(service.date).getDate()
      const list = grouped.get(day) || []
      list.push(service)
      grouped.set(day, list)
    })
    return grouped
  }, [servicesInMonth])

  const birthdaysByDay = useMemo(() => {
    const grouped = new Map<number, ProfileRef[]>()
    const monthIndex = currentMonth.getMonth()

    profiles.forEach((profile) => {
      if (!profile.birthday) return
      const birthdayDate = parseISO(profile.birthday)
      if (Number.isNaN(birthdayDate.getTime())) return
      if (birthdayDate.getMonth() !== monthIndex) return

      const day = birthdayDate.getDate()
      const list = grouped.get(day) || []
      list.push(profile)
      grouped.set(day, list)
    })

    for (const [day, list] of grouped.entries()) {
      list.sort((a, b) => a.full_name.localeCompare(b.full_name, 'ko'))
      grouped.set(day, list)
    }

    return grouped
  }, [currentMonth, profiles])

  const birthdayDays = useMemo(() => {
    return [...birthdaysByDay.keys()].sort((a, b) => a - b)
  }, [birthdaysByDay])

  const calendarCells = useMemo(() => {
    const monthStart = startOfMonth(currentMonth)
    const monthEnd = endOfMonth(currentMonth)
    const leadingEmptyCells = monthStart.getDay()
    const daysInMonth = monthEnd.getDate()
    const totalCells = leadingEmptyCells + daysInMonth
    const trailingEmptyCells = (7 - (totalCells % 7)) % 7

    const cells: Array<number | null> = []
    for (let i = 0; i < leadingEmptyCells; i++) cells.push(null)
    for (let day = 1; day <= daysInMonth; day++) cells.push(day)
    for (let i = 0; i < trailingEmptyCells; i++) cells.push(null)
    return cells
  }, [currentMonth])

  const weekDays = ['일', '월', '화', '수', '목', '금', '토']

  const mobileCalendarDayData = useMemo(() => {
    const data: Record<number, MobileAdminDayData> = {}

    calendarCells.forEach((day) => {
      if (!day) return

      const birthdays = (birthdaysByDay.get(day) || []).map((profile) => profile.full_name)
      const services = (servicesByDay.get(day) || []).map((service) => {
        const serviceAssignments = assignmentsByServiceId.get(service.id) || []
        const assignedTeams = new Set(serviceAssignments.map((assignment) => assignment.team_id)).size
        const unassignedTeams = Math.max(teams.length - assignedTeams, 0)
        const badges: MobileDetailBadge[] = [{ text: `${assignedTeams}/${teams.length}팀 배정`, tone: 'blue' }]

        if (unassignedTeams > 0) {
          badges.push({ text: `미배정 ${unassignedTeams}팀`, tone: 'amber' })
        }

        return {
          id: service.id,
          title: service.title,
          href: `/admin/services/${service.id}`,
          badges,
        }
      })

      data[day] = { day, birthdays, services }
    })

    return data
  }, [assignmentsByServiceId, birthdaysByDay, calendarCells, servicesByDay, teams.length])

  const handleOpenCreateDialog = (day: number) => {
    const nextDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day)
    const dateValue = format(nextDate, 'yyyy-MM-dd')
    const defaultTitle = `${format(nextDate, 'M월 d일', { locale: ko })} 예배`

    setSelectedDate(dateValue)
    setNewServiceTitle(defaultTitle)
    setCreateDialogOpen(true)
  }

  const handleCreateServiceFromCalendar = async () => {
    const title = newServiceTitle.trim()
    if (!title || !selectedDate) {
      toast.warning('예배 날짜와 명칭을 모두 입력해 주세요.')
      return
    }

    setCreatingService(true)
    const { data, error } = await supabase
      .from('services')
      .insert({
        title,
        date: selectedDate,
        status: 'published',
      })
      .select('id, title, date, status')
      .single()

    if (error) {
      toast.error('일정 생성 실패: ' + error.message)
      setCreatingService(false)
      return
    }

    toast.success('일정이 생성되었습니다.')
    setServices((prev) =>
      [...prev, data as Service].sort((a, b) => compareAsc(parseISO(b.date), parseISO(a.date)))
    )
    setCurrentMonth(startOfMonth(parseISO(selectedDate)))
    setCreateDialogOpen(false)
    setCreatingService(false)
  }

  if (loading) {
    return <div className="p-20 text-center text-slate-500">대시보드 데이터를 불러오는 중...</div>
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">대시보드</h1>
        <div className="flex w-full flex-wrap items-center justify-between gap-2 sm:w-auto sm:flex-nowrap sm:justify-end">
          <Button asChild type="button" variant="outline" className="h-9 px-3 text-xs sm:text-sm">
            <Link href="/">메인화면으로 가기</Link>
          </Button>
          <div className="inline-flex w-full items-center justify-between gap-1 rounded-lg border bg-white p-1 sm:w-auto sm:justify-start">
            <Button type="button" variant="ghost" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, -1))}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="flex-1 text-center text-sm font-semibold sm:min-w-28 sm:flex-none">
              {format(currentMonth, 'yyyy년 M월', { locale: ko })}
            </span>
            <Button type="button" variant="ghost" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <div className="space-y-4 md:hidden">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">월간 일정 피드</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {servicesInMonth.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-slate-400">
                이번 달 예배 일정이 없습니다.
              </div>
            ) : (
              servicesInMonth.map((service) => {
                const serviceAssignments = assignmentsByServiceId.get(service.id) || []
                const assignedTeams = new Set(serviceAssignments.map((assignment) => assignment.team_id)).size
                const unassignedTeams = Math.max(teams.length - assignedTeams, 0)
                return (
                  <Link
                    key={service.id}
                    href={`/admin/services/${service.id}`}
                    className="block rounded-xl border bg-white p-3 shadow-sm"
                  >
                    <p className="text-xs font-semibold text-slate-500">
                      {format(parseISO(service.date), 'M월 d일 (EEE)', { locale: ko })}
                    </p>
                    <p className="mt-1 text-sm font-semibold">{service.title}</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] text-blue-700">
                        {assignedTeams}/{teams.length}팀 배정
                      </span>
                      {unassignedTeams > 0 && (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700">
                          미배정 {unassignedTeams}팀
                        </span>
                      )}
                    </div>
                  </Link>
                )
              })
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">이달 생일</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {birthdayDays.length === 0 ? (
              <p className="text-sm text-slate-400">등록된 생일이 없습니다.</p>
            ) : (
              birthdayDays.map((day) => (
                <div key={day} className="rounded-lg border border-pink-200 bg-pink-50 px-3 py-2">
                  <p className="text-xs font-semibold text-pink-700">{day}일</p>
                  <p className="mt-1 text-sm text-pink-900">
                    {(birthdaysByDay.get(day) || []).map((profile) => profile.full_name).join(', ')}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-base">월간 캘린더</CardTitle>
            <span className="text-xs text-slate-500">일자를 눌러 일정을 등록하세요</span>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          <MobileAdminMonthlyCalendar
            monthLabel={format(currentMonth, 'yyyy년 M월', { locale: ko })}
            totalServices={servicesInMonth.length}
            weekDays={weekDays}
            cells={calendarCells}
            dayDataByDay={mobileCalendarDayData}
            onCreateDay={handleOpenCreateDialog}
            createButtonLabel="일정 등록"
          />

          <div className="hidden md:block">
            <div className="mb-2 grid grid-cols-7 gap-1.5 md:gap-2">
              {weekDays.map((day) => (
                <div key={day} className="py-2 text-center text-xs font-semibold text-slate-500">
                  {day}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1.5 md:gap-2">
              {calendarCells.map((day, index) => (
                <div
                  key={`${day ?? 'empty'}-${index}`}
                  className={`min-h-24 rounded-lg border p-2 md:min-h-28 ${day ? 'bg-white' : 'border-dashed bg-slate-50'}`}
                >
                  {day && (
                    <>
                      <div className="mb-1 flex items-center justify-between gap-1">
                        <button
                          type="button"
                          onClick={() => handleOpenCreateDialog(day)}
                          className="rounded px-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                        >
                          {day}일
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenCreateDialog(day)}
                          className="inline-flex h-5 w-5 items-center justify-center rounded border border-slate-200 text-slate-500 hover:bg-slate-100"
                          aria-label={`${day}일 일정 등록`}
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                      <div className="space-y-1">
                        {(birthdaysByDay.get(day) || []).map((profile) => (
                          <div key={`birthday-${profile.id}`} className="rounded border border-pink-200 bg-pink-50 px-2 py-1 text-[11px] text-pink-700">
                            🎂 {profile.full_name}
                          </div>
                        ))}

                        {(servicesByDay.get(day) || []).map((service) => {
                          const serviceAssignments = assignmentsByServiceId.get(service.id) || []
                          const assignedTeams = new Set(serviceAssignments.map((assignment) => assignment.team_id)).size
                          const unassignedTeams = Math.max(teams.length - assignedTeams, 0)

                          return (
                            <Link
                              key={service.id}
                              href={`/admin/services/${service.id}`}
                              className="block rounded border bg-slate-50 px-2 py-1 text-[11px] hover:bg-blue-50"
                            >
                              <p className="line-clamp-1 font-medium">{service.title}</p>
                              <div className="mt-1 flex flex-wrap gap-1">
                                <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] text-blue-700">
                                  {assignedTeams}/{teams.length}팀 배정
                                </span>
                                {unassignedTeams > 0 && (
                                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700">
                                    미배정 {unassignedTeams}팀
                                  </span>
                                )}
                              </div>
                            </Link>
                          )
                        })}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>일정 등록</DialogTitle>
            <DialogDescription>
              {selectedDate ? `${selectedDate} 일정 정보를 입력해 주세요.` : '일정을 등록합니다.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <p className="mb-1 text-xs font-semibold text-slate-500">날짜</p>
              <Input
                type="date"
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value)}
              />
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold text-slate-500">예배 명칭</p>
              <Input
                value={newServiceTitle}
                onChange={(event) => setNewServiceTitle(event.target.value)}
                placeholder="예: 5부 예배"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              취소
            </Button>
            <Button onClick={() => void handleCreateServiceFromCalendar()} disabled={creatingService}>
              {creatingService ? '등록 중...' : '등록'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">팀별 매트릭스</CardTitle>
        </CardHeader>
        <CardContent>
          {servicesInMonth.length === 0 ? (
            <div className="py-16 text-center text-slate-400">이번 달 예배 일정이 없습니다.</div>
          ) : (
            <>
              <div className="space-y-3 md:hidden">
                {teams.map((team) => (
                  <div key={team.id} className="rounded-lg border bg-white p-3">
                    <p className="text-sm font-semibold text-slate-800">{team.name}</p>
                    <div className="mt-2 space-y-2">
                      {servicesInMonth.map((service) => {
                        const key = `${team.id}__${service.id}`
                        const cellAssignments = assignmentsByTeamService.get(key) || []
                        return (
                          <Link
                            key={key}
                            href={`/admin/services/${service.id}`}
                            className="block rounded-md border border-slate-200 p-2"
                          >
                            <p className="text-xs font-semibold text-slate-500">
                              {format(parseISO(service.date), 'M/d (EEE)', { locale: ko })}
                            </p>
                            <p className="mt-0.5 text-xs font-medium">{service.title}</p>
                            {cellAssignments.length === 0 ? (
                              <p className="mt-1 text-[11px] text-slate-400">미배정</p>
                            ) : (
                              <p className="mt-1 text-[11px] text-slate-600">
                                {cellAssignments.map((assignment) => `${assignment.profileName}(${assignment.role_name})`).join(', ')}
                              </p>
                            )}
                          </Link>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <div className="hidden overflow-x-auto rounded-lg border bg-white md:block">
                <table className="min-w-max text-left text-sm">
                  <thead className="border-b bg-slate-50">
                    <tr>
                      <th className="min-w-32 whitespace-nowrap break-keep px-4 py-3 text-xs font-semibold uppercase text-slate-500">
                        팀
                      </th>
                      {servicesInMonth.map((service) => (
                        <th key={service.id} className="min-w-52 px-4 py-3 align-top">
                          <Link href={`/admin/services/${service.id}`} className="hover:underline">
                            <p className="text-xs text-slate-500">{format(parseISO(service.date), 'M/d (EEE)', { locale: ko })}</p>
                            <p className="mt-1 text-sm font-semibold">{service.title}</p>
                          </Link>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {teams.map((team) => (
                      <tr key={team.id} className="border-b align-top last:border-b-0">
                        <td className="whitespace-nowrap break-keep px-4 py-3 font-semibold text-slate-700">
                          {team.name}
                        </td>
                        {servicesInMonth.map((service) => {
                          const key = `${team.id}__${service.id}`
                          const cellAssignments = assignmentsByTeamService.get(key) || []

                          return (
                            <td key={key} className="px-4 py-3">
                              <Link href={`/admin/services/${service.id}`} className="block rounded-md border p-2 hover:bg-slate-50">
                                {cellAssignments.length === 0 ? (
                                  <span className="text-xs text-slate-400">미배정</span>
                                ) : (
                                  <div className="space-y-1">
                                    {cellAssignments.map((assignment) => (
                                      <div key={assignment.id} className="text-xs">
                                        <span className="font-medium">{assignment.profileName}</span>
                                        <span className="text-slate-500"> · {assignment.role_name}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </Link>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
