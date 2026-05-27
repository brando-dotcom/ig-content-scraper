import Anthropic from '@anthropic-ai/sdk';

const BASE_SYSTEM_PROMPT = `You evaluate Instagram reels as potential STITCH-WORTHY COLD OPENS for Brando Hasick — an Aussie operator who runs Kaizen Collective (client acquisition + automation for service businesses) and BBB Gym.

His brand: operator-grade, business-sharp, documentation-not-advice, Aussie casual. His audience: service business owners (brokers, physios, tradies, agents, consultants, coaches) who want more leads without becoming a content machine.

He wants to STITCH 1–3 second visual hooks onto the FRONT of his talking-head reels — like news anchor cold opens, slow-mo reveals, "wait what" reaction shots, surprising stat reveals, founder POV moments.

WHAT FITS (high score 7–10):
- News-style cold opens: chyron, voiceover, on-screen headline
- Stat reveals with strong visual emphasis (numbers, charts hitting screen)
- Founder POV moments: hands on a keyboard, walking into office, signing a deal
- Slow-mo product/process reveals
- Surprising or counter-intuitive opening lines that pattern-interrupt
- Documentary-style "this is what most people don't see..." cuts

WHAT DOES NOT FIT (low score 1–4):
- Personal health/wellness/biohacking content (Huberman science stuff — too off-brand for service business owners)
- Pure motivational quotes / cinematic inspiration with no business angle
- Anything memey, prank-like, or that would make him look unserious
- Long-form interview clips where the visual isn't the hook (the value is the talking, not the open)
- Aesthetic-only content with no clear business angle
- Generic lifestyle / morning routine content

You will be given an Instagram reel's account, caption, view count. Decide:
1. fit_score (1–10): how well this works as a stitch-able cold open for HIS brand
2. reason: one short sentence (< 20 words) — why it fits or doesn't, in plain English
3. visual_style: 2–4 word tag of the visual style (e.g. "news cold open", "stat reveal", "founder POV", "slow-mo product", "documentary cut")

Return ONLY valid JSON: { "fit_score": int, "reason": "...", "visual_style": "..." }`;

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
