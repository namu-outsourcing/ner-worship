'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { User, ShieldCheck } from 'lucide-react'

interface Profile {
  id: string
  full_name: string
  role: string
  created_at: string
}

export default function MembersAdminPage() {
  const [members, setMembers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    fetchMembers()
  }, [])

  const fetchMembers = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('full_name')
    if (error) toast.error('팀원 목록을 불러오지 못했습니다.')
    else setMembers(data || [])
    setLoading(false)
  }

  const handleUpdateRole = async (userId: string, newRole: string) => {
    const { error } = await supabase
      .from('profiles')
      .update({ role: newRole })
      .eq('id', userId)

    if (error) toast.error('권한 변경 실패')
    else {
      toast.success('권한이 변경되었습니다.')
      fetchMembers()
    }
  }

  if (loading) return <div className="p-20 text-center">로딩 중...</div>

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">팀원 권한 관리</h1>
        <p className="text-slate-500">가입된 팀원들의 직책과 권한을 설정합니다.</p>
      </header>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b">
                <tr>
                  <th className="px-6 py-4">이름</th>
                  <th className="px-6 py-4">가입일</th>
                  <th className="px-6 py-4">현재 권한</th>
                  <th className="px-6 py-4">권한 변경</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {members.map((member) => (
                  <tr key={member.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 font-medium flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                        <User className="w-4 h-4" />
                      </div>
                      {member.full_name}
                    </td>
                    <td className="px-6 py-4 text-slate-500">
                      {new Date(member.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${
                        member.role === 'division_leader' ? 'bg-purple-100 text-purple-700' :
                        member.role === 'team_leader' ? 'bg-blue-100 text-blue-700' :
                        member.role === 'secretary' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {member.role}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <Select 
                        defaultValue={member.role} 
                        onValueChange={(val) => handleUpdateRole(member.id, val)}
                      >
                        <SelectTrigger className="w-32 h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="division_leader">부문장</SelectItem>
                          <SelectItem value="team_leader">팀장</SelectItem>
                          <SelectItem value="secretary">총무</SelectItem>
                          <SelectItem value="member">팀원</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
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
