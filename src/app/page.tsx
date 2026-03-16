import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { CalendarDays, Users, Settings, UserCheck } from 'lucide-react'
import { buildYoutubeQueueUrl, extractYouTubeVideoIds } from '@/lib/youtube'

interface ServiceRef {
  id: string
  title: string
  date: string
  status: string
}

interface TeamRef {
  id: string
  name: string
}

interface AssignmentRow {
  id: string
  role_name: string
  services: ServiceRef | ServiceRef[] | null
  teams: TeamRef | TeamRef[] | null
}

interface AssignmentDisplay {
  id: string
  role_name: string
  service: ServiceRef
  team: TeamRef
  resource: ServiceResource | null
}

interface TeamMembershipRow {
  teams: TeamRef | TeamRef[] | null
}

interface ServiceResource {
  service_id: string
  setlist_urls: string[] | null
  meditation: string | null
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // 1. 프로필 정보 가져오기
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  // 2. 내 배정 일정 가져오기
  const { data: myAssignmentsRaw } = await supabase
    .from('assignments')
    .select(`
      id,
      role_name,
      services (id, title, date, status),
      teams (id, name)
    `)
    .eq('profile_id', user.id)
    .eq('services.status', 'published') // 공개된 스케줄만
    .order('services(date)', { ascending: true })

  // 3. 내 소속 팀 정보 가져오기
  const { data: myTeamsRaw } = await supabase
    .from('team_members')
    .select('teams(id, name)')
    .eq('profile_id', user.id)

  const myAssignmentsBase = ((myAssignmentsRaw || []) as AssignmentRow[])
    .map((row) => {
      const service = Array.isArray(row.services) ? row.services[0] || null : row.services
      const team = Array.isArray(row.teams) ? row.teams[0] || null : row.teams

      if (!service || !team) return null

      return {
        id: row.id,
        role_name: row.role_name,
        service,
        team,
      }
    })
    .filter((row): row is Omit<AssignmentDisplay, 'resource'> => row !== null)

  const serviceIds = Array.from(new Set(myAssignmentsBase.map((item) => item.service.id)))
  const serviceResourceMap = new Map<string, ServiceResource>()

  if (serviceIds.length > 0) {
    const { data: resourcesRaw } = await supabase
      .from('service_resources')
      .select('service_id, setlist_urls, meditation')
      .in('service_id', serviceIds)

    for (const row of (resourcesRaw || []) as ServiceResource[]) {
      serviceResourceMap.set(row.service_id, row)
    }
  }

  const myAssignments: AssignmentDisplay[] = myAssignmentsBase.map((item) => ({
    ...item,
    resource: serviceResourceMap.get(item.service.id) || null,
  }))

  const myTeams: TeamRef[] = ((myTeamsRaw || []) as TeamMembershipRow[])
    .map((row) => (Array.isArray(row.teams) ? row.teams[0] || null : row.teams))
    .filter((team): team is TeamRef => team !== null)

  const myNextSetlistAssignment =
    myAssignments.find((assignment) => {
      const urls = assignment.resource?.setlist_urls || []
      return extractYouTubeVideoIds(urls).length > 0 || Boolean(assignment.resource?.meditation?.trim())
    }) || null

  const isAdmin = ['division_leader', 'team_leader', 'secretary'].includes(profile?.role || '')

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <header className="flex justify-between items-center mb-10">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">⛪️ 예배팀 대시보드</h1>
          <p className="text-slate-500 mt-1">
            {profile?.full_name} <span className="text-blue-600 font-semibold">{profile?.role}</span>님, 환영합니다.
          </p>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <Button asChild variant="outline">
              <Link href="/admin">
                <Settings className="w-4 h-4 mr-2" />
                관리자 패널
              </Link>
            </Button>
          )}
        </div>
      </header>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* 내 사역 일정 */}
        <Card className="hover:shadow-md transition-shadow border-blue-100">
          <CardHeader className="flex flex-row items-center space-x-2 border-b pb-3">
            <CalendarDays className="w-5 h-5 text-blue-500" />
            <CardTitle className="text-lg">내 사역 일정</CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-4">
            {myAssignments.length > 0 ? (
              myAssignments.map((a) => (
                <div key={a.id} className="p-3 bg-blue-50 rounded-lg border border-blue-100">
                  <p className="text-xs font-bold text-blue-600 mb-1">{a.service.date}</p>
                  <p className="text-sm font-bold">{a.service.title}</p>
                  <div className="flex justify-between items-center mt-2">
                    <span className="text-xs text-slate-500">{a.team.name}</span>
                    <span className="text-xs font-bold bg-white px-2 py-1 rounded shadow-sm">{a.role_name}</span>
                  </div>
                  {(() => {
                    const setlistIds = extractYouTubeVideoIds(a.resource?.setlist_urls || [])
                    const playlistUrl = buildYoutubeQueueUrl(setlistIds)
                    if (!playlistUrl) return null

                    return (
                      <a
                        href={playlistUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-block rounded-md border bg-white px-2 py-1 text-xs hover:bg-slate-100"
                      >
                        콘티 듣기
                      </a>
                    )
                  })()}
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500 py-4 text-center">확정된 사역 일정이 없습니다.</p>
            )}
          </CardContent>
        </Card>

        {/* 우리 팀 정보 */}
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center space-x-2 border-b pb-3">
            <Users className="w-5 h-5 text-green-500" />
            <CardTitle className="text-lg">내 소속 팀</CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-2">
            {myTeams.length > 0 ? (
              myTeams.map((team) => (
                <div key={team.id} className="flex items-center gap-2 p-2 hover:bg-slate-50 rounded">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-sm font-medium">{team.name}</span>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500 py-4 text-center">아직 소속된 팀이 없습니다.</p>
            )}
          </CardContent>
        </Card>

        {/* 공지/스왑 */}
        <Card className="hover:shadow-md transition-shadow border-purple-100">
          <CardHeader className="flex flex-row items-center space-x-2 border-b pb-3">
            <UserCheck className="w-5 h-5 text-purple-500" />
            <CardTitle className="text-lg">이번 주 콘티/묵상</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            {myNextSetlistAssignment ? (
              <div className="space-y-2">
                <p className="text-xs font-bold text-purple-600">{myNextSetlistAssignment.service.date}</p>
                <p className="text-sm font-bold">{myNextSetlistAssignment.service.title}</p>
                <p className="text-xs text-slate-500">{myNextSetlistAssignment.team.name}</p>

                {(() => {
                  const setlistIds = extractYouTubeVideoIds(myNextSetlistAssignment.resource?.setlist_urls || [])
                  const playlistUrl = buildYoutubeQueueUrl(setlistIds)
                  if (!playlistUrl) return null

                  return (
                    <a
                      href={playlistUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-block rounded-md border bg-slate-50 px-2 py-1 text-xs hover:bg-slate-100"
                    >
                      콘티 재생목록 열기
                    </a>
                  )
                })()}

                <p className="line-clamp-4 text-xs text-slate-600 whitespace-pre-wrap">
                  {myNextSetlistAssignment.resource?.meditation?.trim() || '등록된 묵상이 없습니다.'}
                </p>
              </div>
            ) : (
              <p className="text-sm text-slate-500 py-4 text-center">해당 주차 콘티/묵상이 아직 등록되지 않았습니다.</p>
            )}
          </CardContent>
        </Card>
      </div>
      
      <div className="mt-10">
        <h2 className="text-xl font-semibold mb-4">전체 예배 일정 현황</h2>
        <Card>
          <CardContent className="p-10 text-center text-slate-400 border-2 border-dashed rounded-xl">
            <p className="mb-2">전체 예배 배정 캘린더가 곧 준비됩니다.</p>
            <p className="text-xs">관리자가 스케줄을 [공개]하면 이곳에 나타납니다.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
