const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export function apiHeaders(extra?: Record<string, string>): Record<string, string> {
  return { ...extra };
}

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? `API error ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export interface Student {
  id: number; name: string; grade: string; school: string | null;
  class_ids: number[]; class_names: string[]; phone: string | null; teacher: string | null; historical_student_id: number | null;
}
export interface StudentProfile {
  id: number; name: string; grade: string; school: string | null;
  phone: string | null; teacher: string | null; class_ids: number[]; class_names: string[];
  historical_student_id: number | null;
  test_results: {
    test_id: number; test_title: string; subject: string; grade: string;
    score: number; total: number; score_pct: number | null; test_date: string;
  }[];
  historical: {
    id: number; subject: string | null; score: number | null; total: number | null;
    score_pct: number | null; outcome: string | null; source_file: string | null; grade?: string;
  }[];
  tutoring_sessions: {
    id: number; session_date: string; word_test_title: string | null;
    attempt1_total: number | null; attempt1_wrong: number | null;
    attempt2_total: number | null; attempt2_wrong: number | null;
    attempt3_total: number | null; attempt3_wrong: number | null;
    memo: string | null;
  }[];
  math_results: {
    id: number; test_title: string; test_date: string | null;
    score: number | null; total: number | null; score_pct: number | null;
    class_avg: number | null; class_rank: number | null; class_total: number;
  }[];
}
export interface Test {
  id: number; title: string; grade: string; subject: string;
  question_count: number; answers: Record<string, string>; test_date: string;
}
export interface Class { id: number; name: string; grade: string; subject: string; }
export interface ClassRule {
  id: number; test_id: number; class_id: number;
  min_score: number; max_score: number; class_name?: string;
}
export interface QuestionStat {
  question_no: number; correct: number; incorrect: number;
  correct_rate: number; incorrect_rate: number;
  correct_classes?: { class_name: string; count: number }[];
  incorrect_classes?: { class_name: string; count: number }[];
}
export interface AnalyticsData {
  test_id: number; test_title: string; total_students: number;
  questions: QuestionStat[];
}
export interface AssignmentRow {
  student_id: number; student_name: string; score: number; total: number;
  score_pct: number; recommended_class_id: number | null; recommended_class_name: string;
}
export interface WordTest {
  id: number; title: string; grade: string; direction: string; test_date: string; item_count: number;
  correct_threshold: number; ambiguous_threshold: number;
}
export interface WordTestDetail {
  id: number; title: string; grade: string; direction: string; test_date: string;
  items: { id: number; item_no: number; question: string; answer: string }[];
}
export interface WordSubmissionSummary {
  id: number; word_test_id: number; test_title: string; student_name: string; grade: string;
  status: string; score: number | null; total: number | null; submitted_at: string;
}
export interface WordSubmissionDetail {
  id: number; word_test_id: number; test_title: string; student_name: string; grade: string;
  status: string; score: number | null; total: number | null; submitted_at: string;
  items: { id: number; item_no: number; question: string; correct_answer: string; student_answer: string | null; is_correct: boolean | null }[];
}
export interface ResultSummary {
  id: number; student_id: number; student_name: string;
  test_id: number; test_title: string; subject: string; grade: string;
  score: number; total: number; score_pct: number | null; test_date: string | null;
}
export interface ResultDetail {
  id: number; student_id: number; test_id: number;
  score: number; total: number;
  question_results: { question_no: number; is_correct: boolean }[];
}
export interface TutoringSession {
  id: number; student_id: number; student_name: string;
  word_test_id: number | null; word_test_title: string | null;
  session_date: string;
  attempt1_total: number | null; attempt1_wrong: number | null;
  attempt2_total: number | null; attempt2_wrong: number | null;
  attempt3_total: number | null; attempt3_wrong: number | null;
  memo: string | null;
}
