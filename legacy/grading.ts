export function getGrade(score: number, outOf: number = 100): string {
  const percentage = (score / outOf) * 100;
  if (percentage >= 80) return 'A';
  if (percentage >= 60) return 'B';
  if (percentage >= 40) return 'C';
  if (percentage >= 30) return 'D';
  return 'E';
}

export function getGradeClass(grade: string): string {
  const map: Record<string, string> = {
    A: 'grade-a',
    B: 'grade-b',
    C: 'grade-c',
    D: 'grade-d',
    E: 'grade-e',
  };
  return map[grade] || '';
}

export function calculateAverage(scores: number[]): number {
  if (scores.length === 0) return 0;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}
