/**
 * rehearsal.js — C1. A dress rehearsal in an empty theatre.
 *
 * The problem
 * ----------
 * A creator's first ever live session is also the first time they see the control
 * room in motion. They learn what Unlock does, what the timer feels like, and what
 * happens when the last question ends — live, in front of thirty students. That is
 * a terrible place to learn, and it is why people put off trying the feature at
 * all.
 *
 * This is a simulated cohort: fake students who join, answer at plausible speeds,
 * get things right and wrong, go quiet, and occasionally say they are lost. Every
 * control is real and pressable. Nothing is written anywhere.
 *
 * Isolation
 * ---------
 * This module imports no Supabase client and has no network access of any kind.
 * That is the guarantee, and it is structural rather than a flag: there is no
 * code path from here to the database to forget to disable. A rehearsal that
 * leaked rows into a real leaderboard would be worse than no rehearsal.
 *
 * Determinism
 * -----------
 * A seeded PRNG rather than Math.random, so a rehearsal can be replayed and a
 * test can assert on it. Real randomness would make the whole thing untestable
 * for no gain.
 */

/**
 * Mulberry32 — small, fast, good enough for simulated students, and seedable.
 * @param {number} seed
 */
export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST_NAMES = [
  "Aarav", "Priya", "Rohan", "Sana", "Vikram", "Ananya", "Karan", "Meera",
  "Dev", "Isha", "Arjun", "Nisha", "Rahul", "Tara", "Omar", "Leila",
  "Sam", "Zoe", "Noah", "Aisha", "Ben", "Maya", "Ravi", "Elena",
];
const LAST_INITIALS = "ABCDEFGHJKLMNPRSTVW".split("");

/**
 * @typedef {Object} FakeStudent
 * @property {string} user_id
 * @property {string} display_name
 * @property {number} skill      0..1, probability-of-correct before difficulty
 * @property {number} pace       0..1, lower answers sooner
 * @property {boolean} flaky     drops offline partway through
 */

/**
 * Build a cohort with a spread of ability, because a rehearsal where everyone
 * scores the same teaches the creator nothing about what the insight surfaces
 * look like.
 *
 * @param {number} size
 * @param {() => number} rng
 * @returns {FakeStudent[]}
 */
export function makeCohort(size, rng) {
  const out = [];
  for (let i = 0; i < size; i++) {
    const first = FIRST_NAMES[i % FIRST_NAMES.length];
    const initial = LAST_INITIALS[Math.floor(rng() * LAST_INITIALS.length)];
    out.push({
      user_id: `rehearsal-${i}`,
      display_name: `${first} ${initial}.`,
      // Beta-ish: most students in the middle, a few at each end.
      skill: Math.min(0.97, Math.max(0.08, (rng() + rng() + rng()) / 3)),
      pace: rng(),
      // Roughly one in twelve loses connection at some point, so the creator sees
      // what the offline-drop coach line looks like.
      flaky: rng() < 0.08,
    });
  }
  return out;
}

/**
 * Simulate one question.
 *
 * Returns the per-student outcome plus the moment each answer lands, so the
 * driver can release them over the question's real duration rather than all at
 * once — watching the answered count climb is most of what a rehearsal is for.
 *
 * @param {FakeStudent[]} cohort
 * @param {{ optionCount: number, correctIndex: number, difficulty: number, windowMs: number }} q
 * @param {() => number} rng
 * @returns {{ user_id: string, optionIndex: number, correct: boolean, atMs: number, confused: boolean }[]}
 */
export function simulateQuestion(cohort, q, rng) {
  const { optionCount, correctIndex, difficulty, windowMs } = q;
  const events = [];

  for (const s of cohort) {
    // A flaky student misses roughly a third of questions outright.
    if (s.flaky && rng() < 0.34) continue;
    // Even present students sometimes do not answer in time.
    if (rng() < 0.06) continue;

    const pCorrect = Math.max(0.02, Math.min(0.98, s.skill * (1 - difficulty)));
    const correct = rng() < pCorrect;

    let optionIndex;
    if (correct) {
      optionIndex = correctIndex;
    } else {
      // Wrong answers are NOT uniform. A hard question usually has one attractive
      // distractor, and clustering onto it is what makes the misconception
      // classifier show something interesting in a rehearsal.
      const lure = (correctIndex + 1) % Math.max(1, optionCount);
      if (rng() < 0.55) {
        optionIndex = lure;
      } else {
        do {
          optionIndex = Math.floor(rng() * optionCount);
        } while (optionIndex === correctIndex && optionCount > 1);
      }
    }

    // Right-skewed: most answers land in the first half, stragglers trail.
    const base = Math.pow(rng(), 1.7);
    const paced = Math.min(0.97, base * (0.55 + s.pace * 0.7));
    events.push({
      user_id: s.user_id,
      optionIndex,
      correct,
      atMs: Math.max(400, Math.floor(paced * windowMs)),
      // The weakest students are likeliest to say so, which is the signal B12
      // exists to surface.
      confused: rng() < 0.1 + (1 - s.skill) * 0.18,
    });
  }

  return events.sort((a, b) => a.atMs - b.atMs);
}

/**
 * Difficulty per question, so a rehearsal has an arc.
 *
 * A flat run of identical questions produces a flat run of identical insights and
 * teaches the creator nothing about reading them. This gives an easy opener, a
 * hard one in the middle, and variation around it — deterministic, so the same
 * seed always produces the same lesson.
 *
 * @param {number} index
 * @param {number} total
 * @param {() => number} rng
 */
export function difficultyFor(index, total, rng) {
  if (total <= 1) return 0.35;
  const arc = Math.sin((index / Math.max(1, total - 1)) * Math.PI); // 0 → 1 → 0
  const jitter = (rng() - 0.5) * 0.25;
  return Math.min(0.85, Math.max(0.05, 0.2 + arc * 0.45 + jitter));
}

/**
 * Aggregate simulated events into the analytics shape the real pipeline produces,
 * so every insight surface renders from the same fields it would in a live
 * session — no rehearsal-specific rendering path anywhere.
 *
 * @param {{ user_id: string, optionIndex: number, correct: boolean, atMs: number, confused: boolean }[]} events
 * @param {number} cohortSize
 * @param {number} windowMs
 */
export function eventsToAnalytics(events, cohortSize, windowMs) {
  const dist = {};
  events.forEach((e) => {
    const key = `"${e.optionIndex}"`;
    dist[key] = (dist[key] || 0) + 1;
  });

  const times = events.map((e) => e.atMs).sort((a, b) => a - b);
  const median = times.length ? times[Math.floor(times.length / 2)] : null;
  const threshold = times.length >= 8 && median !== null ? median : windowMs * 0.35;
  const correct = events.filter((e) => e.correct);

  const histogram = new Array(12).fill(0);
  events.forEach((e) => {
    const b = Math.min(11, Math.floor((e.atMs / Math.max(1, windowMs)) * 12));
    histogram[b] += 1;
  });

  return {
    total_responses: events.length,
    correct_count: correct.length,
    wrong_count: events.length - correct.length,
    skipped_count: Math.max(0, cohortSize - events.length),
    option_distribution: dist,
    avg_time_correct_ms: correct.length
      ? Math.round(correct.reduce((s, e) => s + e.atMs, 0) / correct.length)
      : null,
    fastest_time_ms: correct.length ? correct[0].atMs : null,
    median_time_ms: median,
    fast_correct: events.filter((e) => e.correct && e.atMs <= threshold).length,
    slow_correct: events.filter((e) => e.correct && e.atMs > threshold).length,
    fast_wrong: events.filter((e) => !e.correct && e.atMs <= threshold).length,
    slow_wrong: events.filter((e) => !e.correct && e.atMs > threshold).length,
    impulsive_wrong: events.filter((e) => !e.correct && e.atMs < windowMs * 0.2).length,
    time_histogram: histogram,
    confusion_count: events.filter((e) => e.confused).length,
  };
}
