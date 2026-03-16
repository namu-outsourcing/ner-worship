const YOUTUBE_ID_REGEX = /^[A-Za-z0-9_-]{11}$/

function normalizeHost(host: string) {
  return host.toLowerCase().replace(/^www\./, '')
}

export function extractYouTubeVideoId(input: string): string | null {
  const raw = input.trim()
  if (!raw) return null

  if (YOUTUBE_ID_REGEX.test(raw)) {
    return raw
  }

  try {
    const url = new URL(raw)
    const host = normalizeHost(url.hostname)
    const path = url.pathname.replace(/\/+$/, '')

    if (host === 'youtu.be') {
      const candidate = path.split('/').filter(Boolean)[0] || ''
      return YOUTUBE_ID_REGEX.test(candidate) ? candidate : null
    }

    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      if (path === '/watch') {
        const candidate = url.searchParams.get('v') || ''
        return YOUTUBE_ID_REGEX.test(candidate) ? candidate : null
      }

      const segments = path.split('/').filter(Boolean)
      if (segments.length >= 2 && ['shorts', 'embed', 'live'].includes(segments[0])) {
        const candidate = segments[1]
        return YOUTUBE_ID_REGEX.test(candidate) ? candidate : null
      }
    }
  } catch {
    return null
  }

  return null
}

export function normalizeYouTubeWatchUrl(input: string): string | null {
  const id = extractYouTubeVideoId(input)
  return id ? `https://www.youtube.com/watch?v=${id}` : null
}

export function extractYouTubeVideoIds(inputs: string[]): string[] {
  const ids: string[] = []
  for (const input of inputs) {
    const id = extractYouTubeVideoId(input)
    if (!id || ids.includes(id)) continue
    ids.push(id)
  }
  return ids
}

export function buildYoutubeQueueUrl(ids: string[]): string | null {
  if (ids.length === 0) return null
  return `https://www.youtube.com/watch_videos?video_ids=${ids.join(',')}`
}

export function buildYoutubeEmbedPlaylistUrl(ids: string[]): string | null {
  if (ids.length === 0) return null
  const [first, ...rest] = ids
  if (rest.length === 0) return `https://www.youtube.com/embed/${first}`
  return `https://www.youtube.com/embed/${first}?playlist=${rest.join(',')}`
}
