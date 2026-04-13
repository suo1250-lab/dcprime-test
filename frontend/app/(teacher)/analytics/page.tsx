"use client";
import { useEffect, useState } from "react";
import { apiFetch, apiHeaders, Test, AnalyticsData, QuestionStat, Student, Class } from "@/lib/api";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, Cell,
} from "recharts";

const selectCls = "border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500";

interface WeaknessResult {
  student_name: string; test_title: string; grade: string;
  score: number; total: number;
  tags: { tag: string; wrong: number; total: number; wrong_rate: number; wrong_questions: number[] }[];
}

interface AiAssignment {
  student_id: number | null;
  student_name: string;
  score: number;
  total: number;
  score_pct: number;
  recommended_class_id: number | null;
  recommended_class_name: string;
  reason: string;
}

export default function AnalyticsPage() {
  const [tests, setTests] = useState<Test[]>([]);
  const [testId, setTestId] = useState("");
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [selected, setSelected] = useState<QuestionStat | null>(null);

  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [weakStudentId, setWeakStudentId] = useState("");
  const [weakTestId, setWeakTestId] = useState("");
  const [weakness, setWeakness] = useState<WeaknessResult | null>(null);
  const [weakLoading, setWeakLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  const [aiTestId, setAiTestId] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiAssignments, setAiAssignments] = useState<AiAssignment[] | null>(null);
  const [aiOverrides, setAiOverrides] = useState<Record<number, number>>({});
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    apiFetch<Test[]>("/tests").then(setTests).catch(() => {});
    apiFetch<Student[]>("/students").then(setStudents).catch(() => {});
    apiFetch<Class[]>("/classes").then(setClasses).catch(() => {});
  }, []);

  const load = () => {
    if (!testId) return;
    apiFetch<AnalyticsData>(`/analytics/questions/${testId}`).then(setData).catch(() => {});
    setSelected(null);
  };

  const loadWeakness = async () => {
    setWeakLoading(true);
    setWeakness(null);
    try {
      const data = await apiFetch<WeaknessResult>(`/analytics/weakness/${weakStudentId}/${weakTestId}`);
      setWeakness(data);
    } catch { /* handle */ } finally { setWeakLoading(false); }
  };

  const runAiAssign = async () => {
    if (!aiTestId) return;
    setAiLoading(true);
    setAiAssignments(null);
    try {
      const res = await apiFetch<{ assignments: AiAssignment[] }>(`/analytics/assign/${aiTestId}/ai`, { method: "POST" });
      setAiAssignments(res.assignments);
      setAiOverrides({});
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      alert("AI 추천 실패: " + msg);
    } finally { setAiLoading(false); }
  };

  const confirmAiAssign = async () => {
    if (!aiAssignments) return;
    setConfirming(true);
    try {
      // AI 추천을 기본으로 하되, 선생님이 수동 변경한 항목은 override 적용
      const finalOverrides: Record<number, number> = {};
      for (const a of aiAssignments) {
        if (a.student_id == null) continue;
        const overrideVal = aiOverrides[a.student_id];
        const classId = overrideVal !== undefined ? overrideVal : a.recommended_class_id;
        if (classId != null) finalOverrides[a.student_id] = classId;
      }
      await apiFetch(`/analytics/assign/${aiTestId}/confirm`, { method: "POST", body: JSON.stringify(finalOverrides) });
      alert("반 배정이 완료됐습니다.");
      setAiAssignments(null);
      setAiOverrides({});
    } catch { alert("배정 실패"); } finally { setConfirming(false); }
  };

  const generateWorksheet = async () => {
    setGenerating(true);
    try {
      const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
      const res = await fetch(`${BASE}/api/analytics/weakness/${weakStudentId}/${weakTestId}/generate`, { method: "POST", headers: apiHeaders() });
      if (res.ok) {
        const html = await res.text();
        const win = window.open("", "_blank");
        win?.document.write(html);
        win?.document.close();
      }
    } finally { setGenerating(false); }
  };

  return (
    <div>
      <h1 className="text-xl font-bold mb-6 text-gray-900 dark:text-gray-100">분석 대시보드</h1>

      <div className="flex gap-3 mb-6 items-end">
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">테스트 선택</label>
          <select value={testId} onChange={(e) => setTestId(e.target.value)} className={selectCls + " w-72"}>
            <option value="">-- 테스트를 선택하세요 --</option>
            {tests.map((t) => (
              <option key={t.id} value={t.id}>{t.title}</option>
            ))}
          </select>
        </div>
        <button onClick={load} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm">
          조회
        </button>
      </div>

      {data && (
        <>
          <div className="bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-700 rounded-xl px-5 py-3 mb-6 text-sm">
            <span className="font-semibold text-gray-800 dark:text-gray-100">{data.test_title}</span>
            <span className="ml-4 text-gray-500 dark:text-gray-400">응시 학생: {data.total_students}명</span>
          </div>

          {/* 문항별 오답률 차트 */}
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5 mb-6 shadow-sm">
            <h2 className="font-semibold mb-4 text-gray-800 dark:text-gray-100">문항별 오답률 (%)</h2>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data.questions} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                <XAxis dataKey="question_no" label={{ value: "문항", position: "insideBottom", offset: -2 }} />
                <YAxis domain={[0, 100]} unit="%" />
                <Tooltip formatter={(v) => `${v}%`} />
                <Legend />
                <Bar dataKey="incorrect_rate" name="오답률" fill="#f87171">
                  {data.questions.map((q) => (
                    <Cell
                      key={q.question_no}
                      fill={q.incorrect_rate >= 70 ? "#dc2626" : q.incorrect_rate >= 40 ? "#f87171" : "#fca5a5"}
                      cursor="pointer"
                      onClick={() => setSelected(q)}
                    />
                  ))}
                </Bar>
                <Bar dataKey="correct_rate" name="정답률" fill="#4ade80" />
              </BarChart>
            </ResponsiveContainer>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">막대를 클릭하면 반별 분포를 확인할 수 있습니다.</p>
          </div>

          {/* 문항 상세 (반별 분포) */}
          {selected && (
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5 mb-6 shadow-sm">
              <h2 className="font-semibold mb-3 text-gray-800 dark:text-gray-100">
                {selected.question_no}번 문항 상세
                <span className="ml-3 text-sm text-gray-500 dark:text-gray-400">
                  정답률 {selected.correct_rate}% / 오답률 {selected.incorrect_rate}%
                </span>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <h3 className="text-sm font-medium text-green-700 dark:text-green-400 mb-2">정답자 반 분포</h3>
                  <table className="w-full text-sm border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                    <thead className="bg-gray-50 dark:bg-gray-900/50">
                      <tr>
                        <th className="px-3 py-2 text-left text-gray-600 dark:text-gray-300 font-medium">반</th>
                        <th className="px-3 py-2 text-right text-gray-600 dark:text-gray-300 font-medium">명수</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                      {(selected.correct_classes ?? []).map((c) => (
                        <tr key={c.class_name}>
                          <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{c.class_name}</td>
                          <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">{c.count}명</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-red-600 dark:text-red-400 mb-2">오답자 반 분포</h3>
                  <table className="w-full text-sm border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                    <thead className="bg-gray-50 dark:bg-gray-900/50">
                      <tr>
                        <th className="px-3 py-2 text-left text-gray-600 dark:text-gray-300 font-medium">반</th>
                        <th className="px-3 py-2 text-right text-gray-600 dark:text-gray-300 font-medium">명수</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                      {(selected.incorrect_classes ?? []).map((c) => (
                        <tr key={c.class_name}>
                          <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{c.class_name}</td>
                          <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">{c.count}명</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* 전체 문항 테이블 */}
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden shadow-sm mb-6">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">문항</th>
                  <th className="text-right px-4 py-3 font-semibold text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">정답</th>
                  <th className="text-right px-4 py-3 font-semibold text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">오답</th>
                  <th className="text-right px-4 py-3 font-semibold text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">정답률</th>
                  <th className="text-right px-4 py-3 font-semibold text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">오답률</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {data.questions.map((q) => (
                  <tr
                    key={q.question_no}
                    className={`cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50 ${
                      selected?.question_no === q.question_no ? "bg-indigo-50 dark:bg-indigo-950/30" : ""
                    }`}
                    onClick={() => setSelected(q)}
                  >
                    <td className="px-4 py-2 text-gray-700 dark:text-gray-300">{q.question_no}번</td>
                    <td className="px-4 py-2 text-right text-green-700 dark:text-green-400">{q.correct}</td>
                    <td className="px-4 py-2 text-right text-red-600 dark:text-red-400">{q.incorrect}</td>
                    <td className="px-4 py-2 text-right text-gray-700 dark:text-gray-300">{q.correct_rate}%</td>
                    <td className="px-4 py-2 text-right font-medium"
                      style={{ color: q.incorrect_rate >= 70 ? "#dc2626" : q.incorrect_rate >= 40 ? "#ea580c" : "#16a34a" }}>
                      {q.incorrect_rate}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* AI 반 편성 추천 */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5 shadow-sm mb-6">
        <h2 className="font-semibold mb-4 text-gray-800 dark:text-gray-100">AI 반 편성 추천</h2>
        <div className="flex gap-3 mb-4 items-end flex-wrap">
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">테스트 선택</label>
            <select value={aiTestId} onChange={(e) => { setAiTestId(e.target.value); setAiAssignments(null); }}
              className={selectCls + " w-72"}>
              <option value="">-- 테스트를 선택하세요 --</option>
              {tests.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
          </div>
          <button onClick={runAiAssign} disabled={!aiTestId || aiLoading}
            className="bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 shadow-sm">
            {aiLoading ? "AI 분석 중..." : "AI 추천"}
          </button>
        </div>

        {aiAssignments && (
          <div>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">
              "최종 반" 셀렉트를 변경하면 해당 학생만 수동 조정됩니다. <span className="text-amber-600 dark:text-amber-400">수정된 항목은 주황색으로 표시됩니다.</span>
            </p>
            <div className="overflow-x-auto mb-4">
              <table className="w-full text-sm border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                <thead className="bg-gray-50 dark:bg-gray-900/50">
                  <tr>
                    {["학생", "점수", "AI 추천반", "최종 반", "이유"].map((h) => (
                      <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {aiAssignments.map((a, i) => {
                    const isOverridden = a.student_id != null && aiOverrides[a.student_id] !== undefined;
                    return (
                      <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td className="px-3 py-2 font-medium text-gray-800 dark:text-gray-100">{a.student_name}</td>
                        <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{a.score}/{a.total} ({a.score_pct}%)</td>
                        <td className="px-3 py-2">
                          <span className="bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 px-2 py-0.5 rounded text-xs font-medium">
                            {a.recommended_class_name}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={a.student_id != null ? (aiOverrides[a.student_id] ?? a.recommended_class_id ?? "") : ""}
                            onChange={(e) => {
                              if (a.student_id == null) return;
                              setAiOverrides((prev) => ({ ...prev, [a.student_id!]: Number(e.target.value) }));
                            }}
                            className={`border rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 w-full
                              ${isOverridden
                                ? "border-amber-400 dark:border-amber-500 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300"
                                : "border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200"
                              }`}
                          >
                            <option value="">미배정</option>
                            {classes.map((c) => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2 text-gray-500 dark:text-gray-400 text-xs">{a.reason}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <button onClick={confirmAiAssign} disabled={confirming}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 shadow-sm">
              {confirming ? "적용 중..." : "반 배정 확정"}
            </button>
            <span className="ml-3 text-xs text-gray-400 dark:text-gray-500">확정 시 학생 DB에 반이 저장됩니다</span>
          </div>
        )}
      </div>

      {/* 학생별 취약 유형 분석 */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5 shadow-sm">
        <h2 className="font-semibold mb-4 text-gray-800 dark:text-gray-100">학생별 취약 유형 분석</h2>
        <div className="flex gap-3 mb-4 flex-wrap items-end">
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">학생</label>
            <select value={weakStudentId} onChange={(e) => { setWeakStudentId(e.target.value); setWeakness(null); }}
              className={selectCls + " w-48"}>
              <option value="">학생 선택</option>
              {students.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.grade})</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">테스트</label>
            <select value={weakTestId} onChange={(e) => { setWeakTestId(e.target.value); setWeakness(null); }}
              className={selectCls + " w-72"}>
              <option value="">테스트 선택</option>
              {tests.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
          </div>
          <button onClick={loadWeakness} disabled={!weakStudentId || !weakTestId || weakLoading}
            className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 shadow-sm">
            {weakLoading ? "분석 중..." : "취약 분석"}
          </button>
        </div>

        {weakness && (
          <div>
            <div className="text-sm text-gray-600 dark:text-gray-400 mb-3">
              <b className="text-gray-800 dark:text-gray-100">{weakness.student_name}</b> ({weakness.grade}) — {weakness.test_title} &nbsp;|&nbsp; 점수: {weakness.score}/{weakness.total}
            </div>
            {weakness.tags.length === 0 ? (
              <p className="text-gray-400 dark:text-gray-500 text-sm">태그된 문항 데이터가 없습니다. 테스트 관리에서 태그를 먼저 설정하세요.</p>
            ) : (
              <>
                <div className="space-y-2 mb-4">
                  {weakness.tags.map((t) => (
                    <div key={t.tag} className="flex items-center gap-3 text-sm">
                      <span className="bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-400 px-2 py-0.5 rounded text-xs font-medium w-28 text-center shrink-0">{t.tag}</span>
                      <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-2.5">
                        <div className="bg-red-400 h-2.5 rounded-full transition-all" style={{ width: `${t.wrong_rate}%` }} />
                      </div>
                      <span className="text-xs text-gray-500 dark:text-gray-400 w-24 text-right shrink-0">{t.wrong}/{t.total}개 ({t.wrong_rate}%)</span>
                    </div>
                  ))}
                </div>
                <button onClick={generateWorksheet} disabled={generating}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 shadow-sm">
                  {generating ? "생성 중..." : "취약 유형 문제 생성 (PDF)"}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
