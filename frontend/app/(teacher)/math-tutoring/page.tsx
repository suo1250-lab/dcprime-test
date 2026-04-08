"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

const inputCls = "border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-orange-500";

interface Student { id: number; name: string; grade: string; }
interface MathTest { id: number; title: string; grade: string; }

interface MathTutoringSession {
  id: number;
  student_id: number;
  student_name: string;
  math_test_id: number;
  math_test_title: string;
  session_date: string;
  attempt1_score: number | null;
  attempt1_total: number | null;
  attempt2_score: number | null;
  attempt2_total: number | null;
  attempt3_score: number | null;
  attempt3_total: number | null;
  memo: string;
}

export default function MathTutoringPage() {
  const [sessions, setSessions] = useState<MathTutoringSession[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [mathTests, setMathTests] = useState<MathTest[]>([]);
  const [filterStudentId, setFilterStudentId] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({
    student_id: "", math_test_id: "",
    session_date: new Date().toISOString().split("T")[0],
    attempt1_score: "", attempt1_total: "",
    attempt2_score: "", attempt2_total: "",
    attempt3_score: "", attempt3_total: "",
    memo: "",
  });
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);

  const load = () => {
    apiFetch<Student[]>("/students").then(setStudents).catch(() => {});
    apiFetch<MathTest[]>("/math-tests").then(setMathTests).catch(() => {});
    const q = filterStudentId ? `?student_id=${filterStudentId}` : "";
    apiFetch<MathTutoringSession[]>(`/math-tutoring${q}`).then(setSessions).catch(() => {});
  };

  useEffect(() => { load(); }, [filterStudentId]); // eslint-disable-line react-hooks/exhaustive-deps

  const resetForm = () => setForm({
    student_id: "", math_test_id: "",
    session_date: new Date().toISOString().split("T")[0],
    attempt1_score: "", attempt1_total: "",
    attempt2_score: "", attempt2_total: "",
    attempt3_score: "", attempt3_total: "",
    memo: "",
  });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const body = {
        student_id: Number(form.student_id),
        math_test_id: Number(form.math_test_id),
        session_date: form.session_date,
        attempt1_score: form.attempt1_score ? Number(form.attempt1_score) : null,
        attempt1_total: form.attempt1_total ? Number(form.attempt1_total) : null,
        attempt2_score: form.attempt2_score ? Number(form.attempt2_score) : null,
        attempt2_total: form.attempt2_total ? Number(form.attempt2_total) : null,
        attempt3_score: form.attempt3_score ? Number(form.attempt3_score) : null,
        attempt3_total: form.attempt3_total ? Number(form.attempt3_total) : null,
        memo: form.memo,
      };
      if (editId) {
        await apiFetch(`/math-tutoring/${editId}`, { method: "PUT", body: JSON.stringify(body) });
      } else {
        await apiFetch("/math-tutoring", { method: "POST", body: JSON.stringify(body) });
      }
      setAddOpen(false);
      setEditId(null);
      resetForm();
      load();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (s: MathTutoringSession) => {
    setEditId(s.id);
    setForm({
      student_id: String(s.student_id),
      math_test_id: String(s.math_test_id),
      session_date: s.session_date,
      attempt1_score: s.attempt1_score != null ? String(s.attempt1_score) : "",
      attempt1_total: s.attempt1_total != null ? String(s.attempt1_total) : "",
      attempt2_score: s.attempt2_score != null ? String(s.attempt2_score) : "",
      attempt2_total: s.attempt2_total != null ? String(s.attempt2_total) : "",
      attempt3_score: s.attempt3_score != null ? String(s.attempt3_score) : "",
      attempt3_total: s.attempt3_total != null ? String(s.attempt3_total) : "",
      memo: s.memo ?? "",
    });
    setAddOpen(true);
  };

  const deleteSession = async (id: number) => {
    if (!confirm("삭제하시겠습니까?")) return;
    try {
      await apiFetch(`/math-tutoring/${id}`, { method: "DELETE" });
    } catch (e: unknown) {
      if (!(e instanceof Error && e.message === "Not found")) {
        alert(e instanceof Error ? e.message : "삭제 실패");
      }
    }
    load();
  };

  const scoreCell = (score: number | null, total: number | null) => {
    if (score == null) return <span className="text-gray-300 dark:text-gray-600">-</span>;
    return <span className="font-medium">{score}{total != null ? `/${total}` : ""}</span>;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">수학 튜터링 기록</h1>
        <button onClick={() => { setAddOpen(!addOpen); setEditId(null); resetForm(); }}
          className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors shadow-sm">
          {addOpen && !editId ? "취소" : "+ 기록 추가"}
        </button>
      </div>

      {/* 등록/수정 폼 */}
      {addOpen && (
        <form onSubmit={save} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5 mb-6 shadow-sm">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">{editId ? "기록 수정" : "새 기록 추가"}</p>
          <div className="flex flex-wrap gap-3 mb-4">
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">학생 *</label>
              <select required value={form.student_id} onChange={(e) => setForm({ ...form, student_id: e.target.value })} className={inputCls + " w-40"}>
                <option value="">선택...</option>
                {students.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.grade})</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">시험 *</label>
              <select required value={form.math_test_id} onChange={(e) => setForm({ ...form, math_test_id: e.target.value })} className={inputCls + " w-48"}>
                <option value="">선택...</option>
                {mathTests.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">날짜 *</label>
              <input required type="date" value={form.session_date} onChange={(e) => setForm({ ...form, session_date: e.target.value })} className={inputCls} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            {([1, 2, 3] as const).map((attempt) => (
              <div key={attempt} className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">{attempt}차 시험</p>
                <div className="flex gap-2">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">점수</label>
                    <input type="number" min={0} value={form[`attempt${attempt}_score`]}
                      onChange={(e) => setForm({ ...form, [`attempt${attempt}_score`]: e.target.value })}
                      className={inputCls + " w-16"} placeholder="0" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">총점</label>
                    <input type="number" min={0} value={form[`attempt${attempt}_total`]}
                      onChange={(e) => setForm({ ...form, [`attempt${attempt}_total`]: e.target.value })}
                      className={inputCls + " w-16"} placeholder="100" />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mb-4">
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">메모</label>
            <input value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })}
              className={inputCls + " w-full"} placeholder="특이사항 입력" />
          </div>

          <button type="submit" disabled={saving}
            className="bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors">
            {saving ? "저장 중..." : "저장"}
          </button>
        </form>
      )}

      {/* 필터 */}
      <div className="flex gap-3 mb-4 items-center">
        <span className="text-sm text-gray-500 dark:text-gray-400">학생 필터:</span>
        <select value={filterStudentId} onChange={(e) => setFilterStudentId(e.target.value)} className={inputCls}>
          <option value="">전체</option>
          {students.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.grade})</option>)}
        </select>
      </div>

      {/* 기록 목록 */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden shadow-sm">
        {sessions.length === 0 ? (
          <div className="p-8 text-center text-gray-400 dark:text-gray-500">기록이 없습니다</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">학생</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">시험</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">날짜</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600 dark:text-gray-300">1차</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600 dark:text-gray-300">2차</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600 dark:text-gray-300">3차</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">메모</th>
                  <th className="w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {sessions.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-800 dark:text-gray-100">{s.student_name}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 text-xs">{s.math_test_title}</td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">{s.session_date}</td>
                    <td className="px-4 py-3 text-center text-gray-700 dark:text-gray-300">{scoreCell(s.attempt1_score, s.attempt1_total)}</td>
                    <td className="px-4 py-3 text-center text-gray-700 dark:text-gray-300">{scoreCell(s.attempt2_score, s.attempt2_total)}</td>
                    <td className="px-4 py-3 text-center text-gray-700 dark:text-gray-300">{scoreCell(s.attempt3_score, s.attempt3_total)}</td>
                    <td className="px-4 py-3 text-xs text-gray-400 dark:text-gray-500">{s.memo}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button onClick={() => startEdit(s)} className="text-xs text-indigo-500 dark:text-indigo-400 hover:underline">수정</button>
                        <button onClick={() => deleteSession(s.id)} className="text-xs text-red-500 dark:text-red-400 hover:underline">삭제</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
