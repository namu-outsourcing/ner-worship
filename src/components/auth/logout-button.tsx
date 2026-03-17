'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

interface LogoutButtonProps {
  className?: string
  variant?: 'default' | 'outline' | 'ghost'
}

export function LogoutButton({
  className,
  variant = 'outline',
}: LogoutButtonProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const handleLogout = async () => {
    if (loading) return

    setLoading(true)
    const supabase = createClient()

    try {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
      toast.success('로그아웃되었습니다.')
      router.push('/login')
      router.refresh()
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : '로그아웃 중 오류가 발생했습니다.'
      toast.error(message)
      setLoading(false)
    }
  }

  return (
    <Button
      variant={variant}
      className={className}
      onClick={handleLogout}
      disabled={loading}
    >
      <LogOut className="w-4 h-4 mr-2" />
      {loading ? '로그아웃 중...' : '로그아웃'}
    </Button>
  )
}
