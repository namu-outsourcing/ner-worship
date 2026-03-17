'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { getAdminScope } from '@/lib/admin-scope'
import { toast } from 'sonner'
import { User } from 'lucide-react'

interface Profile {
  id: string
  full_name: string
  role: string
  birthday: string | null
  created_at: string
}

interface TeamMembershipRow {
  profile_id: string
  teams: { name: string } | { name: string }[] | null
}

export default function MembersAdminPage() {
  const [members, setMembers] = useState<Profile[]>([])
  const [teamsByMember, setTeamsByMember] = useState<Record<string, string[]>>({})
  const [birthdayDrafts, setBirthdayDrafts] = useState<Record<string, string>>({})
  const [birthdaySavingId, setBirthdaySavingId] = useState<string | null>(null)
  const [accessDenied, setAccessDenied] = useState(false)
  const [canEditRole, setCanEditRole] = useState(false)
  const [currentRoleLabel, setCurrentRoleLabel] = useState('')
  const [loading, setLoading] = useState(true)
  const supabase = useMemo(() => createClient(), [])

  const fetchMembers = useCallback(async () => {
    setLoading(true)
    setAccessDenied(false)
    setCanEditRole(false)
    setCurrentRoleLabel('')

    const scope = await getAdminScope(supabase)
    const canAccess = scope.isDivisionLeader || scope.role === 'team_leader'
    if (!canAccess) {
      setMembers([])
      setTeamsByMember({})
      setBirthdayDrafts({})
      setAccessDenied(true)
      setLoading(false)
      return
    }

    setCanEditRole(scope.isDivisionLeader)
    setCurrentRoleLabel(
      scope.role === 'system_admin'
        ? '시스템 관리자'
        : scope.isDivisionLeader
          ? '부문장'
          : '팀장'
    )

    let membersRes:
      | { data: Profile[] | null; error: { message: string } | null }
      | { data: null; error: null }
    let membershipsRes:
      | { data: TeamMembershipRow[] | null; error: { message: string } | null }
      | { data: null; error: null }

    if (scope.isDivisionLeader) {
      ;[membersRes, membershipsRes] = await Promise.all([
        supabase.from('profiles').select('id, full_name, role, birthday, created_at').order('full_name'),
        supabase.from('team_members').select('profile_id, teams(name)'),
      ])
    } else {
      if (scope.managedTeamIds.length === 0) {
        setMembers([])
        setTeamsByMember({})
        setBirthdayDrafts({})
        setLoading(false)
        return
      }

      membershipsRes = await supabase
        .from('team_members')
        .select('profile_id, teams(name)')
        .in('team_id', scope.managedTeamIds)

      const visibleProfileIds = Array.from(
        new Set(((membershipsRes.data || []) as TeamMembershipRow[]).map((item) => item.profile_id))
      )

      if (visibleProfileIds.length === 0) {
        membersRes = { data: [], error: null }
      } else {
        membersRes = await supabase
          .from('profiles')
          .select('id, full_name, role, birthday, created_at')
          .in('id', visibleProfileIds)
          .order('full_name')
      }
    }

    if (membersRes.error) {
      toast.error('팀원 목록을 불러오지 못했습니다.')
      setLoading(false)
      return
    }

    if (membershipsRes.error) {
      toast.error('팀 소속 정보를 불러오지 못했습니다.')
    }

    const grouped: Record<string, string[]> = {}
    ;((membershipsRes.data || []) as TeamMembershipRow[]).forEach((row) => {
      const rawTeams = Array.isArray(row.teams) ? row.teams : row.teams ? [row.teams] : []
      const names = rawTeams.map((team) => team.name).filter(Boolean)
      if (names.length === 0) return
      if (!grouped[row.profile_id]) grouped[row.profile_id] = []
      grouped[row.profile_id].push(...names)
    })

    Object.keys(grouped).forEach((profileId) => {
      grouped[profileId] = Array.from(new Set(grouped[profileId])).sort((a, b) => a.localeCompare(b, 'ko'))
    })

    const fetchedMembers = (membersRes.data || []) as Profile[]
    const drafts: Record<string, string> = {}
    fetchedMembers.forEach((member) => {
      drafts[member.id] = member.birthday || ''
    })

    setMembers(fetchedMembers)
    setTeamsByMember(grouped)
    setBirthdayDrafts(drafts)
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchMembers()
  }, [fetchMembers])

  const handleUpdateRole = async (userId: string, newRole: string | null) => {
    if (accessDenied || !canEditRole) {
      toast.error('시스템 관리자 또는 부문장만 권한 변경이 가능합니다.')
      return
    }
    if (!newRole) return

    const { error } = await supabase
      .from('profiles')
      .update({ role: newRole })
      .eq('id', userId)

    if (error) {
      const msg = error.message || ''
      if (msg.includes('invalid input value for enum') || msg.includes('check constraint')) {
        toast.error('DB 권한 스키마에 인도자 값이 없어 변경에 실패했습니다. 역할 마이그레이션이 필요합니다.')
      } else {
        toast.error('권한 변경 실패')
      }
    } else {
      toast.success('권한이 변경되었습니다.')
      void fetchMembers()
    }
  }

  const handleSaveBirthday = async (userId: string) => {
    if (accessDenied) return
    const member = members.find((item) => item.id === userId)
    if (!member) return

    const nextBirthday = (birthdayDrafts[userId] || '').trim()
    const prevBirthday = member.birthday || ''
    if (nextBirthday === prevBirthday) return

    setBirthdaySavingId(userId)
    const { error } = await supabase
      .from('profiles')
      .update({ birthday: nextBirthday || null })
      .eq('id', userId)

    if (error) {
      toast.error('생일 저장 실패')
      setBirthdayDrafts((prev) => ({ ...prev, [userId]: prevBirthday }))
    } else {
      setMembers((prev) =>
        prev.map((item) => (item.id === userId ? { ...item, birthday: nextBirthday || null } : item))
      )
    }
    setBirthdaySavingId(null)
  }

  const roleBadgeClass = (role: string) => {
    if (role === 'division_leader') return 'bg-purple-100 text-purple-700'
    if (role === 'system_admin') return 'bg-indigo-100 text-indigo-700'
    if (role === 'service_admin') return 'bg-indigo-100 text-indigo-700'
    if (role === 'team_leader') return 'bg-blue-100 text-blue-700'
    if (role === 'secretary') return 'bg-green-100 text-green-700'
    if (role === 'worship_leader') return 'bg-amber-100 text-amber-700'
    return 'bg-slate-100 text-slate-600'
  }

  const roleLabel = (role: string) => {
    if (role === 'division_leader') return '부문장'
    if (role === 'system_admin') return '시스템 관리자'
    if (role === 'service_admin') return '시스템 관리자'
    if (role === 'team_leader') return '팀장'
    if (role === 'secretary') return '총무'
    if (role === 'worship_leader') return '인도자'
    return '팀원'
  }

  if (loading) return <div className="p-20 text-center">로딩 중...</div>
  if (accessDenied) return <div className="p-20 text-center text-slate-500">시스템 관리자, 부문장 또는 팀장만 접근할 수 있습니다.</div>

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">팀원 권한 관리</h1>
        <p className="text-slate-500">
          {canEditRole
            ? '가입된 팀원들의 직책과 권한을 설정합니다.'
            : `${currentRoleLabel} 권한: 소속 팀원의 정보만 조회/수정할 수 있습니다.`}
        </p>
      </header>

      <Card>
        <CardContent className="p-0">
          <div className="md:hidden space-y-3 p-3">
            {members.map((member) => (
              <div key={member.id} className="rounded-lg border bg-white p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                      <User className="h-4 w-4" />
                    </div>
                    <p className="truncate text-base font-semibold break-keep">{member.full_name}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${roleBadgeClass(member.role)}`}>
                    {roleLabel(member.role)}
                  </span>
                </div>

                <div className="mt-3 space-y-3">
                  <div>
                    <p className="mb-1 text-[11px] font-semibold text-slate-500">소속 팀</p>
                    {(teamsByMember[member.id] || []).length === 0 ? (
                      <span className="text-xs text-slate-400">미소속</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {(teamsByMember[member.id] || []).map((teamName) => (
                          <span key={`${member.id}-${teamName}`} className="rounded-full bg-slate-100 px-2 py-1 text-[11px] text-slate-700 break-keep">
                            {teamName}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <p className="mb-1 text-[11px] font-semibold text-slate-500">생일</p>
                    <Input
                      type="date"
                      value={birthdayDrafts[member.id] || ''}
                      onChange={(event) =>
                        setBirthdayDrafts((prev) => ({
                          ...prev,
                          [member.id]: event.target.value,
                        }))
                      }
                      onBlur={() => void handleSaveBirthday(member.id)}
                      disabled={birthdaySavingId === member.id}
                      className="h-9 w-full text-sm"
                    />
                  </div>

                  <div className="text-xs text-slate-500">
                    가입일: {new Date(member.created_at).toLocaleDateString()}
                  </div>

                  {canEditRole && (
                    <div>
                      <p className="mb-1 text-[11px] font-semibold text-slate-500">권한 변경</p>
                      <Select
                        defaultValue={member.role}
                        onValueChange={(val) => handleUpdateRole(member.id, val)}
                      >
                        <SelectTrigger className="h-9 w-full text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="division_leader">부문장</SelectItem>
                          <SelectItem value="service_admin">시스템 관리자</SelectItem>
                          <SelectItem value="team_leader">팀장</SelectItem>
                          <SelectItem value="secretary">총무</SelectItem>
                          <SelectItem value="worship_leader">인도자</SelectItem>
                          <SelectItem value="member">팀원</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b">
                <tr>
                  <th className="px-6 py-4">이름</th>
                  <th className="px-6 py-4">소속 팀</th>
                  <th className="px-6 py-4">생일</th>
                  <th className="px-6 py-4">가입일</th>
                  <th className="px-6 py-4">현재 권한</th>
                  {canEditRole && <th className="px-6 py-4">권한 변경</th>}
                </tr>
              </thead>
              <tbody className="divide-y">
                {members.map((member) => (
                  <tr key={member.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 font-medium">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                          <User className="h-4 w-4" />
                        </div>
                        {member.full_name}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {(teamsByMember[member.id] || []).length === 0 ? (
                        <span className="text-xs text-slate-400">미소속</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {(teamsByMember[member.id] || []).map((teamName) => (
                            <span key={`${member.id}-${teamName}`} className="rounded-full bg-slate-100 px-2 py-1 text-[11px] text-slate-700">
                              {teamName}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <Input
                        type="date"
                        value={birthdayDrafts[member.id] || ''}
                        onChange={(event) =>
                          setBirthdayDrafts((prev) => ({
                            ...prev,
                            [member.id]: event.target.value,
                          }))
                        }
                        onBlur={() => void handleSaveBirthday(member.id)}
                        disabled={birthdaySavingId === member.id}
                        className="h-8 w-40 text-xs"
                      />
                    </td>
                    <td className="px-6 py-4 text-slate-500">
                      {new Date(member.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${roleBadgeClass(member.role)}`}>
                        {roleLabel(member.role)}
                      </span>
                    </td>
                    {canEditRole && (
                      <td className="px-6 py-4">
                        <Select
                          defaultValue={member.role}
                          onValueChange={(val) => handleUpdateRole(member.id, val)}
                        >
                          <SelectTrigger className="h-8 w-36 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="division_leader">부문장</SelectItem>
                            <SelectItem value="service_admin">시스템 관리자</SelectItem>
                            <SelectItem value="team_leader">팀장</SelectItem>
                            <SelectItem value="secretary">총무</SelectItem>
                            <SelectItem value="worship_leader">인도자</SelectItem>
                            <SelectItem value="member">팀원</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
