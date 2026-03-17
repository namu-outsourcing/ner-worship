'use client'

import { useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export interface AvailabilityVoteService {
  id: string
  title: string
  date: string
}

export interface AvailabilityVoteTeam {
  id: string
  name: string
}

export interface AvailabilityVoteRecord {
  id: string
  service_id: string
  team_id: string
  profile_id: string
  availability: 'available' | 'maybe' | 'unavailable'
  note: string
}

interface VoteDraft {
  id: string | null
  availability: '' | 'available' | 'unavailable'
}

interface MonthlyAvailabilityVoteCardProps {
  profileId: string
  monthLabel: string
  teams: AvailabilityVoteTeam[]
  services: AvailabilityVoteService[]
  initialVotes: AvailabilityVoteRecord[]
}

const keyOf = (teamId: string, serviceId: string) => `${teamId}__${serviceId}`

export function MonthlyAvailabilityVoteCard({
  profileId,
  monthLabel,
  teams,
  services,
  initialVotes,
}: MonthlyAvailabilityVoteCardProps) {
  const supabase = useMemo(() => createClient(), [])
  const [savingAll, setSavingAll] = useState(false)
  const [drafts, setDrafts] = useState<Record<string, VoteDraft>>(() => {
    const seeded: Record<string, VoteDraft> = {}
    for (const vote of initialVotes) {
      seeded[keyOf(vote.team_id, vote.service_id)] = {
        id: vote.id,
        availability: vote.availability === 'unavailable' ? 'unavailable' : 'available',
      }
    }
    return seeded
  })

  const totalSlots = teams.length * services.length
  const respondedSlots = Object.values(drafts).filter((item) => item.availability !== '').length

  const getDraft = (teamId: string, serviceId: string): VoteDraft => {
    return drafts[keyOf(teamId, serviceId)] || { id: null, availability: '' }
  }

  const updateDraft = (teamId: string, serviceId: string, availability: VoteDraft['availability']) => {
    const voteKey = keyOf(teamId, serviceId)
    setDrafts((prev) => {
      const current = prev[voteKey] || { id: null, availability: '' }
      return {
        ...prev,
        [voteKey]: { ...current, availability },
      }
    })
  }

  const handleSaveAll = async () => {
    const payload = teams.flatMap((team) =>
      services
        .map((service) => {
          const draft = getDraft(team.id, service.id)
          if (!draft.availability) return null
          return {
            service_id: service.id,
            team_id: team.id,
            profile_id: profileId,
            availability: draft.availability,
            note: '',
          }
        })
        .filter((item): item is { service_id: string; team_id: string; profile_id: string; availability: 'available' | 'unavailable'; note: string } => item !== null)
    )

    if (payload.length === 0) {
      toast.warning('가능/불가능을 먼저 선택해 주세요.')
      return
    }

    setSavingAll(true)
    const { data, error } = await supabase
      .from('availability_votes')
      .upsert(payload, { onConflict: 'service_id,team_id,profile_id' })
      .select('id, service_id, team_id, profile_id, availability, note')

    if (error) {
      if (error.code === '42P01') {
        toast.error('투표 기능이 아직 활성화되지 않았습니다. 마이그레이션 적용이 필요합니다.')
      } else {
        toast.error('투표 저장 실패: ' + error.message)
      }
      setSavingAll(false)
      return
    }

    if (data && Array.isArray(data)) {
      setDrafts((prev) => {
        const next = { ...prev }
        for (const row of data as AvailabilityVoteRecord[]) {
          next[keyOf(row.team_id, row.service_id)] = {
            id: row.id,
            availability: row.availability === 'unavailable' ? 'unavailable' : 'available',
          }
        }
        return next
      })
    }

    toast.success(`투표가 저장되었습니다. (${payload.length}건)`)
    setSavingAll(false)
  }

  if (teams.length === 0) {
    return (
      <Card>
        <CardHeader className="border-b pb-3">
          <CardTitle className="text-lg">다음 달 가능 일정 투표</CardTitle>
        </CardHeader>
        <CardContent className="pt-4 text-sm text-slate-500">
          소속 팀이 없어 투표할 수 없습니다.
        </CardContent>
      </Card>
    )
  }

  if (services.length === 0) {
    return (
      <Card>
        <CardHeader className="border-b pb-3">
          <CardTitle className="text-lg">다음 달 가능 일정 투표</CardTitle>
        </CardHeader>
        <CardContent className="pt-4 text-sm text-slate-500">
          {monthLabel} 예배 일정이 아직 등록되지 않았습니다.
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-emerald-200">
      <CardHeader className="border-b pb-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle className="text-lg">다음 달 가능 일정 투표</CardTitle>
            <p className="text-xs text-slate-500">
              {monthLabel} 응답 {respondedSlots}/{totalSlots}
            </p>
          </div>
          <Button
            type="button"
            onClick={() => void handleSaveAll()}
            disabled={savingAll}
            className="w-full sm:w-auto"
          >
            {savingAll ? '저장 중...' : '전체 저장'}
          </Button>
        </div>
        <p className="text-xs text-slate-500">
          소속 팀별 일정에 대해 가능/불가능을 선택한 뒤 한 번에 저장해 주세요.
        </p>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        {teams.map((team) => (
          <div key={team.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <h4 className="mb-3 text-sm font-semibold">{team.name}</h4>
            <div className="space-y-2">
              {services.map((service) => {
                const voteKey = keyOf(team.id, service.id)
                const draft = getDraft(team.id, service.id)
                return (
                  <div key={voteKey} className="rounded-md border bg-white p-3">
                    <div className="mb-2">
                      <p className="text-xs text-slate-500">
                        {format(parseISO(service.date), 'M월 d일 (EEE)', { locale: ko })}
                      </p>
                      <p className="text-sm font-semibold">{service.title}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className={
                          draft.availability === 'available'
                            ? 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                            : ''
                        }
                        onClick={() => updateDraft(team.id, service.id, 'available')}
                      >
                        가능
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className={
                          draft.availability === 'unavailable'
                            ? 'border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100'
                            : ''
                        }
                        onClick={() => updateDraft(team.id, service.id, 'unavailable')}
                      >
                        불가능
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
