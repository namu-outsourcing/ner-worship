'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { User, Trash2, ChevronLeft, Globe, GripVertical } from 'lucide-react'
import { compareAsc, endOfMonth, format, parseISO, startOfMonth } from 'date-fns'
import { ko } from 'date-fns/locale'

interface Service {
  id: string
  title: string
  date: string
  status: string
}

interface Team {
  id: string
  name: string
}

interface Profile {
  id: string
  full_name: string
}

interface TeamMember {
  team_id: string
  profile_id: string
}

interface Assignment {
  id: string
  service_id: string
  team_id: string
  profile_id: string
  role_name: string
}

type DragPayload =
  | { type: 'member'; profileId: string }
  | { type: 'assignment'; assignmentId: string }

export default function ServiceDetailPage() {
  const params = useParams()
  const id = params.id as string
  const router = useRouter()
  const supabase = createClient()

  const [service, setService] = useState<Service | null>(null)
  const [monthServices, setMonthServices] = useState<Service[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [activeTeamId, setActiveTeamId] = useState('')
  const [selectedMember, setSelectedMember] = useState('')
  const [roleName, setRoleName] = useState('')
  const [dragOverServiceId, setDragOverServiceId] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const { data: serviceData, error: serviceError } = await supabase
        .from('services')
        .select('*')
        .eq('id', id)
        .single()

      if (serviceError || !serviceData) {
        toast.error('예배 정보를 불러오지 못했습니다.')
        setLoading(false)
        return
      }

      setService(serviceData)

      const serviceDate = parseISO(serviceData.date)
      const monthStart = format(startOfMonth(serviceDate), 'yyyy-MM-dd')
      const monthEnd = format(endOfMonth(serviceDate), 'yyyy-MM-dd')

      const [teamsRes, profilesRes, teamMembersRes, monthServicesRes] = await Promise.all([
        supabase.from('teams').select('*').order('name'),
        supabase.from('profiles').select('id, full_name').order('full_name'),
        supabase.from('team_members').select('team_id, profile_id'),
        supabase
          .from('services')
          .select('*')
          .gte('date', monthStart)
          .lte('date', monthEnd)
          .order('date', { ascending: true }),
      ])

      if (teamsRes.error) toast.error('팀 목록을 불러오지 못했습니다.')
      if (profilesRes.error) toast.error('팀원 목록을 불러오지 못했습니다.')
      if (teamMembersRes.error) toast.error('팀 소속 정보를 불러오지 못했습니다.')
      if (monthServicesRes.error) toast.error('월간 예배 목록을 불러오지 못했습니다.')

      const fetchedTeams = teamsRes.data || []
      const fetchedProfiles = profilesRes.data || []
      const fetchedTeamMembers = (teamMembersRes.data || []) as TeamMember[]
      const fetchedMonthServices = monthServicesRes.data || []

      setTeams(fetchedTeams)
      setProfiles(fetchedProfiles)
      setTeamMembers(fetchedTeamMembers)
      setMonthServices(fetchedMonthServices)

      if (!activeTeamId && fetchedTeams.length > 0) {
        setActiveTeamId(fetchedTeams[0].id)
      } else if (activeTeamId && !fetchedTeams.find((team) => team.id === activeTeamId)) {
        setActiveTeamId(fetchedTeams[0]?.id || '')
      }

      if (fetchedMonthServices.length === 0) {
        setAssignments([])
        setLoading(false)
        return
      }

      const serviceIds = fetchedMonthServices.map((item) => item.id)
      const { data: assignmentData, error: assignmentError } = await supabase
        .from('assignments')
        .select('*')
        .in('service_id', serviceIds)

      if (assignmentError) toast.error('배정 정보를 불러오지 못했습니다.')
      setAssignments((assignmentData || []) as Assignment[])
    } catch {
      toast.error('데이터를 불러오는 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }, [activeTeamId, id, supabase])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  const profileById = useMemo(() => {
    return new Map(profiles.map((profile) => [profile.id, profile]))
  }, [profiles])

  const sortedMonthServices = useMemo(() => {
    return [...monthServices].sort((a, b) => compareAsc(parseISO(a.date), parseISO(b.date)))
  }, [monthServices])

  const activeTeamMembers = useMemo(() => {
    const memberIds = new Set(
      teamMembers
        .filter((teamMember) => teamMember.team_id === activeTeamId)
        .map((teamMember) => teamMember.profile_id)
    )

    return profiles.filter((profile) => memberIds.has(profile.id))
  }, [activeTeamId, profiles, teamMembers])

  const activeTeamAssignments = useMemo(() => {
    return assignments.filter((assignment) => assignment.team_id === activeTeamId)
  }, [activeTeamId, assignments])

  const currentServiceAssignments = useMemo(() => {
    return activeTeamAssignments.filter((assignment) => assignment.service_id === id)
  }, [activeTeamAssignments, id])

  const assignmentsByService = useMemo(() => {
    const grouped = new Map<string, Assignment[]>()
    activeTeamAssignments.forEach((assignment) => {
      const list = grouped.get(assignment.service_id) || []
      list.push(assignment)
      grouped.set(assignment.service_id, list)
    })
    return grouped
  }, [activeTeamAssignments])

  const monthlyCountByProfile = useMemo(() => {
    const counts = new Map<string, number>()
    activeTeamAssignments.forEach((assignment) => {
      counts.set(assignment.profile_id, (counts.get(assignment.profile_id) || 0) + 1)
    })
    return counts
  }, [activeTeamAssignments])

  const selectedMemberName = profileById.get(selectedMember)?.full_name || ''

  const handlePublish = async () => {
    if (!service) return
    const newStatus = service.status === 'published' ? 'draft' : 'published'
    const { error } = await supabase.from('services').update({ status: newStatus }).eq('id', id)

    if (error) {
      toast.error('상태 변경 실패')
      return
    }

    toast.success(newStatus === 'published' ? '스케줄이 공개되었습니다!' : '초안으로 변경되었습니다.')
    await fetchData()
  }

  const createAssignment = async (serviceId: string, teamId: string, profileId: string, nextRoleName?: string) => {
    const alreadyAssignedInService = assignments.find(
      (assignment) => assignment.service_id === serviceId && assignment.profile_id === profileId
    )

    if (alreadyAssignedInService) {
      toast.warning('해당 팀원은 이미 이 예배에 배정되어 있습니다.')
      return
    }

    const role = (nextRoleName || roleName || '팀원').trim() || '팀원'

    const { error } = await supabase.from('assignments').insert({
      service_id: serviceId,
      team_id: teamId,
      profile_id: profileId,
      role_name: role,
    })

    if (error) {
      toast.error('배정 실패: ' + error.message)
      return
    }

    toast.success('배정되었습니다.')
    setSelectedMember('')
    setRoleName('')
    await fetchData()
  }

  const moveAssignment = async (assignmentId: string, targetServiceId: string) => {
    const targetAssignment = assignments.find((assignment) => assignment.id === assignmentId)
    if (!targetAssignment) return

    if (targetAssignment.service_id === targetServiceId) return

    const duplicated = assignments.find(
      (assignment) =>
        assignment.id !== assignmentId &&
        assignment.service_id === targetServiceId &&
        assignment.profile_id === targetAssignment.profile_id
    )

    if (duplicated) {
      toast.warning('같은 예배에 중복 배정할 수 없습니다.')
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
    await fetchData()
  }

  const handleDeleteAssignment = async (assignmentId: string) => {
    const { error } = await supabase.from('assignments').delete().eq('id', assignmentId)
    if (error) {
      toast.error('삭제 실패')
      return
    }
    await fetchData()
  }

  const handleDropToService = async (event: React.DragEvent<HTMLDivElement>, targetServiceId: string) => {
    event.preventDefault()
    setDragOverServiceId(null)

    const payloadRaw = event.dataTransfer.getData('application/json')
    if (!payloadRaw) return

    let payload: DragPayload
    try {
      payload = JSON.parse(payloadRaw) as DragPayload
    } catch {
      return
    }

    setSaving(true)
    try {
      if (payload.type === 'member') {
        await createAssignment(targetServiceId, activeTeamId, payload.profileId)
      } else if (payload.type === 'assignment') {
        await moveAssignment(payload.assignmentId, targetServiceId)
      }
    } finally {
      setSaving(false)
    }
  }

  const handleDragMember = (event: React.DragEvent<HTMLDivElement>, profileId: string) => {
    const payload: DragPayload = { type: 'member', profileId }
    event.dataTransfer.setData('application/json', JSON.stringify(payload))
    event.dataTransfer.effectAllowed = 'copyMove'
  }

  const handleDragAssignment = (event: React.DragEvent<HTMLDivElement>, assignmentId: string) => {
    const payload: DragPayload = { type: 'assignment', assignmentId }
    event.dataTransfer.setData('application/json', JSON.stringify(payload))
    event.dataTransfer.effectAllowed = 'move'
  }

  if (loading) return <div className="p-20 text-center">로딩 중...</div>

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{service?.title}</h1>
            <p className="text-slate-500">{service?.date}</p>
          </div>
        </div>
        <Button onClick={handlePublish} variant={service?.status === 'published' ? 'outline' : 'default'}>
          <Globe className="w-4 h-4 mr-2" />
          {service?.status === 'published' ? '비공개로 전환' : '스케줄 공개하기'}
        </Button>
      </header>

      <Card className="bg-slate-50 border-dashed border-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">월간 배정 워크벤치</CardTitle>
          <p className="text-sm text-slate-500">
            {service ? `${format(startOfMonth(parseISO(service.date)), 'M월', { locale: ko })} 전체 예배 기준` : ''}으로 팀원을 드래그해 빠르게 배정하세요.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {teams.map((team) => (
              <Button
                key={team.id}
                type="button"
                variant={activeTeamId === team.id ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setActiveTeamId(team.id)
                  setSelectedMember('')
                }}
              >
                {team.name}
              </Button>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
            <Card>
              <CardHeader className="pb-3 border-b">
                <CardTitle className="text-sm font-semibold">팀원 풀</CardTitle>
              </CardHeader>
              <CardContent className="pt-3 space-y-2 max-h-[540px] overflow-auto">
                {activeTeamMembers.length === 0 ? (
                  <p className="text-sm text-slate-500">이 팀에 등록된 팀원이 없습니다.</p>
                ) : (
                  activeTeamMembers.map((member) => (
                    <div
                      key={member.id}
                      draggable
                      onDragStart={(event) => handleDragMember(event, member.id)}
                      className="rounded-md border bg-white p-3 cursor-grab active:cursor-grabbing hover:border-blue-200"
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold">{member.full_name}</p>
                        <GripVertical className="w-4 h-4 text-slate-400" />
                      </div>
                      <p className="mt-1 text-xs text-slate-500">이번 달 {monthlyCountByProfile.get(member.id) || 0}회 배정</p>
                    </div>
                  ))
                )}

                <div className="pt-2 border-t space-y-2">
                  <p className="text-xs font-semibold text-slate-500 uppercase">현재 예배 빠른 추가</p>
                  <Select value={selectedMember} onValueChange={(value) => setSelectedMember(value || '')}>
                    <SelectTrigger>
                      <SelectValue placeholder="팀원 선택">{selectedMemberName || '팀원 선택'}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {activeTeamMembers.map((member) => (
                        <SelectItem key={member.id} value={member.id} label={member.full_name}>
                          {member.full_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder="역할 (예: 메인, 자막)"
                    value={roleName}
                    onChange={(event) => setRoleName(event.target.value)}
                  />
                  <Button
                    type="button"
                    className="w-full"
                    disabled={!selectedMember || !activeTeamId || saving}
                    onClick={() => void createAssignment(id, activeTeamId, selectedMember)}
                  >
                    현재 예배에 추가
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3 border-b">
                <CardTitle className="text-sm font-semibold">월간 예배 보드</CardTitle>
              </CardHeader>
              <CardContent className="pt-3">
                {sortedMonthServices.length === 0 ? (
                  <p className="text-sm text-slate-500">이 달에 등록된 예배가 없습니다.</p>
                ) : (
                  <div className="space-y-3 max-h-[540px] overflow-auto pr-1">
                    {sortedMonthServices.map((monthService) => {
                      const laneAssignments = (assignmentsByService.get(monthService.id) || []).sort((a, b) => {
                        const aName = profileById.get(a.profile_id)?.full_name || ''
                        const bName = profileById.get(b.profile_id)?.full_name || ''
                        return aName.localeCompare(bName, 'ko')
                      })

                      return (
                        <div
                          key={monthService.id}
                          onDragOver={(event) => {
                            event.preventDefault()
                            setDragOverServiceId(monthService.id)
                          }}
                          onDragLeave={() => setDragOverServiceId((prev) => (prev === monthService.id ? null : prev))}
                          onDrop={(event) => void handleDropToService(event, monthService.id)}
                          className={`rounded-lg border p-3 transition-colors ${
                            monthService.id === id
                              ? 'border-blue-400 bg-blue-50/50'
                              : dragOverServiceId === monthService.id
                                ? 'border-blue-300 bg-blue-50'
                                : 'bg-white'
                          }`}
                        >
                          <div className="mb-2 flex items-center justify-between">
                            <div>
                              <p className="text-xs text-slate-500">
                                {format(parseISO(monthService.date), 'M월 d일 (EEE)', { locale: ko })}
                              </p>
                              <p className="text-sm font-semibold">{monthService.title}</p>
                            </div>
                            {monthService.id === id && (
                              <span className="rounded bg-blue-100 px-2 py-0.5 text-[11px] text-blue-700">현재 예배</span>
                            )}
                          </div>

                          {laneAssignments.length === 0 ? (
                            <p className="text-xs text-slate-400">여기로 팀원을 드래그해 배정하세요.</p>
                          ) : (
                            <div className="space-y-2">
                              {laneAssignments.map((assignment) => (
                                <div
                                  key={assignment.id}
                                  draggable
                                  onDragStart={(event) => handleDragAssignment(event, assignment.id)}
                                  className="flex items-center justify-between rounded-md border bg-slate-50 px-2 py-1.5 cursor-grab active:cursor-grabbing"
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
                                    onClick={() => void handleDeleteAssignment(assignment.id)}
                                  >
                                    <Trash2 className="w-4 h-4 text-red-400" />
                                  </Button>
                                </div>
                              ))}
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

      <Card>
        <CardHeader className="pb-3 border-b">
          <CardTitle className="text-base">현재 예배 팀별 배정</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-2 mb-4">
            {teams.map((team) => (
              <Button
                key={team.id}
                type="button"
                size="sm"
                variant={activeTeamId === team.id ? 'default' : 'outline'}
                onClick={() => setActiveTeamId(team.id)}
              >
                {team.name}
              </Button>
            ))}
          </div>

          {currentServiceAssignments.length === 0 ? (
            <p className="text-sm text-slate-500">이 팀에 배정된 인원이 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {currentServiceAssignments.map((assignment) => (
                <div key={assignment.id} className="flex items-center justify-between rounded-md border p-2">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100">
                      <User className="w-4 h-4 text-slate-400" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{profileById.get(assignment.profile_id)?.full_name || '이름 없음'}</p>
                      <p className="text-xs text-slate-500">{assignment.role_name}</p>
                    </div>
                  </div>
                  <Button type="button" variant="ghost" size="icon" onClick={() => void handleDeleteAssignment(assignment.id)}>
                    <Trash2 className="w-4 h-4 text-red-400" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
