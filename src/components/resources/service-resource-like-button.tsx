'use client'

import { useMemo, useState } from 'react'
import { Heart } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'

interface ServiceResourceLikeButtonProps {
  serviceId: string
  initialLiked: boolean
  initialCount: number
  className?: string
}

export function ServiceResourceLikeButton({
  serviceId,
  initialLiked,
  initialCount,
  className = '',
}: ServiceResourceLikeButtonProps) {
  const supabase = useMemo(() => createClient(), [])
  const [liked, setLiked] = useState(initialLiked)
  const [count, setCount] = useState(initialCount)
  const [saving, setSaving] = useState(false)

  const handleToggleLike = async () => {
    if (saving) return
    setSaving(true)

    if (liked) {
      const { error } = await supabase
        .from('service_resource_likes')
        .delete()
        .eq('service_id', serviceId)

      if (error) {
        if (error.code === '42P01') {
          toast.error('좋아요 기능이 아직 활성화되지 않았습니다. 마이그레이션 적용이 필요합니다.')
        } else {
          toast.error('좋아요 취소에 실패했습니다.')
        }
        setSaving(false)
        return
      }

      setLiked(false)
      setCount((prev) => Math.max(0, prev - 1))
      setSaving(false)
      return
    }

    const { error } = await supabase
      .from('service_resource_likes')
      .insert({ service_id: serviceId })

    if (error) {
      if (error.code === '42P01') {
        toast.error('좋아요 기능이 아직 활성화되지 않았습니다. 마이그레이션 적용이 필요합니다.')
      } else if (error.code === '23505') {
        setLiked(true)
      } else {
        toast.error('좋아요 등록에 실패했습니다.')
      }
      setSaving(false)
      return
    }

    setLiked(true)
    setCount((prev) => prev + 1)
    setSaving(false)
  }

  return (
    <Button
      type="button"
      variant={liked ? 'secondary' : 'outline'}
      size="sm"
      disabled={saving}
      onClick={() => void handleToggleLike()}
      className={`gap-1.5 ${className}`}
    >
      <Heart className={`h-4 w-4 ${liked ? 'fill-current text-rose-500' : 'text-slate-500'}`} />
      <span>{liked ? '좋아요 취소' : '좋아요'}</span>
      <span className="text-xs text-slate-500">{count}</span>
    </Button>
  )
}
