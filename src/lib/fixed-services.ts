export interface SeoulDateParts {
  year: number
  month: number
  day: number
}

export interface EnsureFixedServicesResult {
  targetYear: number
  targetMonth: number
  sundayDates: string[]
  existingDates: string[]
  insertedDates: string[]
}

const FIXED_SERVICE_TITLE = '5부 예배'

const pad2 = (value: number) => String(value).padStart(2, '0')

export function getSeoulDateParts(date: Date = new Date()): SeoulDateParts {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })

  const parts = formatter.formatToParts(date)
  const year = Number(parts.find((part) => part.type === 'year')?.value || 0)
  const month = Number(parts.find((part) => part.type === 'month')?.value || 0)
  const day = Number(parts.find((part) => part.type === 'day')?.value || 0)
  return { year, month, day }
}

export function getDaysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function isLastWeekOfMonthInSeoul(date: Date = new Date()) {
  const { year, month, day } = getSeoulDateParts(date)
  const daysInMonth = getDaysInMonth(year, month)
  const lastWeekStart = daysInMonth - 6
  return day >= lastWeekStart
}

export function getNextMonth(year: number, month: number) {
  if (month === 12) {
    return { year: year + 1, month: 1 }
  }
  return { year, month: month + 1 }
}

export function getSundayDatesOfMonth(year: number, month: number) {
  const dates: string[] = []
  const daysInMonth = getDaysInMonth(year, month)
  const monthIndex = month - 1

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(Date.UTC(year, monthIndex, day))
    if (date.getUTCDay() === 0) {
      dates.push(`${year}-${pad2(month)}-${pad2(day)}`)
    }
  }

  return dates
}

interface ExistingServiceRow {
  date: string
}

interface ServicesTableQuery {
  select: (columns: string) => {
    gte: (column: string, value: string) => {
      lte: (column: string, value: string) => {
        eq: (
          column: string,
          value: string
        ) => Promise<{ data: ExistingServiceRow[] | null; error: { message: string } | null }>
      }
    }
  }
  insert: (values: { date: string; title: string; status: string }[]) => Promise<{ error: { message: string } | null }>
}

export interface ServiceAdminClient {
  from: (table: 'services') => ServicesTableQuery
}

export async function ensureFixedSundayServicesForMonth(
  supabase: ServiceAdminClient,
  year: number,
  month: number
): Promise<EnsureFixedServicesResult> {
  const sundayDates = getSundayDatesOfMonth(year, month)
  const monthStart = `${year}-${pad2(month)}-01`
  const monthEnd = `${year}-${pad2(month)}-${pad2(getDaysInMonth(year, month))}`

  const { data: existingRows, error: existingError } = await supabase
    .from('services')
    .select('date')
    .gte('date', monthStart)
    .lte('date', monthEnd)
    .eq('title', FIXED_SERVICE_TITLE)

  if (existingError) {
    throw new Error(existingError.message)
  }

  const existingDates = new Set((existingRows || []).map((row: ExistingServiceRow) => row.date))
  const missingDates = sundayDates.filter((date) => !existingDates.has(date))

  if (missingDates.length > 0) {
    const { error: insertError } = await supabase.from('services').insert(
      missingDates.map((date) => ({
        date,
        title: FIXED_SERVICE_TITLE,
        status: 'published',
      }))
    )

    if (insertError) {
      throw new Error(insertError.message)
    }
  }

  return {
    targetYear: year,
    targetMonth: month,
    sundayDates,
    existingDates: sundayDates.filter((date) => existingDates.has(date)),
    insertedDates: missingDates,
  }
}
