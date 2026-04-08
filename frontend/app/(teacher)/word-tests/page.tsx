"use client";
import { useEffect, useState } from "react";
import { apiFetch, WordTest, WordTestDetail } from "@/lib/api";

const GRADES = ["초1","초2","초3","초4","초5","초6","중1","중2","중3","고1","고2","고3"];
const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const inputCls = "border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500";
const selectCls = inputCls;

interface ItemRow {
  id?: number;
  item_no: number;
  question: string;
  answer: string;
}

export default function WordTestsPage() {
  const [tests, setTests] = useState<WordTest[]>([]);
  const [form, setForm] = useState({ title: "", grade: "중1", direction: "EN_KR", test_date: "" });
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<WordTestDetail | null>(null);
  const [editItems, setEditItems] = useState<ItemRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [showQR, setShowQR] = useState<number | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractMsg, setExtractMsg] = useState("");
  // 단어장 불러오기
  const [bookId, setBookId] = useState<string>("");
  const [dayStart, setDayStart] = useState<string>("");
  const [dayEnd, setDayEnd] = useState<string>("");
  const [loadingBook, setLoadingBook] = useState(false);
  const [previewItems, setPreviewItems] = useState<ItemRow[]>([]);
  const [editingMeta, setEditingMeta] = useState<number | null>(null);
  const [metaForm, setMetaForm] = useState({ title: "", grade: "중1", direction: "EN_KR", test_date: "" });
  const [savingMeta, setSavingMeta] = useState(false);

  const load = () => {
    apiFetch<WordTest[]>("/word-tests").then(setTests).catch(() => {});
  };

  useEffect(() => { load(); }, []);

  const loadFromBook = async () => {
    if (!bookId || !dayStart || !dayEnd) return;
    if (Number(dayStart) > Number(dayEnd)) { setError("시작 Day가 끝 Day보다 클 수 없습니다"); return; }
    setLoadingBook(true);
    setError("");
    try {
      const data = await apiFetch<{ title: string; direction: string; items: ItemRow[] }>(
        `/word-tests/${bookId}/items/by-day?day_start=${dayStart}&day_end=${dayEnd}`
      );
      setPreviewItems(data.items.map((i, idx) => ({ item_no: idx + 1, question: i.question, answer: i.answer })));
      if (!form.direction) setForm((f) => ({ ...f, direction: data.direction }));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "불러오기 실패");
    } finally {
      setLoadingBook(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await apiFetch<WordTestDetail>("/word-tests", {
        method: "POST",
        body: JSON.stringify({ ...form, items: previewItems.map((i) => ({ item_no: i.item_no, question: i.question, answer: i.answer })) }),
      });
      setForm({ title: "", grade: "중1", direction: "EN_KR", test_date: "" });
      setBookId(""); setDayStart(""); setDayEnd(""); setPreviewItems([]);
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "오류가 발생했습니다");
    }
  };

  const toggleExpand = async (id: number) => {
    if (expandedId === id) {
      setExpandedId(null);
      setDetail(null);
      setEditItems([]);
      return;
    }
    setExpandedId(id);
    const d = await apiFetch<WordTestDetail>(`/word-tests/${id}`);
    setDetail(d);
    setEditItems(d.items.map((i) => ({ id: i.id, item_no: i.item_no, question: i.question, answer: i.answer })));
  };

  const addRow = () => {
    const nextNo = editItems.length > 0 ? Math.max(...editItems.map((i) => i.item_no)) + 1 : 1;
    setEditItems([...editItems, { item_no: nextNo, question: "", answer: "" }]);
  };

  const removeRow = (idx: number) => {
    setEditItems(editItems.filter((_, i) => i !== idx));
  };

  const updateRow = (idx: number, field: keyof ItemRow, value: string | number) => {
    setEditItems(editItems.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  };

  const extractFromPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !expandedId) return;
    setExtracting(true);
    setExtractMsg("");
    try {
      const formData = new FormData();
      formData.append("pdf", file);
      const res = await fetch(`${BASE}/api/word-tests/${expandedId}/extract-pdf`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? "추출 실패");
      setEditItems(data.items.map((i: { item_no: number; question: string; answer: string }) => ({
        item_no: i.item_no,
        question: i.question,
        answer: i.answer,
      })));
      setExtractMsg(`${data.ai === "claude" ? "Claude" : "Grok"}가 ${data.items.length}개 단어를 추출했습니다. 확인 후 저장하세요.`);
    } catch (err: unknown) {
      setExtractMsg(err instanceof Error ? err.message : "오류 발생");
    } finally {
      setExtracting(false);
      e.target.value = "";
    }
  };

  const saveItems = async () => {
    if (!expandedId) return;
    setSaving(true);
    try {
      await apiFetch<WordTestDetail>(`/word-tests/${expandedId}/items`, {
        method: "PUT",
        body: JSON.stringify(editItems.map((r) => ({ item_no: r.item_no, question: r.question, answer: r.answer }))),
      });
      load();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  const startEditMeta = (t: WordTest) => {
    setEditingMeta(t.id);
    setMetaForm({ title: t.title, grade: t.grade, direction: t.direction, test_date: String(t.test_date) });
  };

  const saveMeta = async (id: number) => {
    setSavingMeta(true);
    try {
      await apiFetch(`/word-tests/${id}`, {
        method: "PUT",
        body: JSON.stringify(metaForm),
      });
      setEditingMeta(null);
      load();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setSavingMeta(false);
    }
  };

  const deleteTest = async (id: number) => {
    if (!confirm("시험을 삭제하시겠습니까? 모든 제출 결과도 삭제됩니다.")) return;
    try {
      await apiFetch(`/word-tests/${id}`, { method: "DELETE" });
    } catch (e: unknown) {
      if (!(e instanceof Error && e.message === "Not found")) {
        alert(e instanceof Error ? e.message : "삭제 실패");
      }
    }
    if (expandedId === id) { setExpandedId(null); setDetail(null); setEditItems([]); }
    load();
  };

  const getSubmitUrl = (testId: number) => {
    const base = process.env.NEXT_PUBLIC_APP_URL ?? (typeof window !== "undefined" ? window.location.origin : "http://localhost:3000");
    return `${base}/submit?test=${testId}`;
  };

  const getQRUrl = (testId: number) => {
    return `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(getSubmitUrl(testId))}`;
  };

  return (
    <div>
      <h1 className="text-xl font-bold mb-6 text-gray-900 dark:text-gray-100">단어시험 관리</h1>

      {/* 시험 생성 폼 */}
      <form onSubmit={submit} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5 mb-6 flex flex-wrap gap-3 items-end shadow-sm">
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">시험명 *</label>
          <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
            className={inputCls + " w-52"} placeholder="3월 단어시험 1회" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">학년 *</label>
          <select value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })} className={selectCls}>
            {GRADES.map((g) => <option key={g}>{g}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">방향 *</label>
          <select value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value })} className={selectCls}>
            <option value="EN_KR">영어→한국어</option>
            <option value="KR_EN">한국어→영어</option>
            <option value="MIXED">혼합</option>
          </select>
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

        {/* 단어장 불러오기 */}
        <div className="w-full border-t border-gray-100 dark:border-gray-700 pt-3 mt-1">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">단어장에서 불러오기 (선택)</p>
          <div className="flex flex-wrap gap-2 items-end">
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">단어장</label>
              <select value={bookId} onChange={(e) => { setBookId(e.target.value); setPreviewItems([]); }} className={selectCls + " w-52"}>
                <option value="">단어장 선택...</option>
                {tests.map((t) => <option key={t.id} value={t.id}>{t.title} ({t.item_count}단어)</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">Day 시작</label>
              <input type="number" min={1} value={dayStart} onChange={(e) => setDayStart(e.target.value)}
                className={inputCls + " w-20"} placeholder="1" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">Day 끝</label>
              <input type="number" min={1} value={dayEnd} onChange={(e) => setDayEnd(e.target.value)}
                className={inputCls + " w-20"} placeholder="3" />
            </div>
            <button type="button" onClick={loadFromBook} disabled={!bookId || !dayStart || !dayEnd || loadingBook}
              className="bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors">
              {loadingBook ? "로딩 중..." : "불러오기"}
            </button>
            {previewItems.length > 0 && (
              <span className="text-xs text-green-600 dark:text-green-400 font-medium">
                ✓ {previewItems.length}개 단어 로드됨 (시험 생성 시 포함)
              </span>
            )}
          </div>
        </div>
      </form>

      {/* 시험 목록 */}
      <div className="space-y-3">
        {tests.length === 0 && (
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-8 text-center text-gray-400 dark:text-gray-500 shadow-sm">등록된 시험이 없습니다</div>
        )}
        {tests.map((t) => (
          <div key={t.id} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden shadow-sm">
            {/* 헤더 */}
            {editingMeta === t.id ? (
              <div className="flex flex-wrap items-center gap-2 px-5 py-4">
                <input value={metaForm.title} onChange={(e) => setMetaForm({ ...metaForm, title: e.target.value })}
                  className={inputCls + " w-52"} placeholder="시험명" />
                <select value={metaForm.grade} onChange={(e) => setMetaForm({ ...metaForm, grade: e.target.value })} className={selectCls}>
                  {GRADES.map((g) => <option key={g}>{g}</option>)}
                </select>
                <select value={metaForm.direction} onChange={(e) => setMetaForm({ ...metaForm, direction: e.target.value })} className={selectCls}>
                  <option value="EN_KR">영어→한국어</option>
                  <option value="KR_EN">한국어→영어</option>
                  <option value="MIXED">혼합</option>
                </select>
                <input type="date" value={metaForm.test_date} onChange={(e) => setMetaForm({ ...metaForm, test_date: e.target.value })}
                  className={inputCls} />
                <button onClick={() => saveMeta(t.id)} disabled={savingMeta}
                  className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors">
                  {savingMeta ? "저장 중..." : "저장"}
                </button>
                <button onClick={() => setEditingMeta(null)}
                  className="text-xs text-gray-500 dark:text-gray-400 hover:underline">취소</button>
              </div>
            ) : (
            <div className="flex items-center gap-4 px-5 py-4">
              <button onClick={() => toggleExpand(t.id)} className="flex-1 text-left flex items-center gap-3 hover:text-indigo-700 dark:hover:text-indigo-400 transition-colors">
                <span className="text-base font-semibold text-gray-800 dark:text-gray-100">{t.title}</span>
                <span className="text-xs bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded-full">{t.grade}</span>
                <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-2 py-0.5 rounded-full">
                  {t.direction === "EN_KR" ? "영→한" : t.direction === "KR_EN" ? "한→영" : "혼합"}
                </span>
                <span className="text-xs text-gray-400 dark:text-gray-500">{t.test_date}</span>
                <span className="text-xs text-gray-400 dark:text-gray-500">{t.item_count}문항</span>
                <span className="text-xs text-indigo-400 dark:text-indigo-500 ml-auto">{expandedId === t.id ? "▲ 접기" : "▼ 펼치기"}</span>
              </button>
              <button onClick={() => startEditMeta(t)}
                className="text-xs text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                수정
              </button>
              <button
                onClick={() => setShowQR(showQR === t.id ? null : t.id)}
                className="text-xs text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                QR코드
              </button>
              <button onClick={() => deleteTest(t.id)} className="text-xs text-red-500 dark:text-red-400 hover:underline font-medium">삭제</button>
            </div>
            )}

            {/* QR코드 팝업 */}
            {showQR === t.id && (
              <div className="px-5 pb-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30 flex items-center gap-4">
                <img src={getQRUrl(t.id)} alt="QR Code" className="w-36 h-36" />
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">학생 제출 링크</p>
                  <code className="text-xs text-gray-500 dark:text-gray-400 break-all">{getSubmitUrl(t.id)}</code>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">학생이 이 QR코드를 스캔하면 답안 제출 페이지로 이동합니다</p>
                </div>
              </div>
            )}

            {/* 단어 목록 편집 */}
            {expandedId === t.id && detail && (
              <div className="border-t border-gray-200 dark:border-gray-700 px-5 py-4">
                <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">단어 목록 ({editItems.length}개)</span>
                  <div className="flex gap-2 flex-wrap">
                    <label className={`text-xs px-3 py-1.5 rounded-lg cursor-pointer border transition-colors ${extracting ? "opacity-50 cursor-not-allowed bg-gray-100 dark:bg-gray-700 border-gray-200 dark:border-gray-600" : "bg-amber-50 dark:bg-amber-900/30 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/50"}`}>
                      {extracting ? "AI 추출 중..." : "PDF로 가져오기"}
                      <input type="file" accept=".pdf" className="hidden" disabled={extracting} onChange={extractFromPdf} />
                    </label>
                    <button onClick={addRow} className="text-xs bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 px-3 py-1.5 rounded-lg transition-colors">
                      + 행 추가
                    </button>
                    <button onClick={saveItems} disabled={saving}
                      className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors">
                      {saving ? "저장 중..." : "저장"}
                    </button>
                  </div>
                </div>
                {extractMsg && (
                  <p className={`text-xs mb-3 px-3 py-2 rounded-lg ${extractMsg.includes("추출했습니다") ? "bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400" : "bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400"}`}>
                    {extractMsg}
                  </p>
                )}

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-300 w-16">번호</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-300">
                          {t.direction === "EN_KR" ? "영어 (문제)" : t.direction === "KR_EN" ? "한국어 (문제)" : "문제"}
                        </th>
                        <th className="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-300">
                          {t.direction === "EN_KR" ? "한국어 (정답)" : t.direction === "KR_EN" ? "영어 (정답)" : "정답"}
                        </th>
                        <th className="w-12"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                      {editItems.map((row, idx) => (
                        <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              value={row.item_no}
                              onChange={(e) => updateRow(idx, "item_no", Number(e.target.value))}
                              className="border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1 text-sm w-14 bg-white dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              value={row.question}
                              onChange={(e) => updateRow(idx, "question", e.target.value)}
                              className="border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1 text-sm w-full bg-white dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              placeholder={t.direction === "EN_KR" ? "apple" : "사과"}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              value={row.answer}
                              onChange={(e) => updateRow(idx, "answer", e.target.value)}
                              className="border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1 text-sm w-full bg-white dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              placeholder={t.direction === "EN_KR" ? "사과" : "apple"}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <button onClick={() => removeRow(idx)} className="text-red-400 dark:text-red-500 hover:text-red-600 dark:hover:text-red-400 text-xs transition-colors">삭제</button>
                          </td>
                        </tr>
                      ))}
                      {editItems.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-3 py-6 text-center text-gray-400 dark:text-gray-500 text-sm">
                            단어가 없습니다. &quot;+ 행 추가&quot;를 눌러 추가하세요.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
