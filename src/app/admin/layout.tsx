import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { LayoutDashboard, Users, Users2, Calendar } from 'lucide-react'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const isAdmin = ['division_leader', 'team_leader', 'secretary'].includes(profile?.role || '')
  const canAccessMembers = ['division_leader', 'team_leader'].includes(profile?.role || '')

  if (!isAdmin) redirect('/')

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-200 hidden md:flex flex-col">
        <div className="p-6 border-b border-slate-200">
          <h2 className="text-xl font-bold">Admin Panel</h2>
        </div>
        <nav className="flex-1 p-4 space-y-2">
          <Link href="/admin" className="flex items-center gap-3 p-3 text-sm font-medium rounded-lg hover:bg-slate-100 transition-colors">
            <LayoutDashboard className="w-4 h-4" /> 대시보드
          </Link>
          <Link href="/admin/teams" className="flex items-center gap-3 p-3 text-sm font-medium rounded-lg hover:bg-slate-100 transition-colors">
            <Users2 className="w-4 h-4" /> 팀 관리
          </Link>
          {canAccessMembers && (
            <Link href="/admin/members" className="flex items-center gap-3 p-3 text-sm font-medium rounded-lg hover:bg-slate-100 transition-colors">
              <Users className="w-4 h-4" /> 팀원 관리
            </Link>
          )}
          <Link href="/admin/services" className="flex items-center gap-3 p-3 text-sm font-medium rounded-lg hover:bg-slate-100 transition-colors">
            <Calendar className="w-4 h-4" /> 예배 스케줄 관리
          </Link>
        </nav>
        <div className="p-4 border-t border-slate-200">
          <Link href="/" className="text-sm text-blue-600 hover:underline">메인으로 돌아가기</Link>
        </div>
      </aside>

      <main className="flex-1 p-8 overflow-auto">
        {children}
      </main>
    </div>
  )
}
