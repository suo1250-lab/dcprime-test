"use client";
import { useEffect, useState, useRef } from "react";
import { apiFetch } from "@/lib/api";

const GRADES = ["초1","초2","초3","초4","초5","초6","중1","중2","중3","고1","고2","고3"];
const inputCls = "border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500";

interface MathTest {
  id: number;
  title: string;
  grade: string;
  test_date: string;
  num_questions: number;
  has_answers: boolean;
  tags: Record<string, string>;
  tips: Record<string, string>;
  point_weights: Record<string, number>;
}

export default function MathTestsPage() {
  const [tests, setTests] = useState<MathTest[]>([]);
  const [form, setForm] = useState({ title: "", grade: "중1", test_date: "", num_questions: 20 });
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [tags, setTags] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);
  const [savingTags, setSavingTags] = useState(false);
  const [editingMeta, setEditingMeta] = useState<number | null>(null);
  const [metaForm, setMetaForm] = useState({ title: "", grade: "중1", test_date: "", num_questions: 20 });
  const [savingMeta, setSavingMeta] = useState(false);
  const [analyzingPaper, setAnalyzingPaper] = useState(false);
  const [analyzeMsg, setAnalyzeMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const paperInputRef = useRef<HTMLInputElement>(null);
  const [tips, setTips] = useState<Record<number, string>>({});
  const [pointWeights, setPointWeights] = useState<Record<number, string>>({});
  const [savingWeights, setSavingWeights] = useState(false);

  const load = () => {
    apiFetch<MathTest[]>("/math-tests").then(setTests).catch(() => {});
  };

  useEffect(() => { load(); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await apiFetch("/math-tests", { method: "POST", body: JSON.stringify(form) });
      setForm({ title: "", grade: "중1", test_date: "", num_questions: 20 });
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "오류가 발생했습니다");
    }
  };

  const toggleExpand = async (t: MathTest) => {
    if (expandedId === t.id) { setExpandedId(null); setAnswers([]); setTags({}); setTips({}); setPointWeights({}); setAnalyzeMsg(null); return; }
    setExpandedId(t.id);
    setAnalyzeMsg(null);
    try {
      const d = await apiFetch<{ answers: number[] }>(`/math-tests/${t.id}/answers`);
      setAnswers(d.answers.length > 0 ? d.answers : Array(t.num_questions).fill(0));
    } catch {
      setAnswers(Array(t.num_questions).fill(0));
    }
    // 태그 로드
    try {
      const td = await apiFetch<{ tags: Record<string, string> }>(`/math-tests/${t.id}/tags`);
      const numericTags: Record<number, string> = {};
      for (const [k, v] of Object.entries(td.tags || {})) {
        numericTags[Number(k)] = v;
      }
      setTags(numericTags);
    } catch {
      setTags({});
    }
    // tips 로드
    try {
      const tipsData = await apiFetch<{ tips: Record<string, string> }>(`/math-tests/${t.id}/tips`);
      const numericTips: Record<number, string> = {};
      for (const [k, v] of Object.entries(tipsData.tips || {})) {
        numericTips[Number(k)] = v;
      }
      setTips(numericTips);
    } catch {
      setTips({});
    }
    // 배점 로드
    try {
      const pwData = await apiFetch<{ point_weights: Record<string, number> }>(`/math-tests/${t.id}/point-weights`);
      const numericWeights: Record<number, string> = {};
      for (const [k, v] of Object.entries(pwData.point_weights || {})) {
        numericWeights[Number(k)] = String(v);
      }
      setPointWeights(numericWeights);
    } catch {
      setPointWeights({});
    }
  };

  const saveAnswers = async () => {
    if (!expandedId) return;
    setSaving(true);
    try {
      await apiFetch(`/math-tests/${expandedId}/answers`, {
        method: "PUT",
        body: JSON.stringify({ answers }),
      });
      load();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  const saveTags = async () => {
    if (!expandedId) return;
    setSavingTags(true);
    try {
      const strTags: Record<string, string> = {};
      for (const [k, v] of Object.entries(tags)) {
        if (v.trim()) strTags[String(k)] = v.trim();
      }
      await apiFetch(`/math-tests/${expandedId}/tags`, {
        method: "PUT",
        body: JSON.stringify({ tags: strTags }),
      });
      // tips도 같이 저장
      const strTips: Record<string, string> = {};
      for (const [k, v] of Object.entries(tips)) {
        if (v.trim()) strTips[String(k)] = v.trim();
      }
      await apiFetch(`/math-tests/${expandedId}/tips`, {
        method: "PUT",
        body: JSON.stringify({ tips: strTips }),
      });
      load();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "태그 저장 실패");
    } finally {
      setSavingTags(false);
    }
  };

  const savePointWeights = async () => {
    if (!expandedId) return;
    setSavingWeights(true);
    try {
      const strWeights: Record<string, number> = {};
      for (const [k, v] of Object.entries(pointWeights)) {
        const n = parseFloat(v);
        if (!isNaN(n) && n > 0) strWeights[String(k)] = n;
      }
      await apiFetch(`/math-tests/${expandedId}/point-weights`, {
        method: "PUT",
        body: JSON.stringify({ point_weights: strWeights }),
      });
      load();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "배점 저장 실패");
    } finally {
      setSavingWeights(false);
    }
  };

  const analyzePaper = async (testId: number) => {
    const file = paperInputRef.current?.files?.[0];
    if (!file) return;
    setAnalyzingPaper(true);
    setAnalyzeMsg(null);
    try {
      const formData = new FormData();
      formData.append("paper", file);
      const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
      const { apiHeaders } = await import("@/lib/api");
      const res = await fetch(`${BASE}/api/math-tests/${testId}/analyze-paper`, {
        method: "POST",
        body: formData,
        headers: apiHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? "분석 실패");
      // 태그 자동 채우기
      const numericTags: Record<number, string> = {};
      for (const [k, v] of Object.entries(data.tags || {})) numericTags[Number(k)] = v as string;
      setTags(numericTags);
      // tips 자동 채우기
      const numericTips: Record<number, string> = {};
      for (const [k, v] of Object.entries(data.tips || {})) numericTips[Number(k)] = v as string;
      setTips(numericTips);
      setAnalyzeMsg({ type: "success", text: `✅ AI 분석 완료! 태그 ${Object.keys(data.tags || {}).length}개, 학습팁 ${Object.keys(data.tips || {}).length}개 생성됨. 아래에서 확인 후 저장하세요.` });
      if (paperInputRef.current) paperInputRef.current.value = "";
    } catch (e: unknown) {
      setAnalyzeMsg({ type: "error", text: e instanceof Error ? e.message : "오류 발생" });
    } finally {
      setAnalyzingPaper(false);
    }
  };

  const deleteTest = async (id: number) => {
    if (!confirm("시험을 삭제하시겠습니까?")) return;
    try {
      await apiFetch(`/math-tests/${id}`, { method: "DELETE" });
    } catch (e: unknown) {
      if (!(e instanceof Error && e.message === "Not found")) {
        alert(e instanceof Error ? e.message : "삭제 실패");
      }
    }
    if (expandedId === id) { setExpandedId(null); setAnswers([]); setTags({}); setPointWeights({}); }
    load();
  };

  const startEditMeta = (t: MathTest) => {
    setEditingMeta(t.id);
    setMetaForm({ title: t.title, grade: t.grade, test_date: t.test_date, num_questions: t.num_questions });
  };

  const saveMeta = async (id: number) => {
    setSavingMeta(true);
    try {
      await apiFetch(`/math-tests/${id}`, { method: "PUT", body: JSON.stringify(metaForm) });
      setEditingMeta(null);
      load();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setSavingMeta(false);
    }
  };

  return (
    <div>
      <h1 className="text-xl font-bold mb-6 text-gray-900 dark:text-gray-100">수학시험 관리</h1>

      {/* 시험 생성 폼 */}
      <form onSubmit={submit} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5 mb-6 flex flex-wrap gap-3 items-end shadow-sm">
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">시험명 *</label>
          <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
            className={inputCls + " w-52"} placeholder="4월 수학 모의고사" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">학년 *</label>
          <select value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })} className={inputCls}>
            {GRADES.map((g) => <option key={g}>{g}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">문항 수 *</label>
          <input required type="number" min={1} max={100} value={form.num_questions}
            onChange={(e) => setForm({ ...form, num_questions: Number(e.target.value) })}
            className={inputCls + " w-20"} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">시험일 *</label>
          <input required type="date" value={form.test_date} onChange={(e) => setForm({ ...form, test_date: e.target.value })}
            className={inputCls} />
        </div>
        <button className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors shadow-sm">
          시험 생성
        </button>
        {error && <span className="text-red-500 dark:text-red-400 text-sm w-full">{error}</span>}
      </form>

      {/* 시험 목록 */}
      <div className="space-y-3">
        {tests.length === 0 && (
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-8 text-center text-gray-400 dark:text-gray-500 shadow-sm">
            등록된 시험이 없습니다
          </div>
        )}
        {tests.map((t) => (
          <div key={t.id} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden shadow-sm">
            {editingMeta === t.id ? (
              <div className="flex flex-wrap items-center gap-2 px-5 py-4">
                <input value={metaForm.title} onChange={(e) => setMetaForm({ ...metaForm, title: e.target.value })}
                  className={inputCls + " w-52"} />
                <select value={metaForm.grade} onChange={(e) => setMetaForm({ ...metaForm, grade: e.target.value })} className={inputCls}>
                  {GRADES.map((g) => <option key={g}>{g}</option>)}
                </select>
                <input type="number" min={1} max={100} value={metaForm.num_questions}
                  onChange={(e) => setMetaForm({ ...metaForm, num_questions: Number(e.target.value) })}
                  className={inputCls + " w-20"} />
                <input type="date" value={metaForm.test_date} onChange={(e) => setMetaForm({ ...metaForm, test_date: e.target.value })}
                  className={inputCls} />
                <button onClick={() => saveMeta(t.id)} disabled={savingMeta}
                  className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors">
                  {savingMeta ? "저장 중..." : "저장"}
                </button>
                <button onClick={() => setEditingMeta(null)} className="text-xs text-gray-500 dark:text-gray-400 hover:underline">취소</button>
              </div>
            ) : (
              <div className="flex items-center gap-4 px-5 py-4">
                <button onClick={() => toggleExpand(t)} className="flex-1 text-left flex items-center gap-3 hover:text-indigo-700 dark:hover:text-indigo-400 transition-colors">
                  <span className="text-base font-semibold text-gray-800 dark:text-gray-100">{t.title}</span>
                  <span className="text-xs bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded-full">{t.grade}</span>
                  <span className="text-xs text-gray-400 dark:text-gray-500">{t.test_date}</span>
                  <span className="text-xs text-gray-400 dark:text-gray-500">{t.num_questions}문항</span>
                  {t.has_answers ? (
                    <span className="text-xs bg-green-50 dark:bg-green-900/40 text-green-600 dark:text-green-400 px-2 py-0.5 rounded-full">정답 등록됨</span>
                  ) : (
                    <span className="text-xs bg-amber-50 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded-full">정답 미등록</span>
                  )}
                  {Object.keys(t.tags || {}).length > 0 && (
                    <span className="text-xs bg-purple-50 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 px-2 py-0.5 rounded-full">
                      태그 {Object.keys(t.tags).length}개
                    </span>
                  )}
                  {Object.keys(t.point_weights || {}).length > 0 && (
                    <span className="text-xs bg-orange-50 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400 px-2 py-0.5 rounded-full">
                      배점 {Object.values(t.point_weights).reduce((a, b) => a + b, 0).toFixed(0)}점
                    </span>
                  )}
                  <span className="text-xs text-indigo-400 dark:text-indigo-500 ml-auto">{expandedId === t.id ? "▲ 접기" : "▼ 정답/태그 등록"}</span>
                </button>
                <button onClick={() => startEditMeta(t)}
                  className="text-xs text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                  수정
                </button>
                <button onClick={() => deleteTest(t.id)} className="text-xs text-red-500 dark:text-red-400 hover:underline font-medium">삭제</button>
              </div>
            )}

            {/* 정답 + 태그 등록 */}
            {expandedId === t.id && (
              <div className="border-t border-gray-200 dark:border-gray-700 px-5 py-4 space-y-5">
                {/* 정답 + 배점 입력 */}
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">정답 입력 (1~5)</span>
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        배점 합계: {answers.map((_, idx) => parseFloat(pointWeights[idx + 1] || "0") || 0).reduce((a, b) => a + b, 0).toFixed(1)}점
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={savePointWeights} disabled={savingWeights}
                        className="text-xs bg-orange-500 hover:bg-orange-600 text-white px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors">
                        {savingWeights ? "저장 중..." : "배점 저장"}
                      </button>
                      <button onClick={saveAnswers} disabled={saving}
                        className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors">
                        {saving ? "저장 중..." : "정답 저장"}
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
                    {answers.map((ans, idx) => (
                      <div key={idx} className="flex flex-col items-center gap-1">
                        <span className="text-xs text-gray-400 dark:text-gray-500">{idx + 1}번</span>
                        <select
                          value={ans}
                          onChange={(e) => {
                            const next = [...answers];
                            next[idx] = Number(e.target.value);
                            setAnswers(next);
                          }}
                          className="border border-gray-200 dark:border-gray-600 rounded-lg px-1 py-1 text-sm w-full text-center bg-white dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        >
                          <option value={0}>-</option>
                          {[1,2,3,4,5].map((n) => <option key={n} value={n}>{n}</option>)}
                        </select>
                        <input
                          type="number"
                          min={0}
                          step={0.5}
                          value={pointWeights[idx + 1] ?? ""}
                          onChange={(e) => setPointWeights({ ...pointWeights, [idx + 1]: e.target.value })}
                          placeholder="배점"
                          className="border border-orange-200 dark:border-orange-700/50 rounded-lg px-1 py-1 text-xs w-full text-center bg-orange-50 dark:bg-orange-900/20 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-orange-400 placeholder:text-orange-300"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* AI 시험지 분석 */}
                <div className="bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-700 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-sm font-semibold text-violet-700 dark:text-violet-400">🤖 시험지 AI 분석</span>
                    <span className="text-xs text-violet-500 dark:text-violet-500">HWP 또는 PDF 업로드 → 문항별 개념태그·학습팁 자동 생성</span>
                  </div>
                  <div className="flex flex-wrap gap-3 items-center">
                    <input
                      ref={paperInputRef}
                      type="file"
                      accept=".hwp,.pdf"
                      className="text-sm text-gray-500 dark:text-gray-400 file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:bg-violet-100 dark:file:bg-violet-900/40 file:text-violet-700 dark:file:text-violet-400 hover:file:bg-violet-200"
                    />
                    <button
                      onClick={() => analyzePaper(t.id)}
                      disabled={analyzingPaper}
                      className="bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors shadow-sm"
                    >
                      {analyzingPaper ? "AI 분석 중..." : "AI 분석 시작"}
                    </button>
                  </div>
                  {analyzeMsg && (
                    <p className={`text-xs mt-3 px-3 py-2 rounded-lg ${analyzeMsg.type === "success" ? "bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400" : "bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400"}`}>
                      {analyzeMsg.text}
                    </p>
                  )}
                </div>

                {/* 문항별 태그 입력 */}
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <div>
                      <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">문항별 개념/유형 태그</span>
                      <span className="text-xs text-gray-400 dark:text-gray-500 ml-2">예: 함수, 인수분해, 확률</span>
                    </div>
                    <button onClick={saveTags} disabled={savingTags}
                      className="text-xs bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors">
                      {savingTags ? "저장 중..." : "태그·팁 저장"}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-2">
                    {answers.map((_, idx) => (
                      <div key={idx} className="flex flex-col gap-1">
                        <span className="text-xs text-gray-400 dark:text-gray-500">{idx + 1}번</span>
                        <input
                          value={tags[idx + 1] ?? ""}
                          onChange={(e) => setTags({ ...tags, [idx + 1]: e.target.value })}
                          placeholder="유형 입력"
                          className="border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-purple-500"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* 문항별 학습팁 (AI 생성 or 수동) */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">문항별 학습 가이드</span>
                    <span className="text-xs text-gray-400 dark:text-gray-500">오답 시 리포트에 표시되는 학습 조언</span>
                  </div>
                  <div className="space-y-1.5">
                    {answers.map((_, idx) => (
                      <div key={idx} className="flex items-start gap-2">
                        <span className="text-xs text-gray-400 dark:text-gray-500 w-8 pt-1.5 shrink-0">{idx + 1}번</span>
                        <input
                          value={tips[idx + 1] ?? ""}
                          onChange={(e) => setTips({ ...tips, [idx + 1]: e.target.value })}
                          placeholder="학습 조언 (AI 분석 후 자동 입력됨)"
                          className="flex-1 border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-violet-500"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
