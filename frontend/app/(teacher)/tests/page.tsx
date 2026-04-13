"use client";
import { useEffect, useState } from "react";
import { apiFetch, apiHeaders, Test } from "@/lib/api";

const GRADES = ["초1","초2","초3","초4","초5","초6","중1","중2","중3","고1","고2","고3"];
const SUBJECTS = ["수학","영어","국어","과학","사회"];
const inputCls = "border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500";
const selectCls = inputCls;

export default function TestsPage() {
  const [tests, setTests] = useState<Test[]>([]);
  const [form, setForm] = useState({
    title: "", grade: "중1", subject: "수학",
    question_count: 20, test_date: new Date().toISOString().split("T")[0],
  });
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [step, setStep] = useState<"info" | "answers">("info");
  const [error, setError] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [extractMsg, setExtractMsg] = useState("");

  const [tagTestId, setTagTestId] = useState<number | null>(null);
  const [tags, setTags] = useState<Record<string, string>>({});
  const [tagSaving, setTagSaving] = useState(false);

  const [editTestId, setEditTestId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ title: "", grade: "중1", subject: "수학", test_date: "" });
  const [editSaving, setEditSaving] = useState(false);

  const load = () => apiFetch<Test[]>("/tests").then(setTests).catch(() => {});
  useEffect(() => { load(); }, []);

  const initAnswers = (count: number) => {
    const a: Record<string, string> = {};
    for (let i = 1; i <= count; i++) a[String(i)] = "";
    setAnswers(a);
  };

  const extractFromPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setExtracting(true);
    setExtractMsg("");
    try {
      const formData = new FormData();
      formData.append("pdf", file);
      const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
      const res = await fetch(`${BASE}/api/tests/extract-pdf`, { method: "POST", body: formData, headers: apiHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? "추출 실패");
      setAnswers(data.answers);
      if (data.question_count !== form.question_count) {
        setForm((f) => ({ ...f, question_count: data.question_count }));
      }
      setExtractMsg(`${data.ai === "claude" ? "Claude" : "Grok"}가 ${data.question_count}문항 정답을 추출했습니다. 확인 후 저장하세요.`);
    } catch (err: unknown) {
      setExtractMsg(err instanceof Error ? err.message : "오류 발생");
    } finally {
      setExtracting(false);
      e.target.value = "";
    }
  };

  const handleInfoNext = (e: React.FormEvent) => {
    e.preventDefault();
    initAnswers(form.question_count);
    setStep("answers");
  };

  const submit = async () => {
    setError("");
    const missing = Object.entries(answers).filter(([, v]) => !v.trim());
    if (missing.length > 0) {
      setError(`${missing[0][0]}번 문항 정답이 비어있습니다`);
      return;
    }
    try {
      await apiFetch("/tests", {
        method: "POST",
        body: JSON.stringify({ ...form, answers }),
      });
      setStep("info");
      setForm({ title: "", grade: "중1", subject: "수학", question_count: 20, test_date: new Date().toISOString().split("T")[0] });
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "오류가 발생했습니다");
    }
  };

  const startEditTest = (t: Test) => {
    setEditTestId(t.id);
    setEditForm({ title: t.title, grade: t.grade, subject: t.subject, test_date: String(t.test_date) });
  };

  const saveEditTest = async () => {
    if (!editTestId) return;
    const t = tests.find((x) => x.id === editTestId);
    if (!t) return;
    setEditSaving(true);
    try {
      await apiFetch(`/tests/${editTestId}`, {
        method: "PUT",
        body: JSON.stringify({ ...editForm, question_count: t.question_count, answers: t.answers }),
      });
      setEditTestId(null);
      load();
    } finally {
      setEditSaving(false);
    }
  };

  const del = async (id: number) => {
    if (!confirm("삭제하시겠습니까?")) return;
    await apiFetch(`/tests/${id}`, { method: "DELETE" });
    if (tagTestId === id) setTagTestId(null);
    load();
  };

  const loadTags = async (t: Test) => {
    if (tagTestId === t.id) { setTagTestId(null); return; }
    setTagTestId(t.id);
    const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
    const res = await fetch(`${BASE}/api/tests/${t.id}/tags`, { headers: apiHeaders() });
    const data = await res.json();
    const init: Record<string, string> = {};
    for (let i = 1; i <= t.question_count; i++) init[String(i)] = data[String(i)] ?? "";
    setTags(init);
  };

  const saveTags = async () => {
    if (!tagTestId) return;
    setTagSaving(true);
    const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
    await fetch(`${BASE}/api/tests/${tagTestId}/tags`, {
      method: "PUT",
      headers: apiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(tags),
    });
    setTagSaving(false);
  };

  return (
    <div>
      <h1 className="text-xl font-bold mb-6 text-gray-900 dark:text-gray-100">테스트 관리</h1>

      {step === "info" ? (
        <form onSubmit={handleInfoNext} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5 mb-6 flex flex-wrap gap-3 items-end shadow-sm">
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">테스트명 *</label>
            <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
              className={inputCls + " w-64"} placeholder="2025년 3월 고1 수학" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">학년</label>
            <select value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })} className={selectCls}>
              {GRADES.map((g) => <option key={g}>{g}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">과목</label>
            <select value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} className={selectCls}>
              {SUBJECTS.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">문항 수</label>
            <input type="number" min={1} max={100} value={form.question_count}
              onChange={(e) => setForm({ ...form, question_count: Number(e.target.value) })}
              className={inputCls + " w-20"} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">시행일</label>
            <input type="date" value={form.test_date} onChange={(e) => setForm({ ...form, test_date: e.target.value })}
              className={inputCls} />
          </div>
          <button className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors shadow-sm">
            다음: 정답 입력 →
          </button>
        </form>
      ) : (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5 mb-6 shadow-sm">
          <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
            <h2 className="font-semibold text-gray-800 dark:text-gray-100">정답 입력 — {form.title}</h2>
            <div className="flex gap-2 items-center">
              <label className={`text-xs px-3 py-1.5 rounded-lg cursor-pointer border transition-colors ${extracting ? "opacity-50 cursor-not-allowed bg-gray-100 dark:bg-gray-700 border-gray-200 dark:border-gray-600" : "bg-amber-50 dark:bg-amber-900/30 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/50"}`}>
                {extracting ? "AI 추출 중..." : "PDF로 가져오기"}
                <input type="file" accept=".pdf" className="hidden" disabled={extracting} onChange={extractFromPdf} />
              </label>
              <button onClick={() => setStep("info")} className="text-sm text-gray-500 dark:text-gray-400 hover:underline">← 뒤로</button>
            </div>
          </div>
          {extractMsg && (
            <p className={`text-xs mb-3 px-3 py-2 rounded-lg ${extractMsg.includes("추출했습니다") ? "bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400" : "bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400"}`}>
              {extractMsg}
            </p>
          )}
          <div className="grid grid-cols-5 sm:grid-cols-8 gap-2 mb-4">
            {Object.keys(answers).map((no) => (
              <div key={no} className="flex flex-col items-center gap-1">
                <span className="text-xs text-gray-400 dark:text-gray-500">{no}번</span>
                <input
                  value={answers[no]}
                  onChange={(e) => setAnswers({ ...answers, [no]: e.target.value })}
                  className="border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1 text-sm w-14 text-center bg-white dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  placeholder="정답"
                  maxLength={10}
                />
              </div>
            ))}
          </div>
          {error && <p className="text-red-500 dark:text-red-400 text-sm mb-2">{error}</p>}
          <button onClick={submit} className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm">
            테스트 저장
          </button>
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
            <tr>
              {["테스트명","학년","과목","문항수","시행일",""].map((h) => (
                <th key={h} className="text-left px-4 py-3 font-semibold text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {tests.map((t) => (
              <>
                {editTestId === t.id ? (
                  <tr key={t.id} className="bg-amber-50 dark:bg-amber-950/20">
                    <td className="px-3 py-2">
                      <input value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                        className={inputCls + " w-48"} />
                    </td>
                    <td className="px-3 py-2">
                      <select value={editForm.grade} onChange={(e) => setEditForm({ ...editForm, grade: e.target.value })} className={selectCls}>
                        {GRADES.map((g) => <option key={g}>{g}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <select value={editForm.subject} onChange={(e) => setEditForm({ ...editForm, subject: e.target.value })} className={selectCls}>
                        {SUBJECTS.map((s) => <option key={s}>{s}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-gray-400 dark:text-gray-500 text-sm">{t.question_count}문항</td>
                    <td className="px-3 py-2">
                      <input type="date" value={editForm.test_date} onChange={(e) => setEditForm({ ...editForm, test_date: e.target.value })}
                        className={inputCls} />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap space-x-2">
                      <button onClick={saveEditTest} disabled={editSaving} className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium disabled:opacity-50">
                        {editSaving ? "저장 중" : "저장"}
                      </button>
                      <button onClick={() => setEditTestId(null)} className="text-xs text-gray-400 hover:underline">취소</button>
                    </td>
                  </tr>
                ) : (
                <tr key={t.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{t.title}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{t.grade}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{t.subject}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{t.question_count}문항</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{t.test_date}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <button onClick={() => startEditTest(t)} className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline mr-3 font-medium">수정</button>
                    <button onClick={() => loadTags(t)} className="text-xs text-purple-600 dark:text-purple-400 hover:underline mr-3 font-medium">
                      {tagTestId === t.id ? "태그 닫기" : "태그 설정"}
                    </button>
                    <button onClick={() => del(t.id)} className="text-xs text-red-500 dark:text-red-400 hover:underline font-medium">삭제</button>
                  </td>
                </tr>
                )}
                {tagTestId === t.id && (
                  <tr key={`tag-${t.id}`}>
                    <td colSpan={6} className="px-4 py-4 bg-purple-50 dark:bg-purple-950/30 border-t border-purple-200 dark:border-purple-800">
                      <div className="flex justify-between items-center mb-3">
                        <span className="text-sm font-semibold text-purple-700 dark:text-purple-400">문항별 유형 태그</span>
                        <button onClick={saveTags} disabled={tagSaving} className="text-xs bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors">
                          {tagSaving ? "저장 중..." : "저장"}
                        </button>
                      </div>
                      <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-2">
                        {Object.keys(tags).map((no) => (
                          <div key={no} className="flex flex-col gap-1">
                            <span className="text-xs text-gray-500 dark:text-gray-400 text-center">{no}번</span>
                            <input
                              value={tags[no]}
                              onChange={(e) => setTags({ ...tags, [no]: e.target.value })}
                              className="border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1 text-xs w-full text-center bg-white dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-purple-500"
                              placeholder="유형"
                            />
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
            {tests.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400 dark:text-gray-500">테스트가 없습니다</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
