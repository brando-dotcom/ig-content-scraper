export function scoreReels(reels, threshold) {
  const withScore = reels.map((r) => ({
    ...r,
    outlier_score: r.views > 0 ? (r.likes + r.comments * 3) / r.views : 0,
  }));

  const byAccount = {};
  for (const r of withScore) {
    (byAccount[r.account_handle] ||= []).push(r);
  }

  const ranked = [];
  for (const handle of Object.keys(byAccount)) {
    const group = byAccount[handle];
    const avg = group.reduce((s, r) => s + r.outlier_score, 0) / group.length;
    if (avg === 0) continue;
    for (const r of group) {
      const relative_score = r.outlier_score / avg;
      if (relative_score >= threshold) {
        ranked.push({ ...r, account_avg: avg, relative_score });
      }
    }
  }

  return ranked.sort((a, b) => b.relative_score - a.relative_score);
}
