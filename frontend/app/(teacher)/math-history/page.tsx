"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine, Legend,
} from "recharts";

const inputCls = "border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-orange-500";

interface MathTest { id: number; title: string; grade: string; test_date: string; }
interface Student { id: number; name: string; grade: string; }

interface MathSubmissionDetail {
  id: number;
  math_test_id: number;
  test_title: string;
  test_date: string;
  score: number;
  total: number;
  status: string;
  student_name: string;
  class_avg: number | null;   // 반 평균 % (0~100)
  class_rank: number | null;  // 반 석차
  class_total: number | null; // 반 응시 인원
  items?: {
    question_no: number;
    student_answer: number | null;
    correct_answer: number;
    is_correct: boolean;
  }[];
}

export default function MathHistoryPage() {
  const [tab, setTab] = useState<"individual" | "class">("individual");

  // 개별 성적
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [submissions, setSubmissions] = useState<MathSubmissionDetail[]>([]);
  const [loading, setLoading] = useState(false);

  // 반별/시험별
  const [mathTests, setMathTests] = useState<MathTest[]>([]);
  const [classTestId, setClassTestId] = useState("");
  const [classSubmissions, setClassSubmissions] = useState<MathSubmissionDetail[]>([]);
  const [classLoading, setClassLoading] = useState(false);

  useEffect(() => {
    apiFetch<Student[]>("/students").then(setStudents).catch(() => {});
    apiFetch<MathTest[]>("/math-tests").then(setMathTests).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedId) { setSubmissions([]); return; }
    setLoading(true);
    apiFetch<MathSubmissionDetail[]>(`/math-submissions?student_id=${selectedId}&detail=true`)
      .then(setSubmissions)
      .catch(() => setSubmissions([]))
      .finally(() => setLoading(false));
  }, [selectedId]);

  useEffect(() => {
    if (!classTestId) { setClassSubmissions([]); return; }
    setClassLoading(true);
    apiFetch<MathSubmissionDetail[]>(`/math-submissions?test_id=${classTestId}&detail=true`)
      .then((data) => setClassSubmissions(data.filter((s) => s.status === "graded" && s.total > 0)))
      .catch(() => setClassSubmissions([]))
      .finally(() => setClassLoading(false));
  }, [classTestId]);

  const selected = students.find((s) => String(s.id) === selectedId);
  const graded = submissions.filter((s) => s.status === "graded" && s.total > 0);

  // 성적 추이 데이터
  const trendData = graded.map((s) => {
    const pct = Math.round((s.score / s.total) * 100);
    const classAvgPct = s.class_avg != null ? Math.round(s.class_avg) : null;
    return {
      name: s.test_title.length > 8 ? s.test_title.slice(0, 8) + "…" : s.test_title,
      fullName: s.test_title,
      date: s.test_date,
      pct,
      classAvgPct,
      score: s.score,
      total: s.total,
      rank: s.class_rank,
      rankTotal: s.class_total,
    };
  });

  // 문항별 오답 빈도
  const wrongMap: Record<number, number> = {};
  const totalMap: Record<number, number> = {};
  graded.forEach((s) => {
    s.items?.forEach((item) => {
      totalMap[item.question_no] = (totalMap[item.question_no] ?? 0) + 1;
      if (!item.is_correct) wrongMap[item.question_no] = (wrongMap[item.question_no] ?? 0) + 1;
    });
  });
  const allQnos = Object.keys(totalMap).map(Number).sort((a, b) => a - b);
  const wrongData = allQnos.map((q) => ({
    q: `${q}번`,
    wrongRate: totalMap[q] ? Math.round(((wrongMap[q] ?? 0) / totalMap[q]) * 100) : 0,
    wrong: wrongMap[q] ?? 0,
    total: totalMap[q],
  }));

  // 요약 계산
  const myAvg = trendData.length > 0 ? Math.round(trendData.reduce((s, d) => s + d.pct, 0) / trendData.length) : null;
  const classAvgAvg = trendData.filter((d) => d.classAvgPct != null).length > 0
    ? Math.round(trendData.filter((d) => d.classAvgPct != null).reduce((s, d) => s + d.classAvgPct!, 0) / trendData.filter((d) => d.classAvgPct != null).length)
    : null;
  const latest = trendData[trendData.length - 1];
  const prev = trendData[trendData.length - 2];
  const diff = latest && prev ? latest.pct - prev.pct : null;
  const bestRank = graded.some((s) => s.class_rank != null)
    ? Math.min(...graded.filter((s) => s.class_rank != null).map((s) => s.class_rank!))
    : null;

  // 반별 뷰 계산
  const classGraded = classSubmissions;
  const classAvgPct = classGraded.length > 0
    ? Math.round(classGraded.reduce((s, r) => s + Math.round((r.score / r.total) * 100), 0) / classGraded.length)
    : null;
  const classMax = classGraded.length > 0 ? Math.max(...classGraded.map((r) => Math.round((r.score / r.total) * 100))) : null;
  const classMin = classGraded.length > 0 ? Math.min(...classGraded.map((r) => Math.round((r.score / r.total) * 100))) : null;
  const classSorted = [...classGraded].sort((a, b) => (b.score / b.total) - (a.score / a.total));

  // 점수 분포 (10점 단위)
  const distMap: Record<string, number> = {};
  classGraded.forEach((r) => {
    const pct = Math.round((r.score / r.total) * 100);
    const band = `${Math.floor(pct / 10) * 10}점대`;
    distMap[band] = (distMap[band] ?? 0) + 1;
  });
  const distData = Array.from({ length: 10 }, (_, i) => ({
    band: `${i * 10}점대`,
    count: distMap[`${i * 10}점대`] ?? 0,
  })).filter((d) => d.count > 0);

  return (
    <div>
      <h1 className="text-xl font-bold mb-4 text-gray-900 dark:text-gray-100">수학 성적 추이</h1>

      {/* 탭 */}
      <div className="flex gap-1 mb-6 border-b border-gray-200 dark:border-gray-700">
        {([["individual", "개별 성적"], ["class", "시험별"]] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === key
                ? "border-orange-500 text-orange-600 dark:text-orange-400"
                : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* ───── 반별/시험별 탭 ───── */}
      {tab === "class" && (
        <div>
          <div className="flex gap-3 items-center mb-6">
            <select value={classTestId} onChange={(e) => setClassTestId(e.target.value)} className={inputCls + " w-72"}>
              <option value="">시험 선택...</option>
              {mathTests.map((t) => (
                <option key={t.id} value={t.id}>{t.title} ({t.grade} · {t.test_date})</option>
              ))}
            </select>
            {classGraded.length > 0 && (
              <span className="text-sm text-gray-500 dark:text-gray-400">응시 {classGraded.length}명</span>
            )}
          </div>

          {!classTestId && (
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-12 text-center text-gray-400 dark:text-gray-500 shadow-sm">
              시험을 선택하면 응시 학생 전체 성적을 확인할 수 있습니다
            </div>
          )}
          {classTestId && classLoading && <div className="text-center text-gray-400 py-12">불러오는 중...</div>}
          {classTestId && !classLoading && classGraded.length === 0 && (
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-12 text-center text-gray-400 dark:text-gray-500 shadow-sm">
              채점 완료된 응시자가 없습니다
            </div>
          )}

          {classTestId && !classLoading && classGraded.length > 0 && (
            <div className="space-y-5">
              {/* 요약 카드 */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "응시 인원", value: `${classGraded.length}명`, color: "text-indigo-600 dark:text-indigo-400" },
                  { label: "반 평균", value: `${classAvgPct}%`, color: "text-orange-600 dark:text-orange-400" },
                  { label: "최고 점수", value: `${classMax}%`, color: "text-green-600 dark:text-green-400" },
                  { label: "최저 점수", value: `${classMin}%`, color: "text-red-500 dark:text-red-400" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 shadow-sm">
                    <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">{label}</p>
                    <p className={`text-2xl font-bold ${color}`}>{value}</p>
                  </div>
                ))}
              </div>

              {/* 점수 분포 */}
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5 shadow-sm">
                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">점수 분포</h2>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={distData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="band" tick={{ fontSize: 11, fill: "#9ca3af" }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#9ca3af" }} />
                    <Tooltip formatter={(v) => [`${v}명`, "인원"]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]} fill="#f97316" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* 학생별 성적 테이블 (석차 순) */}
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
                      <tr>
                        {["석차", "이름", "점수", "정답률", "반 평균 대비", "오답 문항"].map((h) => (
                          <th key={h} className="text-left px-4 py-3 font-semibold text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                      {classSorted.map((s, idx) => {
                        const pct = Math.round((s.score / s.total) * 100);
                        const diff = classAvgPct != null ? pct - classAvgPct : null;
                        const wrong = s.items?.filter((i) => !i.is_correct).map((i) => i.question_no).sort((a, b) => a - b) ?? [];
                        return (
                          <tr key={s.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                            <td className="px-4 py-3 font-bold text-gray-700 dark:text-gray-200">{idx + 1}등</td>
                            <td className="px-4 py-3 font-medium text-gray-800 dark:text-gray-100">{s.student_name}</td>
                            <td className="px-4 py-3 font-bold text-orange-600 dark:text-orange-400">{s.score}/{s.total}</td>
                            <td className="px-4 py-3">
                              <span className={`font-bold ${pct >= 80 ? "text-green-600 dark:text-green-400" : pct >= 60 ? "text-orange-500" : "text-red-500"}`}>{pct}%</span>
                            </td>
                            <td className="px-4 py-3 text-sm">
                              {diff != null ? (
                                <span className={diff >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}>
                                  {diff >= 0 ? "▲" : "▼"}{Math.abs(diff)}%p
                                </span>
                              ) : "-"}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap gap-1">
                                {wrong.length === 0
                                  ? <span className="text-xs text-green-500">만점</span>
                                  : wrong.map((q) => (
                                    <span key={q} className="text-xs bg-red-50 dark:bg-red-900/30 text-red-500 dark:text-red-400 px-1.5 py-0.5 rounded">{q}번</span>
                                  ))}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ───── 개별 성적 탭 ───── */}
      {tab === "individual" && (
      <div>
        {/* 학생 선택 + JPG 저장 */}
        <div className="flex gap-3 items-center mb-6 flex-wrap">
          <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} className={inputCls + " w-52"}>
            <option value="">학생 선택...</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>{s.name} ({s.grade})</option>
            ))}
          </select>
          {selected && graded.length > 0 && (
            <>
              <span className="text-sm text-gray-500 dark:text-gray-400">총 {graded.length}회 시험</span>
              <button
                onClick={async () => {
                  const el = document.getElementById("individual-report");
                  if (!el) return;
                  const html2canvas = (await import("html2canvas")).default;
                  const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
                  const link = document.createElement("a");
                  link.download = `${selected.name}_수학성적분석.jpg`;
                  link.href = canvas.toDataURL("image/jpeg", 0.92);
                  link.click();
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm ml-auto"
              >
                JPG로 저장
              </button>
            </>
          )}
        </div>

        {!selectedId && (
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-12 text-center text-gray-400 dark:text-gray-500 shadow-sm">
            학생을 선택하면 성적 분석 리포트를 확인할 수 있습니다
          </div>
        )}
        {selectedId && loading && <div className="text-center text-gray-400 py-12">불러오는 중...</div>}
        {selectedId && !loading && graded.length === 0 && (
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-12 text-center text-gray-400 dark:text-gray-500 shadow-sm">
            채점 완료된 시험이 없습니다
          </div>
        )}

        {selectedId && !loading && graded.length > 0 && (
          /* ── 리포트 카드 (시험결과.html 스타일) ── */
          <div id="individual-report" style={{ backgroundColor: "#fff", color: "#1a1a1a", fontFamily: "Noto Sans KR, Apple SD Gothic Neo, sans-serif" }}
            className="border border-gray-200 rounded-xl shadow-lg overflow-hidden">
            <div style={{ padding: "40px" }}>

              {/* 헤더 */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", paddingBottom: "20px", borderBottom: "2px solid #e5e7eb" }}>
                <div>
                  <div style={{ fontSize: "18px", fontWeight: "bold", color: "#1f2937" }}>대치프라임 학원</div>
                  <div style={{ fontSize: "12px", color: "#9ca3af", marginTop: "2px" }}>Daechi Prime Academy</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "22px", fontWeight: "bold", color: "#2563eb" }}>수학 성적 분석 리포트</div>
                  <div style={{ fontSize: "13px", color: "#6b7280", marginTop: "4px" }}>
                    {new Date().getFullYear()}년 / 발송일: {new Date().toLocaleDateString("ko-KR")}
                  </div>
                </div>
              </div>

              {/* 학생 정보 */}
              <div style={{ margin: "24px 0", backgroundColor: "#f9fafb", borderRadius: "8px", padding: "16px", border: "1px solid #e5e7eb" }}>
                <div style={{ display: "flex", gap: "48px" }}>
                  <div><span style={{ fontWeight: "bold", color: "#4b5563", marginRight: "12px" }}>학생명</span><span style={{ fontWeight: "600" }}>{selected?.name}</span></div>
                  <div><span style={{ fontWeight: "bold", color: "#4b5563", marginRight: "12px" }}>학년</span>{selected?.grade}</div>
                  <div><span style={{ fontWeight: "bold", color: "#4b5563", marginRight: "12px" }}>총 응시 횟수</span>{graded.length}회</div>
                  {bestRank != null && <div><span style={{ fontWeight: "bold", color: "#4b5563", marginRight: "12px" }}>최고 석차</span>{bestRank}등</div>}
                </div>
              </div>

              {/* 성적 분석 — 차트 + 테이블 */}
              <div style={{ marginTop: "28px" }}>
                <div style={{ fontSize: "17px", fontWeight: "bold", color: "#1f2937", borderLeft: "4px solid #2563eb", paddingLeft: "12px", marginBottom: "20px" }}>
                  성적 분석
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", alignItems: "center" }}>
                  {/* 레이더 차트 */}
                  <div>
                    <ResponsiveContainer width="100%" height={260}>
                      <LineChart data={trendData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#6b7280" }} />
                        <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10, fill: "#6b7280" }} />
                        <Tooltip
                          formatter={(value, name) => [`${value}%`, name === "pct" ? "내 점수" : "반 평균"]}
                          labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName ?? ""}
                          contentStyle={{ fontSize: 11, borderRadius: 6 }}
                        />
                        <Legend formatter={(v) => v === "pct" ? "내 점수" : "반 평균"} wrapperStyle={{ fontSize: 11 }} />
                        <Line type="monotone" dataKey="pct" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 4, fill: "#3b82f6" }} activeDot={{ r: 6 }} />
                        <Line type="monotone" dataKey="classAvgPct" stroke="#f97316" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 3, fill: "#f97316" }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  {/* 성적 테이블 */}
                  <div>
                    <table style={{ width: "100%", textAlign: "center", borderCollapse: "collapse", fontSize: "13px" }}>
                      <thead>
                        <tr style={{ backgroundColor: "#f3f4f6", borderBottom: "2px solid #d1d5db" }}>
                          {["시험명", "점수", "반 평균", "평균 대비", "석차"].map((h) => (
                            <th key={h} style={{ padding: "10px 8px", fontWeight: "600", color: "#4b5563" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {graded.map((s) => {
                          const pct = Math.round((s.score / s.total) * 100);
                          const avg = s.class_avg != null ? Math.round(s.class_avg) : null;
                          const diff = avg != null ? pct - avg : null;
                          return (
                            <tr key={s.id} style={{ borderBottom: "1px solid #e5e7eb" }}>
                              <td style={{ padding: "8px", color: "#374151", fontWeight: "500", textAlign: "left" }}>{s.test_title}</td>
                              <td style={{ padding: "8px", fontWeight: "bold", color: "#2563eb" }}>{s.score}<span style={{ fontWeight: "normal", fontSize: "11px" }}>점</span></td>
                              <td style={{ padding: "8px", color: "#6b7280" }}>{avg != null ? `${avg}%` : "-"}</td>
                              <td style={{ padding: "8px", fontWeight: "500", color: diff != null ? (diff >= 0 ? "#16a34a" : "#dc2626") : "#6b7280" }}>
                                {diff != null ? `${diff >= 0 ? "▲" : "▼"} ${Math.abs(diff)}` : "-"}
                              </td>
                              <td style={{ padding: "8px", color: "#374151" }}>
                                {s.class_rank != null && s.class_total != null ? `${s.class_rank}/${s.class_total}` : "-"}
                              </td>
                            </tr>
                          );
                        })}
                        {/* 평균 행 */}
                        <tr style={{ backgroundColor: "#eff6ff", fontWeight: "bold", borderTop: "2px solid #bfdbfe" }}>
                          <td style={{ padding: "10px 8px", textAlign: "left", color: "#1d4ed8" }}>전체 평균</td>
                          <td style={{ padding: "10px 8px", color: "#1d4ed8" }}>{myAvg}%</td>
                          <td style={{ padding: "10px 8px", color: "#1d4ed8" }}>{classAvgAvg != null ? `${classAvgAvg}%` : "-"}</td>
                          <td style={{ padding: "10px 8px", color: myAvg != null && classAvgAvg != null ? (myAvg >= classAvgAvg ? "#16a34a" : "#dc2626") : "#6b7280" }}>
                            {myAvg != null && classAvgAvg != null ? `${myAvg >= classAvgAvg ? "▲" : "▼"} ${Math.abs(myAvg - classAvgAvg)}` : "-"}
                          </td>
                          <td style={{ padding: "10px 8px", color: "#1d4ed8" }}>{bestRank != null ? `최고 ${bestRank}등` : "-"}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* 문항별 오답 현황 */}
              {wrongData.length > 0 && (
                <div style={{ marginTop: "32px" }}>
                  <div style={{ fontSize: "17px", fontWeight: "bold", color: "#1f2937", borderLeft: "4px solid #2563eb", paddingLeft: "12px", marginBottom: "20px" }}>
                    문항별 오답 현황
                  </div>
                  <div style={{ backgroundColor: "#f9fafb", borderRadius: "8px", border: "1px solid #e5e7eb", padding: "16px" }}>
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={wrongData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="q" tick={{ fontSize: 10, fill: "#6b7280" }} />
                        <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10, fill: "#6b7280" }} />
                        <Tooltip formatter={(value, _, props) => [`${value}% (${props.payload.wrong}/${props.payload.total}회)`, "오답률"]} contentStyle={{ fontSize: 11, borderRadius: 6 }} />
                        <Bar dataKey="wrongRate" radius={[3, 3, 0, 0]}>
                          {wrongData.map((d, i) => (
                            <Cell key={i} fill={d.wrongRate >= 70 ? "#dc2626" : d.wrongRate >= 40 ? "#f97316" : "#4ade80"} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                    {/* 취약 문항 목록 */}
                    <div style={{ marginTop: "12px", display: "flex", flexWrap: "wrap", gap: "6px" }}>
                      {wrongData.filter((d) => d.wrongRate >= 40).map((d) => (
                        <span key={d.q} style={{ fontSize: "12px", backgroundColor: d.wrongRate >= 70 ? "#fee2e2" : "#ffedd5", color: d.wrongRate >= 70 ? "#dc2626" : "#c2410c", padding: "2px 10px", borderRadius: "999px", fontWeight: "500" }}>
                          {d.q} ({d.wrongRate}%)
                        </span>
                      ))}
                      {wrongData.filter((d) => d.wrongRate >= 40).length === 0 && (
                        <span style={{ fontSize: "12px", color: "#16a34a" }}>전체 문항 오답률 40% 미만 — 양호</span>
                      )}
                    </div>
                  </div>
                </div>
              )}

            </div>
          </div>
        )}
      </div>
      )}
    </div>
  );
}
