'use client'

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { getAdminScope } from '@/lib/admin-scope'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

interface NoticeRow {
  id: string
  title: string
  content: string
  created_by: string
  created_at: string
}

interface NoticeDisplay {
  id: string
  title: string
  content: string
  created_by: string
  created_by_name: string
  created_at: string
}

interface ProfileRef {
  id: string
  full_name: string
}

export default function NoticesAdminPage() {
  const supabase = useMemo(() => createClient(), [])
  const [loading, setLoading] = useState(true)
  const [accessDenied, setAccessDenied] = useState(false)
  const [canCreateNotice, setCanCreateNotice] = useState(false)
  const [tableMissing, setTableMissing] = useState(false)
  const [notices, setNotices] = useState<NoticeDisplay[]>([])
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const fetchNotices = useCallback(async () => {
    setLoading(true)
    setAccessDenied(false)
    setTableMissing(false)

    const scope = await getAdminScope(supabase)
    if (!scope.isAdmin) {
      setAccessDenied(true)
      setCanCreateNotice(false)
      setLoading(false)
      return
    }

    const canCreate = scope.role === 'system_admin' || scope.role === 'division_leader'
    setCanCreateNotice(canCreate)

    const noticesRes = await supabase
      .from('team_notices')
      .select('id, title, content, created_by, created_at')
      .order('created_at', { ascending: false })
      .limit(50)

    if (noticesRes.error) {
      if (noticesRes.error.code === '42P01') {
        setTableMissing(true)
      } else {
        toast.error('공지사항을 불러오지 못했습니다.')
      }
      setNotices([])
      setLoading(false)
      return
    }

    const rows = (noticesRes.data || []) as NoticeRow[]
    const userIds = Array.from(new Set(rows.map((row) => row.created_by)))

    const profileNameById = new Map<string, string>()
    if (userIds.length > 0) {
      const profilesRes = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', userIds)

      if (!profilesRes.error) {
        for (const p of (profilesRes.data || []) as ProfileRef[]) {
          profileNameById.set(p.id, p.full_name)
        }
      }
    }

    setNotices(
      rows.map((row) => ({
        ...row,
        created_by_name: profileNameById.get(row.created_by) || '관리자',
      }))
    )
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchNotices()
  }, [fetchNotices])

  const handleCreateNotice = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canCreateNotice) {
      toast.error('시스템 관리자 또는 부문장만 공지 등록이 가능합니다.')
      return
    }

    const nextTitle = title.trim()
    const nextContent = content.trim()
    if (!nextTitle || !nextContent) {
      toast.warning('제목과 내용을 모두 입력해 주세요.')
      return
    }

    setSaving(true)
    const { error } = await supabase.from('team_notices').insert({
      title: nextTitle,
      content: nextContent,
    })

    if (error) {
      if (error.code === '42P01') {
        setTableMissing(true)
        toast.error('team_notices 테이블이 없어 등록할 수 없습니다.')
      } else {
        toast.error('공지사항 등록에 실패했습니다.')
      }
      setSaving(false)
      return
    }

    toast.success('공지사항이 등록되었습니다.')
    setTitle('')
    setContent('')
    setSaving(false)
    void fetchNotices()
  }

  const handleDeleteNotice = async (noticeId: string) => {
    if (!canCreateNotice) {
      toast.error('시스템 관리자 또는 부문장만 공지 삭제가 가능합니다.')
      return
    }

    setDeletingId(noticeId)
    const { error } = await supabase.from('team_notices').delete().eq('id', noticeId)

    if (error) {
      toast.error('공지사항 삭제에 실패했습니다.')
      setDeletingId(null)
      return
    }

    toast.success('공지사항이 삭제되었습니다.')
    setDeletingId(null)
    void fetchNotices()
  }

  if (loading) {
    return <div className="p-20 text-center text-slate-500">공지사항을 불러오는 중...</div>
  }

  if (accessDenied) {
    return <div className="p-20 text-center text-slate-500">관리자만 접근할 수 있습니다.</div>
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">팀 공지사항</h1>
        <p className="text-sm text-slate-500">
          {canCreateNotice
            ? '팀원에게 전달할 공지를 등록하고 관리하세요.'
            : '공지사항 조회만 가능합니다. 등록 권한은 시스템 관리자/부문장에게 있습니다.'}
        </p>
      </header>

      {tableMissing && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-5 text-sm text-amber-800">
            `team_notices` 테이블이 아직 없습니다. Supabase 마이그레이션을 먼저 적용해 주세요.
          </CardContent>
        </Card>
      )}

      {canCreateNotice && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">공지 등록</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateNotice} className="space-y-3">
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="공지 제목"
                maxLength={80}
                required
              />
              <textarea
                value={content}
                onChange={(event) => setContent(event.target.value)}
                placeholder="공지 내용을 입력하세요."
                className="min-h-32 w-full rounded-md border border-slate-200 bg-white p-3 text-sm leading-6 outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
                required
              />
              <div className="flex justify-end">
                <Button type="submit" disabled={saving || tableMissing}>
                  {saving ? '등록 중...' : '공지 등록'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">공지 목록</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {notices.length === 0 ? (
            <p className="rounded-lg border border-dashed p-8 text-center text-sm text-slate-500">
              등록된 공지사항이 없습니다.
            </p>
          ) : (
            notices.map((notice) => (
              <article key={notice.id} className="rounded-lg border bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-semibold">{notice.title}</h3>
                    <p className="mt-1 text-xs text-slate-500">
                      {notice.created_by_name} · {format(parseISO(notice.created_at), 'yyyy.MM.dd HH:mm', { locale: ko })}
                    </p>
                  </div>
                  {canCreateNotice && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => void handleDeleteNotice(notice.id)}
                      disabled={deletingId === notice.id}
                      className="text-red-600 hover:bg-red-50 hover:text-red-600"
                    >
                      {deletingId === notice.id ? '삭제 중...' : '삭제'}
                    </Button>
                  )}
                </div>
                <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-slate-700">
                  {notice.content}
                </p>
              </article>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
