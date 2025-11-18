const THEMES = [
  { key: "Acquisition", label: "Acquisition" },
  { key: "UX", label: "UX / usability" },
  { key: "Content", label: "Content & messaging" },
  { key: "Tech", label: "Tech / tracking" },
];

const PATTERN_LIBRARY = {
  channels: [
    "Balance paid, organic, and direct traffic — defend branded demand while diversifying acquisition.",
    "Check campaign-to-landing alignment; mismatched intent is a common cause of high bounce rates.",
  ],
  "landing-pages": [
    "Above-the-fold clarity: promise, proof, and primary CTA within the first scroll.",
    "Progressive disclosure: layer detail (returns, delivery, FAQs) right before conversion actions.",
  ],
  products: [
    "Highlight social proof near price/CTA, especially on top-grossing SKUs.",
    "Bundle accessories with hero products to lift attach rate.",
  ],
  timeseries: [
    "Annotate major launches and traffic spikes so the team remembers causal events.",
    "Compare trend lines for paid vs. organic to detect cannibalisation or halo effects.",
  ],
  campaigns: [
    "Group campaigns by intent (brand, demand gen, remarketing) and set distinct success metrics.",
    "UTM hygiene: enforce consistent source/medium/naming conventions to prevent analysis blind spots.",
  ],
  ecommerce: [
    "Instrument every checkout step to isolate friction; add reassurance (shipping, payment trust) near CTAs.",
    "Benchmark funnel conversion rates vs. historical best weeks to quantify drop-offs.",
  ],
};

const DEFAULT_PATTERN = [
  "Start with message-market fit: does the promise match the traffic source intent?",
  "Instrument the journey end to end (events + qualitative) so drops are explainable within minutes.",
];

function fmtInt(n) {
  const num = Number(n || 0);
  return Number.isFinite(num) ? num.toLocaleString("en-GB") : "0";
}

function defaultJourney(theme) {
  switch (theme) {
    case "Acquisition":
      return "Acquisition → Landing";
    case "UX":
      return "On-site experience";
    case "Content":
      return "Messaging & Offer";
    case "Tech":
      return "Tracking & Data";
    default:
      return "Analytics workflow";
  }
}

function defaultInsight(fact) {
  const share = fact.share != null ? `${fact.share}% share` : null;
  const change = fact.change ? ` (${fact.change})` : "";
  const metric = fact.metric || "sessions";
  return `${fact.label || "This area"} is shaping ${metric}${share ? ` with ${share}` : ""}${change}.`;
}

function defaultExample(fact, topic) {
  const focus = fact.label || topic || "this flow";
  switch (fact.theme) {
    case "Acquisition":
      return `A user clicks ${focus}, lands on the hero, and decides within 10 seconds if the promise matches the ad.`;
    case "UX":
      return `A returning user reaches ${focus} on mobile, hits friction (slow load/forms) and abandons.`;
    case "Content":
      return `A prospect scans the hero copy on ${focus} but cannot find proof or reassurance, so they bounce.`;
    case "Tech":
      return `A marketer tries to diagnose ${focus} but missing tags / consent mode blocks the signal.`;
    default:
      return `A visitor interacts with ${focus} and either converts or drops depending on how well the experience matches intent.`;
  }
}

function defaultEffect(fact) {
  if (fact.change && fact.change.startsWith("-")) return `Arrest decline (${fact.change})`;
  if (fact.change && fact.change.startsWith("+")) return `Amplify growth (${fact.change})`;
  return `Lift ${fact.metric || "conversions"} by 5–10%`;
}

function defaultEffort(value) {
  if (!Number.isFinite(value)) return "Medium";
  if (value > 50000) return "High";
  if (value > 10000) return "Medium";
  return "Low";
}

function defaultSuccessMetric(metric) {
  if (!metric) return "Engaged sessions & conversions";
  if (/revenue|aov|transactions/i.test(metric)) return "Revenue, CVR, AOV";
  if (/session|traffic|visits/i.test(metric)) return "Qualified sessions & engaged sessions";
  return `${metric}, conversions`;
}

function defaultAction(fact) {
  switch (fact.theme) {
    case "Acquisition":
      return `Tighten targeting & landing alignment for ${fact.label}`;
    case "UX":
      return `Remove friction on ${fact.label} journey (speed, forms, reassurance)`;
    case "Content":
      return `Refresh narrative & proof points on ${fact.label}`;
    case "Tech":
      return `Audit tagging/consent for ${fact.label} so signals stay trustworthy`;
    default:
      return `Diagnose ${fact.label} and route insight to the squad`;
  }
}

function defaultTestIdea(fact) {
  switch (fact.theme) {
    case "Acquisition":
      return `A/B test ${fact.label} creative variants (promise vs. proof) tied to downstream CVR.`;
    case "UX":
      return `Run UX test on ${fact.label}: simplified form vs. current, measure completion.`;
    case "Content":
      return `Headline/value-prop test on ${fact.label}: pain-led vs. benefit-led copy.`;
    case "Tech":
      return `Instrument ${fact.label} with custom events + QA against debug view.`;
    default:
      return `Design a quick win experiment focused on ${fact.label}.`;
  }
}

function ensureFacts(drivers = [], topic = "this area") {
  const normalized = drivers.map((driver) => ({
    theme: driver.theme || "Acquisition",
    label: driver.label || topic,
    metric: driver.metric || "sessions",
    value: Number(driver.value || 0),
    share: driver.share != null ? Number(driver.share) : null,
    change: driver.change || null,
    journey: driver.journey || defaultJourney(driver.theme),
    insight: driver.insight || defaultInsight(driver),
    example: driver.example || defaultExample(driver, topic),
    effort: driver.effort || defaultEffort(driver.value),
    successMetric: driver.successMetric || defaultSuccessMetric(driver.metric),
  }));

  THEMES.forEach((theme) => {
    if (!normalized.some((item) => item.theme === theme.key)) {
      normalized.push({
        theme: theme.key,
        label: `${theme.label} coverage`,
        metric: "engagement",
        value: 0,
        share: null,
        change: null,
        journey: defaultJourney(theme.key),
        insight: `No direct signals captured yet for ${theme.label.toLowerCase()}. Add instrumentation or diagnostics here.`,
        example: defaultExample({ theme: theme.key, label: theme.label }, topic),
        effort: "Medium",
        successMetric: "Sessions, conversions",
      });
    }
  });

  return normalized;
}

function formatHypotheses(facts) {
  const lines = ["Hypothesis & “Why” engine:"];
  THEMES.forEach((theme) => {
    lines.push(`${theme.label}:`);
    facts
      .filter((fact) => fact.theme === theme.key)
      .slice(0, 3)
      .forEach((fact) => {
        const share = fact.share != null ? ` (${fact.share}% share)` : "";
        const change = fact.change ? `, recent shift ${fact.change}` : "";
        lines.push(`• ${fact.label}${share}${change} — ${fact.insight}`);
        lines.push(`  Example user behaviour: ${fact.example}`);
      });
  });
  return lines.join("\n");
}

function formatPlaybooks(facts) {
  const lines = ["Playbooks — from insight to action plan:"];
  facts.slice(0, 5).forEach((fact) => {
    const action = fact.action || defaultAction(fact);
    const effect = fact.effect || defaultEffect(fact);
    lines.push(
      `• ${action} — Journey: ${fact.journey}; Expected effect: ${effect}; Effort: ${fact.effort}; Success metrics: ${fact.successMetric}.`
    );
  });
  return lines.join("\n");
}

function scoreFromFact(fact) {
  const impact = fact.share != null ? Math.min(10, Math.max(3, Math.round(fact.share / 10))) : 6;
  const confidence = fact.value > 0 ? Math.min(10, 4 + Math.round(Math.log10(fact.value + 10))) : 5;
  const effort = fact.effort === "High" ? 8 : fact.effort === "Medium" ? 5 : 3;
  const priority = Math.round((impact + confidence) - effort / 2);
  return { impact, confidence, effort, priority: Math.max(1, priority) };
}

function formatExperiments(facts) {
  const lines = ["Experiment backlog builder:"];
  facts.slice(0, 4).forEach((fact, idx) => {
    const { impact, confidence, effort, priority } = scoreFromFact(fact);
    const idea = fact.testIdea || defaultTestIdea(fact);
    lines.push(
      `• #${idx + 1} ${fact.label} — Impact ${impact}/10 · Confidence ${confidence}/10 · Effort ${effort}/10 → Priority ${priority}. Hypothesis: ${fact.insight} Test idea: ${idea} Success metric: ${fact.successMetric}.`
    );
  });
  return lines.join("\n");
}

function formatPatterns(topic, facts) {
  const patterns = PATTERN_LIBRARY[topic] || DEFAULT_PATTERN;
  const hotSpot = facts.find((f) => f.share != null && f.share >= 30) || facts[0];
  const lines = ["Best-practice pattern matching:"];
  lines.push(`• Pattern focus: ${hotSpot.label} — treat it like your flagship journey and benchmark against the best teams in your vertical.`);
  patterns.forEach((pattern) => lines.push(`• ${pattern}`));
  return lines.join("\n");
}

function formatQualitativeLayer(rawNotes, facts, topic) {
  const notes = typeof rawNotes === "string"
    ? rawNotes
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
    : [];
  if (!notes.length) {
    return "Qualitative layer — Paste survey quotes, onsite feedback, or support tickets to tie user sentiment to these GA4 patterns. We will cluster them here for Premium once provided.";
  }
  const clusters = notes.slice(0, 5).map((note, idx) => {
    const theme = THEMES[idx % THEMES.length];
    const related = facts[idx % facts.length];
    return `• ${theme.label}: “${note}” — links to ${related.label} (${related.metric}) pattern.`;
  });
  return ["Qualitative layer — user voice overlays:", ...clusters].join("\n");
}

export function isPremiumRequest(req) {
  return Boolean(
    req?.premiumUser?.premium ||
      req?.usageMeta?.identity?.premium ||
      req?.usageMeta?.identity?.plan === "premium"
  );
}

export function buildProNarrative({ topic, baseSummary, period, scope, drivers = [], qualitativeNotes } = {}) {
  const parts = [];
  if (baseSummary) parts.push(baseSummary.trim());
  if (period || scope) {
    const meta = [`Period: ${period || "selected range"}`, scope ? `Scope: ${scope}` : null].filter(Boolean);
    if (meta.length) parts.push(meta.join(" · "));
  }
  const facts = ensureFacts(drivers, topic);
  parts.push(formatHypotheses(facts));
  parts.push(formatPlaybooks(facts));
  parts.push(formatExperiments(facts));
  parts.push(formatPatterns(topic, facts));
  parts.push(formatQualitativeLayer(qualitativeNotes, facts, topic));
  return parts.filter(Boolean).join("\n\n");
}

export function finalizeSummary(req, baseSummary, options = {}) {
  if (!isPremiumRequest(req)) return baseSummary;
  return buildProNarrative({ ...options, baseSummary });
}

