"use client";
import { useEffect, useState } from "react";
import { apiFetch, apiHeaders } from "@/lib/api";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const inputCls = "border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500";

interface MathTest {
  id: number;
  title: string;
  grade: string;
  num_questions: number;
  has_answers: boolean;
}

interface MathSubmission {
  id: number;
  student_name: string;
  test_id: number;
  test_title: string;
  score: number;
  total: number;
  status: "pending" | "graded" | "error";
  submitted_at: string;
}

interface AnswerDetail {
  question_no: number;
  student_answer: number | null;
  correct_answer: number;
  is_correct: boolean;
}

interface MathSubmissionDetail extends MathSubmission {
  items: AnswerDetail[];
}

export default function MathSubmissionsPage() {
  const [tests, setTests] = useState<MathTest[]>([]);
  const [submissions, setSubmissions] = useState<MathSubmission[]>([]);
  const [form, setForm] = useState({ student_name: "", test_id: "" });
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<MathSubmissionDetail | null>(null);
  const [filterTest, setFilterTest] = useState("");

  const load = () => {
    apiFetch<MathTest[]>("/math-tests").then(setTests).catch(() => {});
    const q = filterTest ? `?test_id=${filterTest}` : "";
    apiFetch<MathSubmission[]>(`/math-submissions${q}`).then(setSubmissions).catch(() => {});
  };

  useEffect(() => { load(); }, [filterTest]); // eslint-disable-line react-hooks/exhaustive-deps

  const upload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    setUploadMsg(null);
    try {
      const formData = new FormData();
      formData.append("image", file);
      formData.append("student_name", form.student_name);
      formData.append("test_id", form.test_id);
      const res = await fetch(`${BASE}/api/math-submissions`, { method: "POST", body: formData, headers: apiHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? "업로드 실패");
      setUploadMsg({ type: "success", msg: `✓ ${form.student_name} 제출 완료. AI 채점 중...` });
      setForm({ student_name: "", test_id: form.test_id });
      setFile(null);
      load();
    } catch (e: unknown) {
      setUploadMsg({ type: "error", msg: e instanceof Error ? e.message : "오류 발생" });
    } finally {
      setUploading(false);
    }
  };

  const toggleExpand = async (s: MathSubmission) => {
    if (expandedId === s.id) { setExpandedId(null); setDetail(null); return; }
    setExpandedId(s.id);
    try {
      const d = await apiFetch<MathSubmissionDetail>(`/math-submissions/${s.id}`);
      setDetail(d);
    } catch { setDetail(null); }
  };

  const deleteSubmission = async (id: number) => {
    if (!confirm("제출 기록을 삭제하시겠습니까?")) return;
    try {
      await apiFetch(`/math-submissions/${id}`, { method: "DELETE" });
    } catch (e: unknown) {
      if (!(e instanceof Error && e.message === "Not found")) {
        alert(e instanceof Error ? e.message : "삭제 실패");
      }
    }
    if (expandedId === id) { setExpandedId(null); setDetail(null); }
    load();
  };

  const statusBadge = (status: MathSubmission["status"]) => {
    if (status === "graded") return <span className="text-xs bg-green-50 dark:bg-green-900/40 text-green-600 dark:text-green-400 px-2 py-0.5 rounded-full">채점완료</span>;
    if (status === "pending") return <span className="text-xs bg-amber-50 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded-full">채점중</span>;
    return <span className="text-xs bg-red-50 dark:bg-red-900/40 text-red-600 dark:text-red-400 px-2 py-0.5 rounded-full">오류</span>;
  };

  return (
    <div>
      <h1 className="text-xl font-bold mb-6 text-gray-900 dark:text-gray-100">수학 OMR 채점</h1>

      {/* 업로드 폼 */}
      <form onSubmit={upload} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5 mb-6 shadow-sm">
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">OMR 답안지 업로드</p>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">학생 이름 *</label>
            <input required value={form.student_name} onChange={(e) => setForm({ ...form, student_name: e.target.value })}
              className={inputCls + " w-36"} placeholder="홍길동" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">시험 *</label>
            <select required value={form.test_id} onChange={(e) => setForm({ ...form, test_id: e.target.value })} className={inputCls + " w-52"}>
              <option value="">시험 선택...</option>
              {tests.filter((t) => t.has_answers).map((t) => (
                <option key={t.id} value={t.id}>{t.title} ({t.grade})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">OMR 이미지 *</label>
            <input required type="file" accept="image/*,.pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="text-sm text-gray-500 dark:text-gray-400 file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:bg-indigo-50 dark:file:bg-indigo-900/40 file:text-indigo-600 dark:file:text-indigo-400 hover:file:bg-indigo-100" />
          </div>
          <button disabled={uploading || !file}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors shadow-sm">
            {uploading ? "업로드 중..." : "업로드"}
          </button>
        </div>
        {uploadMsg && (
          <p className={`text-xs mt-3 px-3 py-2 rounded-lg ${uploadMsg.type === "success" ? "bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400" : "bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400"}`}>
            {uploadMsg.msg}
          </p>
        )}
      </form>

      {/* 필터 */}
      <div className="flex gap-3 mb-4 items-center">
        <span className="text-sm text-gray-500 dark:text-gray-400">시험 필터:</span>
        <select value={filterTest} onChange={(e) => setFilterTest(e.target.value)} className={inputCls}>
          <option value="">전체</option>
          {tests.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
        </select>
      </div>

      {/* 제출 목록 */}
      <div className="space-y-2">
        {submissions.length === 0 && (
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-8 text-center text-gray-400 dark:text-gray-500 shadow-sm">
            제출된 답안이 없습니다
          </div>
        )}
        {submissions.map((s) => (
          <div key={s.id} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden shadow-sm">
            <div className="flex items-center gap-4 px-5 py-3">
              <button onClick={() => toggleExpand(s)} className="flex-1 text-left flex items-center gap-3 hover:text-indigo-700 dark:hover:text-indigo-400 transition-colors">
                <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">{s.student_name}</span>
                <span className="text-xs text-gray-500 dark:text-gray-400">{s.test_title}</span>
                {statusBadge(s.status)}
                {s.status === "graded" && (
                  <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400">{s.score}/{s.total}</span>
                )}
                <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto">{s.submitted_at}</span>
                <span className="text-xs text-indigo-400 dark:text-indigo-500">{expandedId === s.id ? "▲" : "▼"}</span>
              </button>
              <button onClick={() => deleteSubmission(s.id)} className="text-xs text-red-500 dark:text-red-400 hover:underline font-medium">삭제</button>
            </div>

            {expandedId === s.id && detail && detail.id === s.id && (
              <div className="border-t border-gray-200 dark:border-gray-700 px-5 py-4">
                <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
                  {detail.items.map((a) => (
                    <div key={a.question_no} className={`flex flex-col items-center gap-1 p-2 rounded-lg ${a.is_correct ? "bg-green-50 dark:bg-green-900/30" : "bg-red-50 dark:bg-red-900/30"}`}>
                      <span className="text-xs text-gray-400 dark:text-gray-500">{a.question_no}번</span>
                      <span className={`font-bold text-base ${a.is_correct ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}`}>
                        {a.student_answer || "-"}
                      </span>
                      {!a.is_correct && (
                        <span className="text-xs text-gray-400 dark:text-gray-500">정답:{a.correct_answer}</span>
                      )}
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
