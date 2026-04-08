"use client";
import { useEffect, useState } from "react";
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
}

export default function MathTestsPage() {
  const [tests, setTests] = useState<MathTest[]>([]);
  const [form, setForm] = useState({ title: "", grade: "중1", test_date: "", num_questions: 20 });
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [editingMeta, setEditingMeta] = useState<number | null>(null);
  const [metaForm, setMetaForm] = useState({ title: "", grade: "중1", test_date: "", num_questions: 20 });
  const [savingMeta, setSavingMeta] = useState(false);

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
    if (expandedId === t.id) { setExpandedId(null); setAnswers([]); return; }
    setExpandedId(t.id);
    try {
      const d = await apiFetch<{ answers: number[] }>(`/math-tests/${t.id}/answers`);
      setAnswers(d.answers.length > 0 ? d.answers : Array(t.num_questions).fill(0));
    } catch {
      setAnswers(Array(t.num_questions).fill(0));
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

  const deleteTest = async (id: number) => {
    if (!confirm("시험을 삭제하시겠습니까?")) return;
    try {
      await apiFetch(`/math-tests/${id}`, { method: "DELETE" });
    } catch (e: unknown) {
      if (!(e instanceof Error && e.message === "Not found")) {
        alert(e instanceof Error ? e.message : "삭제 실패");
      }
    }
    if (expandedId === id) { setExpandedId(null); setAnswers([]); }
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
                  <span className="text-xs text-indigo-400 dark:text-indigo-500 ml-auto">{expandedId === t.id ? "▲ 접기" : "▼ 정답 등록"}</span>
                </button>
                <button onClick={() => startEditMeta(t)}
                  className="text-xs text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                  수정
                </button>
                <button onClick={() => deleteTest(t.id)} className="text-xs text-red-500 dark:text-red-400 hover:underline font-medium">삭제</button>
              </div>
            )}

            {/* 정답 등록 */}
            {expandedId === t.id && (
              <div className="border-t border-gray-200 dark:border-gray-700 px-5 py-4">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">정답 입력 (1~5)</span>
                  <button onClick={saveAnswers} disabled={saving}
                    className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors">
                    {saving ? "저장 중..." : "저장"}
                  </button>
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
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
