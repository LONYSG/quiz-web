// =============================================================================
// ★★★ R125 C1 (찬종 2026-11-28 고름 · R112 모습 표 1번) — 문제 카드 머리의 난이도 = **그 문제의 등급** 점 다섯.
//   영상 부품(quiz-video QuestionFrame chipSpecs) 그대로: 테두리 알약 안에 등급 말 + 점 다섯 · 켜진 점 = 분홍(--accent-2) · 꺼진 점 = 막대 바탕(--bar-bg).
//   같이 하기 · 혼자 하기 문제 카드 둘 다. 노래 · 캐치 · 라이어 · 미니게임은 등급이 없어 그리지 않는다.
// =============================================================================

/** 영상 LEVELS 와 같은 말(QuestionFrame.tsx) */
export const GRADE_WORDS = ['쉬움', '조금 쉬움', '보통', '조금 어려움', '어려움'] as const;

export default function GradeDots({ grade }: { grade: number | null | undefined }) {
  if (!grade || grade < 1 || grade > 5) return null;
  return (
    <span className="badge grade-pill" data-grade={grade} aria-label={`난이도 ${GRADE_WORDS[grade - 1]} (5단계 중 ${grade})`}>
      <span className="grade-word">{GRADE_WORDS[grade - 1]}</span>
      <span className="grade-dots" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((i) => (
          <i key={i} className={i <= grade ? 'on' : undefined} />
        ))}
      </span>
    </span>
  );
}
