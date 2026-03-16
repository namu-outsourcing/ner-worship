'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import { ChevronLeft, Globe } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { buildYoutubeEmbedPlaylistUrl, buildYoutubeQueueUrl, extractYouTubeVideoIds } from '@/lib/youtube'

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

interface Assignment {
  id: string
  service_id: string
  team_id: string
  profile_id: string
  role_name: string
}

interface ServiceResource {
  service_id: string
  setlist_urls: string[] | null
  meditation: string | null
}

interface CurrentUserProfile {
  role: string
}

export default function ServiceDetailPage() {
  const params = useParams()
  const id = params.id as string
  const router = useRouter()
  const supabase = createClient()

  const [service, setService] = useState<Service | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [loading, setLoading] = useState(true)
  const [resourceSaving, setResourceSaving] = useState(false)
  const [resourceTableReady, setResourceTableReady] = useState(true)
  const [setlistInputs, setSetlistInputs] = useState<string[]>(['', '', '', '', ''])
  const [meditationText, setMeditationText] = useState('')
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)

    try {
      const { data: authData } = await supabase.auth.getUser()
      const userId = authData.user?.id || null

      const [serviceRes, teamsRes, profilesRes, assignmentsRes, resourceRes, myProfileRes] = await Promise.all([
        supabase.from('services').select('id, title, date, status').eq('id', id).single(),
        supabase.from('teams').select('id, name').order('name', { ascending: true }),
        supabase.from('profiles').select('id, full_name').order('full_name', { ascending: true }),
        supabase
          .from('assignments')
          .select('id, service_id, team_id, profile_id, role_name')
          .eq('service_id', id),
        supabase
          .from('service_resources')
          .select('service_id, setlist_urls, meditation')
          .eq('service_id', id)
          .maybeSingle(),
        userId
          ? supabase.from('profiles').select('role').eq('id', userId).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ])

      if (serviceRes.error || !serviceRes.data) {
        toast.error('예배 정보를 불러오지 못했습니다.')
        return
      }

      if (teamsRes.error) toast.error('팀 목록을 불러오지 못했습니다.')
      if (profilesRes.error) toast.error('팀원 목록을 불러오지 못했습니다.')
      if (assignmentsRes.error) toast.error('배정 정보를 불러오지 못했습니다.')
      if (resourceRes.error) {
        if (resourceRes.error.code === '42P01') {
          setResourceTableReady(false)
        } else {
          toast.error('콘티/묵상 정보를 불러오지 못했습니다.')
        }
      } else {
        setResourceTableReady(true)
      }

      setService(serviceRes.data as Service)
      setTeams((teamsRes.data || []) as Team[])
      setProfiles((profilesRes.data || []) as Profile[])
      setAssignments((assignmentsRes.data || []) as Assignment[])
      setCurrentUserId(userId)
      setCurrentUserRole((myProfileRes.data as CurrentUserProfile | null)?.role || null)

      const resource = resourceRes.data as ServiceResource | null
      const sourceUrls = resource?.setlist_urls || []
      const paddedUrls = [...sourceUrls]
      while (paddedUrls.length < 5) paddedUrls.push('')
      setSetlistInputs(paddedUrls.slice(0, 5))
      setMeditationText(resource?.meditation || '')
    } finally {
      setLoading(false)
    }
  }, [id, supabase])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  const profileById = useMemo(() => {
    return new Map(profiles.map((profile) => [profile.id, profile]))
  }, [profiles])

  const assignmentsByTeam = useMemo(() => {
    const grouped = new Map<string, Assignment[]>()

    assignments.forEach((assignment) => {
      const list = grouped.get(assignment.team_id) || []
      list.push(assignment)
      grouped.set(assignment.team_id, list)
    })

    for (const [teamId, list] of grouped.entries()) {
      list.sort((a, b) => {
        const aName = profileById.get(a.profile_id)?.full_name || ''
        const bName = profileById.get(b.profile_id)?.full_name || ''
        return aName.localeCompare(bName, 'ko')
      })
      grouped.set(teamId, list)
    }

    return grouped
  }, [assignments, profileById])

  const assignedTeamsCount = useMemo(() => {
    return new Set(assignments.map((assignment) => assignment.team_id)).size
  }, [assignments])

  const setlistVideoIds = useMemo(() => {
    return extractYouTubeVideoIds(setlistInputs)
  }, [setlistInputs])

  const queueUrl = useMemo(() => {
    return buildYoutubeQueueUrl(setlistVideoIds)
  }, [setlistVideoIds])

  const embedUrl = useMemo(() => {
    return buildYoutubeEmbedPlaylistUrl(setlistVideoIds)
  }, [setlistVideoIds])

  const canEditResources = useMemo(() => {
    if (!currentUserId) return false
    if (currentUserRole === 'division_leader') return true
    return assignments.some(
      (assignment) =>
        assignment.profile_id === currentUserId &&
        typeof assignment.role_name === 'string' &&
        assignment.role_name.includes('인도')
    )
  }, [assignments, currentUserId, currentUserRole])

  const handlePublish = async () => {
    if (!service) return

    const nextStatus = service.status === 'published' ? 'draft' : 'published'
    const { error } = await supabase.from('services').update({ status: nextStatus }).eq('id', service.id)

    if (error) {
      toast.error('상태 변경에 실패했습니다.')
      return
    }

    setService((prev) => (prev ? { ...prev, status: nextStatus } : prev))
    toast.success(nextStatus === 'published' ? '스케줄이 공개되었습니다.' : '초안으로 전환되었습니다.')
  }

  const handleSetlistInputChange = (index: number, value: string) => {
    setSetlistInputs((prev) => {
      const next = [...prev]
      next[index] = value
      return next
    })
  }

  const handleSaveResources = async () => {
    if (!canEditResources) {
      toast.error('인도자 또는 최고 관리자만 콘티/묵상을 수정할 수 있습니다.')
      return
    }

    if (!resourceTableReady) {
      toast.error('service_resources 테이블이 없어 저장할 수 없습니다.')
      return
    }

    setResourceSaving(true)
    try {
      const cleanedUrls = setlistInputs.map((item) => item.trim()).filter(Boolean).slice(0, 5)
      const { error } = await supabase.from('service_resources').upsert(
        {
          service_id: id,
          setlist_urls: cleanedUrls,
          meditation: meditationText.trim(),
        },
        { onConflict: 'service_id' }
      )

      if (error) {
        if (error.code === '42P01') {
          setResourceTableReady(false)
          toast.error('service_resources 테이블이 없어 저장할 수 없습니다.')
          return
        }
        toast.error('콘티/묵상 저장에 실패했습니다.')
        return
      }

      toast.success('콘티와 묵상이 임시 저장되었습니다.')
    } finally {
      setResourceSaving(false)
    }
  }

  if (loading) {
    return <div className="p-20 text-center text-slate-500">일정 정보를 불러오는 중...</div>
  }

  if (!service) {
    return <div className="p-20 text-center text-slate-500">일정 정보를 찾을 수 없습니다.</div>
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{service.title}</h1>
            <p className="text-slate-500">{format(parseISO(service.date), 'yyyy년 M월 d일 (EEE)', { locale: ko })}</p>
          </div>
        </div>
        <Button onClick={handlePublish} variant={service.status === 'published' ? 'outline' : 'default'}>
          <Globe className="w-4 h-4 mr-2" />
          {service.status === 'published' ? '비공개로 전환' : '스케줄 공개하기'}
        </Button>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-slate-500">일정 상태</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-bold">{service.status === 'published' ? '공개됨' : '초안'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-slate-500">배정 팀 수</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-bold">{assignedTeamsCount}/{teams.length}팀</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-slate-500">총 배정 인원</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-bold">{assignments.length}명</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">콘티 및 묵상</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!canEditResources && (
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
              콘티/묵상은 인도자 또는 최고 관리자만 수정할 수 있습니다.
            </div>
          )}

          {!resourceTableReady && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              `service_resources` 테이블이 아직 없습니다. 마이그레이션을 먼저 적용해 주세요.
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
            <div className="space-y-3">
              <p className="text-sm font-semibold">콘티 (최대 5곡 유튜브 링크)</p>
              {setlistInputs.map((value, index) => (
                <Input
                  key={index}
                  value={value}
                  placeholder={`곡 ${index + 1} 유튜브 URL`}
                  onChange={(event) => handleSetlistInputChange(index, event.target.value)}
                  disabled={!canEditResources}
                />
              ))}

              <p className="pt-2 text-sm font-semibold">묵상</p>
              <textarea
                value={meditationText}
                onChange={(event) => setMeditationText(event.target.value)}
                placeholder="예배 콘티에 대한 묵상을 입력하세요."
                disabled={!canEditResources}
                className="min-h-40 w-full rounded-md border px-3 py-2 text-sm outline-none focus-visible:border-ring disabled:cursor-not-allowed disabled:bg-slate-100"
              />

              <Button
                type="button"
                onClick={() => void handleSaveResources()}
                disabled={resourceSaving || !canEditResources}
              >
                {resourceSaving ? '저장 중...' : '임시 저장하기'}
              </Button>
            </div>

            <div className="space-y-3 rounded-lg border bg-slate-50 p-4">
              <p className="text-sm font-semibold">자동 재생목록 미리보기</p>
              <p className="text-xs text-slate-500">
                유튜브 URL을 자동 파싱해 한 번에 재생 가능한 목록을 만듭니다.
              </p>

              {queueUrl ? (
                <a
                  href={queueUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex rounded-md border bg-white px-3 py-1.5 text-sm hover:bg-slate-100"
                >
                  유튜브 재생목록 열기
                </a>
              ) : (
                <p className="text-sm text-slate-500">유효한 유튜브 링크를 하나 이상 입력해 주세요.</p>
              )}

              {embedUrl && (
                <iframe
                  title="setlist-preview"
                  src={embedUrl}
                  className="h-56 w-full rounded-md border"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allowFullScreen
                />
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">팀별 매트릭스</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b bg-slate-50">
                <tr>
                  <th className="w-40 px-4 py-3 text-xs font-semibold uppercase text-slate-500">팀</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase text-slate-500">{service.title}</th>
                </tr>
              </thead>
              <tbody>
                {teams.map((team) => {
                  const teamAssignments = assignmentsByTeam.get(team.id) || []

                  return (
                    <tr key={team.id} className="border-b align-top last:border-b-0">
                      <td className="px-4 py-3 font-semibold text-slate-700">{team.name}</td>
                      <td className="px-4 py-3">
                        {teamAssignments.length === 0 ? (
                          <span className="text-xs text-slate-400">미배정</span>
                        ) : (
                          <div className="space-y-1">
                            {teamAssignments.map((assignment) => (
                              <div key={assignment.id} className="text-xs">
                                <span className="font-medium">
                                  {profileById.get(assignment.profile_id)?.full_name || '이름 없음'}
                                </span>
                                <span className="text-slate-500"> · {assignment.role_name}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
