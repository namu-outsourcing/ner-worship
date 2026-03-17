import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { LayoutDashboard, Users, Users2, Calendar, Megaphone } from 'lucide-react'
import logoImage from '@/assets/ner.jpeg'
import { LogoutButton } from '@/components/auth/logout-button'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const isAdmin = ['system_admin', 'division_leader', 'team_leader', 'secretary', 'service_admin'].includes(profile?.role || '')
  const canAccessMembers = ['system_admin', 'division_leader', 'team_leader', 'service_admin'].includes(profile?.role || '')
  const canAccessTeams = ['system_admin', 'division_leader', 'team_leader', 'secretary', 'service_admin'].includes(profile?.role || '')

  if (!isAdmin) redirect('/')

  const navItems = [
    { href: '/admin', label: '대시보드', icon: LayoutDashboard },
    ...(canAccessTeams ? [{ href: '/admin/teams', label: '팀 관리', icon: Users2 }] : []),
    ...(canAccessMembers ? [{ href: '/admin/members', label: '팀원 관리', icon: Users }] : []),
    { href: '/admin/notices', label: '공지사항', icon: Megaphone },
    { href: '/admin/services', label: '예배 스케줄 관리', icon: Calendar },
  ]

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="hidden w-64 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="h-9 w-24 overflow-hidden rounded-lg border border-slate-200 bg-white p-1">
              <Image src={logoImage} alt="NER Worship 로고" className="h-full w-full object-contain" />
            </div>
            <h2 className="text-xl font-bold">Admin Panel</h2>
          </div>
        </div>
        <nav className="flex-1 p-4 space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 rounded-lg p-3 text-sm font-medium transition-colors hover:bg-slate-100"
              >
                <Icon className="w-4 h-4" /> {item.label}
              </Link>
            )
          })}
        </nav>
        <div className="border-t border-slate-200 p-4">
          <div className="flex items-center justify-between gap-2">
            <Link href="/" className="text-sm text-blue-600 hover:underline">
              메인으로 돌아가기
            </Link>
            <LogoutButton variant="ghost" className="text-xs" />
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur lg:hidden">
          <div className="px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="h-8 w-20 overflow-hidden rounded-lg border border-slate-200 bg-white p-1">
                  <Image src={logoImage} alt="NER Worship 로고" className="h-full w-full object-contain" />
                </div>
                <h2 className="text-lg font-bold">Admin Panel</h2>
              </div>
              <Link href="/" className="text-xs font-medium text-blue-600 hover:underline">
                메인으로
              </Link>
            </div>
            <div className="mt-2 flex justify-end">
              <LogoutButton variant="ghost" className="text-xs" />
            </div>
            <nav className="-mx-1 mt-3 flex gap-2 overflow-x-auto pb-1">
              {navItems.map((item) => {
                const Icon = item.icon
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700"
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {item.label}
                  </Link>
                )
              })}
            </nav>
          </div>
        </header>

        <main className="min-w-0 flex-1 overflow-auto p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  )
}
