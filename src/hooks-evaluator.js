import Anthropic from '@anthropic-ai/sdk';

const BASE_SYSTEM_PROMPT = `You evaluate Instagram reels for use as CONTRARIAN STITCH MATERIAL.

Brando Hasick (Aussie operator running Kaizen Collective — client acquisition for service businesses) wants to find viral clips of OTHER PEOPLE making bold, confident, overreaching, or guru-flavoured claims, so he can stitch the clip and respond with a deadpan contrarian take — like @tetyanawrites does ("yeah, no, nobody cares, anyway").

A GOOD source clip is one where the original speaker says something that:
- Sounds confident, definitive, or absolute ("If you're not waking up at 5am, you're failing")
- Is a hot take, guru gospel, or hustle-bro proclamation ("You need 7 income streams")
- Overreaches or moralises ("Successful people don't watch Netflix")
- Is a viral business / mindset / wellness opinion that audiences love to dunk on
- Triggers an obvious "yeah but actually..." in any reasonable operator
- Has high engagement (lots of views/comments) — viral takes are best
- Is a SHORT punchy statement, not a long explanation — ideally one quote / one line

A BAD source clip is:
- News or factual content (nothing to disagree with)
- Pure self-deprecating or humble content (nothing to push back on)
- Lifestyle / aesthetic content with no clear claim
- Content that's already nuanced or balanced (no straw man to knock down)
- Anything genuinely good advice — Brando agrees with too much, no contrarian angle

SCORING:
- 9–10: caption signals a strong hot take or guru claim. Brando could stitch and respond.
- 7–8: probable hot take, some setup needed.
- 5–6: ambiguous — could be either bland or hot, hard to tell from caption alone.
- 3–4: probably bland / news / factual / non-controversial.
- 1–2: clearly nothing to react to (lifestyle, aesthetic, news, humble personal share).

You will see an Instagram reel's account, caption, view count. You can't see the video, so weight the CAPTION heavily — if the caption itself is a hot take or guru claim, score high. If the caption is bland or descriptive, score low.

Return ONLY valid JSON: { "fit_score": int, "reason": "...", "visual_style": "..." }

- reason: one short sentence (< 20 words), plain English — what's the take Brando could push back on
- visual_style: 2–4 word tag describing the type of take ("hustle gospel", "wellness gospel", "alpha rant", "guru claim", "money advice", "mindset hot take", "skip — bland")`;

function buildSystemPrompt(rejectedExamples) {
  if (!rejectedExamples?.length) return BASE_SYSTEM_PROMPT;
  const examples = rejectedExamples
    .slice(0, 25)
    .map((r, i) => `  ${i + 1}. @${r.source_account} — "${(r.caption || '').slice(0, 80)}" (was: ${r.reason || 'n/a'})`)
    .join('\n');
  return `${BASE_SYSTEM_PROMPT}

PREVIOUSLY REJECTED HOOKS — Brando rejected these as "not for me". Lower the score (1–3) for anything that matches their vibe or angle:
${examples}`;
}

export async function evaluateHook(client, model, hook, systemPrompt) {
  const userPrompt = `Account: @${hook.source_account}
Caption: ${(hook.caption || '').slice(0, 400)}
Views: ${hook.views}

Score this hook for stitch-ability and return the JSON.`;

  const resp = await client.messages.create({
    model,
    max_tokens: 256,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const text = resp.content?.[0]?.text || '';
  // Extract JSON
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('no JSON in response');
  const parsed = JSON.parse(match[0]);
  return {
    fit_score: Number(parsed.fit_score) || 0,
    reason: String(parsed.reason || ''),
    visual_style: String(parsed.visual_style || ''),
  };
}

export async function evaluateAll(anthropicKey, model, hooks, rejectedExamples = []) {
  const client = new Anthropic({ apiKey: anthropicKey });
  const systemPrompt = buildSystemPrompt(rejectedExamples);
  if (rejectedExamples.length) {
    console.log(`  injecting ${rejectedExamples.length} rejected hook examples`);
  }
  const evaluated = [];
  const errors = [];

  for (let i = 0; i < hooks.length; i++) {
    const h = hooks[i];
    try {
      console.log(`  evaluating ${i + 1}/${hooks.length} (@${h.source_account})...`);
      const eva = await evaluateHook(client, model, h, systemPrompt);
      evaluated.push({ ...h, ...eva });
    } catch (err) {
      console.error(`    failed: ${err.message}`);
      errors.push({ hook: h.source_url, error: err.message });
      evaluated.push({ ...h, fit_score: null, reason: null, visual_style: null });
    }
  }

  return { hooks: evaluated, errors };
}
