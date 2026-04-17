"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, apiHeaders, Student, Class } from "@/lib/api";
import Link from "next/link";

const GRADES = ["초1","초2","초3","초4","초5","초6","중1","중2","중3","고1","고2","고3"];
const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const inputCls = "border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full";
const selectCls = "border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500";
const cellInputCls = "border border-gray-200 dark:border-gray-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 w-full";

interface EditForm { name: string; grade: string; school: string; class_ids: string[]; phone: string; teacher: string; }

export default function StudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [form, setForm] = useState({ name: "", grade: "중1", school: "", class_id: "", phone: "", teacher: "" });
  const [search, setSearch] = useState("");
  const [filterGrade, setFilterGrade] = useState("");
  const [error, setError] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ name: "", grade: "중1", school: "", class_ids: [], phone: "", teacher: "" });
  const [saving, setSaving] = useState(false);

  // 엑셀 import 관련
  const importInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const classMap = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);

  const load = () => {
    const q = filterGrade ? `?grade=${filterGrade}` : "";
    apiFetch<Student[]>(`/students${q}`).then(setStudents).catch(() => {});
    if (classes.length === 0)
      apiFetch<Class[]>("/classes").then(setClasses).catch(() => {});
  };

  useEffect(() => { load(); }, [filterGrade]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await apiFetch("/students", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          grade: form.grade,
          school: form.school || null,
          class_ids: form.class_id ? [Number(form.class_id)] : [],
          phone: form.phone || null,
          teacher: form.teacher || null,
        }),
      });
      setForm({ name: "", grade: "중1", school: "", class_id: "", phone: "", teacher: "" });
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "오류가 발생했습니다");
    }
  };

  const del = async (id: number) => {
    if (!confirm("삭제하시겠습니까?")) return;
    await apiFetch(`/students/${id}`, { method: "DELETE" });
    if (editId === id) setEditId(null);
    load();
  };

  const startEdit = (s: Student) => {
    setEditId(s.id);
    setEditForm({
      name: s.name,
      grade: s.grade,
      school: s.school ?? "",
      class_ids: s.class_ids.map(String),
      phone: s.phone ?? "",
      teacher: s.teacher ?? "",
    });
  };

  const saveEdit = async () => {
    if (!editId) return;
    setSaving(true);
    try {
      await apiFetch(`/students/${editId}`, {
        method: "PUT",
        body: JSON.stringify({
          name: editForm.name,
          grade: editForm.grade,
          school: editForm.school || null,
          class_ids: editForm.class_ids.map(Number),
          phone: editForm.phone || null,
          teacher: editForm.teacher || null,
          historical_student_id: students.find((s) => s.id === editId)?.historical_student_id ?? null,
        }),
      });
      setEditId(null);
      load();
    } finally {
      setSaving(false);
    }
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportMsg(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`${BASE}/api/students/import/excel`, {
        method: "POST",
        body: formData,
        headers: apiHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? "임포트 실패");
      setImportMsg({
        type: "success",
        text: `완료: 신규 ${data.created}명, 업데이트 ${data.updated}명${data.errors?.length ? ` (경고 ${data.errors.length}건)` : ""}`,
      });
      load();
    } catch (err: unknown) {
      setImportMsg({ type: "error", text: err instanceof Error ? err.message : "임포트 실패" });
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  };

  const downloadTemplate = () => {
    window.open(`${BASE}/api/students/export/excel-template`, "_blank");
  };

  const filtered = students.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">원생 관리</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={downloadTemplate}
            className="text-xs border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            📋 엑셀 템플릿
          </button>
          <label className={`text-xs px-3 py-1.5 rounded-lg cursor-pointer border transition-colors ${importing ? "opacity-50 cursor-not-allowed bg-gray-100 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-400" : "bg-green-50 dark:bg-green-900/30 border-green-300 dark:border-green-700 text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/50"}`}>
            {importing ? "임포트 중..." : "📥 엑셀 일괄 등록"}
            <input ref={importInputRef} type="file" accept=".xlsx,.xls" className="hidden" disabled={importing} onChange={handleImportExcel} />
          </label>
        </div>
      </div>

      {importMsg && (
        <div className={`mb-4 px-4 py-3 rounded-xl text-sm ${importMsg.type === "success" ? "bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800" : "bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800"}`}>
          {importMsg.text}
        </div>
      )}

      <form onSubmit={submit} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5 mb-6 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">원생 등록</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-3">
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">이름 *</label>
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              className={inputCls} placeholder="홍길동" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">학년 *</label>
            <select value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })}
              className={selectCls + " w-full"}>
              {GRADES.map((g) => <option key={g}>{g}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">학교</label>
            <input value={form.school} onChange={(e) => setForm({ ...form, school: e.target.value })}
              className={inputCls} placeholder="능곡중학교" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">반</label>
            <select value={form.class_id} onChange={(e) => setForm({ ...form, class_id: e.target.value })}
              className={selectCls + " w-full"}>
              <option value="">미배정</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">연락처</label>
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className={inputCls} placeholder="010-0000-0000" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">담당선생님</label>
            <input value={form.teacher} onChange={(e) => setForm({ ...form, teacher: e.target.value })}
              className={inputCls} placeholder="김선생님" />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm">
            등록
          </button>
          {error && <span className="text-red-500 dark:text-red-400 text-sm">{error}</span>}
        </div>
      </form>

      <div className="flex flex-wrap gap-3 mb-4">
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="이름 검색" className={inputCls + " !w-40"} />
        <select value={filterGrade} onChange={(e) => setFilterGrade(e.target.value)}
          className={selectCls}>
          <option value="">전체 학년</option>
          {GRADES.map((g) => <option key={g}>{g}</option>)}
        </select>
        <span className="text-xs text-gray-400 dark:text-gray-500 self-center ml-auto">{filtered.length}명</span>
      </div>

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
                {["이름","학년","학교","반","연락처","담당선생님",""].map((h) => (
                  <th key={h} className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300 text-xs uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {filtered.map((s) =>
                editId === s.id ? (
                  <tr key={s.id} className="bg-amber-50 dark:bg-amber-900/20">
                    <td className="px-3 py-2"><input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className={cellInputCls + " w-24"} /></td>
                    <td className="px-3 py-2">
                      <select value={editForm.grade} onChange={(e) => setEditForm({ ...editForm, grade: e.target.value })} className={cellInputCls + " w-20"}>
                        {GRADES.map((g) => <option key={g}>{g}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2"><input value={editForm.school} onChange={(e) => setEditForm({ ...editForm, school: e.target.value })} className={cellInputCls + " w-28"} /></td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1 max-w-[160px]">
                        {classes.map((c) => (
                          <label key={c.id} className="flex items-center gap-1 text-xs cursor-pointer">
                            <input
                              type="checkbox"
                              checked={editForm.class_ids.includes(String(c.id))}
                              onChange={(e) => {
                                const id = String(c.id);
                                setEditForm({ ...editForm, class_ids: e.target.checked ? [...editForm.class_ids, id] : editForm.class_ids.filter((x) => x !== id) });
                              }}
                              className="rounded"
                            />
                            {c.name}
                          </label>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2"><input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} className={cellInputCls + " w-32"} /></td>
                    <td className="px-3 py-2"><input value={editForm.teacher} onChange={(e) => setEditForm({ ...editForm, teacher: e.target.value })} className={cellInputCls + " w-24"} placeholder="선생님" /></td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <button onClick={saveEdit} disabled={saving} className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1 rounded-lg mr-2 disabled:opacity-50 transition-colors">{saving ? "저장중" : "저장"}</button>
                      <button onClick={() => setEditId(null)} className="text-xs text-gray-500 dark:text-gray-400 hover:underline">취소</button>
                    </td>
                  </tr>
                ) : (
                  <tr key={s.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="px-4 py-3 font-medium">
                      <Link href={`/students/${s.id}`} className="text-indigo-600 dark:text-indigo-400 hover:underline">{s.name}</Link>
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{s.grade}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{s.school ?? "-"}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                      {s.class_names.length > 0
                        ? <span className="flex flex-wrap gap-1">{s.class_names.map((n) => <span key={n} className="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-xs px-1.5 py-0.5 rounded">{n}</span>)}</span>
                        : <span className="text-gray-400 dark:text-gray-500">미배정</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{s.phone ?? "-"}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{s.teacher ?? "-"}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <button onClick={() => startEdit(s)} className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium mr-3">수정</button>
                      <button onClick={() => del(s.id)} className="text-xs text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 font-medium transition-colors">삭제</button>
                    </td>
                  </tr>
                )
              )}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400 dark:text-gray-500">원생이 없습니다</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
