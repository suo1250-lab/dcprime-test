"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { StudentProfile, Class, apiFetch, apiHeaders } from "@/lib/api";
import Link from "next/link";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface HistoricalRecord {
  id: number; name: string; grade: string | null; subject: string | null;
  score: number | null; total: number | null; score_pct: number | null; outcome: string | null;
}

export default function StudentProfilePage() {
  const { id } = useParams<{ id: string }>();
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [linkOpen, setLinkOpen] = useState(false);
  const [historicals, setHistoricals] = useState<HistoricalRecord[]>([]);
  const [linkSearch, setLinkSearch] = useState("");
  const [linking, setLinking] = useState(false);
  const [classOpen, setClassOpen] = useState(false);
  const [classes, setClasses] = useState<Class[]>([]);
  const [classLinking, setClassLinking] = useState(false);

  const loadProfile = () => {
    setLoading(true);
    fetch(`${BASE}/api/students/${id}/profile`, { headers: apiHeaders() })
      .then((r) => r.json())
      .then(setProfile)
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadProfile(); }, [id]);

  const openLink = async () => {
    setLinkOpen(true);
    if (historicals.length === 0) {
      const res = await fetch(`${BASE}/api/historical`, { headers: apiHeaders() });
      if (res.ok) setHistoricals(await res.json());
    }
  };

  const linkHistorical = async (historicalId: number | null) => {
    setLinking(true);
    try {
      await apiFetch(`/students/${id}/historical`, {
        method: "PATCH",
        body: JSON.stringify({ historical_student_id: historicalId }),
      });
      setLinkOpen(false);
      loadProfile();
    } finally {
      setLinking(false);
    }
  };

  const openClass = async () => {
    setClassOpen(true);
    if (classes.length === 0) {
      const data = await apiFetch<Class[]>("/classes");
      setClasses(data);
    }
  };

  const linkClass = async (classId: number | null) => {
    setClassLinking(true);
    try {
      await apiFetch(`/students/${id}/class`, {
        method: "PATCH",
        body: JSON.stringify({ class_id: classId }),
      });
      loadProfile();
    } finally {
      setClassLinking(false);
    }
  };

  if (loading) return <div className="text-gray-400 py-20 text-center">불러오는 중...</div>;
  if (!profile) return <div className="text-red-500 py-20 text-center">학생을 찾을 수 없습니다.</div>;

  const outcomeColor = (o: string | null) => {
    if (o === "배정확정") return "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400";
    if (o === "등록불가") return "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400";
    if (o === "포기") return "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400";
    return "bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-400";
  };

  const card = "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 shadow-sm";
  const thCls = "text-left px-4 py-3 font-semibold text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide";
  const tdCls = "px-4 py-3 text-sm text-gray-700 dark:text-gray-300";

  const filteredHistoricals = historicals.filter((h) =>
    h.name.includes(linkSearch) ||
    (h.grade ?? "").includes(linkSearch) ||
    (h.subject ?? "").includes(linkSearch)
  );

  return (
    <div className="space-y-5">
      <Link href="/students" className="inline-flex items-center gap-1 text-sm text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
        ← 원생 목록
      </Link>

      {/* 기본 정보 */}
      <div className={card}>
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">{profile.name}</h1>
            <div className="flex flex-wrap gap-2">
              <span className="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs px-2.5 py-1 rounded-full">{profile.grade}</span>
              {profile.school && <span className="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs px-2.5 py-1 rounded-full">{profile.school}</span>}
              {profile.class_names.map((n) => <span key={n} className="bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-400 text-xs px-2.5 py-1 rounded-full font-medium">{n}</span>)}
              {profile.phone && <span className="text-gray-500 dark:text-gray-400 text-xs self-center">{profile.phone}</span>}
              {profile.teacher && (
                <span className="bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-xs px-2.5 py-1 rounded-full border border-amber-200 dark:border-amber-700">
                  담당: {profile.teacher}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-1.5 items-end">
            <button onClick={openClass} className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium">
              반 {profile.class_names.length > 0 ? "변경" : "배정"}
            </button>
            <Link href={`/students`} className="text-xs text-gray-400 dark:text-gray-500 hover:underline">수정은 원생 목록에서</Link>
          </div>
        </div>
        {classOpen && (
          <div className="mt-4 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-700 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-indigo-700 dark:text-indigo-400">반 배정</p>
              <button onClick={() => setClassOpen(false)} className="text-xs text-gray-400 hover:underline">닫기</button>
            </div>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {profile.class_names.length > 0 && (
                <button onClick={() => linkClass(null)} disabled={classLinking}
                  className="w-full text-left px-3 py-2 text-sm rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors">
                  전체 해제
                </button>
              )}
              {classes.map((c) => {
                const isIn = profile.class_ids.includes(c.id);
                return (
                  <button key={c.id} onClick={() => linkClass(c.id)} disabled={classLinking}
                    className={`w-full text-left px-3 py-2 text-sm rounded-lg transition-colors flex items-center justify-between ${isIn ? "bg-indigo-200 dark:bg-indigo-800 text-indigo-800 dark:text-indigo-200 font-semibold" : "hover:bg-indigo-100 dark:hover:bg-indigo-900/40 text-gray-700 dark:text-gray-300"}`}>
                    <span>{c.name} <span className="text-gray-400 dark:text-gray-500 text-xs ml-1">({c.grade} · {c.subject})</span></span>
                    {isIn && <span className="text-xs text-indigo-600 dark:text-indigo-300">✓ 배정됨</span>}
                  </button>
                );
              })}
              {classes.length === 0 && <p className="text-xs text-gray-400 text-center py-3">반이 없습니다</p>}
            </div>
          </div>
        )}
      </div>

      {/* 입학테스트 결과 */}
      <div className={card}>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 className="font-semibold text-gray-800 dark:text-gray-200">입학테스트 결과</h2>
          <button onClick={openLink}
            className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium">
            역대 이력 연결 {profile.historical.length > 0 ? "변경" : "설정"}
          </button>
        </div>

        {/* 역대 이력 연결 UI */}
        {linkOpen && (
          <div className="mb-4 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-700 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <p className="text-sm font-semibold text-indigo-700 dark:text-indigo-400">역대 이력 레코드 연결</p>
              <button onClick={() => setLinkOpen(false)} className="text-xs text-gray-400 hover:underline">닫기</button>
            </div>
            <input
              value={linkSearch}
              onChange={(e) => setLinkSearch(e.target.value)}
              placeholder="이름/학년/과목 검색"
              className="border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 w-full mb-2"
            />
            <div className="max-h-48 overflow-y-auto space-y-1">
              {profile.historical.length > 0 && (
                <button
                  onClick={() => linkHistorical(null)}
                  disabled={linking}
                  className="w-full text-left px-3 py-2 text-sm rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                >
                  연결 해제
                </button>
              )}
              {filteredHistoricals.map((h) => (
                <button
                  key={h.id}
                  onClick={() => linkHistorical(h.id)}
                  disabled={linking}
                  className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors text-gray-700 dark:text-gray-300"
                >
                  <span className="font-medium">{h.name}</span>
                  <span className="text-gray-400 dark:text-gray-500 ml-2">{h.grade} / {h.subject}</span>
                  {h.score != null && <span className="text-gray-500 dark:text-gray-400 ml-2">{h.score}/{h.total}</span>}
                  {h.outcome && <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${outcomeColor(h.outcome)}`}>{h.outcome}</span>}
                </button>
              ))}
              {filteredHistoricals.length === 0 && (
                <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-3">검색 결과 없음</p>
              )}
            </div>
          </div>
        )}

        {profile.historical.length > 0 && (
          <div className="mb-4">
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-2 font-medium">역대 이력</p>
            <div className="flex flex-wrap gap-2">
              {profile.historical.map((h, i) => (
                <div key={i} className="bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg px-4 py-3 text-sm">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-gray-800 dark:text-gray-200">{h.subject ?? "과목미상"}</span>
                    {h.grade && <span className="text-gray-400 text-xs">{h.grade}</span>}
                    {h.outcome && <span className={`text-xs px-2 py-0.5 rounded-full ${outcomeColor(h.outcome)}`}>{h.outcome}</span>}
                  </div>
                  <div className="text-gray-600 dark:text-gray-400">
                    {h.score != null ? `${h.score}${h.total ? `/${h.total}` : ""}점` : "점수 없음"}
                    {h.score_pct != null && <span className="ml-1 text-gray-400 dark:text-gray-500">({h.score_pct}%)</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {profile.test_results.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-700">
                  {["테스트","과목","점수","점수율","시행일"].map((h) => <th key={h} className={thCls}>{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {profile.test_results.map((r, i) => (
                  <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className={tdCls}>{r.test_title}</td>
                    <td className={tdCls}>{r.subject}</td>
                    <td className={tdCls}>{r.score}/{r.total}</td>
                    <td className={tdCls}>
                      {r.score_pct != null && (
                        <span className={`font-semibold ${r.score_pct >= 80 ? "text-green-600 dark:text-green-400" : r.score_pct >= 60 ? "text-yellow-600 dark:text-yellow-400" : "text-red-500 dark:text-red-400"}`}>{r.score_pct}%</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{r.test_date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : profile.historical.length === 0 && (
          <p className="text-gray-400 dark:text-gray-500 text-sm">입학테스트 데이터 없음</p>
        )}
      </div>

      {/* 수학 성적 */}
      <div className={card}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-800 dark:text-gray-200">수학 성적</h2>
          <span className="text-xs text-gray-400 dark:text-gray-500">채점 완료 기준</span>
        </div>
        {(profile.math_results ?? []).length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-700">
                  {["시험명","시험일","점수","정답률","반 평균","반 평균 대비","석차"].map((h) => <th key={h} className={thCls}>{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {(profile.math_results ?? []).map((r) => {
                  const diff = r.score_pct != null && r.class_avg != null ? Math.round(r.score_pct - r.class_avg) : null;
                  return (
                    <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className={tdCls + " font-medium"}>{r.test_title}</td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{r.test_date ?? "-"}</td>
                      <td className={tdCls}>{r.score != null && r.total != null ? `${r.score}/${r.total}` : "-"}</td>
                      <td className={tdCls}>
                        {r.score_pct != null && (
                          <span className={`font-semibold ${r.score_pct >= 80 ? "text-green-600 dark:text-green-400" : r.score_pct >= 60 ? "text-yellow-600 dark:text-yellow-400" : "text-red-500 dark:text-red-400"}`}>
                            {Math.round(r.score_pct)}%
                          </span>
                        )}
                      </td>
                      <td className={tdCls}>{r.class_avg != null ? `${Math.round(r.class_avg)}%` : "-"}</td>
                      <td className={tdCls}>
                        {diff != null ? (
                          <span className={diff >= 0 ? "text-green-600 dark:text-green-400 font-semibold" : "text-red-500 dark:text-red-400 font-semibold"}>
                            {diff >= 0 ? "▲" : "▼"}{Math.abs(diff)}%p
                          </span>
                        ) : "-"}
                      </td>
                      <td className={tdCls}>
                        {r.class_rank != null ? `${r.class_rank}/${r.class_total}등` : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-400 dark:text-gray-500 text-sm">수학 성적 없음</p>
        )}
      </div>

      {/* 튜터링 이력 */}
      <div className={card}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-semibold text-gray-800 dark:text-gray-200">영어단어 튜터링 이력</h2>
          <Link href={`/word-tutoring?student_id=${profile.id}`}
            className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline font-medium">+ 기록 추가</Link>
        </div>
        {profile.tutoring_sessions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-700">
                  {["날짜","단어시험","1차","2차","3차","메모"].map((h) => <th key={h} className={thCls}>{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {profile.tutoring_sessions.map((t, i) => (
                  <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">{t.session_date}</td>
                    <td className={tdCls}>{t.word_test_title ?? "-"}</td>
                    {[
                      [t.attempt1_total, t.attempt1_wrong],
                      [t.attempt2_total, t.attempt2_wrong],
                      [t.attempt3_total, t.attempt3_wrong],
                    ].map(([total, wrong], ai) => (
                      <td key={ai} className="px-4 py-3 text-sm">
                        {total != null ? (
                          <span className={wrong === 0 ? "text-green-600 dark:text-green-400 font-semibold" : "text-red-500 dark:text-red-400"}>
                            {wrong != null ? `${wrong}개 오답` : "-"}{total ? `/${total}` : ""}
                          </span>
                        ) : <span className="text-gray-300 dark:text-gray-600">-</span>}
                      </td>
                    ))}
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{t.memo ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-400 dark:text-gray-500 text-sm">튜터링 기록 없음</p>
        )}
      </div>
    </div>
  );
}
