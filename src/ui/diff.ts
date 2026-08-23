export function lineDiff(a: string, b: string, maxLines = 80): { removed: string[]; added: string[] } {
  const A = a.split('\n').slice(0, 2000);
  const B = b.split('\n').slice(0, 2000);
  // Fallback set-diff when the LCS table would be too large.
  if (A.length * B.length > 1_000_000) {
    const setA = new Set(A);
    const setB = new Set(B);
    return {
      removed: A.filter((l) => !setB.has(l)).slice(0, maxLines),
      added: B.filter((l) => !setA.has(l)).slice(0, maxLines),
    };
  }
  const dp: number[][] = Array.from({ length: A.length + 1 }, () => new Array(B.length + 1).fill(0));
  for (let i = A.length - 1; i >= 0; i--) {
    for (let j = B.length - 1; j >= 0; j--) {
      dp[i]![j] = A[i] === B[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }
  const removed: string[] = [];
  const added: string[] = [];
  let i = 0;
  let j = 0;
  while (i < A.length && j < B.length) {
    if (A[i] === B[j]) {
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      removed.push(A[i++]!);
    } else {
      added.push(B[j++]!);
    }
  }
  while (i < A.length) removed.push(A[i++]!);
  while (j < B.length) added.push(B[j++]!);
  return { removed: removed.slice(0, maxLines), added: added.slice(0, maxLines) };
}
