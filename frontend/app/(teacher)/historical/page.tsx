"use client";
import { useEffect, useState } from "react";

const OUTCOMES = ["배정확정", "등록불가", "포기"];
const GRADES = ["초1","초2","초3","초4","초5","초6","중1","중2","중3","고1","고2","고3"];
const SUBJECTS = ["수학","영어","국어","과학","사회"];

interface HistoricalStudent {
  id: number; name: string; grade: string | null; school: string | null;
  subject: string | null; score: number | null; total: number | null;
  score_pct: number | null; outcome: string | null; source_file: string | null;
  question_count: number;
}
interface Stats {
  total: number;
  by_outcome: Record<string, number>;
  by_subject: Record<string, number>;
  by_grade: Record<string, number>;
}

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const inputCls = "border border-gray-200 dark:border-gray-600 rounded-lg px-2.5 py-1.5 text-sm bg-white dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500";
const selectCls = inputCls;

export default function HistoricalPage() {
  const [students, setStudents] = useState<HistoricalStudent[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [filterOutcome, setFilterOutcome] = useState("");
  const [filterGrade, setFilterGrade] = useState("");
  const [filterSubject, setFilterSubject] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Partial<HistoricalStudent>>({});
  const [saving, setSaving] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    name: "", grade: "중1", school: "", subject: "수학",
    score: "", total: "", outcome: "배정확정", source_file: "",
  });

  const load = async () => {
    const params = new URLSearchParams();
    if (filterOutcome) params.set("outcome", filterOutcome);
    if (filterGrade) params.set("grade", filterGrade);
    if (filterSubject) params.set("subject", filterSubject);
    const [sRes, stRes] = await Promise.all([
      fetch(`${BASE}/api/historical?${params}`),
      fetch(`${BASE}/api/historical/stats`),
    ]);
    if (sRes.ok) setStudents(await sRes.json());
    if (stRes.ok) setStats(await stRes.json());
  };

  useEffect(() => { load(); }, [filterOutcome, filterGrade, filterSubject]);

  const startEdit = (s: HistoricalStudent) => {
    setEditId(s.id);
    setEditForm({ name: s.name, grade: s.grade ?? "", school: s.school ?? "",
      subject: s.subject ?? "", score: s.score ?? undefined, total: s.total ?? undefined, outcome: s.outcome ?? "배정확정" });
  };

  const saveEdit = async () => {
    if (!editId) return;
    setSaving(true);
    await fetch(`${BASE}/api/historical/${editId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editForm.name, grade: editForm.grade || null, school: editForm.school || null,
        subject: editForm.subject || null, score: editForm.score != null ? Number(editForm.score) : null,
        total: editForm.total != null ? Number(editForm.total) : null, outcome: editForm.outcome }),
    });
    setSaving(false); setEditId(null); load();
  };

  const del = async (id: number) => {
    if (!confirm("삭제하시겠습니까?")) return;
    await fetch(`${BASE}/api/historical/${id}`, { method: "DELETE" });
    load();
  };

  const addRecord = async () => {
    await fetch(`${BASE}/api/historical`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: addForm.name, grade: addForm.grade || null, school: addForm.school || null,
        subject: addForm.subject || null, score: addForm.score ? Number(addForm.score) : null,
        total: addForm.total ? Number(addForm.total) : null, outcome: addForm.outcome, source_file: addForm.source_file || null }),
    });
    setAddOpen(false);
    setAddForm({ name: "", grade: "중1", school: "", subject: "수학", score: "", total: "", outcome: "배정확정", source_file: "" });
    load();
  };

  const outcomeColor = (o: string | null) => {
    if (o === "배정확정") return "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400";
    if (o === "등록불가") return "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400";
    if (o === "포기") return "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400";
    return "bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-400";
  };

  const outcomeStatColor = (k: string) => {
    if (k === "배정확정") return "text-green-600 dark:text-green-400";
    if (k === "등록불가") return "text-red-500 dark:text-red-400";
    if (k === "포기") return "text-gray-500 dark:text-gray-400";
    return "text-gray-700 dark:text-gray-300";
  };

  const exportExcel = () => {
    const params = new URLSearchParams();
    if (filterOutcome) params.set("outcome", filterOutcome);
    if (filterGrade) params.set("grade", filterGrade);
    if (filterSubject) params.set("subject", filterSubject);
    const q = params.toString() ? `?${params}` : "";
    window.open(`${BASE}/api/historical/export/excel${q}`, "_blank");
  };

  const [ingestStatus, setIngestStatus] = useState<{
    running: boolean; total: number; done: number; skipped: number; errors: number; current: string; log: string[];
  } | null>(null);
  const [ingestOpen, setIngestOpen] = useState(false);

  const startIngest = async () => {
    await fetch(`${BASE}/api/historical/ingest`, { method: "POST" });
    setIngestOpen(true);
    pollIngest();
  };

  const pollIngest = () => {
    const iv = setInterval(async () => {
      const r = await fetch(`${BASE}/api/historical/ingest/status`);
      const data = await r.json();
      setIngestStatus(data);
      if (!data.running) { clearInterval(iv); load(); }
    }, 1500);
  };

  useEffect(() => {
    fetch(`${BASE}/api/historical/ingest/status`)
      .then(r => r.json()).then(data => {
        if (data.running) { setIngestStatus(data); setIngestOpen(true); pollIngest(); }
      });
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">역대 입학테스트 이력</h1>
        <div className="flex gap-2">
          <button onClick={startIngest}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm">
            📥 스캔본 일괄 적재
          </button>
          <button onClick={exportExcel}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm">
            엑셀 내보내기
          </button>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 text-center shadow-sm">
            <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{stats.total}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">전체</p>
          </div>
          {Object.entries(stats.by_outcome).map(([k, v]) => (
            <div key={k} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 text-center shadow-sm">
              <p className={`text-2xl font-bold ${outcomeStatColor(k)}`}>{v}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{k}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-3 items-end mb-4">
        {[
          { label: "결과", value: filterOutcome, onChange: setFilterOutcome, options: OUTCOMES },
          { label: "학년", value: filterGrade, onChange: setFilterGrade, options: GRADES },
          { label: "과목", value: filterSubject, onChange: setFilterSubject, options: SUBJECTS },
        ].map(({ label, value, onChange, options }) => (
          <div key={label}>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">{label}</label>
            <select value={value} onChange={(e) => onChange(e.target.value)} className={selectCls}>
              <option value="">전체</option>
              {options.map((o) => <option key={o}>{o}</option>)}
            </select>
          </div>
        ))}
        <button onClick={() => setAddOpen(!addOpen)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors ml-auto shadow-sm">
          + 직접 추가
        </button>
      </div>

      {addOpen && (
        <div className="bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-700 rounded-xl p-4 mb-4">
          <div className="flex flex-wrap gap-3 items-end">
            {[
              { label: "이름 *", key: "name", type: "text", w: "w-24" },
              { label: "학교", key: "school", type: "text", w: "w-32" },
              { label: "점수", key: "score", type: "number", w: "w-16" },
              { label: "만점", key: "total", type: "number", w: "w-16" },
              { label: "파일명", key: "source_file", type: "text", w: "w-40" },
            ].map(({ label, key, type, w }) => (
              <div key={key}>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">{label}</label>
                <input type={type} value={(addForm as Record<string, string>)[key]}
                  onChange={(e) => setAddForm({ ...addForm, [key]: e.target.value })}
                  className={inputCls + ` ${w}`} />
              </div>
            ))}
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">학년</label>
              <select value={addForm.grade} onChange={(e) => setAddForm({ ...addForm, grade: e.target.value })} className={selectCls}>
                {GRADES.map((g) => <option key={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">과목</label>
              <select value={addForm.subject} onChange={(e) => setAddForm({ ...addForm, subject: e.target.value })} className={selectCls}>
                {SUBJECTS.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">결과</label>
              <select value={addForm.outcome} onChange={(e) => setAddForm({ ...addForm, outcome: e.target.value })} className={selectCls}>
                {OUTCOMES.map((o) => <option key={o}>{o}</option>)}
              </select>
            </div>
            <button onClick={addRecord} disabled={!addForm.name}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 shadow-sm">
              추가
            </button>
            <button onClick={() => setAddOpen(false)} className="text-sm text-gray-500 dark:text-gray-400 hover:underline">취소</button>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
                {["이름","학년","학교","과목","점수","점수율","결과","문항수","파일",""].map((h) => (
                  <th key={h} className="text-left px-3 py-3 font-semibold text-xs text-gray-600 dark:text-gray-300 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {students.map((s) => (
                editId === s.id ? (
                  <tr key={s.id} className="bg-amber-50 dark:bg-amber-900/20">
                    <td className="px-3 py-2"><input value={editForm.name ?? ""} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className={inputCls + " w-24"} /></td>
                    <td className="px-3 py-2"><select value={editForm.grade ?? ""} onChange={(e) => setEditForm({ ...editForm, grade: e.target.value })} className={selectCls}><option value="">-</option>{GRADES.map((g) => <option key={g}>{g}</option>)}</select></td>
                    <td className="px-3 py-2"><input value={editForm.school ?? ""} onChange={(e) => setEditForm({ ...editForm, school: e.target.value })} className={inputCls + " w-28"} /></td>
                    <td className="px-3 py-2"><select value={editForm.subject ?? ""} onChange={(e) => setEditForm({ ...editForm, subject: e.target.value })} className={selectCls}><option value="">-</option>{SUBJECTS.map((sub) => <option key={sub}>{sub}</option>)}</select></td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <input type="number" value={editForm.score ?? ""} onChange={(e) => setEditForm({ ...editForm, score: Number(e.target.value) })} className={inputCls + " w-14"} />
                      <span className="text-gray-400 mx-1">/</span>
                      <input type="number" value={editForm.total ?? ""} onChange={(e) => setEditForm({ ...editForm, total: Number(e.target.value) })} className={inputCls + " w-14"} />
                    </td>
                    <td className="px-3 py-2 text-gray-400">-</td>
                    <td className="px-3 py-2"><select value={editForm.outcome ?? ""} onChange={(e) => setEditForm({ ...editForm, outcome: e.target.value })} className={selectCls}>{OUTCOMES.map((o) => <option key={o}>{o}</option>)}</select></td>
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{s.question_count}</td>
                    <td className="px-3 py-2 text-gray-400 text-xs truncate max-w-xs">{s.source_file}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <button onClick={saveEdit} disabled={saving} className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1 rounded-lg mr-2 disabled:opacity-50 transition-colors">{saving ? "저장중" : "저장"}</button>
                      <button onClick={() => setEditId(null)} className="text-xs text-gray-500 dark:text-gray-400 hover:underline">취소</button>
                    </td>
                  </tr>
                ) : (
                  <tr key={s.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="px-3 py-3 font-medium text-gray-900 dark:text-gray-100">{s.name}</td>
                    <td className="px-3 py-3 text-gray-600 dark:text-gray-400">{s.grade ?? "-"}</td>
                    <td className="px-3 py-3 text-gray-600 dark:text-gray-400">{s.school ?? "-"}</td>
                    <td className="px-3 py-3 text-gray-600 dark:text-gray-400">{s.subject ?? "-"}</td>
                    <td className="px-3 py-3 text-gray-700 dark:text-gray-300">{s.score != null ? `${s.score}/${s.total ?? "?"}` : "-"}</td>
                    <td className="px-3 py-3">
                      {s.score_pct != null ? (
                        <span className={`font-semibold ${s.score_pct >= 80 ? "text-green-600 dark:text-green-400" : s.score_pct >= 60 ? "text-yellow-600 dark:text-yellow-400" : "text-red-500 dark:text-red-400"}`}>{s.score_pct}%</span>
                      ) : "-"}
                    </td>
                    <td className="px-3 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${outcomeColor(s.outcome)}`}>{s.outcome ?? "-"}</span>
                    </td>
                    <td className="px-3 py-3 text-gray-500 dark:text-gray-400">{s.question_count > 0 ? `${s.question_count}문항` : "-"}</td>
                    <td className="px-3 py-3 text-gray-400 text-xs truncate max-w-[8rem]" title={s.source_file ?? ""}>{s.source_file ? s.source_file.split("/").pop() : "-"}</td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <button onClick={() => startEdit(s)} className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline mr-2 font-medium">수정</button>
                      <button onClick={() => del(s.id)} className="text-xs text-red-500 dark:text-red-400 hover:underline font-medium">삭제</button>
                    </td>
                  </tr>
                )
              ))}
              {students.length === 0 && (
                <tr><td colSpan={10} className="px-4 py-10 text-center text-gray-400 dark:text-gray-500">데이터가 없습니다</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">총 {students.length}건 표시 중 (전체 {stats?.total ?? 0}건)</p>

      {ingestOpen && ingestStatus && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold dark:text-white">📥 스캔본 적재 중</h2>
              {!ingestStatus.running && (
                <button onClick={() => setIngestOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
              )}
            </div>
            <div className="mb-4">
              <div className="flex justify-between text-sm text-gray-600 dark:text-gray-300 mb-1">
                <span>{ingestStatus.running ? `처리 중: ${ingestStatus.current}` : "완료"}</span>
                <span>{ingestStatus.done + ingestStatus.skipped + ingestStatus.errors} / {ingestStatus.total}</span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div className="bg-indigo-500 h-2 rounded-full transition-all"
                  style={{ width: ingestStatus.total ? `${((ingestStatus.done + ingestStatus.skipped + ingestStatus.errors) / ingestStatus.total) * 100}%` : "0%" }} />
              </div>
            </div>
            <div className="flex gap-4 text-sm mb-4">
              <span className="text-green-600 dark:text-green-400">✓ {ingestStatus.done}개</span>
              <span className="text-gray-500">⏭ {ingestStatus.skipped}개 스킵</span>
              <span className="text-red-500">❌ {ingestStatus.errors}개 오류</span>
            </div>
            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3 h-40 overflow-y-auto text-xs font-mono text-gray-700 dark:text-gray-300 space-y-0.5">
              {ingestStatus.log.slice(-50).map((l, i) => <div key={i}>{l}</div>)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
