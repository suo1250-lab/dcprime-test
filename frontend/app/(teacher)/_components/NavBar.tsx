"use client";
import { useState, useRef } from "react";
import Link from "next/link";
import LogoutButton from "./LogoutButton";

type MenuItem = { href: string; label: string };
type MenuGroup = { groupLabel: string; items: MenuItem[] };
type Menu = { label: string; items?: MenuItem[]; groups?: MenuGroup[] };

const menus: Menu[] = [
  {
    label: "입학테스트",
    items: [
      { href: "/students", label: "원생 관리" },
      { href: "/tests", label: "테스트 관리" },
      { href: "/results", label: "결과 조회" },
      { href: "/results/new", label: "결과 입력" },
      { href: "/analytics", label: "분석" },
      { href: "/classes", label: "반 배정" },
      { href: "/historical", label: "역대 이력" },
    ],
  },
  {
    label: "영어",
    items: [
      { href: "/word-tests", label: "단어시험 관리" },
      { href: "/word-submissions", label: "단어시험 채점" },
      { href: "/unmatched-submissions", label: "매칭 불가" },
      { href: "/word-tutoring", label: "튜터링 기록" },
      { href: "/word-config", label: "채점 설정" },
      { href: "/word-answer-key", label: "답지 등록" },
    ],
  },
  {
    label: "수학",
    items: [
      { href: "/math-tests", label: "시험 관리" },
      { href: "/math-submissions", label: "OMR 채점" },
      { href: "/math-bulk-grade", label: "반별 채점" },
      { href: "/math-history", label: "성적 추이" },
    ],
  },
  {
    label: "분석리포트",
    groups: [
      {
        groupLabel: "국어",
        items: [
          { href: "/math-history?subject=korean", label: "성적 추이" },
          { href: "/math-history?subject=korean&tab=class", label: "반별 성적" },
        ],
      },
      {
        groupLabel: "수학",
        items: [
          { href: "/math-history", label: "성적 추이" },
          { href: "/math-history?tab=class", label: "반별 성적" },
        ],
      },
      {
        groupLabel: "영어",
        items: [
          { href: "/word-tutoring", label: "튜터링 이력" },
        ],
      },
      {
        groupLabel: "과학",
        items: [
          { href: "/math-history?subject=science", label: "성적 추이" },
          { href: "/math-history?subject=science&tab=class", label: "반별 성적" },
        ],
      },
    ],
  },
];

function DropdownMenu({ label, items, groups }: { label: string; items?: MenuItem[]; groups?: MenuGroup[] }) {
  const [open, setOpen] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setOpen(true);
  };
  const hide = () => {
    timeoutRef.current = setTimeout(() => setOpen(false), 100);
  };

  return (
    <div className="relative flex items-stretch" onMouseEnter={show} onMouseLeave={hide}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 px-4 h-full hover:bg-indigo-600 dark:hover:bg-indigo-800 text-sm font-medium transition-colors whitespace-nowrap"
      >
        {label}
        <svg className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute top-full left-0 z-50 bg-indigo-800 dark:bg-indigo-950 shadow-xl rounded-b-xl overflow-hidden min-w-40"
          onMouseEnter={show} onMouseLeave={hide}>
          {/* 일반 flat 항목 */}
          {items?.map((n) => (
            <Link key={n.href} href={n.href} onClick={() => setOpen(false)}
              className="block px-4 py-2.5 text-sm hover:bg-indigo-600 dark:hover:bg-indigo-800 transition-colors whitespace-nowrap">
              {n.label}
            </Link>
          ))}
          {/* 그룹별 항목 */}
          {groups?.map((g, gi) => (
            <div key={g.groupLabel}>
              {gi > 0 && <div className="border-t border-indigo-600/50 mx-2" />}
              <div className="px-4 pt-2 pb-1 text-xs font-bold text-indigo-300 uppercase tracking-wide">
                {g.groupLabel}
              </div>
              {g.items.map((n) => (
                <Link key={n.href} href={n.href} onClick={() => setOpen(false)}
                  className="block px-5 py-2 text-sm hover:bg-indigo-600 dark:hover:bg-indigo-800 transition-colors whitespace-nowrap">
                  {n.label}
                </Link>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function NavBar() {
  const [open, setOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState<string | null>(null);

  return (
    <nav className="bg-indigo-700 dark:bg-indigo-900 text-white shadow-lg relative z-40">
      {/* 데스크탑 */}
      <div className="hidden lg:flex items-stretch h-12">
        <Link href="/" className="font-bold text-base flex items-center px-5 border-r border-indigo-500/50 hover:bg-indigo-600 transition-colors shrink-0">
          DCPRIME
        </Link>
        <div className="flex items-stretch border-r border-indigo-500/50">
          {menus.map((m) => (
            <DropdownMenu key={m.label} label={m.label} items={m.items} groups={m.groups} />
          ))}
        </div>
        <div className="ml-auto flex items-center px-4">
          <LogoutButton />
        </div>
      </div>

      {/* 모바일 헤더 */}
      <div className="lg:hidden flex items-center justify-between px-4 h-12">
        <Link href="/" className="font-bold text-base">DCPRIME</Link>
        <button onClick={() => setOpen(!open)} className="p-2 rounded-lg hover:bg-indigo-600 transition-colors" aria-label="메뉴">
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
          {menus.map((m) => (
            <div key={m.label} className="border-b border-indigo-500/30">
              <button
                onClick={() => setMobileOpen(mobileOpen === m.label ? null : m.label)}
                className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold hover:bg-indigo-600 transition-colors"
              >
                {m.label}
                <svg className={`w-4 h-4 transition-transform ${mobileOpen === m.label ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {mobileOpen === m.label && (
                <div className="px-4 pb-3">
                  {m.items && (
                    <div className="grid grid-cols-3 gap-1">
                      {m.items.map((n) => (
                        <Link key={n.href} href={n.href} onClick={() => setOpen(false)}
                          className="text-sm py-2 px-3 rounded-lg hover:bg-indigo-600 transition-colors text-center">
                          {n.label}
                        </Link>
                      ))}
                    </div>
                  )}
                  {m.groups?.map((g, gi) => (
                    <div key={g.groupLabel} className={gi > 0 ? "mt-2 pt-2 border-t border-indigo-500/30" : ""}>
                      <div className="text-xs font-bold text-indigo-300 uppercase tracking-wide mb-1">{g.groupLabel}</div>
                      <div className="grid grid-cols-3 gap-1">
                        {g.items.map((n) => (
                          <Link key={n.href} href={n.href} onClick={() => setOpen(false)}
                            className="text-sm py-2 px-3 rounded-lg hover:bg-indigo-600 transition-colors text-center">
                            {n.label}
                          </Link>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          <div className="px-4 pt-2 flex justify-end">
            <LogoutButton />
          </div>
        </div>
      )}
    </nav>
  );
}
