"use client";
import { useEffect, useState, Suspense, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { apiFetch, apiHeaders, Student, WordTest, TutoringSession } from "@/lib/api";
import Link from "next/link";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const inputCls = "border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500";
const selectCls = inputCls;

function WordTutoringContent() {
  const searchParams = useSearchParams();
  const presetStudentId = searchParams.get("student_id");

  const [sessions, setSessions] = useState<TutoringSession[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [wordTests, setWordTests] = useState<WordTest[]>([]);
  const [filterStudentId, setFilterStudentId] = useState(presetStudentId ?? "");
  const [addOpen, setAddOpen] = useState(!!presetStudentId);
  const [form, setForm] = useState({
    student_id: presetStudentId ?? "", word_test_id: "",
    session_date: new Date().toISOString().split("T")[0],
    attempt1_total: "", attempt1_wrong: "",
    attempt2_total: "", attempt2_wrong: "",
    attempt3_total: "", attempt3_wrong: "",
    memo: "",
  });
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<typeof form | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [gradingAttempt, setGradingAttempt] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);
  const quickFileInputRef = useRef<HTMLInputElement>(null);
  const [quickGrading, setQuickGrading] = useState<{ sessionId: number; attemptNo: number } | null>(null);

  const load = async () => {
    const q = filterStudentId ? `?student_id=${filterStudentId}` : "";
    const [s, st, wt] = await Promise.all([
      apiFetch<TutoringSession[]>(`/word-tutoring${q}`),
      apiFetch<Student[]>("/students"),
      apiFetch<WordTest[]>("/word-tests"),
    ]);
    setSessions(s); setStudents(st); setWordTests(wt);
  };

  useEffect(() => { load(); }, [filterStudentId]);

  const num = (v: string) => v !== "" ? Number(v) : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch("/word-tutoring", {
        method: "POST",
        body: JSON.stringify({
          student_id: Number(form.student_id), word_test_id: form.word_test_id ? Number(form.word_test_id) : null,
          session_date: form.session_date,
          attempt1_total: num(form.attempt1_total), attempt1_wrong: num(form.attempt1_wrong),
          attempt2_total: num(form.attempt2_total), attempt2_wrong: num(form.attempt2_wrong),
          attempt3_total: num(form.attempt3_total), attempt3_wrong: num(form.attempt3_wrong),
          memo: form.memo || null,
        }),
      });
      setAddOpen(false);
      setForm({ student_id: "", word_test_id: "", session_date: new Date().toISOString().split("T")[0],
        attempt1_total: "", attempt1_wrong: "", attempt2_total: "", attempt2_wrong: "",
        attempt3_total: "", attempt3_wrong: "", memo: "" });
      load();
    } finally { setSaving(false); }
  };

  const startEdit = (s: TutoringSession) => {
    setEditId(s.id);
    setEditForm({
      student_id: String(s.student_id),
      word_test_id: s.word_test_id ? String(s.word_test_id) : "",
      session_date: s.session_date,
      attempt1_total: s.attempt1_total != null ? String(s.attempt1_total) : "",
      attempt1_wrong: s.attempt1_wrong != null ? String(s.attempt1_wrong) : "",
      attempt2_total: s.attempt2_total != null ? String(s.attempt2_total) : "",
      attempt2_wrong: s.attempt2_wrong != null ? String(s.attempt2_wrong) : "",
      attempt3_total: s.attempt3_total != null ? String(s.attempt3_total) : "",
      attempt3_wrong: s.attempt3_wrong != null ? String(s.attempt3_wrong) : "",
      memo: s.memo ?? "",
    });
  };

  const saveEdit = async () => {
    if (!editId || !editForm) return;
    setEditSaving(true);
    try {
      await apiFetch(`/word-tutoring/${editId}`, {
        method: "PUT",
        body: JSON.stringify({
          student_id: Number(editForm.student_id),
          word_test_id: editForm.word_test_id ? Number(editForm.word_test_id) : null,
          session_date: editForm.session_date,
          attempt1_total: num(editForm.attempt1_total), attempt1_wrong: num(editForm.attempt1_wrong),
          attempt2_total: num(editForm.attempt2_total), attempt2_wrong: num(editForm.attempt2_wrong),
          attempt3_total: num(editForm.attempt3_total), attempt3_wrong: num(editForm.attempt3_wrong),
          memo: editForm.memo || null,
        }),
      });
      setEditId(null);
      setEditForm(null);
      load();
    } finally {
      setEditSaving(false); }
  };

  const handleAiGrade = async (file: File, attemptNo: number, isEdit: boolean) => {
    const testId = isEdit ? editForm?.word_test_id : form.word_test_id;
    if (!testId) { alert("단어시험을 먼저 선택하세요."); return; }
    setGradingAttempt(attemptNo);
    try {
      const fd = new FormData();
      fd.append("word_test_id", testId);
      fd.append("image", file);
      const res = await fetch(`${BASE}/api/word-tutoring/grade-image`, { method: "POST", body: fd, headers: apiHeaders() });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail ?? "AI 채점 실패"); }
      const data: { total: number; correct: number; wrong: number } = await res.json();
      const totalKey = `attempt${attemptNo}_total` as keyof typeof form;
      const wrongKey = `attempt${attemptNo}_wrong` as keyof typeof form;
      if (isEdit && editForm) {
        setEditForm({ ...editForm, [totalKey]: String(data.total), [wrongKey]: String(data.wrong) });
      } else {
        setForm((f) => ({ ...f, [totalKey]: String(data.total), [wrongKey]: String(data.wrong) }));
      }
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "AI 채점 실패");
    } finally {
      setGradingAttempt(null);
    }
  };

  // 목록에서 바로 채점 후 즉시 저장
  const handleQuickGrade = async (file: File) => {
    if (!quickGrading) return;
    const { sessionId, attemptNo } = quickGrading;
    const s = sessions.find((x) => x.id === sessionId);
    if (!s || !s.word_test_id) return;
    setQuickGrading({ sessionId, attemptNo }); // keep state for loading indicator
    try {
      const fd = new FormData();
      fd.append("word_test_id", String(s.word_test_id));
      fd.append("image", file);
      const res = await fetch(`${BASE}/api/word-tutoring/grade-image`, { method: "POST", body: fd, headers: apiHeaders() });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail ?? "AI 채점 실패"); }
      const data: { total: number; correct: number; wrong: number } = await res.json();
      const patch: Record<string, number | null> = {
        [`attempt${attemptNo}_total`]: data.total,
        [`attempt${attemptNo}_wrong`]: data.wrong,
      };
      await apiFetch(`/word-tutoring/${sessionId}`, {
        method: "PUT",
        body: JSON.stringify({
          student_id: s.student_id,
          word_test_id: s.word_test_id,
          session_date: s.session_date,
          attempt1_total: s.attempt1_total, attempt1_wrong: s.attempt1_wrong,
          attempt2_total: s.attempt2_total, attempt2_wrong: s.attempt2_wrong,
          attempt3_total: s.attempt3_total, attempt3_wrong: s.attempt3_wrong,
          memo: s.memo,
          ...patch,
        }),
      });
      load();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "AI 채점 실패");
    } finally {
      setQuickGrading(null);
    }
  };

  const del = async (id: number) => {
    if (!confirm("삭제하시겠습니까?")) return;
    await apiFetch(`/word-tutoring/${id}`, { method: "DELETE" });
    load();
  };

  const AttemptCell = ({ total, wrong }: { total: number | null; wrong: number | null }) => {
    if (total == null) return <span className="text-gray-300 dark:text-gray-600">-</span>;
    return (
      <span className={wrong === 0 ? "text-green-600 dark:text-green-400 font-semibold" : "text-red-500 dark:text-red-400"}>
        {wrong != null ? `${wrong}개 오답` : "-"}/{total}
      </span>
    );
  };

  const exportExcel = () => {
    const q = filterStudentId ? `?student_id=${filterStudentId}` : "";
    window.open(`${BASE}/api/word-tutoring/export/excel${q}`, "_blank");
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">영어단어 튜터링 기록</h1>
        <button onClick={exportExcel}
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm">
          엑셀 내보내기
        </button>
      </div>

      <div className="flex flex-wrap gap-3 items-end mb-4">
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">원생 필터</label>
          <select value={filterStudentId} onChange={(e) => setFilterStudentId(e.target.value)} className={selectCls}>
            <option value="">전체 원생</option>
            {students.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.grade})</option>)}
          </select>
        </div>
        <button onClick={() => setAddOpen(!addOpen)}
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors ml-auto shadow-sm">
          + 기록 추가
        </button>
      </div>

      {addOpen && (
        <form onSubmit={submit} className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl p-5 mb-6 shadow-sm">
          <div className="flex flex-wrap gap-3 items-end mb-4">
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">원생 *</label>
              <select required value={form.student_id} onChange={(e) => setForm({ ...form, student_id: e.target.value })} className={selectCls}>
                <option value="">선택</option>
                {students.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.grade})</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">단어시험</label>
              <select value={form.word_test_id} onChange={(e) => setForm({ ...form, word_test_id: e.target.value })} className={selectCls}>
                <option value="">없음</option>
                {wordTests.map((w) => <option key={w.id} value={w.id}>{w.title}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">날짜 *</label>
              <input type="date" required value={form.session_date} onChange={(e) => setForm({ ...form, session_date: e.target.value })} className={inputCls} />
            </div>
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f && gradingAttempt) handleAiGrade(f, gradingAttempt, false); e.target.value = ""; }} />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            {[
              { label: "1차 시험", totalKey: "attempt1_total", wrongKey: "attempt1_wrong", no: 1 },
              { label: "2차 시험", totalKey: "attempt2_total", wrongKey: "attempt2_wrong", no: 2 },
              { label: "3차 시험", totalKey: "attempt3_total", wrongKey: "attempt3_wrong", no: 3 },
            ].map(({ label, totalKey, wrongKey, no }) => (
              <div key={label} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">{label}</p>
                  <button type="button"
                    disabled={gradingAttempt !== null}
                    onClick={() => { setGradingAttempt(no); fileInputRef.current?.click(); }}
                    className="text-xs px-2 py-0.5 rounded-md bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-400 hover:bg-violet-200 dark:hover:bg-violet-900/60 disabled:opacity-50 transition-colors font-medium">
                    {gradingAttempt === no ? "채점 중..." : "AI 채점"}
                  </button>
                </div>
                <div className="flex gap-2 items-center">
                  <div>
                    <label className="block text-xs text-gray-400 dark:text-gray-500 mb-1">전체</label>
                    <input type="number" min={0} value={(form as Record<string, string>)[totalKey]}
                      onChange={(e) => setForm({ ...form, [totalKey]: e.target.value })}
                      className={inputCls + " w-16"} placeholder="n개" />
                  </div>
                  <span className="text-gray-300 dark:text-gray-600 mt-4">중</span>
                  <div>
                    <label className="block text-xs text-gray-400 dark:text-gray-500 mb-1">오답</label>
                    <input type="number" min={0} value={(form as Record<string, string>)[wrongKey]}
                      onChange={(e) => setForm({ ...form, [wrongKey]: e.target.value })}
                      className={inputCls + " w-16"} placeholder="n개" />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-3 items-end flex-wrap">
            <div className="flex-1 min-w-48">
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">메모</label>
              <input value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })}
                className={inputCls + " w-full"} placeholder="특이사항 등" />
            </div>
            <button type="submit" disabled={saving}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 shadow-sm">
              {saving ? "저장 중..." : "저장"}
            </button>
            <button type="button" onClick={() => setAddOpen(false)} className="text-sm text-gray-500 dark:text-gray-400 hover:underline">취소</button>
          </div>
        </form>
      )}

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
                {["날짜","원생","단어시험","1차","2차","3차","메모",""].map((h) => (
                  <th key={h} className="text-left px-3 py-3 font-semibold text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {sessions.map((s) => editId === s.id && editForm ? (
                <tr key={s.id} className="bg-amber-50 dark:bg-amber-950/20">
                  <td className="px-2 py-2">
                    <input type="date" value={editForm.session_date} onChange={(e) => setEditForm({ ...editForm, session_date: e.target.value })}
                      className={inputCls + " w-32"} />
                  </td>
                  <td className="px-2 py-2">
                    <select value={editForm.student_id} onChange={(e) => setEditForm({ ...editForm, student_id: e.target.value })} className={selectCls}>
                      {students.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-2">
                    <select value={editForm.word_test_id} onChange={(e) => setEditForm({ ...editForm, word_test_id: e.target.value })} className={selectCls}>
                      <option value="">없음</option>
                      {wordTests.map((w) => <option key={w.id} value={w.id}>{w.title}</option>)}
                    </select>
                  </td>
                  <input ref={editFileInputRef} type="file" accept="image/*" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f && gradingAttempt) handleAiGrade(f, gradingAttempt, true); e.target.value = ""; }} />
                  {([["attempt1",1],["attempt2",2],["attempt3",3]] as const).map(([a, no]) => (
                    <td key={a} className="px-2 py-2">
                      <div className="flex flex-col gap-1">
                        <div className="flex gap-1 items-center">
                          <input type="number" min={0} value={(editForm as Record<string, string>)[`${a}_total`]}
                            onChange={(e) => setEditForm({ ...editForm, [`${a}_total`]: e.target.value })}
                            className={inputCls + " w-14"} placeholder="전체" />
                          <span className="text-gray-400 text-xs">/</span>
                          <input type="number" min={0} value={(editForm as Record<string, string>)[`${a}_wrong`]}
                            onChange={(e) => setEditForm({ ...editForm, [`${a}_wrong`]: e.target.value })}
                            className={inputCls + " w-14"} placeholder="오답" />
                        </div>
                        <button type="button" disabled={gradingAttempt !== null}
                          onClick={() => { setGradingAttempt(no); editFileInputRef.current?.click(); }}
                          className="text-xs px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-400 hover:bg-violet-200 disabled:opacity-50 transition-colors font-medium">
                          {gradingAttempt === no ? "채점 중..." : "AI 채점"}
                        </button>
                      </div>
                    </td>
                  ))}
                  <td className="px-2 py-2">
                    <input value={editForm.memo} onChange={(e) => setEditForm({ ...editForm, memo: e.target.value })}
                      className={inputCls + " w-28"} />
                  </td>
                  <td className="px-2 py-2 whitespace-nowrap space-x-2">
                    <button onClick={saveEdit} disabled={editSaving} className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium disabled:opacity-50">
                      {editSaving ? "저장 중" : "저장"}
                    </button>
                    <button onClick={() => { setEditId(null); setEditForm(null); }} className="text-xs text-gray-400 hover:underline">취소</button>
                  </td>
                </tr>
              ) : (
                <tr key={s.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  <td className="px-3 py-3 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">{s.session_date}</td>
                  <td className="px-3 py-3 font-medium">
                    <Link href={`/students/${s.student_id}`} className="text-indigo-600 dark:text-indigo-400 hover:underline">{s.student_name}</Link>
                  </td>
                  <td className="px-3 py-3 text-gray-600 dark:text-gray-400">{s.word_test_title ?? "-"}</td>
                  {([1, 2, 3] as const).map((no) => {
                    const total = s[`attempt${no}_total` as keyof typeof s] as number | null;
                    const wrong = s[`attempt${no}_wrong` as keyof typeof s] as number | null;
                    const isGrading = quickGrading?.sessionId === s.id && quickGrading.attemptNo === no;
                    return (
                      <td key={no} className="px-3 py-3">
                        <div className="flex flex-col gap-1">
                          <AttemptCell total={total} wrong={wrong} />
                          {s.word_test_id && (
                            <button
                              disabled={quickGrading !== null}
                              onClick={() => { setQuickGrading({ sessionId: s.id, attemptNo: no }); quickFileInputRef.current?.click(); }}
                              className="text-xs px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-400 hover:bg-violet-200 dark:hover:bg-violet-900/60 disabled:opacity-50 transition-colors font-medium w-fit">
                              {isGrading ? "채점 중..." : "AI 채점"}
                            </button>
                          )}
                        </div>
                      </td>
                    );
                  })}
                  <td className="px-3 py-3 text-gray-500 dark:text-gray-400 max-w-xs truncate">{s.memo ?? "-"}</td>
                  <td className="px-3 py-3 whitespace-nowrap space-x-2">
                    <button onClick={() => startEdit(s)} className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium">수정</button>
                    <button onClick={() => del(s.id)} className="text-xs text-red-500 dark:text-red-400 hover:underline font-medium">삭제</button>
                  </td>
                </tr>
              ))}
              {sessions.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-400 dark:text-gray-500">기록이 없습니다</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <input ref={quickFileInputRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleQuickGrade(f); e.target.value = ""; }} />
    </div>
  );
}

export default function WordTutoringPage() {
  return (
    <Suspense fallback={<div className="text-gray-400 py-20 text-center">불러오는 중...</div>}>
      <WordTutoringContent />
    </Suspense>
  );
}
