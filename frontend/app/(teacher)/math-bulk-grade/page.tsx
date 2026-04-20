"use client";
import { useEffect, useState, useRef } from "react";
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

interface BulkResult {
  id: number;
  filename: string;
}

interface BulkSubmission {
  id: number;
  student_name: string;
  status: "pending" | "graded" | "error";
  score: number | null;
  total: number | null;
  items?: {
    question_no: number;
    student_answer: number | null;
    correct_answer: number;
    is_correct: boolean;
  }[];
}

export default function MathBulkGradePage() {
  const [tests, setTests] = useState<MathTest[]>([]);
  const [testId, setTestId] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [results, setResults] = useState<BulkResult[]>([]);
  const [subs, setSubs] = useState<Record<number, BulkSubmission>>({});
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [regradeTestId, setRegradeTestId] = useState("");
  const [regrading, setRegrading] = useState(false);
  const [regradeMsg, setRegradeMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const regradeAll = async () => {
    if (!regradeTestId || !confirm("선택한 시험의 모든 제출을 재채점합니다. 계속할까요?")) return;
    setRegrading(true);
    setRegradeMsg(null);
    try {
      const data = await apiFetch<{ queued: number }>(`/math-submissions/regrade-all?test_id=${regradeTestId}`, { method: "POST" });
      setRegradeMsg({ type: "success", text: `${data.queued}개 재채점 시작됨. 잠시 후 결과 확인하세요.` });
    } catch (e: unknown) {
      setRegradeMsg({ type: "error", text: e instanceof Error ? e.message : "오류 발생" });
    } finally {
      setRegrading(false);
    }
  };

  useEffect(() => {
    apiFetch<MathTest[]>("/math-tests").then(setTests).catch(() => {});
  }, []);

  // pending 항목 5초마다 폴링
  useEffect(() => {
    const pendingIds = results
      .map((r) => r.id)
      .filter((id) => !subs[id] || subs[id].status === "pending");

    if (pendingIds.length === 0) {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }

    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const updates: Record<number, BulkSubmission> = {};
      await Promise.all(
        pendingIds.map(async (id) => {
          try {
            const s = await apiFetch<BulkSubmission>(`/math-submissions/${id}`);
            updates[id] = s;
          } catch {}
        })
      );
      setSubs((prev) => ({ ...prev, ...updates }));
    }, 5000);

    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [results, subs]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFiles(Array.from(e.target.files ?? []));
  };

  const upload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testId || files.length === 0) return;
    setUploading(true);
    setMsg(null);
    setResults([]);
    setSubs({});

    try {
      const formData = new FormData();
      formData.append("test_id", testId);
      files.forEach((f) => formData.append("images", f));

      const res = await fetch(`${BASE}/api/math-submissions/bulk`, {
        method: "POST",
        body: formData,
        headers: apiHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? "업로드 실패");

      setResults(data.submissions ?? []);
      setMsg({ type: "success", text: `${data.created}개 파일 채점 시작. AI 채점 중...` });
      setFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (e: unknown) {
      setMsg({ type: "error", text: e instanceof Error ? e.message : "오류 발생" });
    } finally {
      setUploading(false);
    }
  };

  const toggleExpand = async (id: number) => {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    if (subs[id]?.items) return;
    try {
      const s = await apiFetch<BulkSubmission>(`/math-submissions/${id}`);
      setSubs((prev) => ({ ...prev, [id]: s }));
    } catch {}
  };

  const statusBadge = (status: BulkSubmission["status"]) => {
    if (status === "graded") return <span className="text-xs bg-green-50 dark:bg-green-900/40 text-green-600 dark:text-green-400 px-2 py-0.5 rounded-full">채점완료</span>;
    if (status === "pending") return <span className="text-xs bg-amber-50 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded-full animate-pulse">채점중</span>;
    return <span className="text-xs bg-red-50 dark:bg-red-900/40 text-red-600 dark:text-red-400 px-2 py-0.5 rounded-full">오류</span>;
  };

  const selectedTest = tests.find((t) => String(t.id) === testId);

  return (
    <div>
      <h1 className="text-xl font-bold mb-2 text-gray-900 dark:text-gray-100">반별 합본 채점</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        여러 학생의 OMR 이미지를 한 번에 업로드하면 AI가 학생 이름과 마킹을 자동 인식하여 채점합니다.
      </p>

      {/* 전체 재채점 */}
      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl p-4 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-sm font-semibold text-amber-700 dark:text-amber-400">🔄 전체 재채점</span>
          <span className="text-xs text-amber-600 dark:text-amber-500">OMR 인식 오류 발생 시 기존 제출 전체를 다시 채점합니다</span>
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <select value={regradeTestId} onChange={(e) => setRegradeTestId(e.target.value)} className={inputCls + " w-56"}>
            <option value="">시험 선택...</option>
            {tests.filter((t) => t.has_answers).map((t) => (
              <option key={t.id} value={t.id}>{t.title} ({t.grade})</option>
            ))}
          </select>
          <button
            onClick={regradeAll}
            disabled={regrading || !regradeTestId}
            className="bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors shadow-sm"
          >
            {regrading ? "재채점 중..." : "전체 재채점"}
          </button>
          {regradeMsg && (
            <span className={`text-xs px-3 py-1.5 rounded-lg ${regradeMsg.type === "success" ? "bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400" : "bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400"}`}>
              {regradeMsg.text}
            </span>
          )}
        </div>
      </div>

      <form onSubmit={upload} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5 mb-6 shadow-sm">
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">합본 OMR 업로드</p>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">시험 선택 *</label>
            <select required value={testId} onChange={(e) => setTestId(e.target.value)} className={inputCls + " w-56"}>
              <option value="">시험 선택...</option>
              {tests.filter((t) => t.has_answers).map((t) => (
                <option key={t.id} value={t.id}>{t.title} ({t.grade})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">OMR 이미지 (여러 파일 선택 가능) *</label>
            <input
              ref={fileInputRef}
              required
              type="file"
              accept="image/*,.pdf"
              multiple
              onChange={handleFileChange}
              className="text-sm text-gray-500 dark:text-gray-400 file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:bg-indigo-50 dark:file:bg-indigo-900/40 file:text-indigo-600 dark:file:text-indigo-400 hover:file:bg-indigo-100"
            />
          </div>
          <button
            disabled={uploading || files.length === 0 || !testId}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors shadow-sm"
          >
            {uploading ? "업로드 중..." : `채점 시작 (${files.length}개)`}
          </button>
        </div>

        {files.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {files.map((f, i) => (
              <span key={i} className="text-xs bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 px-2 py-1 rounded-lg">
                {f.name}
              </span>
            ))}
          </div>
        )}

        {msg && (
          <p className={`text-xs mt-3 px-3 py-2 rounded-lg ${msg.type === "success" ? "bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400" : "bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400"}`}>
            {msg.text}
          </p>
        )}
      </form>

      {results.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              채점 결과 — {selectedTest?.title ?? ""} ({results.length}명)
            </h2>
            {results.some((r) => subs[r.id]?.status === "graded") && (
              <span className="text-xs text-gray-400">
                평균:{" "}
                {(() => {
                  const graded = results.map((r) => subs[r.id]).filter((s) => s?.status === "graded" && s.score != null && s.total);
                  if (!graded.length) return "-";
                  const avg = graded.reduce((a, s) => a + (s!.score! / s!.total!) * 100, 0) / graded.length;
                  return avg.toFixed(1) + "%";
                })()}
              </span>
            )}
          </div>
          <div className="space-y-2">
            {results.map((r) => {
              const s = subs[r.id];
              return (
                <div key={r.id} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden shadow-sm">
                  <div className="flex items-center gap-4 px-5 py-3">
                    <button
                      onClick={() => toggleExpand(r.id)}
                      className="flex-1 text-left flex items-center gap-3 hover:text-indigo-700 dark:hover:text-indigo-400 transition-colors"
                    >
                      <span className="text-sm font-semibold text-gray-800 dark:text-gray-100 min-w-20">
                        {s?.student_name ?? "인식중..."}
                      </span>
                      <span className="text-xs text-gray-400 dark:text-gray-500">{r.filename}</span>
                      {s ? statusBadge(s.status) : <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-400 px-2 py-0.5 rounded-full animate-pulse">대기중</span>}
                      {s?.status === "graded" && s.score != null && (
                        <>
                          <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400">{s.score}/{s.total}</span>
                          <span className="text-xs text-gray-400">({s.total ? Math.round((s.score / s.total) * 100) : 0}%)</span>
                        </>
                      )}
                      <span className="text-xs text-indigo-400 ml-auto">{expandedId === r.id ? "▲" : "▼"}</span>
                    </button>
                  </div>

                  {expandedId === r.id && s?.items && (
                    <div className="border-t border-gray-200 dark:border-gray-700 px-5 py-4">
                      <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
                        {s.items.map((item) => (
                          <div
                            key={item.question_no}
                            className={`flex flex-col items-center gap-1 p-2 rounded-lg ${item.is_correct ? "bg-green-50 dark:bg-green-900/30" : "bg-red-50 dark:bg-red-900/30"}`}
                          >
                            <span className="text-xs text-gray-400 dark:text-gray-500">{item.question_no}번</span>
                            <span className={`font-bold text-base ${item.is_correct ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}`}>
                              {item.student_answer ?? "-"}
                            </span>
                            {!item.is_correct && (
                              <span className="text-xs text-gray-400 dark:text-gray-500">정답:{item.correct_answer}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
