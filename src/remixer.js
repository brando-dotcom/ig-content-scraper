import Anthropic from '@anthropic-ai/sdk';

const SYSTEM_PROMPT = `You are a content strategist for Brando Hasick, an Australian operator who runs Kaizen Collective — a client acquisition and automation system for service businesses (mortgage brokers, physios, real estate agents, tradies, consultants, coaches).

His content rules:
- Documentation over advice. Show what's happening in the business, not what people should do.
- Raw over polished. iPhone talking reels outperform produced content.
- Operator framing, not guru framing. He's building and running a business — not dispensing wisdom.
- No motivational language. No punchy "gotcha" punchlines. No em dashes. No three-part phrase patterns.
- Dry humour acceptable. Specific real-life details beat frameworks.
- Short punchy sentences. Direct and deadpan.
- Australian English spelling.
- Every piece ends with a CTA tied to one of:
  • ENGINE — his full Kaizen blueprint (the Authority & Acquisition Install)
  • CAMERA — his on-camera mini course
  • TOOLS — a sneak peek / early access to one of the tools he's building (Kaizen Launchpad client cockpit, DadWodz programming + habit app, brando-onboarding, etc.). Use this when the idea naturally leads to "look at this thing I built" — operator documenting in public, giving value, opening a conversation. Not every CTA should be ENGINE; vary them based on what the content angle calls for.

His audience: service business owners who are good at their job but invisible online. They want more leads without becoming a content machine.

His offer: The Authority & Acquisition Install — a done-for-you system that installs client acquisition and automation into their business. Five steps: Traffic, Data, Ads, Offers, Emails.

Given a competitor's reel (hook + caption), your job is to:
1. Identify the core angle or insight that made it perform
2. Rebuild it through Brando's lens — same insight, his voice, his ICP
3. Output a content idea in the format below

OUTPUT FORMAT (JSON):
{
  "source_account": "",
  "source_hook": "",
  "outlier_score": "",
  "core_angle": "",
  "brando_hook": "",
  "format": "talking head | documentary VO | skit | educational",
  "brando_angle": "",
  "cta": "ENGINE | CAMERA | TOOLS",
  "thumbnail_text": "",
  "notes": ""
}

Return only valid JSON. No preamble. No explanation.`;

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('no JSON object in response');
  return JSON.parse(candidate.slice(start, end + 1));
}

function buildSystemPrompt(rejectedExamples) {
  if (!rejectedExamples?.length) return SYSTEM_PROMPT;
  const examples = rejectedExamples
    .slice(0, 30)
    .map((r, i) => `  ${i + 1}. @${r.source_account} → "${r.brando_hook || r.source_hook || ''}" (angle: ${r.core_angle || 'n/a'})`)
    .join('\n');
  return `${SYSTEM_PROMPT}

REJECTED EXAMPLES — Brando has previously rejected these ideas as "not me". Do NOT pitch ideas with similar angles, hooks, or framings. If a competitor reel maps too closely to any of these, lean into a different angle entirely:
${examples}`;
}

export async function remixReel(client, model, reel, systemPrompt = SYSTEM_PROMPT) {
  const userPrompt = `Account: @${reel.account_handle}
Hook: ${reel.hook}
Caption: ${(reel.caption_full || '').slice(0, 200)}
Relative outlier score: ${reel.relative_score.toFixed(2)}

Remix this through Brando's voice and return the JSON.`;

  const resp = await client.messages.create({
    model,
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const text = resp.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
  const idea = extractJson(text);

  idea.source_account = idea.source_account || `@${reel.account_handle}`;
  idea.source_hook = idea.source_hook || reel.hook;
  idea.outlier_score = reel.relative_score.toFixed(2);
  idea._source_url = reel.post_url;
  return idea;
}

export async function remixAll(anthropicKey, model, reels, rejectedExamples = []) {
  const client = new Anthropic({ apiKey: anthropicKey });
  const systemPrompt = buildSystemPrompt(rejectedExamples);
  if (rejectedExamples.length) {
    console.log(`  injecting ${rejectedExamples.length} rejected examples as negative guidance`);
  }
  const ideas = [];
  const errors = [];

  for (let i = 0; i < reels.length; i++) {
    const reel = reels[i];
    try {
      console.log(`  remixing ${i + 1}/${reels.length} (@${reel.account_handle}, score ${reel.relative_score.toFixed(2)})...`);
      const idea = await remixReel(client, model, reel, systemPrompt);
      ideas.push(idea);
    } catch (err) {
      console.error(`    failed: ${err.message}`);
      errors.push({ reel: reel.post_url, error: err.message });
    }
  }

  return { ideas, errors };
}
