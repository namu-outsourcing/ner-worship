export interface AdminScope {
  userId: string | null
  role: string | null
  isAdmin: boolean
  isDivisionLeader: boolean
  managedTeamIds: string[]
}

interface TeamMembershipRow {
  team_id: string
}

const ADMIN_ROLES = new Set(['division_leader', 'team_leader', 'secretary'])

interface AuthClient {
  auth: {
    getUser: () => Promise<{ data: { user: { id?: string | null } | null } }>
  }
  from: (table: string) => unknown
}

export async function getAdminScope(supabase: AuthClient): Promise<AdminScope> {
  const { data: authData } = await supabase.auth.getUser()
  const userId = authData.user?.id || null

  if (!userId) {
    return {
      userId: null,
      role: null,
      isAdmin: false,
      isDivisionLeader: false,
      managedTeamIds: [],
    }
  }

  const profilesQuery = supabase.from('profiles') as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<{ data: { role?: string } | null }>
      }
    }
  }
  const { data: profileData } = await profilesQuery.select('role').eq('id', userId).maybeSingle()
  const role = (profileData?.role as string | undefined) || null
  const isAdmin = ADMIN_ROLES.has(role || '')
  const isDivisionLeader = role === 'division_leader'

  if (!isAdmin) {
    return {
      userId,
      role,
      isAdmin: false,
      isDivisionLeader: false,
      managedTeamIds: [],
    }
  }

  if (isDivisionLeader) {
    return {
      userId,
      role,
      isAdmin: true,
      isDivisionLeader: true,
      managedTeamIds: [],
    }
  }

  const teamMembersQuery = supabase.from('team_members') as {
    select: (columns: string) => {
      eq: (column: string, value: string) => Promise<{ data: TeamMembershipRow[] | null }>
    }
  }
  const { data: membershipsData } = await teamMembersQuery.select('team_id').eq('profile_id', userId)

  const managedTeamIds = Array.from(
    new Set(((membershipsData || []) as TeamMembershipRow[]).map((item) => item.team_id))
  )

  return {
    userId,
    role,
    isAdmin: true,
    isDivisionLeader: false,
    managedTeamIds,
  }
}
