"use client";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend,
} from "recharts";

const inputCls = "border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-orange-500";

interface MathTest { id: number; title: string; grade: string; test_date: string; }
interface Student { id: number; name: string; grade: string; }
interface MathSubmissionDetail {
  id: number;
  math_test_id: number;
  test_title: string;
  test_date: string;
  score: number;
  total: number;
  objective_points: number | null;
  objective_total: number | null;
  subjective_score: number | null;
  subjective_max: number | null;
  status: string;
  student_name: string;
  class_avg: number | null;
  class_rank: number | null;
  class_total: number | null;
  tendency: string | null;
  items?: {
    question_no: number;
    student_answer: number | null;
    correct_answer: number;
    is_correct: boolean;
    tag: string | null;
    tip: string | null;
  }[];
}

export type Subject = "수학" | "국어" | "영어" | "과학";

// objective_points 우선 사용 (배점 적용 점수), 없으면 score 폴백
function objPts(s: { score: number; total: number; objective_points: number | null; objective_total: number | null }) {
  return { pts: s.objective_points ?? s.score, tot: s.objective_total ?? s.total };
}

// 서술형 포함 퍼센트 계산
function calcTotalPct(s: MathSubmissionDetail) {
  const { pts, tot } = objPts(s);
  if (s.subjective_max != null && s.subjective_max > 0) {
    return Math.round(((pts + (s.subjective_score ?? 0)) / (tot + s.subjective_max)) * 100);
  }
  return tot > 0 ? Math.round((pts / tot) * 100) : 0;
}

// 점수 셀 텍스트 (배점 + 서술형 포함 형식)
function formatScoreCell(s: MathSubmissionDetail) {
  const { pts, tot } = objPts(s);
  if (!s.subjective_max) return `${pts}/${tot}`;
  const sub = s.subjective_score ?? 0;
  const total = pts + sub;
  if (s.items && s.items.length > 0) {
    const correct = s.items.filter(i => i.is_correct).length;
    const n = s.items.length;
    return `객관식 ${correct}/${n}문항(${pts}점) + 서술형 ${sub}점 = 합계 ${total}점`;
  }
  return `객관식 ${pts}점 + 서술형 ${sub}점 = 합계 ${total}점`;
}

export function subjectMatch(title: string, subject: Subject) {
  if (subject === "국어") return title.includes("국어");
  if (subject === "영어") return title.includes("영어");
  if (subject === "과학") return title.includes("과학");
  return !title.includes("국어") && !title.includes("영어") && !title.includes("과학");
}

function SubjectHistoryContent({ subject }: { subject: Subject }) {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<"individual" | "class">(
    searchParams.get("tab") === "class" ? "class" : "individual"
  );

  const [students, setStudents] = useState<Student[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [submissions, setSubmissions] = useState<MathSubmissionDetail[]>([]);
  const [loading, setLoading] = useState(false);

  const [mathTests, setMathTests] = useState<MathTest[]>([]);
  const [classTestId, setClassTestId] = useState("");
  const [classSubmissions, setClassSubmissions] = useState<MathSubmissionDetail[]>([]);
  const [classLoading, setClassLoading] = useState(false);

  useEffect(() => {
    apiFetch<Student[]>("/students").then(setStudents).catch(() => {});
    apiFetch<MathTest[]>("/math-tests").then(setMathTests).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedId) { setSubmissions([]); return; }
    setLoading(true);
    apiFetch<MathSubmissionDetail[]>(`/math-submissions?student_id=${selectedId}&detail=true`)
      .then(setSubmissions).catch(() => setSubmissions([])).finally(() => setLoading(false));
  }, [selectedId]);

  useEffect(() => {
    if (!classTestId) { setClassSubmissions([]); return; }
    setClassLoading(true);
    apiFetch<MathSubmissionDetail[]>(`/math-submissions?test_id=${classTestId}&detail=true`)
      .then((data) => setClassSubmissions(data.filter((s) => s.status === "graded" && s.total > 0)))
      .catch(() => setClassSubmissions([])).finally(() => setClassLoading(false));
  }, [classTestId]);

  const selected = students.find((s) => String(s.id) === selectedId);
  const filteredTests = mathTests.filter((t) => subjectMatch(t.title, subject));
  const graded = submissions.filter((s) => s.status === "graded" && s.total > 0 && subjectMatch(s.test_title ?? "", subject));

  // 성적 추이 데이터
  const trendData = graded.map((s) => {
    const pct = calcTotalPct(s);
    const classAvgPct = s.class_avg != null ? Math.round(s.class_avg) : null;
    return {
      name: (s.test_title ?? "").length > 8 ? (s.test_title ?? "").slice(0, 8) + "…" : (s.test_title ?? ""),
      fullName: s.test_title,
      date: s.test_date,
      pct,
      classAvgPct,
      score: s.score,
      total: s.total,
      subjective_score: s.subjective_score,
      subjective_max: s.subjective_max,
      rank: s.class_rank,
      rankTotal: s.class_total,
    };
  });

  // 개인별 문항 오답 빈도 (내 시험들 전체 누적)
  const wrongMap: Record<number, number> = {};
  const totalMap: Record<number, number> = {};
  graded.forEach((s) => {
    s.items?.forEach((item) => {
      totalMap[item.question_no] = (totalMap[item.question_no] ?? 0) + 1;
      if (!item.is_correct) wrongMap[item.question_no] = (wrongMap[item.question_no] ?? 0) + 1;
    });
  });
  const wrongData = Object.keys(totalMap).map(Number).sort((a, b) => a - b).map((q) => ({
    q: `${q}번`,
    wrongRate: totalMap[q] ? Math.round(((wrongMap[q] ?? 0) / totalMap[q]) * 100) : 0,
    wrong: wrongMap[q] ?? 0,
    total: totalMap[q],
  }));

  // 요약 계산
  const myAvg = trendData.length > 0 ? Math.round(trendData.reduce((s, d) => s + d.pct, 0) / trendData.length) : null;
  const classAvgAvg = trendData.filter((d) => d.classAvgPct != null).length > 0
    ? Math.round(trendData.filter((d) => d.classAvgPct != null).reduce((s, d) => s + d.classAvgPct!, 0) / trendData.filter((d) => d.classAvgPct != null).length)
    : null;
  const latest = trendData[trendData.length - 1];
  const prev = trendData[trendData.length - 2];
  const diff = latest && prev ? latest.pct - prev.pct : null;
  const bestRank = graded.some((s) => s.class_rank != null)
    ? Math.min(...graded.filter((s) => s.class_rank != null).map((s) => s.class_rank!))
    : null;

  // 반별 뷰 계산
  const classGraded = classSubmissions;
  const classPct = (r: MathSubmissionDetail) => calcTotalPct(r);
  const classAvgPct = classGraded.length > 0
    ? Math.round(classGraded.reduce((s, r) => s + classPct(r), 0) / classGraded.length)
    : null;
  const classMax = classGraded.length > 0 ? Math.max(...classGraded.map(classPct)) : null;
  const classMin = classGraded.length > 0 ? Math.min(...classGraded.map(classPct)) : null;
  const classSorted = [...classGraded].sort((a, b) => classPct(b) - classPct(a));

  // 점수 분포 (10점 단위)
  const distMap: Record<string, number> = {};
  classGraded.forEach((r) => {
    const band = `${Math.floor(classPct(r) / 10) * 10}점대`;
    distMap[band] = (distMap[band] ?? 0) + 1;
  });
  const distData = Array.from({ length: 10 }, (_, i) => ({
    band: `${i * 10}점대`,
    count: distMap[`${i * 10}점대`] ?? 0,
  })).filter((d) => d.count > 0);

  // 반 전체 문항별 오답률 (class tab용 — 해당 시험 응시 학생 전체 집계)
  const classWrongRates = (() => {
    const wMap: Record<number, number> = {};
    const tMap: Record<number, number> = {};
    classSubmissions.forEach((s) => {
      s.items?.forEach((item) => {
        tMap[item.question_no] = (tMap[item.question_no] ?? 0) + 1;
        if (!item.is_correct) wMap[item.question_no] = (wMap[item.question_no] ?? 0) + 1;
      });
    });
    return Object.keys(tMap).map(Number).sort((a, b) => a - b).map((q) => ({
      q: `${q}번`,
      rate: tMap[q] ? Math.round(((wMap[q] ?? 0) / tMap[q]) * 100) : 0,
      wrong: wMap[q] ?? 0,
      total: tMap[q],
    }));
  })();

  // 개별 리포트 HTML
  const buildReportHtml = (s: MathSubmissionDetail, rank: number, total: number, avgPct: number | null) => {
    const { pts: oPts, tot: oTot } = objPts(s);
    const pct = calcTotalPct(s);
    const diffVal = avgPct != null ? pct - avgPct : null;
    const wrong = s.items?.filter((i) => !i.is_correct).map((i) => i.question_no).sort((a, b) => a - b) ?? [];
    const today = new Date().toLocaleDateString("ko-KR");
    const escHtml = (str: string) => str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const wrongRows = wrong.map((q) => `<span class="badge red">${q}번</span>`).join("") || `<span class="badge green">없음 (만점)</span>`;
    const weakTagMap: Record<string, number[]> = {};
    (s.items ?? []).filter(i => !i.is_correct && i.tag).forEach(i => {
      const t = i.tag!;
      if (!weakTagMap[t]) weakTagMap[t] = [];
      weakTagMap[t].push(i.question_no);
    });
    const weakTagHtml = Object.entries(weakTagMap).map(([tag, qnos]) =>
      `<span class="badge red">${tag} (${qnos.map(q => q + "번").join(", ")})</span>`
    ).join("") || "";
    const studyGuideHtml = (s.items ?? [])
      .filter(i => !i.is_correct && i.tip && !i.tip.includes("논술형"))
      .sort((a, b) => a.question_no - b.question_no)
      .map(i => `
        <div class="tip-card">
          <div class="tip-head">${i.question_no}번 문항</div>
          ${i.tag ? `<div class="tip-concept">${escHtml(i.tag)}</div>` : ""}
          <div class="tip-body">💡 ${escHtml(i.tip!)}</div>
        </div>`
      ).join("");
    const barItems = (s.items ?? []).map((item) => `
      <div class="bar-item">
        <div class="bar-no">${item.question_no}</div>
        <div class="bar-fill ${item.is_correct ? "correct" : "wrong"}"></div>
        <div class="bar-label">${item.is_correct ? "○" : "✗"}</div>
      </div>`).join("");

    return `<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8"><title>${s.student_name} - ${s.test_title}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif;background:#f3f4f6;display:flex;justify-content:center;padding:32px 16px}
  .report{background:#fff;width:780px;border:1px solid #e2e8f0;border-radius:12px;padding:40px;box-shadow:0 4px 24px rgba(0,0,0,.08)}
  .header{display:flex;justify-content:space-between;align-items:flex-end;padding-bottom:20px;border-bottom:2px solid #e5e7eb}
  .header-left h2{font-size:18px;font-weight:700;color:#1f2937}.header-left p{font-size:12px;color:#9ca3af;margin-top:2px}
  .header-right h1{font-size:22px;font-weight:700;color:#2563eb}.header-right p{font-size:12px;color:#6b7280;margin-top:4px;text-align:right}
  .info-box{margin:24px 0;background:#f9fafb;border-radius:8px;padding:16px;border:1px solid #e5e7eb;display:flex;gap:40px;flex-wrap:wrap}
  .info-item{font-size:14px;color:#374151}.info-item b{color:#4b5563;margin-right:8px}
  .section-title{font-size:16px;font-weight:700;color:#1f2937;border-left:4px solid #2563eb;padding-left:12px;margin:28px 0 16px}
  .score-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
  .score-card{background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:16px;text-align:center}
  .score-card .label{font-size:11px;color:#9ca3af;margin-bottom:6px}.score-card .value{font-size:26px;font-weight:700}
  .blue{color:#2563eb}.orange{color:#f97316}.green{color:#16a34a}.red{color:#dc2626}
  .bar-wrap{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
  .bar-item{display:flex;flex-direction:column;align-items:center;gap:2px}
  .bar-no{font-size:10px;color:#6b7280}.bar-fill{width:20px;height:40px;border-radius:4px}
  .bar-fill.correct{background:#4ade80}.bar-fill.wrong{background:#f87171}
  .bar-label{font-size:11px;font-weight:700}
  .badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:12px;font-weight:500;margin:2px}
  .badge.red{background:#fee2e2;color:#dc2626}.badge.green{background:#dcfce7;color:#16a34a}
  .tip-card{background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:12px 14px;margin-bottom:8px}
  .tip-card .tip-head{font-size:12px;font-weight:700;color:#1d4ed8;margin-bottom:4px}
  .tip-card .tip-concept{font-size:11px;color:#6b7280;margin-bottom:6px}
  .tip-card .tip-body{font-size:13px;color:#374151;line-height:1.6}
  .print-btn{display:block;margin:24px auto 0;padding:10px 28px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer}
  @media print{.print-btn{display:none}body{background:#fff;padding:0}.report{box-shadow:none;border:none}}
</style></head><body>
<div class="report">
  <div class="header">
    <div class="header-left"><h2>대치프라임 학원</h2><p>Daechi Prime Academy</p></div>
    <div class="header-right"><h1>${subject} 성적 분석 리포트</h1><p>발송일: ${today}</p></div>
  </div>
  <div class="info-box">
    <div class="info-item"><b>학생명</b>${s.student_name}</div>
    <div class="info-item"><b>시험명</b>${s.test_title}</div>
    <div class="info-item"><b>시험일</b>${s.test_date}</div>
  </div>
  <div class="section-title">성적 분석</div>
  ${s.subjective_max != null ? `
  <div style="background:#fdf4ff;border:1px solid #e9d5ff;border-radius:8px;padding:12px 16px;margin-bottom:12px;font-size:14px;color:#374151;">
    <span style="font-weight:600;">객관식</span> ${s.items ? `${s.items.filter((i:{is_correct:boolean})=>i.is_correct).length}/${s.items.length}문항` : ""}(${oPts}점)
    &nbsp;+&nbsp;<span style="font-weight:600;">서술형</span> ${s.subjective_score ?? 0}점
    &nbsp;=&nbsp;<span style="font-weight:700;color:#7c3aed;">합계 ${oPts + (s.subjective_score ?? 0)}점</span>
    <span style="color:#9ca3af;font-size:12px;margin-left:8px;">(객관식 만점 ${oTot}점 + 서술형 만점 ${s.subjective_max}점)</span>
  </div>` : ""}
  <div class="score-grid">
    <div class="score-card"><div class="label">점수</div><div class="value blue">${oPts + (s.subjective_max != null ? (s.subjective_score ?? 0) : 0)}<span style="font-size:14px;font-weight:400">/${oTot + (s.subjective_max ?? 0)}점</span></div></div>
    <div class="score-card"><div class="label">정답률</div><div class="value ${pct >= 80 ? "green" : pct >= 60 ? "orange" : "red"}">${pct}%</div></div>
    <div class="score-card"><div class="label">반 평균</div><div class="value orange">${avgPct != null ? avgPct + "%" : "-"}</div></div>
    <div class="score-card"><div class="label">석차</div><div class="value blue">${rank}<span style="font-size:14px;font-weight:400">/${total}등</span></div></div>
  </div>
  ${diffVal != null ? `<p style="margin-top:12px;font-size:13px;color:${diffVal >= 0 ? "#16a34a" : "#dc2626"};font-weight:600;">반 평균 대비: ${diffVal >= 0 ? "▲" : "▼"} ${Math.abs(diffVal)}%p</p>` : ""}
  ${s.tendency ? `
  <div class="section-title">출제경향</div>
  <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px 16px;font-size:13px;color:#374151;line-height:1.7;white-space:pre-wrap;">${escHtml(s.tendency)}</div>` : ""}
  <div class="section-title">문항별 결과</div>
  <div class="bar-wrap">${barItems}</div>
  <div style="margin-top:16px;"><p style="font-size:13px;color:#374151;margin-bottom:6px;"><b>오답 문항</b></p><div>${wrongRows}</div></div>
  ${weakTagHtml ? `<div style="margin-top:16px;"><p style="font-size:13px;color:#374151;margin-bottom:6px;"><b>취약 유형</b></p><div>${weakTagHtml}</div></div>` : ""}
  <button class="print-btn" onclick="window.print()">인쇄 / PDF 저장</button>
</div></body></html>`;
  };

  const openReport = (s: MathSubmissionDetail, rank: number) => {
    const html = buildReportHtml(s, rank, classGraded.length, classAvgPct);
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
  };

  const downloadAllJpg = async () => {
    if (classGraded.length === 0) return;
    const JSZip = (await import("jszip")).default;
    const html2canvas = (await import("html2canvas")).default;
    const zip = new JSZip();
    const btn = document.getElementById("bulk-jpg-btn");
    if (btn) btn.textContent = "생성 중...";
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;left:-9999px;top:0;width:820px;height:1200px;border:none;";
    document.body.appendChild(iframe);
    for (let i = 0; i < classSorted.length; i++) {
      const s = classSorted[i];
      const rank = i + 1;
      if (btn) btn.textContent = `생성 중... (${rank}/${classSorted.length}) ${s.student_name}`;
      const html = buildReportHtml(s, rank, classGraded.length, classAvgPct);
      const doc = iframe.contentDocument!;
      doc.open(); doc.write(html); doc.close();
      await new Promise((r) => setTimeout(r, 700));
      const reportEl = doc.querySelector(".report") as HTMLElement;
      if (reportEl) {
        const canvas = await html2canvas(reportEl, { scale: 2, useCORS: true, backgroundColor: "#fff" });
        const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), "image/jpeg", 0.92));
        zip.file(`${String(rank).padStart(2, "0")}_${s.student_name}_리포트.jpg`, blob);
      }
    }
    document.body.removeChild(iframe);
    if (btn) btn.textContent = "ZIP 압축 중...";
    const zipBlob = await zip.generateAsync({ type: "blob" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(zipBlob);
    const testTitle = mathTests.find((t) => String(t.id) === classTestId)?.title ?? "리포트";
    link.download = `${testTitle}_전원리포트.zip`;
    link.click();
    if (btn) btn.textContent = "전원 JPG 저장 (ZIP)";
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{subject} 성적 추이</h1>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 mb-6 border-b border-gray-200 dark:border-gray-700">
        {([["individual", "개별 성적"], ["class", "시험별"]] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === key
                ? "border-orange-500 text-orange-600 dark:text-orange-400"
                : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* ───── 시험별(반별) 탭 ───── */}
      {tab === "class" && (
        <div>
          <div className="flex gap-3 items-center mb-6 flex-wrap">
            <select value={classTestId} onChange={(e) => setClassTestId(e.target.value)} className={inputCls + " w-72"}>
              <option value="">시험 선택...</option>
              {filteredTests.map((t) => (
                <option key={t.id} value={t.id}>{t.title} ({t.grade} · {t.test_date})</option>
              ))}
            </select>
            {classGraded.length > 0 && (
              <>
                <span className="text-sm text-gray-500 dark:text-gray-400">응시 {classGraded.length}명</span>
                <button
                  id="bulk-jpg-btn"
                  onClick={downloadAllJpg}
                  className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm"
                >
                  전원 JPG 저장 (ZIP)
                </button>
              </>
            )}
            <Link
              href="/subject-analysis"
              className="ml-auto flex items-center gap-1.5 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 border border-indigo-200 dark:border-indigo-700 px-3 py-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors"
            >
              세부 분석 →
            </Link>
          </div>

          {!classTestId && (
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-12 text-center text-gray-400 dark:text-gray-500 shadow-sm">
              시험을 선택하면 응시 학생 전체 성적을 확인할 수 있습니다
            </div>
          )}
          {classTestId && classLoading && <div className="text-center text-gray-400 py-12">불러오는 중...</div>}
          {classTestId && !classLoading && classGraded.length === 0 && (
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-12 text-center text-gray-400 dark:text-gray-500 shadow-sm">
              채점 완료된 응시자가 없습니다
            </div>
          )}

          {classTestId && !classLoading && classGraded.length > 0 && (
            <div className="space-y-5">
              {/* 요약 카드 */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "응시 인원", value: `${classGraded.length}명`, color: "text-indigo-600 dark:text-indigo-400" },
                  { label: "반 평균", value: `${classAvgPct}%`, color: "text-orange-600 dark:text-orange-400" },
                  { label: "최고 점수", value: `${classMax}%`, color: "text-green-600 dark:text-green-400" },
                  { label: "최저 점수", value: `${classMin}%`, color: "text-red-500 dark:text-red-400" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 shadow-sm">
                    <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">{label}</p>
                    <p className={`text-2xl font-bold ${color}`}>{value}</p>
                  </div>
                ))}
              </div>

              {/* 점수 분포 */}
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5 shadow-sm">
                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">점수 분포</h2>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={distData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                    <XAxis dataKey="band" tick={{ fontSize: 11, fill: "#9ca3af" }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#9ca3af" }} />
                    <Tooltip formatter={(v) => [`${v}명`, "인원"]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]} fill="#f97316" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* 학생별 성적 테이블 */}
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
                      <tr>
                        {["석차", "이름", "점수", "정답률", "반 평균 대비", "오답 문항", ""].map((h) => (
                          <th key={h} className="text-left px-4 py-3 font-semibold text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                      {classSorted.map((s, idx) => {
                        const pct = classPct(s);
                        const d = classAvgPct != null ? pct - classAvgPct : null;
                        const wrong = s.items?.filter((i) => !i.is_correct).map((i) => i.question_no).sort((a, b) => a - b) ?? [];
                        return (
                          <tr key={s.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                            <td className="px-4 py-3 font-bold text-gray-700 dark:text-gray-200">{idx + 1}등</td>
                            <td className="px-4 py-3 font-medium text-gray-800 dark:text-gray-100">{s.student_name}</td>
                            <td className="px-4 py-3 font-bold text-orange-600 dark:text-orange-400 text-xs">
                              {formatScoreCell(s)}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`font-bold ${pct >= 80 ? "text-green-600 dark:text-green-400" : pct >= 60 ? "text-orange-500" : "text-red-500"}`}>{pct}%</span>
                            </td>
                            <td className="px-4 py-3 text-sm">
                              {d != null ? (
                                <span className={d >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}>
                                  {d >= 0 ? "▲" : "▼"}{Math.abs(d)}%p
                                </span>
                              ) : "-"}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap gap-1">
                                {wrong.length === 0
                                  ? <span className="text-xs text-green-500">만점</span>
                                  : wrong.map((q) => (
                                    <span key={q} className="text-xs bg-red-50 dark:bg-red-900/30 text-red-500 dark:text-red-400 px-1.5 py-0.5 rounded">{q}번</span>
                                  ))}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex gap-1">
                                <button onClick={() => openReport(s, idx + 1)}
                                  className="text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 px-2 py-1 rounded font-medium transition-colors">
                                  리포트
                                </button>
                                <button
                                  onClick={() => {
                                    const html = buildReportHtml(s, idx + 1, classGraded.length, classAvgPct);
                                    const win = window.open("", "_blank");
                                    if (!win) return;
                                    win.document.write(html);
                                    win.document.close();
                                    setTimeout(() => win.print(), 600);
                                  }}
                                  className="text-xs bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 px-2 py-1 rounded font-medium transition-colors">
                                  인쇄
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ── 시험 전체 문항별 오답률 ── */}
              {classWrongRates.length > 0 && (
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5 shadow-sm">
                  <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">문항별 오답률 (전체 응시자 기준)</h2>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">해당 시험을 응시한 학생 전체의 문항별 오답 비율입니다</p>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={classWrongRates} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                      <XAxis dataKey="q" tick={{ fontSize: 10, fill: "#9ca3af" }} />
                      <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10, fill: "#9ca3af" }} />
                      <Tooltip
                        formatter={(value, _, props) => [`${value}% (${props.payload.wrong}/${props.payload.total}명)`, "오답률"]}
                        contentStyle={{ fontSize: 11, borderRadius: 6 }}
                      />
                      <Bar dataKey="rate" radius={[3, 3, 0, 0]}>
                        {classWrongRates.map((d, i) => (
                          <Cell key={i} fill={d.rate >= 70 ? "#dc2626" : d.rate >= 40 ? "#f97316" : "#4ade80"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {classWrongRates.filter((d) => d.rate >= 50).map((d) => (
                      <span key={d.q}
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${d.rate >= 70 ? "bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400" : "bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400"}`}>
                        {d.q} {d.rate}%
                      </span>
                    ))}
                    {classWrongRates.filter((d) => d.rate >= 50).length === 0 && (
                      <span className="text-xs text-green-500">50% 이상 오답 문항 없음</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ───── 개별 성적 탭 ───── */}
      {tab === "individual" && (
        <div>
          <div className="flex gap-3 items-center mb-6 flex-wrap">
            <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} className={inputCls + " w-52"}>
              <option value="">학생 선택...</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>{s.name} ({s.grade})</option>
              ))}
            </select>
            {selected && graded.length > 0 && (
              <>
                <span className="text-sm text-gray-500 dark:text-gray-400">총 {graded.length}회 시험</span>
                <button
                  onClick={async () => {
                    const el = document.getElementById("individual-report");
                    if (!el) return;
                    const html2canvas = (await import("html2canvas")).default;
                    const canvas = await html2canvas(el, {
                      scale: 2, useCORS: true, backgroundColor: "#ffffff",
                      onclone: (_d, clonedEl) => {
                        (clonedEl as HTMLElement).querySelectorAll<HTMLElement>("*").forEach((node) => {
                          const cs = window.getComputedStyle(node);
                          const bg = cs.backgroundColor;
                          const fg = cs.color;
                          if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") node.style.backgroundColor = bg;
                          if (fg) node.style.color = fg;
                          node.style.borderColor = cs.borderTopColor;
                        });
                      },
                    });
                    const link = document.createElement("a");
                    link.download = `${selected.name}_${subject}성적분석.jpg`;
                    link.href = canvas.toDataURL("image/jpeg", 0.92);
                    link.click();
                  }}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm ml-auto"
                >
                  JPG로 저장
                </button>
              </>
            )}
          </div>

          {!selectedId && (
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-12 text-center text-gray-400 dark:text-gray-500 shadow-sm">
              학생을 선택하면 성적 분석 리포트를 확인할 수 있습니다
            </div>
          )}
          {selectedId && loading && <div className="text-center text-gray-400 py-12">불러오는 중...</div>}
          {selectedId && !loading && graded.length === 0 && (
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-12 text-center text-gray-400 dark:text-gray-500 shadow-sm">
              채점 완료된 {subject} 시험이 없습니다
            </div>
          )}

          {selectedId && !loading && graded.length > 0 && (
            <div id="individual-report" style={{ backgroundColor: "#fff", color: "#1a1a1a", fontFamily: "Noto Sans KR, Apple SD Gothic Neo, sans-serif" }}
              className="border border-gray-200 rounded-xl shadow-lg overflow-hidden">
              <div style={{ padding: "40px" }}>
                {/* 헤더 */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", paddingBottom: "20px", borderBottom: "2px solid #e5e7eb" }}>
                  <div>
                    <div style={{ fontSize: "18px", fontWeight: "bold", color: "#1f2937" }}>대치프라임 학원</div>
                    <div style={{ fontSize: "12px", color: "#9ca3af", marginTop: "2px" }}>Daechi Prime Academy</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "22px", fontWeight: "bold", color: "#2563eb" }}>{subject} 성적 분석 리포트</div>
                    <div style={{ fontSize: "13px", color: "#6b7280", marginTop: "4px" }}>
                      {new Date().getFullYear()}년 / 발송일: {new Date().toLocaleDateString("ko-KR")}
                    </div>
                  </div>
                </div>
                {/* 학생 정보 */}
                <div style={{ margin: "24px 0", backgroundColor: "#f9fafb", borderRadius: "8px", padding: "16px", border: "1px solid #e5e7eb" }}>
                  <div style={{ display: "flex", gap: "48px" }}>
                    <div><span style={{ fontWeight: "bold", color: "#4b5563", marginRight: "12px" }}>학생명</span><span style={{ fontWeight: "600" }}>{selected?.name}</span></div>
                    <div><span style={{ fontWeight: "bold", color: "#4b5563", marginRight: "12px" }}>학년</span>{selected?.grade}</div>
                    <div><span style={{ fontWeight: "bold", color: "#4b5563", marginRight: "12px" }}>총 응시 횟수</span>{graded.length}회</div>
                    {bestRank != null && <div><span style={{ fontWeight: "bold", color: "#4b5563", marginRight: "12px" }}>최고 석차</span>{bestRank}등</div>}
                  </div>
                </div>
                {/* 성적 분석 */}
                <div style={{ marginTop: "28px" }}>
                  <div style={{ fontSize: "17px", fontWeight: "bold", color: "#1f2937", borderLeft: "4px solid #2563eb", paddingLeft: "12px", marginBottom: "20px" }}>
                    성적 분석
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", alignItems: "center" }}>
                    <div>
                      <ResponsiveContainer width="100%" height={260}>
                        <LineChart data={trendData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                          <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#6b7280" }} />
                          <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10, fill: "#6b7280" }} />
                          <Tooltip
                            formatter={(value, name) => [`${value}%`, name === "pct" ? "내 점수" : "반 평균"]}
                            labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName ?? ""}
                            contentStyle={{ fontSize: 11, borderRadius: 6 }}
                          />
                          <Legend formatter={(v) => v === "pct" ? "내 점수" : "반 평균"} wrapperStyle={{ fontSize: 11 }} />
                          <Line type="monotone" dataKey="pct" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 4, fill: "#3b82f6" }} activeDot={{ r: 6 }} />
                          <Line type="monotone" dataKey="classAvgPct" stroke="#f97316" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 3, fill: "#f97316" }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                    <div>
                      <table style={{ width: "100%", textAlign: "center", borderCollapse: "collapse", fontSize: "13px" }}>
                        <thead>
                          <tr style={{ backgroundColor: "#f3f4f6", borderBottom: "2px solid #d1d5db" }}>
                            {["시험명", "점수", "반 평균", "평균 대비", "석차"].map((h) => (
                              <th key={h} style={{ padding: "10px 8px", fontWeight: "600", color: "#4b5563" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {graded.map((s) => {
                            const pct = calcTotalPct(s);
                            const { pts: sPts, tot: sTot } = objPts(s);
                            const avg = s.class_avg != null ? Math.round(s.class_avg) : null;
                            const d = avg != null ? pct - avg : null;
                            const totalScore = sPts + (s.subjective_max != null ? (s.subjective_score ?? 0) : 0);
                            const maxScore = sTot + (s.subjective_max ?? 0);
                            return (
                              <tr key={s.id} style={{ borderBottom: "1px solid #e5e7eb" }}>
                                <td style={{ padding: "8px", color: "#374151", fontWeight: "500", textAlign: "left" }}>{s.test_title}</td>
                                <td style={{ padding: "8px", fontWeight: "bold", color: "#2563eb" }}>
                                  {s.subjective_max != null
                                    ? <>{totalScore}<span style={{ fontWeight: "normal", fontSize: "11px" }}>/{maxScore}점</span></>
                                    : <>{s.score}<span style={{ fontWeight: "normal", fontSize: "11px" }}>점</span></>}
                                </td>
                                <td style={{ padding: "8px", color: "#6b7280" }}>{avg != null ? `${avg}%` : "-"}</td>
                                <td style={{ padding: "8px", fontWeight: "500", color: d != null ? (d >= 0 ? "#16a34a" : "#dc2626") : "#6b7280" }}>
                                  {d != null ? `${d >= 0 ? "▲" : "▼"} ${Math.abs(d)}` : "-"}
                                </td>
                                <td style={{ padding: "8px", color: "#374151" }}>
                                  {s.class_rank != null && s.class_total != null ? `${s.class_rank}/${s.class_total}` : "-"}
                                </td>
                              </tr>
                            );
                          })}
                          <tr style={{ backgroundColor: "#eff6ff", fontWeight: "bold", borderTop: "2px solid #bfdbfe" }}>
                            <td style={{ padding: "10px 8px", textAlign: "left", color: "#1d4ed8" }}>전체 평균</td>
                            <td style={{ padding: "10px 8px", color: "#1d4ed8" }}>{myAvg}%</td>
                            <td style={{ padding: "10px 8px", color: "#1d4ed8" }}>{classAvgAvg != null ? `${classAvgAvg}%` : "-"}</td>
                            <td style={{ padding: "10px 8px", color: myAvg != null && classAvgAvg != null ? (myAvg >= classAvgAvg ? "#16a34a" : "#dc2626") : "#6b7280" }}>
                              {myAvg != null && classAvgAvg != null ? `${myAvg >= classAvgAvg ? "▲" : "▼"} ${Math.abs(myAvg - classAvgAvg)}` : "-"}
                            </td>
                            <td style={{ padding: "10px 8px", color: "#1d4ed8" }}>{bestRank != null ? `최고 ${bestRank}등` : "-"}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
                {/* 문항별 오답 현황 */}
                {wrongData.length > 0 && (
                  <div style={{ marginTop: "32px" }}>
                    <div style={{ fontSize: "17px", fontWeight: "bold", color: "#1f2937", borderLeft: "4px solid #2563eb", paddingLeft: "12px", marginBottom: "20px" }}>
                      문항별 오답 현황 <span style={{ fontSize: "12px", fontWeight: "400", color: "#9ca3af" }}>내 응시 전체 누적</span>
                    </div>
                    <div style={{ backgroundColor: "#f9fafb", borderRadius: "8px", border: "1px solid #e5e7eb", padding: "16px" }}>
                      <ResponsiveContainer width="100%" height={180}>
                        <BarChart data={wrongData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                          <XAxis dataKey="q" tick={{ fontSize: 10, fill: "#6b7280" }} />
                          <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10, fill: "#6b7280" }} />
                          <Tooltip formatter={(value, _, props) => [`${value}% (${props.payload.wrong}/${props.payload.total}회)`, "오답률"]} contentStyle={{ fontSize: 11, borderRadius: 6 }} />
                          <Bar dataKey="wrongRate" radius={[3, 3, 0, 0]}>
                            {wrongData.map((d, i) => (
                              <Cell key={i} fill={d.wrongRate >= 70 ? "#dc2626" : d.wrongRate >= 40 ? "#f97316" : "#4ade80"} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                      <div style={{ marginTop: "12px", display: "flex", flexWrap: "wrap", gap: "6px" }}>
                        {wrongData.filter((d) => d.wrongRate >= 40).map((d) => (
                          <span key={d.q} style={{ fontSize: "12px", backgroundColor: d.wrongRate >= 70 ? "#fee2e2" : "#ffedd5", color: d.wrongRate >= 70 ? "#dc2626" : "#c2410c", padding: "2px 10px", borderRadius: "999px", fontWeight: "500" }}>
                            {d.q} ({d.wrongRate}%)
                          </span>
                        ))}
                        {wrongData.filter((d) => d.wrongRate >= 40).length === 0 && (
                          <span style={{ fontSize: "12px", color: "#16a34a" }}>전체 문항 오답률 40% 미만 — 양호</span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function SubjectHistoryPage({ subject }: { subject: Subject }) {
  return (
    <Suspense fallback={<div className="text-gray-400 py-20 text-center">불러오는 중...</div>}>
      <SubjectHistoryContent subject={subject} />
    </Suspense>
  );
}
