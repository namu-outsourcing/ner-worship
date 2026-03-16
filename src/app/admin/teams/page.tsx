'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Trash2, UserPlus } from 'lucide-react'
import { toast } from 'sonner'

interface Team {
  id: string
  name: string
  description: string | null
}

interface Profile {
  id: string
  full_name: string
  role: string
}

interface TeamMemberRow {
  team_id: string
  profile_id: string
  profiles: Profile | null
}

export default function TeamsAdminPage() {
  const [teams, setTeams] = useState<Team[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [teamMembersByTeam, setTeamMembersByTeam] = useState<Record<string, Profile[]>>({})
  const [newTeamName, setNewTeamName] = useState('')
  const [loading, setLoading] = useState(false)
  const [memberLoading, setMemberLoading] = useState(false)
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)
  const [selectedProfileId, setSelectedProfileId] = useState('')
  const supabase = useMemo(() => createClient(), [])

  const fetchTeams = async () => {
    const { data, error } = await supabase.from('teams').select('*')
    if (error) toast.error('팀 정보를 불러오지 못했습니다.')
    else setTeams(data || [])
  }

  const fetchTeamMembers = async () => {
    const { data, error } = await supabase
      .from('team_members')
      .select('team_id, profile_id, profiles(id, full_name, role)')

    if (error) {
      toast.error('팀별 팀원 정보를 불러오지 못했습니다.')
      return
    }

    const grouped: Record<string, Profile[]> = {}
    ;(data as TeamMemberRow[]).forEach((row) => {
      if (!row.profiles) return
      if (!grouped[row.team_id]) grouped[row.team_id] = []
      grouped[row.team_id].push(row.profiles)
    })
    setTeamMembersByTeam(grouped)
  }

  useEffect(() => {
    let active = true

    const loadInitialData = async () => {
      const [teamsRes, profilesRes, membersRes] = await Promise.all([
        supabase.from('teams').select('*'),
        supabase.from('profiles').select('id, full_name, role').order('full_name', { ascending: true }),
        supabase.from('team_members').select('team_id, profile_id, profiles(id, full_name, role)'),
      ])

      if (!active) return

      if (teamsRes.error) toast.error('팀 정보를 불러오지 못했습니다.')
      else setTeams(teamsRes.data || [])

      if (profilesRes.error) toast.error('팀원 목록을 불러오지 못했습니다.')
      else setProfiles(profilesRes.data || [])

      if (membersRes.error) {
        toast.error('팀별 팀원 정보를 불러오지 못했습니다.')
      } else {
        const grouped: Record<string, Profile[]> = {}
        ;(membersRes.data as TeamMemberRow[]).forEach((row) => {
          if (!row.profiles) return
          if (!grouped[row.team_id]) grouped[row.team_id] = []
          grouped[row.team_id].push(row.profiles)
        })
        setTeamMembersByTeam(grouped)
      }
    }

    void loadInitialData()

    return () => {
      active = false
    }
  }, [supabase])

  const handleCreateTeam = async () => {
    if (!newTeamName.trim()) {
      toast.warning('팀 이름을 입력해 주세요.')
      return
    }
    setLoading(true)

    const { error } = await supabase.from('teams').insert({ name: newTeamName.trim() })
    if (error) {
      toast.error('팀 생성 실패: ' + error.message)
    } else {
      toast.success('새 팀이 생성되었습니다!')
      setNewTeamName('')
      await fetchTeams()
    }
    setLoading(false)
  }

  const handleDeleteTeam = async (id: string) => {
    if (!confirm('정말 삭제하시겠습니까? 팀원 관계도 모두 삭제됩니다.')) return
    
    const { error } = await supabase.from('teams').delete().eq('id', id)
    if (error) toast.error('삭제 실패')
    else {
      toast.success('팀이 삭제되었습니다.')
      if (selectedTeamId === id) {
        setSelectedTeamId(null)
        setSelectedProfileId('')
      }
      await Promise.all([fetchTeams(), fetchTeamMembers()])
    }
  }

  const handleAddMember = async () => {
    if (!selectedTeamId || !selectedProfileId) {
      toast.warning('추가할 팀원을 선택해 주세요.')
      return
    }

    setMemberLoading(true)
    const { error } = await supabase
      .from('team_members')
      .insert({ team_id: selectedTeamId, profile_id: selectedProfileId })

    if (error) {
      toast.error('팀원 추가 실패: ' + error.message)
    } else {
      toast.success('팀원이 추가되었습니다.')
      setSelectedProfileId('')
      await fetchTeamMembers()
    }
    setMemberLoading(false)
  }

  const handleRemoveMember = async (teamId: string, profileId: string) => {
    setMemberLoading(true)
    const { error } = await supabase
      .from('team_members')
      .delete()
      .eq('team_id', teamId)
      .eq('profile_id', profileId)

    if (error) {
      toast.error('팀원 제거 실패: ' + error.message)
    } else {
      toast.success('팀원에서 제외했습니다.')
      await fetchTeamMembers()
    }
    setMemberLoading(false)
  }

  const selectedTeam = teams.find((team) => team.id === selectedTeamId) || null
  const selectedTeamMembers = selectedTeam ? (teamMembersByTeam[selectedTeam.id] || []) : []
  const selectedMemberIds = new Set(selectedTeamMembers.map((member) => member.id))
  const availableProfiles = profiles.filter((profile) => !selectedMemberIds.has(profile.id))

  return (
    <div className="space-y-6">
      <header className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">팀 관리</h1>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void handleCreateTeam()
          }}
          className="flex gap-2"
        >
          <Input 
            placeholder="새 팀 이름 (예: 음향팀)" 
            value={newTeamName}
            onChange={(e) => setNewTeamName(e.target.value)}
            className="w-64"
            required
          />
          <Button type="button" disabled={loading} onClick={() => void handleCreateTeam()}>
            <Plus className="w-4 h-4 mr-1" /> 생성
          </Button>
        </form>
      </header>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {teams.map((team) => (
          <Card key={team.id} className="hover:border-blue-200 transition-colors">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg font-bold">{team.name}</CardTitle>
              <Button variant="ghost" size="icon" onClick={() => handleDeleteTeam(team.id)}>
                <Trash2 className="w-4 h-4 text-slate-400 hover:text-red-500" />
              </Button>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-slate-500 mb-4">{team.description || '팀 설명이 없습니다.'}</p>
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-slate-600">
                  {(teamMembersByTeam[team.id] || []).length} 명의 팀원
                </span>
                <Button
                  variant={selectedTeamId === team.id ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    setSelectedTeamId(team.id)
                    setSelectedProfileId('')
                  }}
                >
                  <UserPlus className="w-3 h-3 mr-1" /> 관리
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {teams.length === 0 && (
          <div className="col-span-full py-20 text-center text-slate-400 border-2 border-dashed rounded-xl">
            생성된 팀이 없습니다. 상단에서 새로운 팀을 추가해 보세요!
          </div>
        )}
      </div>

      {selectedTeam && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{selectedTeam.name} 팀원 관리</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Select value={selectedProfileId} onValueChange={setSelectedProfileId}>
                <SelectTrigger className="w-72">
                  <SelectValue placeholder="추가할 팀원 선택" />
                </SelectTrigger>
                <SelectContent>
                  {availableProfiles.length === 0 ? (
                    <SelectItem value="__empty" disabled>
                      추가 가능한 팀원이 없습니다
                    </SelectItem>
                  ) : (
                    availableProfiles.map((profile) => (
                      <SelectItem key={profile.id} value={profile.id}>
                        {profile.full_name} ({profile.role})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <Button type="button" disabled={memberLoading || !selectedProfileId} onClick={() => void handleAddMember()}>
                팀원 추가
              </Button>
            </div>

            <div className="space-y-2">
              {selectedTeamMembers.length === 0 ? (
                <p className="text-sm text-slate-500">아직 등록된 팀원이 없습니다.</p>
              ) : (
                selectedTeamMembers.map((member) => (
                  <div key={member.id} className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <p className="text-sm font-medium">{member.full_name}</p>
                      <p className="text-xs text-slate-500">{member.role}</p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={memberLoading}
                      onClick={() => void handleRemoveMember(selectedTeam.id, member.id)}
                    >
                      제거
                    </Button>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
