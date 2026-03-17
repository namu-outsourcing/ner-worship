import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Image from "next/image";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { addMonths, endOfMonth, format as formatDate, startOfMonth } from "date-fns";
import { CalendarDays, Settings, UserCheck, Megaphone } from "lucide-react";
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
import { MobileMonthlyWorshipCalendar } from "@/components/dashboard/mobile-monthly-worship-calendar";

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
  resourceEditorName: string | null;
  likeCount: number;
  likedByMe: boolean;
}

interface TeamMembershipRow {
  teams: TeamRef | TeamRef[] | null;
}

interface ServiceResource {
  service_id: string;
  setlist_urls: string[] | null;
  setlist_titles: string[] | null;
  meditation: string | null;
  updated_by: string | null;
}

interface ServiceResourceLike {
  service_id: string;
  profile_id: string;
}

interface TeamNoticeRow {
  id: string;
  title: string;
  content: string;
  created_by: string;
  created_at: string;
}

interface TeamNoticeDisplay {
  id: string;
  title: string;
  content: string;
  created_by_name: string;
  created_at: string;
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
  const resourceEditorNameById = new Map<string, string>();
  const serviceLikeCountMap = new Map<string, number>();
  const likedServiceIds = new Set<string>();

  if (serviceIds.length > 0) {
    const [resourcesRes, likesRes] = await Promise.all([
      supabase
        .from("service_resources")
        .select("service_id, setlist_urls, setlist_titles, meditation, updated_by")
        .in("service_id", serviceIds),
      supabase
        .from("service_resource_likes")
        .select("service_id, profile_id")
        .in("service_id", serviceIds),
    ]);

    const resources = (resourcesRes.data || []) as ServiceResource[];
    for (const row of resources) {
      serviceResourceMap.set(row.service_id, row);
    }

    const resourceEditorIds = Array.from(
      new Set(
        resources
          .map((row) => row.updated_by)
          .filter((editorId): editorId is string => Boolean(editorId)),
      ),
    );

    if (resourceEditorIds.length > 0) {
      const resourceEditorsRes = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", resourceEditorIds);

      if (!resourceEditorsRes.error) {
        for (const row of (resourceEditorsRes.data || []) as {
          id: string;
          full_name: string;
        }[]) {
          resourceEditorNameById.set(row.id, row.full_name);
        }
      }
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
    resourceEditorName:
      (() => {
        const editorId = serviceResourceMap.get(item.service.id)?.updated_by;
        if (!editorId) return null;
        return resourceEditorNameById.get(editorId) || null;
      })(),
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

  const currentMonthStartDate = startOfMonth(new Date());
  const currentMonthEndDate = endOfMonth(currentMonthStartDate);
  const currentMonthStart = formatDate(currentMonthStartDate, "yyyy-MM-dd");
  const currentMonthEnd = formatDate(
    startOfMonth(addMonths(currentMonthStartDate, 1)),
    "yyyy-MM-dd",
  );

  const { data: monthServicesRaw } = await supabase
    .from("services")
    .select("id, title, date, status")
    .eq("status", "published")
    .gte("date", currentMonthStart)
    .lt("date", currentMonthEnd)
    .order("date", { ascending: true });

  const monthServices = (monthServicesRaw || []) as ServiceRef[];
  const monthServicesByDay = new Map<number, ServiceRef[]>();
  for (const service of monthServices) {
    const day = new Date(`${service.date}T00:00:00`).getDate();
    const items = monthServicesByDay.get(day) || [];
    items.push(service);
    monthServicesByDay.set(day, items);
  }

  const monthLeadingEmpty = currentMonthStartDate.getDay();
  const monthTotalDays = currentMonthEndDate.getDate();
  const monthCalendarCells: Array<{
    key: string;
    day: number | null;
    services: ServiceRef[];
  }> = [];

  for (let i = 0; i < monthLeadingEmpty; i += 1) {
    monthCalendarCells.push({ key: `head-empty-${i}`, day: null, services: [] });
  }

  for (let day = 1; day <= monthTotalDays; day += 1) {
    monthCalendarCells.push({
      key: `day-${day}`,
      day,
      services: monthServicesByDay.get(day) || [],
    });
  }

  const monthTrailingEmpty = (7 - (monthCalendarCells.length % 7)) % 7;
  for (let i = 0; i < monthTrailingEmpty; i += 1) {
    monthCalendarCells.push({ key: `tail-empty-${i}`, day: null, services: [] });
  }

  const weekDays = ["일", "월", "화", "수", "목", "금", "토"];
  const currentMonthLabel = formatDate(currentMonthStartDate, "yyyy년 M월");

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

  const getSetlistTitles = (assignment: AssignmentDisplay): string[] => {
    const urls = assignment.resource?.setlist_urls || [];
    const titles = assignment.resource?.setlist_titles || [];
    return urls.map((_, index) => titles[index]?.trim() || `곡 ${index + 1}`);
  };

  let teamNoticesRows: TeamNoticeRow[] = [];
  const noticesRes = await supabase
    .from("team_notices")
    .select("id, title, content, created_by, created_at")
    .order("created_at", { ascending: false })
    .limit(6);

  if (!noticesRes.error) {
    teamNoticesRows = (noticesRes.data || []) as TeamNoticeRow[];
  }

  const noticeAuthorIds = Array.from(
    new Set(teamNoticesRows.map((item) => item.created_by)),
  );
  const noticeAuthorNameById = new Map<string, string>();
  if (noticeAuthorIds.length > 0) {
    const profilesRes = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", noticeAuthorIds);

    if (!profilesRes.error) {
      for (const row of (profilesRes.data || []) as {
        id: string;
        full_name: string;
      }[]) {
        noticeAuthorNameById.set(row.id, row.full_name);
      }
    }
  }

  const teamNotices: TeamNoticeDisplay[] = teamNoticesRows.map((notice) => ({
    id: notice.id,
    title: notice.title,
    content: notice.content,
    created_at: notice.created_at,
    created_by_name: noticeAuthorNameById.get(notice.created_by) || "관리자",
  }));

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
  const myTeamsLabel =
    myTeams.length > 0
      ? myTeams.map((team) => team.name).join(", ")
      : "소속 팀 없음";

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
                <p className="mt-1 text-slate-500">
                  {profile?.full_name}{" "}
                  <span className="font-semibold text-blue-600">
                    {profileRoleLabel}
                  </span>
                  님, 환영합니다.
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  소속 팀: <span className="font-medium text-slate-700">{myTeamsLabel}</span>
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
                  {(() => {
                    const titles = getSetlistTitles(myNextSetlistAssignment);
                    if (titles.length === 0) return null;
                    return (
                      <div className="rounded-md border bg-white p-2">
                        <p className="text-[11px] font-semibold text-slate-500">콘티 곡</p>
                        <ul className="mt-1 space-y-1 text-xs text-slate-700">
                          {titles.map((title, idx) => (
                            <li key={`mobile-setlist-title-${idx}`}>{idx + 1}. {title}</li>
                          ))}
                        </ul>
                      </div>
                    );
                  })()}
                  <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-semibold text-slate-500">묵상</p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      등록자: {myNextSetlistAssignment.resourceEditorName || "미기록"}
                    </p>
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

          <Card className="border-amber-200">
            <CardHeader className="flex flex-row items-center space-x-2 border-b pb-3">
              <Megaphone className="h-5 w-5 text-amber-500" />
              <CardTitle className="text-lg">팀 공지사항</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-4">
              {teamNotices.length > 0 ? (
                teamNotices.map((notice) => (
                  <article key={notice.id} className="rounded-md border bg-amber-50/50 p-3">
                    <p className="text-sm font-semibold">{notice.title}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {notice.created_by_name} · {formatDate(new Date(notice.created_at), "M월 d일 HH:mm")}
                    </p>
                    <p className="mt-2 max-h-24 overflow-hidden whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">
                      {notice.content}
                    </p>
                  </article>
                ))
              ) : (
                <p className="rounded-md border border-dashed p-4 text-center text-sm text-slate-500">
                  등록된 공지사항이 없습니다.
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
            <CardContent className="space-y-3 p-4">
              <MobileMonthlyWorshipCalendar
                monthLabel={currentMonthLabel}
                totalServices={monthServices.length}
                weekDays={weekDays}
                cells={monthCalendarCells}
              />
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
                <p className="mt-1 text-slate-500">
                  {profile?.full_name}{" "}
                  <span className="font-semibold text-blue-600">
                    {profileRoleLabel}
                  </span>
                  님, 환영합니다.
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  소속 팀: <span className="font-medium text-slate-700">{myTeamsLabel}</span>
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

          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.9fr)]">
            <div className="space-y-6">
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

            </div>

            <div className="space-y-6">
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
                      {(() => {
                        const titles = getSetlistTitles(myNextSetlistAssignment);
                        if (titles.length === 0) return null;
                        return (
                          <div className="rounded-md border bg-white p-2">
                            <p className="text-[11px] font-semibold text-slate-500">콘티 곡</p>
                            <ul className="mt-1 space-y-1 text-xs text-slate-700">
                              {titles.map((title, idx) => (
                                <li key={`desktop-setlist-title-${idx}`}>{idx + 1}. {title}</li>
                              ))}
                            </ul>
                          </div>
                        );
                      })()}
                      <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 p-3">
                        <p className="text-xs font-semibold text-slate-500">묵상</p>
                        <p className="mt-1 text-[11px] text-slate-500">
                          등록자: {myNextSetlistAssignment.resourceEditorName || "미기록"}
                        </p>
                        <p className="mt-1 max-h-[300px] overflow-y-auto whitespace-pre-wrap break-words pr-1 text-sm leading-7 text-slate-700">
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

              <Card className="border-amber-200 transition-shadow hover:shadow-md">
                <CardHeader className="flex flex-row items-center space-x-2 border-b pb-3">
                  <Megaphone className="h-5 w-5 text-amber-500" />
                  <CardTitle className="text-lg">팀 공지사항</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 pt-4">
                  {teamNotices.length > 0 ? (
                    teamNotices.map((notice) => (
                      <article key={notice.id} className="rounded-md border bg-amber-50/50 p-3">
                        <p className="text-sm font-semibold">{notice.title}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {notice.created_by_name} · {formatDate(new Date(notice.created_at), "M월 d일 HH:mm")}
                        </p>
                        <p className="mt-2 max-h-24 overflow-hidden whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">
                          {notice.content}
                        </p>
                      </article>
                    ))
                  ) : (
                    <p className="rounded-md border border-dashed p-6 text-center text-sm text-slate-500">
                      등록된 공지사항이 없습니다.
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
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
              <CardContent className="space-y-4 p-6">
                <div className="flex items-center justify-between">
                  <p className="text-base font-semibold text-slate-700">{currentMonthLabel}</p>
                  <p className="text-sm text-slate-500">공개 일정 {monthServices.length}개</p>
                </div>
                <div className="grid grid-cols-7 gap-2">
                  {weekDays.map((label) => (
                    <div
                      key={`desktop-week-${label}`}
                      className="text-center text-xs font-semibold text-slate-500"
                    >
                      {label}
                    </div>
                  ))}
                  {monthCalendarCells.map((cell) => (
                    <div
                      key={`desktop-${cell.key}`}
                      className={`min-h-28 rounded-lg border p-2 ${
                        cell.day === null
                          ? "border-dashed border-slate-200 bg-slate-50"
                          : "border-slate-200 bg-white"
                      }`}
                    >
                      {cell.day !== null && (
                        <>
                          <p className="text-sm font-semibold text-slate-700">{cell.day}일</p>
                          <div className="mt-2 space-y-1.5">
                            {cell.services.length > 0 ? (
                              cell.services.slice(0, 3).map((service) => (
                                <div
                                  key={`desktop-service-${service.id}`}
                                  className="truncate rounded-md bg-blue-50 px-2 py-1 text-xs text-blue-700"
                                >
                                  {service.title}
                                </div>
                              ))
                            ) : (
                              <p className="text-xs text-slate-400">일정 없음</p>
                            )}
                            {cell.services.length > 3 && (
                              <p className="text-xs text-slate-500">+{cell.services.length - 3}개 더 있음</p>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
