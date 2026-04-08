"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine, Legend,
} from "recharts";

const inputCls = "border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-orange-500";

interface Student { id: number; name: string; grade: string; }

interface MathSubmissionDetail {
  id: number;
  math_test_id: number;
  test_title: string;
  test_date: string;
  score: number;
  total: number;
  status: string;
  class_avg: number | null;   // 반 평균 점수 (raw)
  class_rank: number | null;  // 반 석차
  class_total: number | null; // 반 응시 인원
  items: {
    question_no: number;
    student_answer: number;
    correct_answer: number;
    is_correct: boolean;
  }[];
}

export default function MathHistoryPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [submissions, setSubmissions] = useState<MathSubmissionDetail[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiFetch<Student[]>("/students").then(setStudents).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedId) { setSubmissions([]); return; }
    setLoading(true);
    apiFetch<MathSubmissionDetail[]>(`/math-submissions?student_id=${selectedId}&detail=true`)
      .then(setSubmissions)
      .catch(() => setSubmissions([]))
      .finally(() => setLoading(false));
  }, [selectedId]);

  const selected = students.find((s) => String(s.id) === selectedId);
  const graded = submissions.filter((s) => s.status === "graded" && s.total > 0);

  // 성적 추이 데이터
  const trendData = graded.map((s) => {
    const pct = Math.round((s.score / s.total) * 100);
    const classAvgPct = s.class_avg != null ? Math.round((s.class_avg / s.total) * 100) : null;
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

  return (
    <div>
      <h1 className="text-xl font-bold mb-6 text-gray-900 dark:text-gray-100">수학 성적 추이</h1>

      {/* 학생 선택 */}
      <div className="flex gap-3 items-center mb-6">
        <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} className={inputCls + " w-52"}>
          <option value="">학생 선택...</option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>{s.name} ({s.grade})</option>
          ))}
        </select>
        {selected && graded.length > 0 && (
          <span className="text-sm text-gray-500 dark:text-gray-400">총 {graded.length}회 시험</span>
        )}
      </div>

      {!selectedId && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-12 text-center text-gray-400 dark:text-gray-500 shadow-sm">
          학생을 선택하면 성적 추이를 확인할 수 있습니다
        </div>
      )}
      {selectedId && loading && <div className="text-center text-gray-400 py-12">불러오는 중...</div>}
      {selectedId && !loading && graded.length === 0 && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-12 text-center text-gray-400 dark:text-gray-500 shadow-sm">
          채점 완료된 시험이 없습니다
        </div>
      )}

      {selectedId && !loading && graded.length > 0 && (
        <div className="space-y-5">

          {/* 요약 카드 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 shadow-sm">
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">최근 점수</p>
              <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{latest.pct}%</p>
              <p className="text-xs text-gray-400 mt-1">{latest.score}/{latest.total}점</p>
            </div>
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 shadow-sm">
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">내 평균</p>
              <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{myAvg}%</p>
              {classAvgAvg != null && (
                <p className="text-xs mt-1" style={{ color: (myAvg ?? 0) >= classAvgAvg ? "#22c55e" : "#ef4444" }}>
                  반평균 {classAvgAvg}% ({(myAvg ?? 0) >= classAvgAvg ? "▲" : "▼"}{Math.abs((myAvg ?? 0) - classAvgAvg)}%p)
                </p>
              )}
            </div>
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 shadow-sm">
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">전회 대비</p>
              {diff !== null ? (
                <p className={`text-2xl font-bold ${diff > 0 ? "text-green-600 dark:text-green-400" : diff < 0 ? "text-red-500 dark:text-red-400" : "text-gray-500"}`}>
                  {diff > 0 ? "+" : ""}{diff}%
                </p>
              ) : (
                <p className="text-2xl font-bold text-gray-300 dark:text-gray-600">-</p>
              )}
            </div>
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 shadow-sm">
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">최고 석차</p>
              {bestRank != null ? (
                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{bestRank}등</p>
              ) : (
                <p className="text-2xl font-bold text-gray-300 dark:text-gray-600">-</p>
              )}
            </div>
          </div>

          {/* 성적 추이 꺾은선 */}
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">성적 추이</h2>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={trendData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#9ca3af" }} />
                <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fill: "#9ca3af" }} />
                <Tooltip
                  formatter={(value: number, name: string) => [`${value}%`, name === "pct" ? "내 점수" : "반 평균"]}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName ?? ""}
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                />
                <Legend formatter={(value) => value === "pct" ? "내 점수" : "반 평균"} wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="pct" stroke="#f97316" strokeWidth={2.5} dot={{ r: 4, fill: "#f97316" }} activeDot={{ r: 6 }} />
                <Line type="monotone" dataKey="classAvgPct" stroke="#6366f1" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 3, fill: "#6366f1" }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* 문항별 오답률 */}
          {wrongData.length > 0 && (
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">문항별 오답률</h2>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={wrongData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="q" tick={{ fontSize: 10, fill: "#9ca3af" }} />
                  <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fill: "#9ca3af" }} />
                  <Tooltip
                    formatter={(value: number, _: string, props) => [
                      `${value}% (${props.payload.wrong}/${props.payload.total}회)`, "오답률"
                    ]}
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  />
                  <Bar dataKey="wrongRate" radius={[4, 4, 0, 0]}>
                    {wrongData.map((d, i) => (
                      <Cell key={i} fill={d.wrongRate >= 70 ? "#ef4444" : d.wrongRate >= 40 ? "#f97316" : "#22c55e"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="flex gap-4 mt-3 text-xs text-gray-400 justify-end">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-500 inline-block" />70% 이상</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-orange-500 inline-block" />40~69%</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-green-500 inline-block" />39% 이하</span>
              </div>
            </div>
          )}

          {/* 시험별 상세 테이블 */}
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">시험명</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">날짜</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600 dark:text-gray-300">점수</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600 dark:text-gray-300">정답률</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600 dark:text-gray-300">반 평균</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600 dark:text-gray-300">석차</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">오답 문항</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {graded.map((s) => {
                    const pct = Math.round((s.score / s.total) * 100);
                    const classAvgPct = s.class_avg != null ? Math.round((s.class_avg / s.total) * 100) : null;
                    const wrong = s.items?.filter((i) => !i.is_correct).map((i) => i.question_no).sort((a, b) => a - b) ?? [];
                    return (
                      <tr key={s.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                        <td className="px-4 py-3 font-medium text-gray-800 dark:text-gray-100">{s.test_title}</td>
                        <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">{s.test_date}</td>
                        <td className="px-4 py-3 text-center font-bold text-orange-600 dark:text-orange-400">{s.score}/{s.total}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-sm font-bold ${pct >= 80 ? "text-green-600 dark:text-green-400" : pct >= 60 ? "text-orange-500 dark:text-orange-400" : "text-red-500 dark:text-red-400"}`}>
                            {pct}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center text-sm text-indigo-500 dark:text-indigo-400">
                          {classAvgPct != null ? (
                            <span>
                              {classAvgPct}%
                              <span className={`text-xs ml-1 ${pct >= classAvgPct ? "text-green-500" : "text-red-400"}`}>
                                ({pct >= classAvgPct ? "▲" : "▼"}{Math.abs(pct - classAvgPct)}%p)
                              </span>
                            </span>
                          ) : "-"}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {s.class_rank != null && s.class_total != null ? (
                            <span className="font-bold text-gray-700 dark:text-gray-200">{s.class_rank}<span className="text-xs text-gray-400">/{s.class_total}</span></span>
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
  );
}
