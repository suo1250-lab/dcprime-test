"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

const entranceCards = [
  { href: "/students", label: "원생 관리", desc: "원생 등록 및 프로필 조회", icon: "👤" },
  { href: "/tests", label: "테스트 관리", desc: "테스트 생성 및 정답 등록", icon: "📝" },
  { href: "/results/new", label: "결과 입력", desc: "문항별 O/X 입력", icon: "✏️" },
  { href: "/analytics", label: "분석 대시보드", desc: "문항별 오답률 및 반별 비교", icon: "📊" },
  { href: "/classes", label: "반 배정", desc: "점수 기준 자동 배정", icon: "🏫" },
  { href: "/historical", label: "역대 이력", desc: "과거 입학테스트 데이터", icon: "📁" },
];

const wordCards = [
  { href: "/word-tests", label: "단어시험 관리", desc: "단어 목록 등록 및 QR 생성", icon: "📚" },
  { href: "/word-submissions", label: "단어시험 채점", desc: "AI 채점 결과 검토 및 확정", icon: "✅" },
  { href: "/word-tutoring", label: "튜터링 기록", desc: "1~3차 시험 결과 기록 및 조회", icon: "🔄" },
];

const mathCards = [
  { href: "/math-tests", label: "시험 관리", desc: "수학 시험 생성 및 정답 등록", icon: "📐" },
  { href: "/math-submissions", label: "OMR 채점", desc: "OMR 답안지 업로드 및 결과 조회", icon: "📋" },
  { href: "/math-tutoring", label: "튜터링 기록", desc: "수학 튜터링 결과 기록 및 조회", icon: "🔢" },
  { href: "/math-history", label: "성적 추이", desc: "학생별 시험 성적 추이 및 오답 분석", icon: "📈" },
];

interface NasFolder { count: number; files: string[] }
interface NasStatus {
  ungraded_entrance: NasFolder;
  ungraded_word: NasFolder;
  graded_entrance: NasFolder;
  graded_word: NasFolder;
  error: NasFolder;
  unmatched: NasFolder;
}

export default function Home() {
  const [nas, setNas] = useState<NasStatus | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const loadNas = () => {
    apiFetch<NasStatus>("/nas/status").then(setNas).catch(() => {});
  };

  useEffect(() => { loadNas(); }, []);

  const deleteFile = async (type: "error" | "unmatched", filename: string) => {
    if (!confirm(`${filename} 을 삭제하시겠습니까?`)) return;
    await apiFetch(`/nas/${type}/${encodeURIComponent(filename)}`, { method: "DELETE" });
    loadNas();
  };

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-3 mb-4">
          <span className="bg-indigo-600 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-sm">입학테스트</span>
          <h2 className="text-base font-bold text-gray-700 dark:text-gray-200">입학테스트 관리</h2>
          <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {entranceCards.map((c) => (
            <Link key={c.href} href={c.href}
              className="group flex flex-col bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 hover:shadow-md hover:border-indigo-400 dark:hover:border-indigo-500 transition-all duration-200">
              <span className="text-2xl mb-2">{c.icon}</span>
              <div className="text-sm font-semibold text-indigo-700 dark:text-indigo-400 mb-1 group-hover:text-indigo-600">{c.label}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{c.desc}</div>
            </Link>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center gap-3 mb-4">
          <span className="bg-emerald-600 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-sm">영어단어</span>
          <h2 className="text-base font-bold text-gray-700 dark:text-gray-200">영어단어 튜터링</h2>
          <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {wordCards.map((c) => (
            <Link key={c.href} href={c.href}
              className="group flex flex-col bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 hover:shadow-md hover:border-emerald-400 dark:hover:border-emerald-500 transition-all duration-200">
              <span className="text-2xl mb-2">{c.icon}</span>
              <div className="text-sm font-semibold text-emerald-700 dark:text-emerald-400 mb-1">{c.label}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{c.desc}</div>
            </Link>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center gap-3 mb-4">
          <span className="bg-orange-600 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-sm">수학</span>
          <h2 className="text-base font-bold text-gray-700 dark:text-gray-200">수학 튜터링</h2>
          <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {mathCards.map((c) => (
            <Link key={c.href} href={c.href}
              className="group flex flex-col bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 hover:shadow-md hover:border-orange-400 dark:hover:border-orange-500 transition-all duration-200">
              <span className="text-2xl mb-2">{c.icon}</span>
              <div className="text-sm font-semibold text-orange-700 dark:text-orange-400 mb-1">{c.label}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{c.desc}</div>
            </Link>
          ))}
        </div>
      </div>

      {/* NAS 폴더 현황 */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <span className="bg-gray-600 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-sm">NAS</span>
          <h2 className="text-base font-bold text-gray-700 dark:text-gray-200">폴더 현황</h2>
          <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
          <button onClick={loadNas} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">새로고침</button>
        </div>
        {nas ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { key: "ungraded_entrance", label: "입학테스트 미채점", data: nas.ungraded_entrance, color: "yellow" },
              { key: "ungraded_word",     label: "단어시험 미채점",   data: nas.ungraded_word,     color: "yellow" },
              { key: "graded_entrance",   label: "입학테스트 채점완료", data: nas.graded_entrance,  color: "green" },
              { key: "graded_word",       label: "단어시험 채점완료",  data: nas.graded_word,       color: "green" },
              { key: "error",             label: "오류 파일",          data: nas.error,             color: "red" },
              { key: "unmatched",         label: "미매칭 파일",        data: nas.unmatched,         color: "orange" },
            ].map(({ key, label, data, color }) => {
              const colorMap: Record<string, string> = {
                yellow: "border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/20",
                green:  "border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20",
                red:    "border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20",
                orange: "border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/20",
              };
              const badgeMap: Record<string, string> = {
                yellow: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400",
                green:  "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400",
                red:    "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
                orange: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400",
              };
              const isExpandable = (key === "error" || key === "unmatched") && data.count > 0;
              return (
                <div key={key}
                  className={`rounded-xl border p-4 ${colorMap[color]} ${isExpandable ? "cursor-pointer" : ""}`}
                  onClick={() => isExpandable && setExpanded(expanded === key ? null : key)}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{label}</span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${badgeMap[color]}`}>{data.count}개</span>
                  </div>
                  {isExpandable && expanded === key && (
                    <ul className="mt-3 space-y-1.5" onClick={(e) => e.stopPropagation()}>
                      {data.files.map((f) => (
                        <li key={f} className="flex items-center justify-between gap-2">
                          <span className="text-xs text-gray-700 dark:text-gray-300 truncate">{f}</span>
                          <button onClick={() => deleteFile(key as "error" | "unmatched", f)}
                            className="text-xs text-red-500 hover:underline shrink-0">삭제</button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {isExpandable && data.count > 0 && expanded !== key && (
                    <p className="text-xs text-gray-400 mt-1">클릭해서 파일 목록 보기</p>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-gray-400 dark:text-gray-500">NAS 연결 없음</p>
        )}
      </div>
    </div>
  );
}
