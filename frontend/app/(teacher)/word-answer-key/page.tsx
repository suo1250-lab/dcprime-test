"use client";
import { useState } from "react";
import { apiHeaders } from "@/lib/api";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function WordAnswerKeyPage() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const upload = async () => {
    if (!file) return;
    setUploading(true);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`${BASE}/api/nas/upload/answer-word`, {
        method: "POST",
        body: formData,
        headers: apiHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? "업로드 실패");
      setResult({ type: "success", msg: `✓ ${data.filename} 업로드 완료. 자동으로 단어장 등록이 시작됩니다.` });
      setFile(null);
    } catch (e: unknown) {
      setResult({ type: "error", msg: e instanceof Error ? e.message : "오류 발생" });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="max-w-lg">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">단어장 답지 등록</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          단어장 PDF를 업로드하면 자동으로 분석하여 단어 목록을 등록합니다.
        </p>
      </div>

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 shadow-sm">
        <div
          className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-8 text-center cursor-pointer hover:border-indigo-400 dark:hover:border-indigo-500 transition-colors"
          onClick={() => document.getElementById("file-input")?.click()}
        >
          <input
            id="file-input"
            type="file"
            accept=".pdf,.hwp,.hwpx"
            className="hidden"
            onChange={(e) => { setFile(e.target.files?.[0] ?? null); setResult(null); }}
          />
          {file ? (
            <div>
              <p className="text-indigo-600 dark:text-indigo-400 font-medium">{file.name}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
            </div>
          ) : (
            <div>
              <p className="text-gray-500 dark:text-gray-400 text-sm">PDF / HWP 파일을 클릭하여 선택</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">단어장 전체 파일을 올려주세요</p>
            </div>
          )}
        </div>

        <button
          onClick={upload}
          disabled={!file || uploading}
          className="w-full mt-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white py-2.5 rounded-lg font-medium transition-colors shadow-sm"
        >
          {uploading ? "업로드 중..." : "등록 시작"}
        </button>

        {result && (
          <div className={`mt-4 px-4 py-3 rounded-lg text-sm ${
            result.type === "success"
              ? "bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400"
              : "bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400"
          }`}>
            {result.msg}
          </div>
        )}

        <div className="mt-6 border-t border-gray-100 dark:border-gray-700 pt-4">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">처리 순서</p>
          <ol className="text-xs text-gray-400 dark:text-gray-500 space-y-1 list-decimal list-inside">
            <li>PDF 업로드</li>
            <li>AI가 DAY별로 단어 자동 추출 (수백 개라면 수 분 소요)</li>
            <li>단어시험 관리 페이지에서 등록 확인</li>
            <li>채점 설정에서 선생님/반별 단어장 연결</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
