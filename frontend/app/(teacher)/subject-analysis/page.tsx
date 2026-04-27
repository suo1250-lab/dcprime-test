"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { subjectMatch } from "../_components/SubjectHistoryPage";
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend,
} from "recharts";


interface StudentItem { id: number; name: string; grade: string; }

interface MathSub {
  id: number; test_title: string; test_date: string | null;
  status: string; score: number | null; total: number | null;
  subjective_score: number | null; subjective_max: number | null;
  class_avg: number | null; class_rank: number | null; class_total: number | null;
  items?: { question_no: number; is_correct: boolean; tag: string | null }[];
}

const selectCls = "border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-violet-500";
const card = "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5 shadow-sm";

function shorten(s: string) { return s.length > 10 ? s.slice(0, 10) + "…" : s; }

function calcTotalPct(score: number, total: number, sub_score: number | null, sub_max: number | null) {
  if (sub_max != null && sub_max > 0)
    return Math.round(((score + (sub_score ?? 0)) / (total + sub_max)) * 100);
  return Math.round((score / total) * 100);
}

function formatScoreCell(s: MathSub) {
  if (s.score == null || s.total == null) return "-";
  if (!s.subjective_max) return `${s.score}/${s.total}`;
  const sub = s.subjective_score ?? 0;
  const tot = s.score + sub;
  if (s.items && s.items.length > 0) {
    const correct = s.items.filter(i => i.is_correct).length;
    const n = s.items.length;
    return `객관식 ${correct}/${n}문항(${s.score}점) + 서술형 ${sub}점 = 합계 ${tot}점`;
  }
  return `객관식 ${s.score}점 + 서술형 ${sub}점 = 합계 ${tot}점`;
}

const SECTION_HEADER = "flex items-center gap-2 mb-4";
const EMPTY_BOX = card + " py-10 text-center text-sm text-gray-400 dark:text-gray-500";

/* ── 과목 섹션 (국어/영어/수학/과학 공용) ────────────────────── */
function MathSubjectSection({ subject, subs, color }: {
  subject: "국어" | "영어" | "수학" | "과학";
  subs: MathSub[];
  color: { line: string; badge: string; header: string };
}) {
  const ICONS: Record<string, string> = { 국어: "📖", 영어: "📝", 수학: "📐", 과학: "🔬" };

  const header = (
    <div className={SECTION_HEADER}>
      <span className={`text-xs font-bold px-3 py-1 rounded-full text-white ${color.header}`}>
        {ICONS[subject]} {subject}
      </span>
      <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
    </div>
  );

  if (subs.length === 0) {
    return (
      <div>
        {header}
        <div className={EMPTY_BOX}>채점 완료된 {subject} 시험 데이터가 없습니다</div>
      </div>
    );
  }

  const chartData = subs.map((s) => ({
    name: shorten(s.test_title ?? ""),
    fullName: s.test_title,
    pct: s.score != null && s.total ? calcTotalPct(s.score, s.total, s.subjective_score, s.subjective_max) : 0,
    avgPct: s.class_avg != null ? Math.round(s.class_avg) : null,
    score: s.score, total: s.total,
    subjective_score: s.subjective_score, subjective_max: s.subjective_max,
    rank: s.class_rank, rankTotal: s.class_total,
  }));

  const avg = Math.round(chartData.reduce((a, d) => a + d.pct, 0) / chartData.length);
  const latest = chartData[chartData.length - 1];
  const prev = chartData[chartData.length - 2];
  const diff = latest && prev ? latest.pct - prev.pct : null;

  const wMap: Record<number, number> = {};
  const tMap: Record<number, number> = {};
  subs.forEach((s) => s.items?.forEach((item) => {
    tMap[item.question_no] = (tMap[item.question_no] ?? 0) + 1;
    if (!item.is_correct) wMap[item.question_no] = (wMap[item.question_no] ?? 0) + 1;
  }));
  const wrongData = Object.keys(tMap).map(Number).sort((a, b) => a - b).map((q) => ({
    q: `${q}번`,
    wrongRate: tMap[q] ? Math.round(((wMap[q] ?? 0) / tMap[q]) * 100) : 0,
    wrong: wMap[q] ?? 0, total: tMap[q],
  }));

  return (
    <div className="space-y-4">
      {header}

      {/* 요약 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "총 응시", value: `${subs.length}회` },
          { label: "전체 평균", value: `${avg}%` },
          { label: "최근 대비", value: diff == null ? "-" : `${diff >= 0 ? "▲" : "▼"}${Math.abs(diff)}%p`, diffColor: diff == null ? "" : diff >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500" },
          { label: "최고 석차", value: subs.some((s) => s.class_rank != null) ? `${Math.min(...subs.filter((s) => s.class_rank != null).map((s) => s.class_rank!))}등` : "-" },
        ].map(({ label, value, diffColor }) => (
          <div key={label} className={card}>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">{label}</p>
            <p className={`text-2xl font-bold ${diffColor || color.badge}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* 점수 추이 */}
      <div className={card}>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">점수 추이 (반 평균 비교)</h3>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#9ca3af" }} />
            <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10, fill: "#9ca3af" }} />
            <Tooltip
              formatter={(v, name, p) => [`${v}% (${p.payload.score}/${p.payload.total})`, name === "pct" ? "내 점수" : "반 평균"]}
              labelFormatter={(_, pl) => pl?.[0]?.payload?.fullName ?? ""}
              contentStyle={{ fontSize: 11, borderRadius: 6 }}
            />
            <Legend formatter={(v) => v === "pct" ? "내 점수" : "반 평균"} wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="pct" stroke={color.line} strokeWidth={2.5} dot={{ r: 4, fill: color.line }} activeDot={{ r: 6 }} />
            <Line type="monotone" dataKey="avgPct" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 3, fill: "#94a3b8" }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* 문항별 오답률 */}
      {wrongData.length > 0 && (
        <div className={card}>
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">문항별 오답률 (전 시험 누적)</h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={wrongData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="q" tick={{ fontSize: 10, fill: "#9ca3af" }} />
              <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10, fill: "#9ca3af" }} />
              <Tooltip formatter={(v, _, p) => [`${v}% (${p.payload.wrong}/${p.payload.total}회)`, "오답률"]} contentStyle={{ fontSize: 11, borderRadius: 6 }} />
              <Bar dataKey="wrongRate" radius={[3, 3, 0, 0]}>
                {wrongData.map((d, i) => <Cell key={i} fill={d.wrongRate >= 70 ? "#dc2626" : d.wrongRate >= 40 ? "#f97316" : "#4ade80"} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {wrongData.filter((d) => d.wrongRate >= 40).map((d) => (
              <span key={d.q} className={`text-xs px-2.5 py-1 rounded-full font-medium ${d.wrongRate >= 70 ? "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400" : "bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400"}`}>
                {d.q} ({d.wrongRate}%)
              </span>
            ))}
            {wrongData.filter((d) => d.wrongRate >= 40).length === 0 && <span className="text-xs text-emerald-600 dark:text-emerald-400">취약 문항 없음</span>}
          </div>
        </div>
      )}

      {/* 시험 이력 */}
      <div className={card + " overflow-x-auto p-0"}>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
            <tr>{["시험명","시험일","점수","정답률","반 평균","석차"].map((h) => (
              <th key={h} className="text-left px-4 py-3 font-semibold text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">{h}</th>
            ))}</tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {subs.map((s) => {
              const pct = s.score != null && s.total ? calcTotalPct(s.score, s.total, s.subjective_score, s.subjective_max) : null;
              const avgPct = s.class_avg != null ? Math.round(s.class_avg) : null;
              const d = pct != null && avgPct != null ? pct - avgPct : null;
              return (
                <tr key={s.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                  <td className="px-4 py-3 font-medium text-gray-800 dark:text-gray-100">{s.test_title}</td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">{s.test_date ?? "-"}</td>
                  <td className={`px-4 py-3 font-bold text-xs ${color.badge}`}>{formatScoreCell(s)}</td>
                  <td className="px-4 py-3">{pct != null && <span className={`font-semibold ${pct >= 80 ? "text-emerald-600 dark:text-emerald-400" : pct >= 60 ? "text-orange-500" : "text-red-500"}`}>{pct}%</span>}</td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{avgPct != null ? <span>{avgPct}% {d != null && <span className={`text-xs ml-1 ${d >= 0 ? "text-emerald-600" : "text-red-500"}`}>({d >= 0 ? "▲" : "▼"}{Math.abs(d)})</span>}</span> : "-"}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{s.class_rank != null && s.class_total != null ? `${s.class_rank}/${s.class_total}등` : "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── 메인 페이지 ─────────────────────────────────────────────── */
export default function SubjectAnalysisPage() {
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [mathSubs, setMathSubs] = useState<MathSub[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiFetch<StudentItem[]>("/students").then(setStudents).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedId) { setMathSubs([]); return; }
    setLoading(true);
    apiFetch<MathSub[]>(`/math-submissions?student_id=${selectedId}&detail=true`)
      .then((d) => d.filter((s) => s.status === "graded" && s.total != null && s.total > 0))
      .catch(() => [] as MathSub[])
      .then(setMathSubs)
      .finally(() => setLoading(false));
  }, [selectedId]);

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">학생 세부 분석</h1>

      <div className="flex items-center gap-3 flex-wrap">
        <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} className={selectCls + " w-64"}>
          <option value="">학생 선택...</option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>{s.name} ({s.grade})</option>
          ))}
        </select>
        {selectedId && !loading && (
          <button
            onClick={async () => {
              const el = document.getElementById("subject-analysis-report");
              if (!el) return;
              const html2canvas = (await import("html2canvas")).default;
              const student = students.find((s) => String(s.id) === selectedId);
              const canvas = await html2canvas(el, {
                scale: 2,
                useCORS: true,
                backgroundColor: "#ffffff",
                onclone: (_doc, clonedEl) => {
                  // html2canvas v1은 oklch()/lab() 색상 파싱 불가 → computed style을 inline으로 미리 주입
                  (clonedEl as HTMLElement).querySelectorAll<HTMLElement>("*").forEach((node) => {
                    const cs = window.getComputedStyle(node);
                    const bg = cs.backgroundColor;
                    const fg = cs.color;
                    const bc = cs.borderTopColor;
                    if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent")
                      node.style.backgroundColor = bg;
                    if (fg) node.style.color = fg;
                    if (bc) node.style.borderColor = bc;
                  });
                },
              });
              const link = document.createElement("a");
              link.download = `${student?.name ?? "학생"}_과목별분석.jpg`;
              link.href = canvas.toDataURL("image/jpeg", 0.92);
              link.click();
            }}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm"
          >
            JPG로 저장
          </button>
        )}
      </div>

      {!selectedId && (
        <div className={card + " py-16 text-center text-gray-400 dark:text-gray-500"}>
          학생을 선택하면 과목별 성적 분석을 확인할 수 있습니다
        </div>
      )}

      {selectedId && loading && (
        <div className="text-center text-gray-400 py-12">불러오는 중...</div>
      )}

      {/* 국어 → 영어 → 수학 → 과학 항상 표시 */}
      {selectedId && !loading && (
        <div id="subject-analysis-report" className="space-y-10">
          <MathSubjectSection subject="국어" subs={mathSubs.filter((s) => subjectMatch(s.test_title ?? "", "국어"))}
            color={{ line: "#7c3aed", badge: "text-violet-600 dark:text-violet-400", header: "bg-violet-600" }} />
          <MathSubjectSection subject="영어" subs={mathSubs.filter((s) => subjectMatch(s.test_title ?? "", "영어"))}
            color={{ line: "#10b981", badge: "text-emerald-600 dark:text-emerald-400", header: "bg-emerald-600" }} />
          <MathSubjectSection subject="수학" subs={mathSubs.filter((s) => subjectMatch(s.test_title ?? "", "수학"))}
            color={{ line: "#f97316", badge: "text-orange-600 dark:text-orange-400", header: "bg-orange-600" }} />
          <MathSubjectSection subject="과학" subs={mathSubs.filter((s) => subjectMatch(s.test_title ?? "", "과학"))}
            color={{ line: "#0ea5e9", badge: "text-sky-600 dark:text-sky-400", header: "bg-sky-600" }} />
        </div>
      )}
    </div>
  );
}
