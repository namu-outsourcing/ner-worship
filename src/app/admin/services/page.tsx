'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { addMonths, compareAsc, format, isSameMonth, parseISO, startOfMonth } from 'date-fns'
import { ko } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, GripVertical, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

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

interface ProfileRef {
  id: string
  full_name: string
}

interface TeamMember {
  team_id: string
  profile_id: string
}

interface AssignmentRow {
  id: string
  service_id: string
  team_id: string
  profile_id: string
  role_name: string
}

type AvailabilityStatus = 'available' | 'maybe' | 'unavailable'

interface AvailabilityVoteRow {
  id: string
  service_id: string
  team_id: string
  profile_id: string
  availability: AvailabilityStatus
  note: string
}

type DragPayload =
  | { type: 'member'; profileId: string }
  | { type: 'assignment'; assignmentId: string }

export default function ServicesAdminPage() {
  const supabase = useMemo(() => createClient(), [])

  const [services, setServices] = useState<Service[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [profiles, setProfiles] = useState<ProfileRef[]>([])
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [assignments, setAssignments] = useState<AssignmentRow[]>([])
  const [availabilityVotes, setAvailabilityVotes] = useState<AvailabilityVoteRow[]>([])
  const [availabilityReady, setAvailabilityReady] = useState(true)
  const [dataLoading, setDataLoading] = useState(true)
  const [saveLoading, setSaveLoading] = useState(false)

  const [newService, setNewService] = useState({ title: '', date: '' })
  const [currentMonth, setCurrentMonth] = useState(startOfMonth(addMonths(new Date(), 1)))
  const [activeTeamId, setActiveTeamId] = useState('')
  const [dragOverServiceId, setDragOverServiceId] = useState<string | null>(null)
  const [draggingProfileId, setDraggingProfileId] = useState<string | null>(null)
  const [mobileSelectedMemberId, setMobileSelectedMemberId] = useState('')

  useEffect(() => {
    let active = true

    const loadData = async () => {
      setDataLoading(true)

      const [servicesRes, teamsRes, profilesRes, teamMembersRes, assignmentsRes, availabilityVotesRes] = await Promise.all([
        supabase.from('services').select('id, title, date, status').order('date', { ascending: false }),
        supabase.from('teams').select('id, name').order('name', { ascending: true }),
        supabase.from('profiles').select('id, full_name').order('full_name', { ascending: true }),
        supabase.from('team_members').select('team_id, profile_id'),
        supabase.from('assignments').select('id, service_id, team_id, profile_id, role_name'),
        supabase.from('availability_votes').select('id, service_id, team_id, profile_id, availability, note'),
      ])

      if (!active) return

      if (servicesRes.error) toast.error('예배 정보를 불러오지 못했습니다.')
      else setServices((servicesRes.data || []) as Service[])

      if (teamsRes.error) toast.error('팀 정보를 불러오지 못했습니다.')
      else setTeams((teamsRes.data || []) as Team[])

      if (profilesRes.error) toast.error('팀원 정보를 불러오지 못했습니다.')
      else setProfiles((profilesRes.data || []) as ProfileRef[])

      if (teamMembersRes.error) toast.error('팀 소속 정보를 불러오지 못했습니다.')
      else setTeamMembers((teamMembersRes.data || []) as TeamMember[])

      if (assignmentsRes.error) toast.error('배정 정보를 불러오지 못했습니다.')
      else setAssignments((assignmentsRes.data || []) as AssignmentRow[])

      if (availabilityVotesRes.error) {
        if (availabilityVotesRes.error.code === '42P01') {
          setAvailabilityReady(false)
          setAvailabilityVotes([])
        } else {
          toast.error('투표 정보를 불러오지 못했습니다.')
        }
      } else {
        setAvailabilityReady(true)
        setAvailabilityVotes((availabilityVotesRes.data || []) as AvailabilityVoteRow[])
      }

      if (active) setDataLoading(false)
    }

    void loadData()

    return () => {
      active = false
    }
  }, [supabase])

  useEffect(() => {
    if (teams.length === 0) {
      setActiveTeamId('')
      return
    }

    if (!activeTeamId || !teams.find((team) => team.id === activeTeamId)) {
      setActiveTeamId(teams[0].id)
    }
  }, [activeTeamId, teams])

  const profileById = useMemo(() => {
    return new Map(profiles.map((profile) => [profile.id, profile]))
  }, [profiles])

  const teamById = useMemo(() => {
    return new Map(teams.map((team) => [team.id, team]))
  }, [teams])

  const serviceById = useMemo(() => {
    return new Map(services.map((service) => [service.id, service]))
  }, [services])

  const buildDuplicateMessage = (duplicated: AssignmentRow) => {
    const duplicatedService = serviceById.get(duplicated.service_id)
    const duplicatedTeam = teamById.get(duplicated.team_id)
    const dateLabel =
      duplicatedService?.date && !Number.isNaN(parseISO(duplicatedService.date).getTime())
        ? format(parseISO(duplicatedService.date), 'M월 d일 (EEE)', { locale: ko })
        : '날짜 미확인'
    const titleLabel = duplicatedService?.title || '제목 미확인 예배'
    const teamLabel = duplicatedTeam?.name || '팀 미확인'

    return `이미 배정됨: ${dateLabel} · ${titleLabel} · ${teamLabel}`
  }

  const servicesInMonth = useMemo(() => {
    return services
      .filter((service) => isSameMonth(parseISO(service.date), currentMonth))
      .sort((a, b) => compareAsc(parseISO(a.date), parseISO(b.date)))
  }, [currentMonth, services])

  const serviceIdsInMonth = useMemo(() => new Set(servicesInMonth.map((service) => service.id)), [servicesInMonth])

  const assignmentsInMonth = useMemo(() => {
    return assignments.filter((assignment) => serviceIdsInMonth.has(assignment.service_id))
  }, [assignments, serviceIdsInMonth])

  const availabilityVotesInMonth = useMemo(() => {
    return availabilityVotes.filter((vote) => serviceIdsInMonth.has(vote.service_id))
  }, [availabilityVotes, serviceIdsInMonth])

  const assignmentsByTeamService = useMemo(() => {
    const grouped = new Map<string, AssignmentRow[]>()
    assignmentsInMonth.forEach((assignment) => {
      const key = `${assignment.team_id}__${assignment.service_id}`
      const list = grouped.get(key) || []
      list.push(assignment)
      grouped.set(key, list)
    })
    return grouped
  }, [assignmentsInMonth])

  const activeTeamAssignments = useMemo(() => {
    if (!activeTeamId) return []
    return assignmentsInMonth.filter((assignment) => assignment.team_id === activeTeamId)
  }, [activeTeamId, assignmentsInMonth])

  const activeTeamAssignmentsByService = useMemo(() => {
    const grouped = new Map<string, AssignmentRow[]>()
    activeTeamAssignments.forEach((assignment) => {
      const list = grouped.get(assignment.service_id) || []
      list.push(assignment)
      grouped.set(assignment.service_id, list)
    })
    return grouped
  }, [activeTeamAssignments])

  const availabilityByTeamServiceProfile = useMemo(() => {
    const mapped = new Map<string, AvailabilityVoteRow>()
    availabilityVotesInMonth.forEach((vote) => {
      mapped.set(`${vote.team_id}__${vote.service_id}__${vote.profile_id}`, vote)
    })
    return mapped
  }, [availabilityVotesInMonth])

  const activeTeamAvailabilityByProfileService = useMemo(() => {
    const mapped = new Map<string, AvailabilityStatus>()
    if (!activeTeamId) return mapped

    availabilityVotesInMonth.forEach((vote) => {
      if (vote.team_id !== activeTeamId) return
      mapped.set(`${vote.profile_id}__${vote.service_id}`, vote.availability)
    })
    return mapped
  }, [activeTeamId, availabilityVotesInMonth])

  const activeTeamMembers = useMemo(() => {
    if (!activeTeamId) return []

    const memberIds = new Set(
      teamMembers
        .filter((teamMember) => teamMember.team_id === activeTeamId)
        .map((teamMember) => teamMember.profile_id)
    )

    return profiles
      .filter((profile) => memberIds.has(profile.id))
      .sort((a, b) => a.full_name.localeCompare(b.full_name, 'ko'))
  }, [activeTeamId, profiles, teamMembers])

  const monthlyCountByProfile = useMemo(() => {
    const counts = new Map<string, number>()
    activeTeamAssignments.forEach((assignment) => {
      counts.set(assignment.profile_id, (counts.get(assignment.profile_id) || 0) + 1)
    })
    return counts
  }, [activeTeamAssignments])

  const avgLoad = useMemo(() => {
    if (activeTeamMembers.length === 0) return 0
    return activeTeamAssignments.length / activeTeamMembers.length
  }, [activeTeamAssignments.length, activeTeamMembers.length])

  const unassignedServiceCount = useMemo(() => {
    if (!activeTeamId) return 0

    return servicesInMonth.filter((service) => {
      const key = `${activeTeamId}__${service.id}`
      return (assignmentsByTeamService.get(key) || []).length === 0
    }).length
  }, [activeTeamId, assignmentsByTeamService, servicesInMonth])

  const activeTeamVoteResponseCount = useMemo(() => {
    if (!activeTeamId) return 0
    return availabilityVotesInMonth.filter((vote) => vote.team_id === activeTeamId).length
  }, [activeTeamId, availabilityVotesInMonth])

  const activeTeamVoteExpectedCount = useMemo(() => {
    if (!activeTeamId) return 0
    return servicesInMonth.length * activeTeamMembers.length
  }, [activeTeamId, activeTeamMembers.length, servicesInMonth.length])

  const hasActiveTeamVotesAnyMonth = useMemo(() => {
    if (!activeTeamId) return false
    return availabilityVotes.some((vote) => vote.team_id === activeTeamId)
  }, [activeTeamId, availabilityVotes])

  const activeTeamMembersSortedByLoad = useMemo(() => {
    return [...activeTeamMembers].sort((a, b) => {
      const diff = (monthlyCountByProfile.get(a.id) || 0) - (monthlyCountByProfile.get(b.id) || 0)
      if (diff !== 0) return diff
      return a.full_name.localeCompare(b.full_name, 'ko')
    })
  }, [activeTeamMembers, monthlyCountByProfile])

  useEffect(() => {
    if (activeTeamMembersSortedByLoad.length === 0) {
      if (mobileSelectedMemberId) setMobileSelectedMemberId('')
      return
    }

    if (!mobileSelectedMemberId || !activeTeamMembersSortedByLoad.some((member) => member.id === mobileSelectedMemberId)) {
      setMobileSelectedMemberId(activeTeamMembersSortedByLoad[0].id)
    }
  }, [activeTeamMembersSortedByLoad, mobileSelectedMemberId])

  const getAvailabilityVote = (teamId: string, serviceId: string, profileId: string) => {
    return availabilityByTeamServiceProfile.get(`${teamId}__${serviceId}__${profileId}`) || null
  }

  const getAvailabilityStatus = (teamId: string, serviceId: string, profileId: string) => {
    return getAvailabilityVote(teamId, serviceId, profileId)?.availability || null
  }

  const availabilityChipClass = (status: AvailabilityStatus | null) => {
    if (status === 'available') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
    if (status === 'maybe') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
    if (status === 'unavailable') return 'border-rose-200 bg-rose-50 text-rose-700'
    return 'border-slate-200 bg-slate-50 text-slate-500'
  }

  const dragPreviewCardClass = (status: AvailabilityStatus | null) => {
    if (status === 'available') return 'border-emerald-300 bg-emerald-50'
    if (status === 'maybe') return 'border-emerald-300 bg-emerald-50'
    if (status === 'unavailable') return 'border-rose-300 bg-rose-50'
    return 'border-slate-300 bg-slate-50'
  }

  const dragPreviewLabel = (status: AvailabilityStatus | null) => {
    if (status === 'available') return '가능'
    if (status === 'maybe') return '가능'
    if (status === 'unavailable') return '불가'
    return '미응답'
  }

  const handleCreateService = async () => {
    const title = newService.title.trim()
    if (!title || !newService.date) {
      toast.warning('예배 날짜와 명칭을 모두 입력해 주세요.')
      return
    }

    setSaveLoading(true)
    const { data, error } = await supabase
      .from('services')
      .insert({
        title,
        date: newService.date,
        status: 'draft',
      })
      .select('id, title, date, status')
      .single()

    if (error) {
      toast.error('예배 생성 실패: ' + error.message)
    } else if (data) {
      toast.success('새 예배가 생성되었습니다!')
      setCurrentMonth(startOfMonth(parseISO(newService.date)))
      setNewService({ title: '', date: '' })
      setServices((prev) => [...prev, data as Service].sort((a, b) => compareAsc(parseISO(b.date), parseISO(a.date))))
    }

    setSaveLoading(false)
  }

  const createAssignment = async (serviceId: string, teamId: string, profileId: string) => {
    const duplicated = assignments.find(
      (assignment) => assignment.service_id === serviceId && assignment.profile_id === profileId
    )

    if (duplicated) {
      toast.warning(buildDuplicateMessage(duplicated))
      return
    }

    const availabilityVote = getAvailabilityVote(teamId, serviceId, profileId)
    if (availabilityVote?.availability === 'unavailable') {
      toast.error('해당 팀원은 이 일정을 [불가]로 투표하여 배정할 수 없습니다.')
      return
    }

    const { data, error } = await supabase
      .from('assignments')
      .insert({
        service_id: serviceId,
        team_id: teamId,
        profile_id: profileId,
        role_name: '팀원',
      })
      .select('id, service_id, team_id, profile_id, role_name')
      .single()

    if (error) {
      toast.error('배정 실패: ' + error.message)
      return
    }

    toast.success('배정되었습니다.')
    if (data) {
      setAssignments((prev) => [...prev, data as AssignmentRow])
    }
  }

  const moveAssignment = async (assignmentId: string, targetServiceId: string) => {
    const target = assignments.find((assignment) => assignment.id === assignmentId)
    if (!target) return
    if (target.service_id === targetServiceId) return

    const duplicated = assignments.find(
      (assignment) =>
        assignment.id !== assignmentId &&
        assignment.service_id === targetServiceId &&
        assignment.profile_id === target.profile_id
    )

    if (duplicated) {
      toast.warning(buildDuplicateMessage(duplicated))
      return
    }

    const availabilityVote = getAvailabilityVote(target.team_id, targetServiceId, target.profile_id)
    if (availabilityVote?.availability === 'unavailable') {
      toast.error('해당 팀원은 이동 대상 일정을 [불가]로 투표하여 이동할 수 없습니다.')
      return
    }

    const { error } = await supabase
      .from('assignments')
      .update({ service_id: targetServiceId })
      .eq('id', assignmentId)

    if (error) {
      toast.error('이동 실패: ' + error.message)
      return
    }

    toast.success('배정을 이동했습니다.')
    setAssignments((prev) =>
      prev.map((assignment) =>
        assignment.id === assignmentId ? { ...assignment, service_id: targetServiceId } : assignment
      )
    )
  }

  const deleteAssignment = async (assignmentId: string) => {
    const { error } = await supabase.from('assignments').delete().eq('id', assignmentId)
    if (error) {
      toast.error('삭제 실패')
      return
    }

    toast.success('배정을 삭제했습니다.')
    setAssignments((prev) => prev.filter((assignment) => assignment.id !== assignmentId))
  }

  const handleDropToService = async (event: React.DragEvent<HTMLDivElement>, targetServiceId: string) => {
    event.preventDefault()
    setDragOverServiceId(null)

    const payloadRaw = event.dataTransfer.getData('application/json')
    if (!payloadRaw || !activeTeamId) return

    let payload: DragPayload
    try {
      payload = JSON.parse(payloadRaw) as DragPayload
    } catch {
      setDraggingProfileId(null)
      return
    }

    const profileId = payload.type === 'member'
      ? payload.profileId
      : assignments.find((assignment) => assignment.id === payload.assignmentId)?.profile_id || null
    const teamId = payload.type === 'member'
      ? activeTeamId
      : assignments.find((assignment) => assignment.id === payload.assignmentId)?.team_id || activeTeamId

    if (profileId && teamId && getAvailabilityStatus(teamId, targetServiceId, profileId) === 'unavailable') {
      toast.error('불가로 투표한 일정에는 배정할 수 없습니다.')
      setDraggingProfileId(null)
      return
    }

    setSaveLoading(true)
    try {
      if (payload.type === 'member') {
        await createAssignment(targetServiceId, activeTeamId, payload.profileId)
      } else {
        await moveAssignment(payload.assignmentId, targetServiceId)
      }
    } finally {
      setSaveLoading(false)
      setDraggingProfileId(null)
    }
  }

  const handleMobileAssign = async (serviceId: string) => {
    if (!activeTeamId || !mobileSelectedMemberId) {
      toast.warning('먼저 팀원 카드를 선택해 주세요.')
      return
    }

    setSaveLoading(true)
    try {
      await createAssignment(serviceId, activeTeamId, mobileSelectedMemberId)
    } finally {
      setSaveLoading(false)
    }
  }

  const handleDragMember = (event: React.DragEvent<HTMLDivElement>, profileId: string) => {
    const payload: DragPayload = { type: 'member', profileId }
    event.dataTransfer.setData('application/json', JSON.stringify(payload))
    event.dataTransfer.effectAllowed = 'copyMove'
    setDraggingProfileId(profileId)
  }

  const handleDragAssignment = (event: React.DragEvent<HTMLDivElement>, assignmentId: string, profileId: string) => {
    const payload: DragPayload = { type: 'assignment', assignmentId }
    event.dataTransfer.setData('application/json', JSON.stringify(payload))
    event.dataTransfer.effectAllowed = 'move'
    setDraggingProfileId(profileId)
  }

  const handleDragEnd = () => {
    setDragOverServiceId(null)
    setDraggingProfileId(null)
  }

  const handleDragOverService = (event: React.DragEvent<HTMLDivElement>, serviceId: string) => {
    if (activeTeamId && draggingProfileId) {
      const status = getAvailabilityStatus(activeTeamId, serviceId, draggingProfileId)
      if (status === 'unavailable') {
        setDragOverServiceId(null)
        return
      }
    }

    event.preventDefault()
    setDragOverServiceId((prev) => (prev === serviceId ? prev : serviceId))
  }

  if (dataLoading) {
    return <div className="p-20 text-center text-slate-500">예배 스케줄 데이터를 불러오는 중...</div>
  }

  const draggingProfileName = draggingProfileId ? profileById.get(draggingProfileId)?.full_name || '선택 팀원' : null

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between">
        <h1 className="text-2xl font-bold">예배 스케줄 관리</h1>
        <Card className="w-full border-slate-200 p-2 lg:w-auto">
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void handleCreateService()
            }}
            className="grid gap-2 sm:grid-cols-[160px_1fr_auto] sm:items-center"
          >
            <Input
              type="date"
              value={newService.date}
              onChange={(event) => setNewService({ ...newService, date: event.target.value })}
              className="w-full"
              required
            />
            <Input
              placeholder="예배 명칭 (예: 3월 3주차)"
              value={newService.title}
              onChange={(event) => setNewService({ ...newService, title: event.target.value })}
              className="w-full"
              required
            />
            <Button type="button" disabled={saveLoading} onClick={() => void handleCreateService()} className="w-full sm:w-auto">
              <Plus className="w-4 h-4 mr-1" /> 생성
            </Button>
          </form>
        </Card>
      </header>

      <Card className="bg-slate-50 border-dashed border-2">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">월간 배정 허브</CardTitle>
          <p className="text-sm text-slate-500">
            팀 탭을 선택한 뒤 팀원 카드를 월간 예배 카드로 드래그하면 즉시 배정됩니다. 이미 배정된 카드도 다른 날짜로 드래그해 이동할 수 있습니다.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {teams.map((team) => (
              <Button
                key={team.id}
                type="button"
                size="sm"
                variant={activeTeamId === team.id ? 'default' : 'outline'}
                onClick={() => setActiveTeamId(team.id)}
                className="shrink-0"
              >
                {team.name}
              </Button>
            ))}
          </div>

          {!availabilityReady && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              팀원 가능 일정 투표 데이터 테이블이 아직 적용되지 않았습니다. 마이그레이션 적용 후 집계가 표시됩니다.
            </div>
          )}

          {availabilityReady && activeTeamId && hasActiveTeamVotesAnyMonth && activeTeamVoteResponseCount === 0 && (
            <div className="flex flex-col gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700 sm:flex-row sm:items-center sm:justify-between">
              <p>현재 선택한 월에는 투표 응답이 없습니다. 투표한 월과 보드 월이 다를 수 있습니다.</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 self-start text-xs sm:self-auto"
                onClick={() => setCurrentMonth(startOfMonth(addMonths(new Date(), 1)))}
              >
                다음 달로 이동
              </Button>
            </div>
          )}

          {activeTeamId && (
            <div className="grid gap-4 md:grid-cols-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs text-slate-500">선택 팀</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-lg font-bold">{teamById.get(activeTeamId)?.name || '-'}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs text-slate-500">월간 미배정 예배</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-lg font-bold">{unassignedServiceCount}개</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs text-slate-500">1인 평균 배정</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-lg font-bold">{avgLoad.toFixed(1)}회</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs text-slate-500">투표 응답</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-lg font-bold">
                    {activeTeamVoteResponseCount}/{activeTeamVoteExpectedCount}
                  </p>
                </CardContent>
              </Card>
            </div>
          )}

          <div className="space-y-4 lg:hidden">
            <Card>
              <CardHeader className="pb-3 border-b">
                <CardTitle className="text-sm font-semibold">모바일 빠른 배정</CardTitle>
              </CardHeader>
              <CardContent className="pt-3">
                {activeTeamMembersSortedByLoad.length === 0 ? (
                  <p className="text-sm text-slate-500">이 팀에 등록된 팀원이 없습니다.</p>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-slate-500">팀원을 선택한 뒤 일정 카드의 배정 버튼을 누르세요.</p>
                    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                      {activeTeamMembersSortedByLoad.map((member) => {
                        const count = monthlyCountByProfile.get(member.id) || 0
                        const selected = member.id === mobileSelectedMemberId
                        return (
                          <button
                            key={member.id}
                            type="button"
                            onClick={() => setMobileSelectedMemberId(member.id)}
                            className={`shrink-0 rounded-lg border px-3 py-2 text-left ${
                              selected ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-white'
                            }`}
                          >
                            <p className="text-sm font-semibold">{member.full_name}</p>
                            <p className="text-[11px] text-slate-500">{count}회 배정</p>
                            {servicesInMonth.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {servicesInMonth.map((service) => {
                                  const status = activeTeamAvailabilityByProfileService.get(`${member.id}__${service.id}`) || null
                                  const dotClass =
                                    status === 'available'
                                      ? 'bg-emerald-500'
                                      : status === 'maybe'
                                        ? 'bg-emerald-500'
                                        : status === 'unavailable'
                                          ? 'bg-rose-500'
                                          : 'bg-slate-300'
                                  return (
                                    <span
                                      key={service.id}
                                      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] ${availabilityChipClass(status)}`}
                                      title={`${format(parseISO(service.date), 'M월 d일 (EEE)', { locale: ko })} · ${dragPreviewLabel(status)}`}
                                    >
                                      <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
                                      {format(parseISO(service.date), 'M/d')}
                                    </span>
                                  )
                                })}
                              </div>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3 border-b flex flex-row items-center justify-between gap-2">
                <CardTitle className="text-sm font-semibold">월간 예배 보드</CardTitle>
                <div className="inline-flex items-center gap-1 rounded-md border bg-white p-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setCurrentMonth(addMonths(currentMonth, -1))}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="min-w-24 text-center text-xs font-semibold">
                    {format(currentMonth, 'yyyy년 M월', { locale: ko })}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 pt-3">
                {servicesInMonth.length === 0 ? (
                  <p className="text-sm text-slate-500">이번 달 예배 일정이 없습니다.</p>
                ) : (
                  servicesInMonth.map((service) => {
                    const laneAssignments = (activeTeamAssignmentsByService.get(service.id) || []).sort((a, b) => {
                      const aName = profileById.get(a.profile_id)?.full_name || ''
                      const bName = profileById.get(b.profile_id)?.full_name || ''
                      return aName.localeCompare(bName, 'ko')
                    })
                    const selectedMemberStatus =
                      activeTeamId && mobileSelectedMemberId
                        ? getAvailabilityStatus(activeTeamId, service.id, mobileSelectedMemberId)
                        : null
                    const mobileUnavailable = selectedMemberStatus === 'unavailable'
                    return (
                      <div key={service.id} className="rounded-lg border bg-white p-3">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <div>
                            <p className="text-xs text-slate-500">{format(parseISO(service.date), 'M월 d일 (EEE)', { locale: ko })}</p>
                            <p className="text-sm font-semibold">{service.title}</p>
                          </div>
                          <Link href={`/admin/services/${service.id}`} className="text-[11px] text-slate-500 hover:underline">
                            상세
                          </Link>
                        </div>
                        {laneAssignments.length === 0 ? (
                          <p className="rounded-md border border-dashed p-2 text-xs text-slate-400">아직 배정된 팀원이 없습니다.</p>
                        ) : (
                          <div className="space-y-1">
                            {laneAssignments.map((assignment) => {
                              return (
                                <div key={assignment.id} className="flex items-center justify-between rounded-md border bg-slate-50 px-2 py-1.5">
                                  <div>
                                    <p className="text-xs font-medium">{profileById.get(assignment.profile_id)?.full_name || '이름 없음'}</p>
                                    <p className="text-[11px] text-slate-500">{assignment.role_name}</p>
                                  </div>
                                  <Button type="button" variant="ghost" size="icon" onClick={() => void deleteAssignment(assignment.id)}>
                                    <Trash2 className="h-4 w-4 text-red-400" />
                                  </Button>
                                </div>
                              )
                            })}
                          </div>
                        )}

                        <Button
                          type="button"
                          className="mt-2 w-full"
                          disabled={saveLoading || !mobileSelectedMemberId || mobileUnavailable}
                          onClick={() => void handleMobileAssign(service.id)}
                        >
                          {mobileSelectedMemberId
                            ? mobileUnavailable
                              ? '불가 일정은 배정 불가'
                              : `${profileById.get(mobileSelectedMemberId)?.full_name || '선택 팀원'} 배정`
                            : '팀원을 먼저 선택하세요'}
                        </Button>
                      </div>
                    )
                  })
                )}
              </CardContent>
            </Card>
          </div>

          <div className="hidden gap-4 lg:grid xl:grid-cols-[320px_1fr]">
            <Card>
                <CardHeader className="pb-3 border-b">
                  <CardTitle className="text-sm font-semibold">팀원 풀</CardTitle>
                  <p className="text-xs text-slate-500">
                    현재 선택한 월 기준으로 날짜칩에 팀원별 가능 상태를 표시합니다. (초록: 가능, 빨강: 불가, 회색: 미응답)
                  </p>
                </CardHeader>
              <CardContent className="pt-3">
                <div className="max-h-[560px] space-y-2 overflow-auto pr-1">
                  {activeTeamMembersSortedByLoad.length === 0 ? (
                    <p className="text-sm text-slate-500">이 팀에 등록된 팀원이 없습니다.</p>
                  ) : (
                    activeTeamMembersSortedByLoad.map((member) => {
                      const count = monthlyCountByProfile.get(member.id) || 0
                      const isHeavy = count > Math.ceil(avgLoad) + 1

                      return (
                        <div
                          key={member.id}
                          draggable
                          onDragStart={(event) => handleDragMember(event, member.id)}
                          onDragEnd={handleDragEnd}
                          className="cursor-grab rounded-md border bg-white p-3 active:cursor-grabbing hover:border-blue-300"
                        >
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-semibold">{member.full_name}</p>
                            <GripVertical className="h-4 w-4 text-slate-400" />
                          </div>
                          <div className="mt-1 flex items-center gap-2">
                            <span className="rounded bg-blue-100 px-2 py-0.5 text-[11px] text-blue-700">{count}회</span>
                            {isHeavy && <span className="text-[11px] text-amber-600">분배 과다 주의</span>}
                          </div>
                          {servicesInMonth.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {servicesInMonth.map((service) => {
                                const status = activeTeamAvailabilityByProfileService.get(`${member.id}__${service.id}`) || null
                                const dotClass =
                                  status === 'available'
                                    ? 'bg-emerald-500'
                                    : status === 'maybe'
                                      ? 'bg-emerald-500'
                                      : status === 'unavailable'
                                        ? 'bg-rose-500'
                                        : 'bg-slate-300'
                                return (
                                  <span
                                    key={service.id}
                                    className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] ${availabilityChipClass(status)}`}
                                    title={`${format(parseISO(service.date), 'M월 d일 (EEE)', { locale: ko })} · ${dragPreviewLabel(status)}`}
                                  >
                                    <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
                                    {format(parseISO(service.date), 'M/d')}
                                  </span>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3 border-b flex flex-row items-center justify-between gap-2">
                <CardTitle className="text-sm font-semibold">월간 예배 보드</CardTitle>
                <div className="inline-flex items-center gap-1 rounded-md border bg-white p-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setCurrentMonth(addMonths(currentMonth, -1))}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="min-w-24 text-center text-xs font-semibold">
                    {format(currentMonth, 'yyyy년 M월', { locale: ko })}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-3">
                {servicesInMonth.length === 0 ? (
                  <p className="text-sm text-slate-500">이번 달 예배 일정이 없습니다.</p>
                ) : (
                  <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
                    {servicesInMonth.map((service) => {
                      const laneAssignments = (activeTeamAssignmentsByService.get(service.id) || []).sort((a, b) => {
                        const aName = profileById.get(a.profile_id)?.full_name || ''
                        const bName = profileById.get(b.profile_id)?.full_name || ''
                        return aName.localeCompare(bName, 'ko')
                      })
                      const draggingAvailability = draggingProfileId
                        ? activeTeamAvailabilityByProfileService.get(`${draggingProfileId}__${service.id}`) || null
                        : null

                      return (
                        <div
                          key={service.id}
                          onDragOver={(event) => handleDragOverService(event, service.id)}
                          onDragLeave={() => setDragOverServiceId((prev) => (prev === service.id ? null : prev))}
                          onDrop={(event) => void handleDropToService(event, service.id)}
                          className={`rounded-lg border p-3 transition-colors ${
                            dragOverServiceId === service.id
                              ? 'border-blue-300 bg-blue-50'
                              : draggingProfileId
                                ? dragPreviewCardClass(draggingAvailability)
                                : 'bg-white'
                          }`}
                        >
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <div>
                              <p className="text-xs text-slate-500">
                                {format(parseISO(service.date), 'M월 d일 (EEE)', { locale: ko })}
                              </p>
                              <p className="text-sm font-semibold">{service.title}</p>
                            </div>
                            <Link href={`/admin/services/${service.id}`} className="text-[11px] text-slate-500 hover:underline">
                              상세
                            </Link>
                          </div>
                          {draggingProfileId && draggingProfileName && (
                            <p
                              className={`mb-2 inline-flex rounded border px-2 py-0.5 text-[11px] font-medium ${availabilityChipClass(
                                draggingAvailability
                              )}`}
                            >
                              {draggingProfileName}: {dragPreviewLabel(draggingAvailability)}
                            </p>
                          )}

                          {laneAssignments.length === 0 ? (
                            <p className="rounded-md border border-dashed p-3 text-xs text-slate-400">여기로 팀원을 드래그해 배정하세요.</p>
                          ) : (
                            <div className="space-y-2">
                              {laneAssignments.map((assignment) => {
                                return (
                                  <div
                                    key={assignment.id}
                                    draggable
                                    onDragStart={(event) => handleDragAssignment(event, assignment.id, assignment.profile_id)}
                                    onDragEnd={handleDragEnd}
                                    className="flex cursor-grab items-center justify-between rounded-md border bg-slate-50 px-2 py-1.5 active:cursor-grabbing"
                                  >
                                    <div>
                                      <p className="text-xs font-medium">
                                        {profileById.get(assignment.profile_id)?.full_name || '이름 없음'}
                                      </p>
                                      <p className="text-[11px] text-slate-500">{assignment.role_name}</p>
                                    </div>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => void deleteAssignment(assignment.id)}
                                    >
                                      <Trash2 className="h-4 w-4 text-red-400" />
                                    </Button>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
