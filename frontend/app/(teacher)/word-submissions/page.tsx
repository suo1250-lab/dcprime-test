"use client";
import { useEffect, useState } from "react";
import { apiFetch, WordTest, WordSubmissionSummary, WordSubmissionDetail } from "@/lib/api";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  pending_manual: { label: "수동채점 대기", className: "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300" },
  pending_review: { label: "AI채점 검토중", className: "bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-400" },
  confirmed: { label: "확정", className: "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400" },
};

interface EditItem {
  id: number;
  item_no: number;
  question: string;
  correct_answer: string;
  student_answer: string;
  is_correct: boolean | null;
}

export default function WordSubmissionsPage() {
  const [tests, setTests] = useState<WordTest[]>([]);
  const [filterTestId, setFilterTestId] = useState<string>("");
  const [submissions, setSubmissions] = useState<WordSubmissionSummary[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<WordSubmissionDetail | null>(null);
  const [editItems, setEditItems] = useState<EditItem[]>([]);
  const [editName, setEditName] = useState("");
  const [confirming, setConfirming] = useState(false);

  const load = () => {
    apiFetch<WordTest[]>("/word-tests").then(setTests).catch(() => {});
    const q = filterTestId ? `?word_test_id=${filterTestId}` : "";
    apiFetch<WordSubmissionSummary[]>(`/word-submissions${q}`).then(setSubmissions).catch(() => {});
  };

  useEffect(() => { load(); }, [filterTestId]);

  const openDetail = async (id: number) => {
    setSelectedId(id);
    const d = await apiFetch<WordSubmissionDetail>(`/word-submissions/${id}`);
    setDetail(d);
    setEditName(d.student_name);
    setEditItems(d.items.map((i) => ({
      id: i.id,
      item_no: i.item_no,
      question: i.question,
      correct_answer: i.correct_answer,
      student_answer: i.student_answer ?? "",
      is_correct: i.is_correct,
    })));
  };

  const closeDetail = () => {
    setSelectedId(null);
    setDetail(null);
    setEditItems([]);
    setEditName("");
  };

  const toggleCorrect = (idx: number) => {
    setEditItems(editItems.map((item, i) => {
      if (i !== idx) return item;
      const next = item.is_correct === null ? true : item.is_correct === true ? false : null;
      return { ...item, is_correct: next };
    }));
  };

  const updateAnswer = (idx: number, val: string) => {
    setEditItems(editItems.map((item, i) => i === idx ? { ...item, student_answer: val } : item));
  };

  const calcScore = () => editItems.filter((i) => i.is_correct === true).length;

  const confirm = async () => {
    if (!selectedId) return;



    setConfirming(true);
    try {
      await apiFetch(`/word-submissions/${selectedId}/confirm`, {
        method: "PUT",
        body: JSON.stringify({ items: editItems, student_name: editName }),
      });
      setSubmissions((prev) => prev.filter((s) => s.id !== selectedId));
      closeDetail();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "확정 실패");
    } finally {
      setConfirming(false);
    }
  };

  const reopen = async (id: number) => {
    await apiFetch(`/word-submissions/${id}/reopen`, { method: "PUT" });
    load();
    openDetail(id);
  };

  const delSubmission = async (id: number) => {
    if (!window.confirm("삭제하시겠습니까?")) return;
    await apiFetch(`/word-submissions/${id}`, { method: "DELETE" });
    load();
  };

  const exportExcel = () => {
    const q = filterTestId ? `?word_test_id=${filterTestId}` : "";
    window.open(`${BASE}/api/word-submissions/export/excel${q}`, "_blank");
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">단어시험 채점</h1>
        <button onClick={exportExcel}
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm">
          엑셀 내보내기
        </button>
      </div>

      <div className="flex gap-3 mb-5">
        <select value={filterTestId} onChange={(e) => setFilterTestId(e.target.value)}
          className="border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500">
          <option value="">전체 시험</option>
          {tests.map((t) => (
            <option key={t.id} value={t.id}>{t.title} ({t.test_date})</option>
          ))}
        </select>
      </div>

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
                {["제출일시", "시험명", "학년", "학생", "상태", "점수", ""].map((h) => (
                  <th key={h} className="text-left px-4 py-3 font-semibold text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {submissions.map((s) => {
                const st = STATUS_LABEL[s.status] ?? { label: s.status, className: "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300" };
                return (
                  <tr key={s.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs whitespace-nowrap">{new Date(s.submitted_at).toLocaleString("ko-KR")}</td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{s.test_title}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{s.grade}</td>
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{s.student_name}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.className}`}>{st.label}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                      {s.score !== null && s.total !== null
                        ? `${s.score}/${s.total} (${Math.round(s.score / s.total * 100)}%)`
                        : "-"}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap space-x-3">
                      {s.status === "confirmed" ? (
                        <button onClick={() => reopen(s.id)} className="text-amber-600 dark:text-amber-400 hover:underline text-xs font-medium">
                          재채점
                        </button>
                      ) : (
                        <button onClick={() => openDetail(s.id)} className="text-indigo-600 dark:text-indigo-400 hover:underline text-xs font-medium">
                          검토
                        </button>
                      )}
                      <a href={`${BASE}/api/word-submissions/${s.id}/marked-pdf`}
                        download
                        className="text-blue-500 dark:text-blue-400 hover:underline text-xs font-medium">
                        다운로드
                      </a>
                      <button onClick={() => { window.open(`${BASE}/api/word-submissions/${s.id}/marked-pdf`, "_blank"); }}
                        className="text-gray-500 dark:text-gray-400 hover:underline text-xs font-medium">
                        인쇄
                      </button>
                      <button onClick={() => delSubmission(s.id)} className="text-red-500 dark:text-red-400 hover:underline text-xs font-medium">
                        삭제
                      </button>
                    </td>
                  </tr>
                );
              })}
              {submissions.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400 dark:text-gray-500">제출된 답안이 없습니다</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 상세 모달 */}
      {selectedId && detail && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-4xl my-4 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="text-lg font-bold text-gray-900 dark:text-gray-100 border-b border-transparent hover:border-gray-300 dark:hover:border-gray-500 focus:border-indigo-400 focus:outline-none bg-transparent w-32"
                  />
                  <span className="text-lg font-bold text-gray-900 dark:text-gray-100">— {detail.test_title}</span>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400">{detail.grade} | {new Date(detail.submitted_at).toLocaleString("ko-KR")}</p>
              </div>
              <button onClick={closeDetail} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-2xl leading-none p-1">×</button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-gray-200 dark:divide-gray-700">
              <div className="p-4">
                <p className="text-sm font-semibold text-gray-600 dark:text-gray-300 mb-2">제출 사진</p>
                <img
                  src={`${BASE}/api/word-submissions/${selectedId}/image`}
                  alt="제출 사진"
                  className="w-full rounded-lg border border-gray-200 dark:border-gray-600 object-contain max-h-[500px]"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              </div>

              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold text-gray-600 dark:text-gray-300">채점 결과</p>
                  <span className="text-sm font-bold text-indigo-700 dark:text-indigo-400">
                    {calcScore()} / {editItems.length}점
                  </span>
                </div>
                <div className="overflow-y-auto max-h-[420px]">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-900/50 sticky top-0">
                      <tr>
                        <th className="text-left px-2 py-2 font-semibold text-xs text-gray-500 dark:text-gray-400 w-8">No</th>
                        <th className="text-left px-2 py-2 font-semibold text-xs text-gray-500 dark:text-gray-400">문제</th>
                        <th className="text-left px-2 py-2 font-semibold text-xs text-gray-500 dark:text-gray-400">정답</th>
                        <th className="text-left px-2 py-2 font-semibold text-xs text-gray-500 dark:text-gray-400">학생 답</th>
                        <th className="text-center px-2 py-2 font-semibold text-xs text-gray-500 dark:text-gray-400 w-14">O/X</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                      {editItems.map((item, idx) => (
                        <tr key={item.id}>
                          <td className="px-2 py-2 text-gray-400 dark:text-gray-500">{item.item_no}</td>
                          <td className="px-2 py-2 text-gray-700 dark:text-gray-300">{item.question}</td>
                          <td className="px-2 py-2 text-green-700 dark:text-green-400 font-medium">{item.correct_answer}</td>
                          <td className="px-2 py-2">
                            <input
                              value={item.student_answer}
                              onChange={(e) => updateAnswer(idx, e.target.value)}
                              className="border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1 text-sm w-full bg-white dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                          </td>
                          <td className="px-2 py-2 text-center">
                            <button
                              onClick={() => toggleCorrect(idx)}
                              className={`w-8 h-8 rounded-lg font-bold text-sm transition-colors ${
                                item.is_correct === true
                                  ? "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 hover:bg-green-200"
                                  : item.is_correct === false
                                  ? "bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 hover:bg-red-200"
                                  : "bg-gray-100 dark:bg-gray-700 text-gray-400 hover:bg-gray-200"
                              }`}
                            >
                              {item.is_correct === true ? "O" : item.is_correct === false ? "X" : "△"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-4 flex items-center justify-end gap-3">
                  {editItems.some((i) => i.is_correct === null) && (
                    <span className="text-xs text-amber-600 dark:text-amber-400">
                      ⚠ 미채점 {editItems.filter((i) => i.is_correct === null).length}개
                    </span>
                  )}
                  <button
                    onClick={confirm}
                    disabled={confirming}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 shadow-sm"
                  >
                    {confirming ? "처리 중..." : "확정"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
