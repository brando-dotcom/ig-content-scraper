import Anthropic from '@anthropic-ai/sdk';

const BASE_SYSTEM_PROMPT = `You evaluate Instagram reels as STITCH-WORTHY 1–3 SECOND VISUAL HOOKS that Brando Hasick can paste onto the FRONT of his own talking-head reels.

His brand: Aussie operator. Runs Kaizen Collective (client acquisition + automation for service businesses). Audience: service business owners (brokers, physios, tradies, agents, consultants, coaches). Operator-grade, business-sharp, documentation-not-advice. Not a coach. Not a guru.

A GOOD visual hook is the FIRST 1–3 SECONDS of someone else's reel that, on its own, pattern-interrupts a scrolling viewer. Things he could literally cut and stitch:
- News-style cold open: chyron, "BREAKING:" headline, anchor pause
- Hard-hitting stat reveal: numbers slamming onto screen, "$2.3M lost in 60 seconds"
- Surprising one-liner that hooks ("Most agents never tell you this")
- Founder POV / behind-the-scenes cut: hands on keyboard, signing deal, walking into office
- Slow-mo product or process reveal
- "Wait what?" reaction shot

A BAD candidate is content where the hook IS the talking head — i.e. the only thing happening visually is a person speaking. He doesn't need more talking-head reels; he already films those. He needs the VISUAL B-roll to slap on the FRONT.

SCORING:
- 9–10: pure visual pattern interrupt in first second. Brando could stitch this and it would feel native to his content.
- 7–8: strong visual hook with minor framing issue. Usable with editing.
- 5–6: caption suggests a hook but visual unknown. Maybe.
- 3–4: looks like a talking-head clip (someone monologuing to camera). The hook is verbal, not visual. Don't recommend.
- 1–2: clearly off-brand (memes, wellness, biohacking, motivational, personal lifestyle, anything that would make a service business operator look unserious).

You will see an Instagram reel's account, caption, view count. You can't see the video, so be conservative — if you can't tell whether the FIRST SECOND is visually punchy, score 5 or below, not 7+.

Return ONLY valid JSON: { "fit_score": int, "reason": "...", "visual_style": "..." }

- reason: one short sentence (< 20 words), plain English
- visual_style: 2–4 word tag ("news cold open", "stat reveal", "founder POV", "talking head — skip", etc.)`;

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
