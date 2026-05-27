export async function pushToDashboard(baseUrl, token, ideas) {
  const url = baseUrl.replace(/\/$/, '') + '/api/ideas';
  const payload = ideas.map((idea) => ({
    source_account: idea.source_account,
    source_hook: idea.source_hook,
    source_url: idea._source_url || null,
    outlier_score: idea.outlier_score,
    core_angle: idea.core_angle,
    brando_hook: idea.brando_hook,
    format: idea.format,
    cta: idea.cta,
    thumbnail_text: idea.thumbnail_text,
    notes: idea.notes,
  }));

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ ideas: payload }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`dashboard push ${res.status}: ${text}`);
  }
  return res.json();
}
