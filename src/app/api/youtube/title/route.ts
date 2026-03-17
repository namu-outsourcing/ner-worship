import { NextResponse } from 'next/server'
import { extractYouTubeVideoId } from '@/lib/youtube'

const toWatchUrl = (videoId: string) => `https://www.youtube.com/watch?v=${videoId}`

async function fetchYoutubeTitle(videoId: string): Promise<string> {
  const watchUrl = toWatchUrl(videoId)
  const youtubeOembed = `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`
  const noembed = `https://noembed.com/embed?url=${encodeURIComponent(watchUrl)}`

  for (const endpoint of [youtubeOembed, noembed]) {
    try {
      const res = await fetch(endpoint, { cache: 'no-store' })
      if (!res.ok) continue
      const data = (await res.json()) as { title?: unknown }
      if (typeof data.title === 'string' && data.title.trim()) {
        return data.title.trim()
      }
    } catch {
      continue
    }
  }

  return ''
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { urls?: unknown }
    const urls = Array.isArray(body.urls)
      ? body.urls.filter((item): item is string => typeof item === 'string')
      : []

    const ids = urls.map((url) => extractYouTubeVideoId(url))
    const uniqueIds = Array.from(new Set(ids.filter((id): id is string => Boolean(id))))
    const titleById = new Map<string, string>()

    await Promise.all(
      uniqueIds.map(async (id) => {
        const title = await fetchYoutubeTitle(id)
        titleById.set(id, title)
      })
    )

    const titles = ids.map((id) => (id ? titleById.get(id) || '' : ''))
    return NextResponse.json({ titles })
  } catch {
    return NextResponse.json({ titles: [] }, { status: 200 })
  }
}

