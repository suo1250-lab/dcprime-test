"use client";
import { useState } from "react";
import Link from "next/link";
import LogoutButton from "./LogoutButton";

const entranceNav = [
  { href: "/students", label: "원생 관리" },
  { href: "/tests", label: "테스트 관리" },
  { href: "/results", label: "결과 조회" },
  { href: "/results/new", label: "결과 입력" },
  { href: "/analytics", label: "분석" },
  { href: "/classes", label: "반 배정" },
  { href: "/historical", label: "역대 이력" },
];

const wordNav = [
  { href: "/word-tests", label: "단어시험 관리" },
  { href: "/word-submissions", label: "단어시험 채점" },
  { href: "/unmatched-submissions", label: "매칭 불가" },
  { href: "/word-tutoring", label: "튜터링 기록" },
  { href: "/word-config", label: "채점 설정" },
  { href: "/word-answer-key", label: "답지 등록" },
];

const mathNav = [
  { href: "/math-tests", label: "시험 관리" },
  { href: "/math-submissions", label: "OMR 채점" },
  { href: "/math-tutoring", label: "튜터링 기록" },
];

export default function NavBar() {
  const [open, setOpen] = useState(false);

  return (
    <nav className="bg-indigo-700 dark:bg-indigo-900 text-white shadow-lg">
      {/* 데스크탑 */}
      <div className="hidden lg:flex items-stretch h-12 overflow-x-auto">
        <Link href="/" className="font-bold text-base flex items-center px-5 border-r border-indigo-500/50 hover:bg-indigo-600 transition-colors shrink-0">
          DCPRIME
        </Link>
        <div className="flex items-stretch">
          <span className="text-indigo-300 text-xs flex items-center px-3 border-r border-indigo-500/50 shrink-0">입학테스트</span>
          {entranceNav.map((n) => (
            <Link key={n.href} href={n.href}
              className="flex items-center px-3 hover:bg-indigo-600 dark:hover:bg-indigo-800 text-sm font-medium transition-colors whitespace-nowrap">
              {n.label}
            </Link>
          ))}
        </div>
        <div className="flex items-stretch border-l border-indigo-500/50">
          <span className="text-indigo-300 text-xs flex items-center px-3 border-r border-indigo-500/50 shrink-0">영어단어</span>
          {wordNav.map((n) => (
            <Link key={n.href} href={n.href}
              className="flex items-center px-3 hover:bg-indigo-600 dark:hover:bg-indigo-800 text-sm font-medium transition-colors whitespace-nowrap">
              {n.label}
            </Link>
          ))}
        </div>
        <div className="flex items-stretch border-l border-indigo-500/50">
          <span className="text-indigo-300 text-xs flex items-center px-3 border-r border-indigo-500/50 shrink-0">수학</span>
          {mathNav.map((n) => (
            <Link key={n.href} href={n.href}
              className="flex items-center px-3 hover:bg-indigo-600 dark:hover:bg-indigo-800 text-sm font-medium transition-colors whitespace-nowrap">
              {n.label}
            </Link>
          ))}
        </div>
        <div className="ml-auto flex items-center px-4 border-l border-indigo-500/50">
          <LogoutButton />
        </div>
      </div>

      {/* 모바일 헤더 */}
      <div className="lg:hidden flex items-center justify-between px-4 h-12">
        <Link href="/" className="font-bold text-base">DCPRIME</Link>
        <button
          onClick={() => setOpen(!open)}
          className="p-2 rounded-lg hover:bg-indigo-600 transition-colors"
          aria-label="메뉴"
        >
          {open ? (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>

      {/* 모바일 드로어 */}
      {open && (
        <div className="lg:hidden border-t border-indigo-500/50 pb-2">
          <div className="px-4 pt-3 pb-1">
            <p className="text-indigo-300 text-xs font-semibold uppercase tracking-wider mb-2">입학테스트</p>
            <div className="grid grid-cols-3 gap-1">
              {entranceNav.map((n) => (
                <Link key={n.href} href={n.href} onClick={() => setOpen(false)}
                  className="text-sm py-2 px-3 rounded-lg hover:bg-indigo-600 transition-colors text-center">
                  {n.label}
                </Link>
              ))}
            </div>
          </div>
          <div className="px-4 pt-2 pb-1 border-t border-indigo-500/30 mt-1">
            <p className="text-indigo-300 text-xs font-semibold uppercase tracking-wider mb-2">영어단어 튜터링</p>
            <div className="grid grid-cols-3 gap-1">
              {wordNav.map((n) => (
                <Link key={n.href} href={n.href} onClick={() => setOpen(false)}
                  className="text-sm py-2 px-3 rounded-lg hover:bg-indigo-600 transition-colors text-center">
                  {n.label}
                </Link>
              ))}
            </div>
          </div>
          <div className="px-4 pt-2 pb-1 border-t border-indigo-500/30 mt-1">
            <p className="text-indigo-300 text-xs font-semibold uppercase tracking-wider mb-2">수학</p>
            <div className="grid grid-cols-3 gap-1">
              {mathNav.map((n) => (
                <Link key={n.href} href={n.href} onClick={() => setOpen(false)}
                  className="text-sm py-2 px-3 rounded-lg hover:bg-indigo-600 transition-colors text-center">
                  {n.label}
                </Link>
              ))}
            </div>
          </div>
          <div className="px-4 pt-2 border-t border-indigo-500/30 mt-1 flex justify-end">
            <LogoutButton />
          </div>
        </div>
      )}
    </nav>
  );
}
