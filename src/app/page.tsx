import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Image from "next/image";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { addMonths, format as formatDate, startOfMonth } from "date-fns";
import { CalendarDays, Users, Settings, UserCheck } from "lucide-react";
import { buildYoutubeQueueUrl, extractYouTubeVideoIds } from "@/lib/youtube";
import {
  MonthlyAvailabilityVoteCard,
  type AvailabilityVoteRecord,
  type AvailabilityVoteService,
  type AvailabilityVoteTeam,
} from "@/components/availability/monthly-vote-card";
import logoImage from "@/assets/ner.jpeg";
import { LogoutButton } from "@/components/auth/logout-button";
import { ServiceResourceLikeButton } from "@/components/resources/service-resource-like-button";

interface ServiceRef {
  id: string;
  title: string;
  date: string;
  status: string;
}

interface TeamRef {
  id: string;
  name: string;
}

interface AssignmentRow {
  id: string;
  role_name: string;
  services: ServiceRef | ServiceRef[] | null;
  teams: TeamRef | TeamRef[] | null;
}

interface AssignmentDisplay {
  id: string;
  role_name: string;
  service: ServiceRef;
  team: TeamRef;
  resource: ServiceResource | null;
  likeCount: number;
  likedByMe: boolean;
}

interface TeamMembershipRow {
  teams: TeamRef | TeamRef[] | null;
}

interface ServiceResource {
  service_id: string;
  setlist_urls: string[] | null;
  meditation: string | null;
}

interface ServiceResourceLike {
  service_id: string;
  profile_id: string;
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // 1. 프로필 정보 가져오기
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  // 2. 내 배정 일정 가져오기
  const { data: myAssignmentsRaw } = await supabase
    .from("assignments")
    .select(
      `
      id,
      role_name,
      services (id, title, date, status),
      teams (id, name)
    `,
    )
    .eq("profile_id", user.id)
    .eq("services.status", "published") // 공개된 스케줄만
    .order("services(date)", { ascending: true });

  // 3. 내 소속 팀 정보 가져오기
  const { data: myTeamsRaw } = await supabase
    .from("team_members")
    .select("teams(id, name)")
    .eq("profile_id", user.id);

  const myAssignmentsBase = ((myAssignmentsRaw || []) as AssignmentRow[])
    .map((row) => {
      const service = Array.isArray(row.services)
        ? row.services[0] || null
        : row.services;
      const team = Array.isArray(row.teams) ? row.teams[0] || null : row.teams;

      if (!service || !team) return null;

      return {
        id: row.id,
        role_name: row.role_name,
        service,
        team,
      };
    })
    .filter((row): row is Omit<AssignmentDisplay, "resource"> => row !== null);

  const serviceIds = Array.from(
    new Set(myAssignmentsBase.map((item) => item.service.id)),
  );
  const serviceResourceMap = new Map<string, ServiceResource>();
  const serviceLikeCountMap = new Map<string, number>();
  const likedServiceIds = new Set<string>();

  if (serviceIds.length > 0) {
    const [resourcesRes, likesRes] = await Promise.all([
      supabase
        .from("service_resources")
        .select("service_id, setlist_urls, meditation")
        .in("service_id", serviceIds),
      supabase
        .from("service_resource_likes")
        .select("service_id, profile_id")
        .in("service_id", serviceIds),
    ]);

    for (const row of (resourcesRes.data || []) as ServiceResource[]) {
      serviceResourceMap.set(row.service_id, row);
    }

    if (!likesRes.error) {
      for (const row of (likesRes.data || []) as ServiceResourceLike[]) {
        serviceLikeCountMap.set(
          row.service_id,
          (serviceLikeCountMap.get(row.service_id) || 0) + 1,
        );
        if (row.profile_id === user.id) likedServiceIds.add(row.service_id);
      }
    }
  }

  const myAssignments: AssignmentDisplay[] = myAssignmentsBase.map((item) => ({
    ...item,
    resource: serviceResourceMap.get(item.service.id) || null,
    likeCount: serviceLikeCountMap.get(item.service.id) || 0,
    likedByMe: likedServiceIds.has(item.service.id),
  }));

  const myTeams: TeamRef[] = ((myTeamsRaw || []) as TeamMembershipRow[])
    .map((row) => (Array.isArray(row.teams) ? row.teams[0] || null : row.teams))
    .filter((team): team is TeamRef => team !== null);

  const nextMonthStartDate = startOfMonth(addMonths(new Date(), 1));
  const nextMonthEndDate = startOfMonth(addMonths(nextMonthStartDate, 1));
  const nextMonthStart = formatDate(nextMonthStartDate, "yyyy-MM-dd");
  const nextMonthEnd = formatDate(nextMonthEndDate, "yyyy-MM-dd");

  const { data: nextMonthServicesRaw } = await supabase
    .from("services")
    .select("id, title, date")
    .gte("date", nextMonthStart)
    .lt("date", nextMonthEnd)
    .order("date", { ascending: true });

  const nextMonthServices: AvailabilityVoteService[] = (nextMonthServicesRaw ||
    []) as AvailabilityVoteService[];
  const availabilityTeams: AvailabilityVoteTeam[] = myTeams.map((team) => ({
    id: team.id,
    name: team.name,
  }));

  const nextMonthServiceIds = nextMonthServices.map((service) => service.id);
  const availabilityTeamIds = availabilityTeams.map((team) => team.id);
  let myAvailabilityVotes: AvailabilityVoteRecord[] = [];
  if (nextMonthServiceIds.length > 0 && availabilityTeamIds.length > 0) {
    const { data: votesRaw } = await supabase
      .from("availability_votes")
      .select("id, service_id, team_id, profile_id, availability, note")
      .eq("profile_id", user.id)
      .in("service_id", nextMonthServiceIds)
      .in("team_id", availabilityTeamIds);

    myAvailabilityVotes = (votesRaw || []) as AvailabilityVoteRecord[];
  }

  const myNextSetlistAssignment =
    myAssignments.find((assignment) => {
      const urls = assignment.resource?.setlist_urls || [];
      return (
        extractYouTubeVideoIds(urls).length > 0 ||
        Boolean(assignment.resource?.meditation?.trim())
      );
    }) || null;

  const isAdmin = ["system_admin", "division_leader", "team_leader", "secretary", "service_admin"].includes(
    profile?.role || "",
  );
  const profileRoleLabel = (() => {
    if (profile?.role === "system_admin") return "시스템 관리자";
    if (profile?.role === "division_leader") return "부문장";
    if (profile?.role === "team_leader") return "팀장";
    if (profile?.role === "secretary") return "총무";
    if (profile?.role === "worship_leader") return "인도자";
    if (profile?.role === "service_admin") return "시스템 관리자";
    return "팀원";
  })();

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="md:hidden px-3 py-4">
        <div className="mx-auto max-w-md space-y-4">
          <header className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="h-11 w-28 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-1">
                <Image
                  src={logoImage}
                  alt="NER Worship 로고"
                  className="h-full w-full object-contain"
                />
              </div>
              <div className="min-w-0">
                <h3 className="text-2xl font-bold tracking-tight">dashboard</h3>
                <p className="mt-1 text-slate-500">
                  {profile?.full_name}{" "}
                  <span className="font-semibold text-blue-600">
                    {profileRoleLabel}
                  </span>
                  님, 환영합니다.
                </p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {isAdmin && (
                <Button asChild variant="outline" className="w-full text-xs">
                  <Link href="/admin">
                    <Settings className="mr-1 h-4 w-4" />
                    관리자 패널
                  </Link>
                </Button>
              )}
              <LogoutButton
                className={`${isAdmin ? "w-full text-xs" : "col-span-2 w-full text-xs"}`}
              />
            </div>
          </header>

          <Card className="border-blue-100">
            <CardHeader className="flex flex-row items-center space-x-2 border-b pb-3">
              <CalendarDays className="h-5 w-5 text-blue-500" />
              <CardTitle className="text-lg">내 사역 일정</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-4">
              {myAssignments.length > 0 ? (
                myAssignments.map((a) => (
                  <div
                    key={a.id}
                    className="rounded-lg border border-blue-100 bg-blue-50 p-3"
                  >
                    <p className="mb-1 text-xs font-bold text-blue-600">
                      {a.service.date}
                    </p>
                    <p className="text-sm font-bold">{a.service.title}</p>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-xs text-slate-500">{a.team.name}</span>
                      <span className="rounded bg-white px-2 py-1 text-xs font-bold shadow-sm">
                        {a.role_name}
                      </span>
                    </div>
                    {(() => {
                      const setlistIds = extractYouTubeVideoIds(
                        a.resource?.setlist_urls || [],
                      );
                      const playlistUrl = buildYoutubeQueueUrl(setlistIds);
                      if (!playlistUrl) return null;

                      return (
                        <a
                          href={playlistUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 inline-block rounded-md border bg-white px-2 py-1 text-xs hover:bg-slate-100"
                        >
                          콘티 듣기
                        </a>
                      );
                    })()}
                  </div>
                ))
              ) : (
                <p className="py-4 text-center text-sm text-slate-500">
                  확정된 사역 일정이 없습니다.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center space-x-2 border-b pb-3">
              <Users className="h-5 w-5 text-green-500" />
              <CardTitle className="text-lg">내 소속 팀</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-4">
              {myTeams.length > 0 ? (
                myTeams.map((team) => (
                  <div
                    key={team.id}
                    className="flex items-center gap-2 rounded p-2 hover:bg-slate-50"
                  >
                    <div className="h-2 w-2 rounded-full bg-green-500" />
                    <span className="text-sm font-medium">{team.name}</span>
                  </div>
                ))
              ) : (
                <p className="py-4 text-center text-sm text-slate-500">
                  아직 소속된 팀이 없습니다.
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="border-purple-100">
            <CardHeader className="flex flex-row items-center space-x-2 border-b pb-3">
              <UserCheck className="h-5 w-5 text-purple-500" />
              <CardTitle className="text-lg">이번 주 콘티/묵상</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              {myNextSetlistAssignment ? (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-purple-600">
                    {myNextSetlistAssignment.service.date}
                  </p>
                  <p className="text-sm font-bold">
                    {myNextSetlistAssignment.service.title}
                  </p>
                  <p className="text-xs text-slate-500">
                    {myNextSetlistAssignment.team.name}
                  </p>
                  {(() => {
                    const setlistIds = extractYouTubeVideoIds(
                      myNextSetlistAssignment.resource?.setlist_urls || [],
                    );
                    const playlistUrl = buildYoutubeQueueUrl(setlistIds);
                    if (!playlistUrl) return null;

                    return (
                      <a
                        href={playlistUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-block rounded-md border bg-slate-50 px-2 py-1 text-xs hover:bg-slate-100"
                      >
                        콘티 재생목록 열기
                      </a>
                    );
                  })()}
                  <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-semibold text-slate-500">묵상</p>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-7 text-slate-700">
                      {myNextSetlistAssignment.resource?.meditation?.trim() ||
                        "등록된 묵상이 없습니다."}
                    </p>
                    <div className="mt-3">
                      <ServiceResourceLikeButton
                        serviceId={myNextSetlistAssignment.service.id}
                        initialLiked={myNextSetlistAssignment.likedByMe}
                        initialCount={myNextSetlistAssignment.likeCount}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <p className="py-4 text-center text-sm text-slate-500">
                  해당 주차 콘티/묵상이 아직 등록되지 않았습니다.
                </p>
              )}
            </CardContent>
          </Card>

          <MonthlyAvailabilityVoteCard
            profileId={user.id}
            monthLabel={formatDate(nextMonthStartDate, "yyyy년 M월")}
            teams={availabilityTeams}
            services={nextMonthServices}
            initialVotes={myAvailabilityVotes}
          />

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">전체 예배 일정 현황</CardTitle>
            </CardHeader>
            <CardContent className="rounded-xl border-2 border-dashed p-6 text-center text-slate-400">
              <p className="mb-2 text-sm">전체 예배 배정 캘린더가 곧 준비됩니다.</p>
              <p className="text-xs">
                관리자가 스케줄을 [공개]하면 이곳에 나타납니다.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="hidden md:block">
        <div className="container mx-auto max-w-6xl p-6">
          <header className="mb-10 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-12 w-32 overflow-hidden rounded-xl border border-slate-200 bg-white p-1">
                <Image
                  src={logoImage}
                  alt="NER Worship 로고"
                  className="h-full w-full object-contain"
                />
              </div>
              <div>
                <h3 className="text-2xl font-bold tracking-tight">dashboard</h3>
                <p className="mt-1 text-slate-500">
                  {profile?.full_name}{" "}
                  <span className="font-semibold text-blue-600">
                    {profileRoleLabel}
                  </span>
                  님, 환영합니다.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              {isAdmin && (
                <Button asChild variant="outline">
                  <Link href="/admin">
                    <Settings className="mr-2 h-4 w-4" />
                    관리자 패널
                  </Link>
                </Button>
              )}
              <LogoutButton />
            </div>
          </header>

          <div className="grid items-start gap-6 md:grid-cols-2 lg:grid-cols-3">
            <Card className="border-blue-100 transition-shadow hover:shadow-md">
              <CardHeader className="flex flex-row items-center space-x-2 border-b pb-3">
                <CalendarDays className="h-5 w-5 text-blue-500" />
                <CardTitle className="text-lg">내 사역 일정</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-4">
                {myAssignments.length > 0 ? (
                  myAssignments.map((a) => (
                    <div
                      key={a.id}
                      className="rounded-lg border border-blue-100 bg-blue-50 p-3"
                    >
                      <p className="mb-1 text-xs font-bold text-blue-600">
                        {a.service.date}
                      </p>
                      <p className="text-sm font-bold">{a.service.title}</p>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-xs text-slate-500">
                          {a.team.name}
                        </span>
                        <span className="rounded bg-white px-2 py-1 text-xs font-bold shadow-sm">
                          {a.role_name}
                        </span>
                      </div>
                      {(() => {
                        const setlistIds = extractYouTubeVideoIds(
                          a.resource?.setlist_urls || [],
                        );
                        const playlistUrl = buildYoutubeQueueUrl(setlistIds);
                        if (!playlistUrl) return null;

                        return (
                          <a
                            href={playlistUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-2 inline-block rounded-md border bg-white px-2 py-1 text-xs hover:bg-slate-100"
                          >
                            콘티 듣기
                          </a>
                        );
                      })()}
                    </div>
                  ))
                ) : (
                  <p className="py-4 text-center text-sm text-slate-500">
                    확정된 사역 일정이 없습니다.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="transition-shadow hover:shadow-md">
              <CardHeader className="flex flex-row items-center space-x-2 border-b pb-3">
                <Users className="h-5 w-5 text-green-500" />
                <CardTitle className="text-lg">내 소속 팀</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pt-4">
                {myTeams.length > 0 ? (
                  myTeams.map((team) => (
                    <div
                      key={team.id}
                      className="flex items-center gap-2 rounded p-2 hover:bg-slate-50"
                    >
                      <div className="h-2 w-2 rounded-full bg-green-500" />
                      <span className="text-sm font-medium">{team.name}</span>
                    </div>
                  ))
                ) : (
                  <p className="py-4 text-center text-sm text-slate-500">
                    아직 소속된 팀이 없습니다.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="border-purple-100 transition-shadow hover:shadow-md">
              <CardHeader className="flex flex-row items-center space-x-2 border-b pb-3">
                <UserCheck className="h-5 w-5 text-purple-500" />
                <CardTitle className="text-lg">이번 주 콘티/묵상</CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                {myNextSetlistAssignment ? (
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-purple-600">
                      {myNextSetlistAssignment.service.date}
                    </p>
                    <p className="text-sm font-bold">
                      {myNextSetlistAssignment.service.title}
                    </p>
                    <p className="text-xs text-slate-500">
                      {myNextSetlistAssignment.team.name}
                    </p>
                    {(() => {
                      const setlistIds = extractYouTubeVideoIds(
                        myNextSetlistAssignment.resource?.setlist_urls || [],
                      );
                      const playlistUrl = buildYoutubeQueueUrl(setlistIds);
                      if (!playlistUrl) return null;

                      return (
                        <a
                          href={playlistUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-block rounded-md border bg-slate-50 px-2 py-1 text-xs hover:bg-slate-100"
                        >
                          콘티 재생목록 열기
                        </a>
                      );
                    })()}
                    <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs font-semibold text-slate-500">묵상</p>
                      <p className="mt-1 max-h-[360px] overflow-y-auto whitespace-pre-wrap break-words pr-1 text-sm leading-7 text-slate-700">
                        {myNextSetlistAssignment.resource?.meditation?.trim() ||
                          "등록된 묵상이 없습니다."}
                      </p>
                      <div className="mt-3">
                        <ServiceResourceLikeButton
                          serviceId={myNextSetlistAssignment.service.id}
                          initialLiked={myNextSetlistAssignment.likedByMe}
                          initialCount={myNextSetlistAssignment.likeCount}
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="py-4 text-center text-sm text-slate-500">
                    해당 주차 콘티/묵상이 아직 등록되지 않았습니다.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="mt-8">
            <MonthlyAvailabilityVoteCard
              profileId={user.id}
              monthLabel={formatDate(nextMonthStartDate, "yyyy년 M월")}
              teams={availabilityTeams}
              services={nextMonthServices}
              initialVotes={myAvailabilityVotes}
            />
          </div>

          <div className="mt-10">
            <h2 className="mb-4 text-xl font-semibold">전체 예배 일정 현황</h2>
            <Card>
              <CardContent className="rounded-xl border-2 border-dashed p-10 text-center text-slate-400">
                <p className="mb-2">전체 예배 배정 캘린더가 곧 준비됩니다.</p>
                <p className="text-xs">
                  관리자가 스케줄을 [공개]하면 이곳에 나타납니다.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
