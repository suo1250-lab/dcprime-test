"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend,
} from "recharts";

type Subject = "국어" | "영어" | "수학";

interface StudentItem { id: number; name: string; grade: string; }

interface WordSub {
  id: number; word_test_id: number; test_title: string; student_name: string;
  grade: string; status: string; score: number | null; total: number | null; submitted_at: string;
}

interface MathSub {
  id: number; math_test_id: number; test_title: string; test_date: string | null;
  student_name: string; status: string; score: number | null; total: number | null;
  class_avg: number | null; class_rank: number | null; class_total: number | null;
  items?: { question_no: number; student_answer: number | null; correct_answer: number; is_correct: boolean; tag: string | null }[];
}

const selectCls = "border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-violet-500";
const card = "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5 shadow-sm";
const SUBJECTS: Subject[] = ["국어", "영어", "수학"];

const SUBJECT_COLORS: Record<Subject, string> = {
  국어: "violet",
  영어: "emerald",
  수학: "orange",
};

export default function SubjectAnalysisPage() {
  const [subject, setSubject] = useState<Subject>("영어");
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [selectedId, setSelectedId] = useState("");

  // 영어
  const [wordSubs, setWordSubs] = useState<WordSub[]>([]);
  const [wordLoading, setWordLoading] = useState(false);

  // 수학
  const [mathSubs, setMathSubs] = useState<MathSub[]>([]);
  const [mathLoading, setMathLoading] = useState(false);

  useEffect(() => {
    apiFetch<StudentItem[]>("/students").then(setStudents).catch(() => {});
  }, []);

  const selected = students.find((s) => String(s.id) === selectedId);

  // 영어 데이터 로드
  useEffect(() => {
    if (subject !== "영어" || !selected) { setWordSubs([]); return; }
    setWordLoading(true);
    apiFetch<WordSub[]>(`/word-submissions?student_name=${encodeURIComponent(selected.name)}&grade=${encodeURIComponent(selected.grade)}`)
      .then((data) => setWordSubs(data.filter((s) => s.status === "confirmed" && s.score != null)))
      .catch(() => setWordSubs([]))
      .finally(() => setWordLoading(false));
  }, [subject, selected]);

  // 수학 데이터 로드
  useEffect(() => {
    if (subject !== "수학" || !selectedId) { setMathSubs([]); return; }
    setMathLoading(true);
    apiFetch<MathSub[]>(`/math-submissions?student_id=${selectedId}&detail=true`)
      .then((data) => setMathSubs(data.filter((s) => s.status === "graded" && s.total != null && s.total > 0)))
      .catch(() => setMathSubs([]))
      .finally(() => setMathLoading(false));
  }, [subject, selectedId]);

  // 영어 차트 데이터
  const wordChartData = wordSubs.map((s) => ({
    name: s.test_title.length > 8 ? s.test_title.slice(0, 8) + "…" : s.test_title,
    fullName: s.test_title,
    pct: s.score != null && s.total ? Math.round((s.score / s.total) * 100) : 0,
    score: s.score, total: s.total,
  }));
  const wordAvg = wordChartData.length > 0
    ? Math.round(wordChartData.reduce((a, d) => a + d.pct, 0) / wordChartData.length)
    : null;

  // 수학 차트 데이터
  const mathChartData = mathSubs.map((s) => ({
    name: s.test_title.length > 8 ? s.test_title.slice(0, 8) + "…" : s.test_title,
    fullName: s.test_title,
    date: s.test_date,
    pct: s.score != null && s.total ? Math.round((s.score / s.total) * 100) : 0,
    classAvgPct: s.class_avg != null ? Math.round(s.class_avg) : null,
    score: s.score, total: s.total,
    rank: s.class_rank, rankTotal: s.class_total,
  }));

  // 수학 오답 분석
  const wrongMap: Record<number, number> = {};
  const totalMap: Record<number, number> = {};
  mathSubs.forEach((s) => {
    s.items?.forEach((item) => {
      totalMap[item.question_no] = (totalMap[item.question_no] ?? 0) + 1;
      if (!item.is_correct) wrongMap[item.question_no] = (wrongMap[item.question_no] ?? 0) + 1;
    });
  });
  const mathWrongData = Object.keys(totalMap).map(Number).sort((a, b) => a - b).map((q) => ({
    q: `${q}번`,
    wrongRate: totalMap[q] ? Math.round(((wrongMap[q] ?? 0) / totalMap[q]) * 100) : 0,
    wrong: wrongMap[q] ?? 0, total: totalMap[q],
  }));

  const tabColor = {
    국어: "border-violet-500 text-violet-600 dark:text-violet-400",
    영어: "border-emerald-500 text-emerald-600 dark:text-emerald-400",
    수학: "border-orange-500 text-orange-600 dark:text-orange-400",
  };
  const activeBtn = tabColor[subject];

  return (
    <div>
      <h1 className="text-xl font-bold mb-2 text-gray-900 dark:text-gray-100">세부 분석</h1>

      {/* 학생 선택 */}
      <div className="mb-5">
        <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} className={selectCls + " w-56"}>
          <option value="">학생 선택...</option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>{s.name} ({s.grade})</option>
          ))}
        </select>
      </div>

      {/* 과목 탭 */}
      <div className="flex gap-1 mb-6 border-b border-gray-200 dark:border-gray-700">
        {SUBJECTS.map((s) => (
          <button key={s} onClick={() => setSubject(s)}
            className={`px-5 py-2 text-sm font-semibold transition-colors border-b-2 -mb-px ${
              subject === s ? activeBtn : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            }`}>
            {s}
          </button>
        ))}
      </div>

      {/* ── 국어 ── */}
      {subject === "국어" && (
        <div className={card + " flex flex-col items-center justify-center py-20 text-center"}>
          <div className="text-4xl mb-4">📚</div>
          <p className="text-lg font-semibold text-gray-600 dark:text-gray-300 mb-2">국어 분석 준비 중</p>
          <p className="text-sm text-gray-400 dark:text-gray-500">국어 시험 데이터가 등록되면 분석이 표시됩니다</p>
        </div>
      )}

      {/* ── 영어 ── */}
      {subject === "영어" && (
        <div className="space-y-5">
          {!selectedId && (
            <div className={card + " py-16 text-center text-gray-400 dark:text-gray-500"}>학생을 선택하면 영어 성적 분석을 확인할 수 있습니다</div>
          )}
          {selectedId && wordLoading && <div className="text-center text-gray-400 py-12">불러오는 중...</div>}
          {selectedId && !wordLoading && wordSubs.length === 0 && (
            <div className={card + " py-16 text-center text-gray-400 dark:text-gray-500"}>확정된 단어시험 결과가 없습니다</div>
          )}
          {selectedId && !wordLoading && wordSubs.length > 0 && (
            <>
              {/* 요약 카드 */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className={card}>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">총 응시 횟수</p>
                  <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{wordSubs.length}회</p>
                </div>
                <div className={card}>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">전체 평균</p>
                  <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{wordAvg}%</p>
                </div>
                <div className={card}>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">최근 시험</p>
                  <p className="text-xl font-bold text-gray-700 dark:text-gray-200">
                    {wordChartData[wordChartData.length - 1]?.pct ?? "-"}%
                  </p>
                </div>
              </div>

              {/* 성적 추이 차트 */}
              <div className={card}>
                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">점수 추이</h2>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={wordChartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#9ca3af" }} />
                    <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10, fill: "#9ca3af" }} />
                    <Tooltip
                      formatter={(v, _, p) => [`${v}% (${p.payload.score}/${p.payload.total})`, "점수"]}
                      labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName ?? ""}
                      contentStyle={{ fontSize: 11, borderRadius: 6 }}
                    />
                    <Line type="monotone" dataKey="pct" stroke="#10b981" strokeWidth={2.5}
                      dot={{ r: 4, fill: "#10b981" }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* 성적 테이블 */}
              <div className={card + " overflow-x-auto p-0"}>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
                    <tr>
                      {["시험명", "점수", "정답률", "응시일"].map((h) => (
                        <th key={h} className="text-left px-4 py-3 font-semibold text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {wordSubs.map((s) => {
                      const pct = s.score != null && s.total ? Math.round((s.score / s.total) * 100) : null;
                      return (
                        <tr key={s.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                          <td className="px-4 py-3 font-medium text-gray-800 dark:text-gray-100">{s.test_title}</td>
                          <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{s.score}/{s.total}</td>
                          <td className="px-4 py-3">
                            {pct != null && (
                              <span className={`font-semibold ${pct >= 85 ? "text-emerald-600 dark:text-emerald-400" : pct >= 65 ? "text-yellow-600" : "text-red-500"}`}>{pct}%</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">{s.submitted_at.slice(0, 10)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── 수학 ── */}
      {subject === "수학" && (
        <div className="space-y-5">
          {!selectedId && (
            <div className={card + " py-16 text-center text-gray-400 dark:text-gray-500"}>학생을 선택하면 수학 성적 분석을 확인할 수 있습니다</div>
          )}
          {selectedId && mathLoading && <div className="text-center text-gray-400 py-12">불러오는 중...</div>}
          {selectedId && !mathLoading && mathSubs.length === 0 && (
            <div className={card + " py-16 text-center text-gray-400 dark:text-gray-500"}>채점 완료된 수학 시험이 없습니다</div>
          )}
          {selectedId && !mathLoading && mathSubs.length > 0 && (
            <>
              {/* 요약 카드 */}
              {(() => {
                const mathAvg = mathChartData.length > 0
                  ? Math.round(mathChartData.reduce((a, d) => a + d.pct, 0) / mathChartData.length)
                  : null;
                const latest = mathChartData[mathChartData.length - 1];
                const prev = mathChartData[mathChartData.length - 2];
                const diff = latest && prev ? latest.pct - prev.pct : null;
                const bestRank = mathSubs.some((s) => s.class_rank != null)
                  ? Math.min(...mathSubs.filter((s) => s.class_rank != null).map((s) => s.class_rank!))
                  : null;
                return (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className={card}><p className="text-xs text-gray-400 dark:text-gray-500 mb-1">총 응시 횟수</p><p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{mathSubs.length}회</p></div>
                    <div className={card}><p className="text-xs text-gray-400 dark:text-gray-500 mb-1">전체 평균</p><p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{mathAvg}%</p></div>
                    <div className={card}><p className="text-xs text-gray-400 dark:text-gray-500 mb-1">최근 대비</p><p className={`text-2xl font-bold ${diff == null ? "text-gray-400" : diff >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}`}>{diff == null ? "-" : `${diff >= 0 ? "▲" : "▼"}${Math.abs(diff)}%p`}</p></div>
                    <div className={card}><p className="text-xs text-gray-400 dark:text-gray-500 mb-1">최고 석차</p><p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{bestRank != null ? `${bestRank}등` : "-"}</p></div>
                  </div>
                );
              })()}

              {/* 성적 추이 + 반평균 비교 */}
              <div className={card}>
                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">점수 추이 (반 평균 비교)</h2>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={mathChartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#9ca3af" }} />
                    <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10, fill: "#9ca3af" }} />
                    <Tooltip
                      formatter={(v, name) => [`${v}%`, name === "pct" ? "내 점수" : "반 평균"]}
                      labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName ?? ""}
                      contentStyle={{ fontSize: 11, borderRadius: 6 }}
                    />
                    <Legend formatter={(v) => v === "pct" ? "내 점수" : "반 평균"} wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="pct" stroke="#f97316" strokeWidth={2.5} dot={{ r: 4, fill: "#f97316" }} activeDot={{ r: 6 }} />
                    <Line type="monotone" dataKey="classAvgPct" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 3, fill: "#94a3b8" }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* 문항별 오답률 */}
              {mathWrongData.length > 0 && (
                <div className={card}>
                  <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">문항별 오답률 (전 시험 누적)</h2>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={mathWrongData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="q" tick={{ fontSize: 10, fill: "#9ca3af" }} />
                      <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10, fill: "#9ca3af" }} />
                      <Tooltip
                        formatter={(v, _, p) => [`${v}% (${p.payload.wrong}/${p.payload.total}회)`, "오답률"]}
                        contentStyle={{ fontSize: 11, borderRadius: 6 }}
                      />
                      <Bar dataKey="wrongRate" radius={[3, 3, 0, 0]}>
                        {mathWrongData.map((d, i) => (
                          <Cell key={i} fill={d.wrongRate >= 70 ? "#dc2626" : d.wrongRate >= 40 ? "#f97316" : "#4ade80"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {mathWrongData.filter((d) => d.wrongRate >= 40).map((d) => (
                      <span key={d.q} className={`text-xs px-2.5 py-1 rounded-full font-medium ${d.wrongRate >= 70 ? "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400" : "bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400"}`}>
                        {d.q} ({d.wrongRate}%)
                      </span>
                    ))}
                    {mathWrongData.filter((d) => d.wrongRate >= 40).length === 0 && (
                      <span className="text-xs text-emerald-600 dark:text-emerald-400">취약 문항 없음</span>
                    )}
                  </div>
                </div>
              )}

              {/* 성적 테이블 */}
              <div className={card + " overflow-x-auto p-0"}>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
                    <tr>
                      {["시험명", "시험일", "점수", "정답률", "반 평균", "석차"].map((h) => (
                        <th key={h} className="text-left px-4 py-3 font-semibold text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {mathSubs.map((s) => {
                      const pct = s.score != null && s.total ? Math.round((s.score / s.total) * 100) : null;
                      const avg = s.class_avg != null ? Math.round(s.class_avg) : null;
                      const diff = pct != null && avg != null ? pct - avg : null;
                      return (
                        <tr key={s.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                          <td className="px-4 py-3 font-medium text-gray-800 dark:text-gray-100">{s.test_title}</td>
                          <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">{s.test_date ?? "-"}</td>
                          <td className="px-4 py-3 font-bold text-orange-600 dark:text-orange-400">{s.score}/{s.total}</td>
                          <td className="px-4 py-3">
                            {pct != null && <span className={`font-semibold ${pct >= 80 ? "text-emerald-600 dark:text-emerald-400" : pct >= 60 ? "text-orange-500" : "text-red-500"}`}>{pct}%</span>}
                          </td>
                          <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                            {avg != null ? (
                              <span>{avg}% {diff != null && <span className={`text-xs ml-1 ${diff >= 0 ? "text-emerald-600" : "text-red-500"}`}>({diff >= 0 ? "▲" : "▼"}{Math.abs(diff)})</span>}</span>
                            ) : "-"}
                          </td>
                          <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                            {s.class_rank != null && s.class_total != null ? `${s.class_rank}/${s.class_total}등` : "-"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
