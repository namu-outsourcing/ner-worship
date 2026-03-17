import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  ensureFixedSundayServicesForMonth,
  getNextMonth,
  getSeoulDateParts,
  isLastWeekOfMonthInSeoul,
  type ServiceAdminClient,
} from '@/lib/fixed-services'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 })
  }

  const force = request.nextUrl.searchParams.get('force') === '1'
  if (!force && !isLastWeekOfMonthInSeoul()) {
    const today = getSeoulDateParts()
    return NextResponse.json({
      ok: true,
      skipped: true,
      message: 'Not in last week of month (Asia/Seoul).',
      today,
    })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      {
        ok: false,
        message: 'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.',
      },
      { status: 500 }
    )
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  try {
    const today = getSeoulDateParts()
    const target = getNextMonth(today.year, today.month)
    const result = await ensureFixedSundayServicesForMonth(
      supabase as unknown as ServiceAdminClient,
      target.year,
      target.month
    )

    return NextResponse.json({
      ok: true,
      skipped: false,
      force,
      today,
      ...result,
    })
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
