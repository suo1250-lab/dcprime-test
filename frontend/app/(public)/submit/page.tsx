"use client";
import { useEffect, useState, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { apiFetch, apiHeaders, WordTest } from "@/lib/api";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const GRADES = ["초1","초2","초3","초4","초5","초6","중1","중2","중3","고1","고2","고3"];

interface SubmitResult {
  id: number;
  status: string;
  score: number | null;
  total: number | null;
  items: {
    item_no: number;
    question: string;
    correct_answer: string;
    student_answer: string | null;
    is_correct: boolean | null;
  }[];
}

function SubmitPageInner() {
  const searchParams = useSearchParams();
  const presetTestId = searchParams.get("test");

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [tests, setTests] = useState<WordTest[]>([]);
  const [testId, setTestId] = useState(presetTestId ?? "");
  const [name, setName] = useState("");
  const [grade, setGrade] = useState("중1");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    apiFetch<WordTest[]>("/word-tests").then(setTests).catch(() => {});
  }, []);

  useEffect(() => {
    if (presetTestId) setTestId(presetTestId);
  }, [presetTestId]);

  const selectedTest = tests.find((t) => String(t.id) === testId);

  const handleImageChange = (file: File | null) => {
    setImageFile(file);
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => setImagePreview(e.target?.result as string);
      reader.readAsDataURL(file);
    } else {
      setImagePreview(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) handleImageChange(file);
  };

  const goStep2 = (e: React.FormEvent) => {
    e.preventDefault();
    if (!testId || !name.trim()) return;
    setStep(2);
  };

  const handleSubmit = async () => {
    if (!imageFile || !testId) return;
    setSubmitting(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("word_test_id", testId);
      formData.append("student_name", name.trim());
      formData.append("grade", grade);
      formData.append("image", imageFile);

      const res = await fetch(`${BASE}/api/word-submissions`, {
        method: "POST",
        body: formData,
        headers: apiHeaders(),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail ?? `오류 ${res.status}`);
      }
      const data: SubmitResult = await res.json();
      setResult(data);
      setStep(3);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "제출 실패");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-gray-950 dark:to-indigo-950 flex flex-col items-center px-4 py-8">
      <div className="w-full max-w-lg">
        <h1 className="text-2xl font-bold text-indigo-700 dark:text-indigo-400 text-center mb-1">단어시험 제출</h1>
        <p className="text-gray-500 dark:text-gray-400 text-center text-sm mb-8">DCPRIME 영어 단어시험</p>

        {/* 단계 표시 */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                step === s ? "bg-indigo-600 text-white" :
                step > s ? "bg-green-500 text-white" : "bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
              }`}>
                {step > s ? "✓" : s}
              </div>
              {s < 3 && <div className={`w-12 h-0.5 ${step > s ? "bg-green-500" : "bg-gray-200 dark:bg-gray-700"}`} />}
            </div>
          ))}
        </div>

        {/* Step 1: 정보 입력 */}
        {step === 1 && (
          <form onSubmit={goStep2} className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 space-y-5">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">시험 선택 및 정보 입력</h2>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">시험 선택 *</label>
              <select
                required
                value={testId}
                onChange={(e) => setTestId(e.target.value)}
                className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-3 text-base bg-white dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              >
                <option value="">시험을 선택하세요</option>
                {tests.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title} — {t.grade} ({t.test_date})
                  </option>
                ))}
              </select>
              {selectedTest && (
                <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-1">
                  {selectedTest.direction === "EN_KR" ? "영어 → 한국어" : selectedTest.direction === "KR_EN" ? "한국어 → 영어" : "혼합"} | {selectedTest.item_count}문항
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">이름 *</label>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-3 text-base bg-white dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                placeholder="홍길동"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">학년 *</label>
              <select
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
                className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-3 text-base bg-white dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              >
                {GRADES.map((g) => <option key={g}>{g}</option>)}
              </select>
            </div>

            <button
              type="submit"
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-4 rounded-xl text-lg font-semibold active:scale-95 transition-colors"
            >
              다음 →
            </button>
          </form>
        )}

        {/* Step 2: 사진 업로드 */}
        {step === 2 && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 space-y-5">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">답안지 사진 업로드</h2>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              <span className="font-medium text-gray-700 dark:text-gray-200">{name}</span> ({grade}) | {selectedTest?.title}
            </div>

            <div
              onClick={() => fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors ${
                imageFile
                  ? "border-indigo-400 bg-indigo-50 dark:bg-indigo-950/30"
                  : "border-gray-300 dark:border-gray-600 hover:border-indigo-400 hover:bg-gray-50 dark:hover:bg-gray-700/50"
              }`}
            >
              {imagePreview ? (
                <div>
                  <img src={imagePreview} alt="미리보기" className="max-h-64 mx-auto rounded-lg object-contain mb-3" />
                  <p className="text-sm text-indigo-600 dark:text-indigo-400 font-medium">{imageFile?.name}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">다시 선택하려면 클릭하세요</p>
                </div>
              ) : (
                <div>
                  <div className="text-5xl mb-4">📷</div>
                  <p className="text-gray-600 dark:text-gray-300 font-medium">사진을 업로드하세요</p>
                  <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">클릭하거나 파일을 드래그하세요</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">JPG, PNG, WEBP 지원</p>
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => handleImageChange(e.target.files?.[0] ?? null)}
            />

            {error && <p className="text-red-500 dark:text-red-400 text-sm text-center">{error}</p>}

            <div className="flex gap-3">
              <button
                onClick={() => setStep(1)}
                className="flex-1 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 py-4 rounded-xl text-base font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                ← 이전
              </button>
              <button
                onClick={handleSubmit}
                disabled={!imageFile || submitting}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-4 rounded-xl text-base font-semibold disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition-colors"
              >
                {submitting ? "제출 중..." : "제출하기"}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: 결과 */}
        {step === 3 && result && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 space-y-5">
            {result.status === "pending_manual" ? (
              <div className="text-center py-6">
                <div className="text-5xl mb-4">✅</div>
                <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-2">제출 완료!</h2>
                <p className="text-gray-500 dark:text-gray-400">선생님이 채점 후 결과를 알려드립니다.</p>
              </div>
            ) : (
              <div>
                <div className="text-center mb-6">
                  <div className="text-5xl mb-3">📊</div>
                  <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-1">채점 결과</h2>
                  <div className="text-4xl font-bold text-indigo-600 dark:text-indigo-400">
                    {result.score} <span className="text-xl text-gray-400 dark:text-gray-500">/ {result.total}</span>
                  </div>
                  {result.score !== null && result.total && (
                    <div className="text-gray-500 dark:text-gray-400 text-sm mt-1">
                      정답률 {Math.round(result.score / result.total * 100)}%
                    </div>
                  )}
                  <div className="text-xs text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg px-3 py-2 mt-3">
                    AI가 채점한 결과입니다. 선생님 최종 확인 후 점수가 확정됩니다.
                  </div>
                </div>

                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-900/50">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-300 w-8">No</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-300">문제</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-300">내 답</th>
                      <th className="text-center px-3 py-2 font-medium text-gray-600 dark:text-gray-300 w-12">결과</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {result.items.map((item) => (
                      <tr key={item.item_no}>
                        <td className="px-3 py-2 text-gray-400 dark:text-gray-500">{item.item_no}</td>
                        <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{item.question}</td>
                        <td className="px-3 py-2">
                          <span className={item.is_correct ? "text-green-700 dark:text-green-400" : "text-red-600 dark:text-red-400"}>
                            {item.student_answer || "-"}
                          </span>
                          {!item.is_correct && (
                            <span className="text-xs text-gray-400 dark:text-gray-500 ml-1">→ {item.correct_answer}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className={`font-bold ${item.is_correct ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}`}>
                            {item.is_correct ? "O" : "X"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <button
              onClick={() => { setStep(1); setResult(null); setImageFile(null); setImagePreview(null); setName(""); }}
              className="w-full border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 py-3 rounded-xl text-base hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              다시 제출하기
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SubmitPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-gray-400 dark:text-gray-600">로딩 중...</div>}>
      <SubmitPageInner />
    </Suspense>
  );
}
