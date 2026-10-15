import { feature, plan, item } from "atmn";

/** AI resume match-score runs. */
export const resumeScore = feature({
  id: "resume_score",
  name: "Resume match scores",
  type: "metered",
  consumable: true,
});

/** AI resume tailoring runs. */
export const resumeTailor = feature({
  id: "resume_tailor",
  name: "Resume tailoring runs",
  type: "metered",
  consumable: true,
});

/** Application tracker slots — Free is capped, paid plans are effectively unlimited. */
export const trackerSlots = feature({
  id: "tracker_slots",
  name: "Tracked applications",
  type: "metered",
  consumable: false,
});

/** Weekly job digest email. */
export const weeklyDigest = feature({
  id: "weekly_digest",
  name: "Weekly job digest",
  type: "boolean",
});

export const free = plan({
  id: "free",
  name: "Free",
  autoEnable: true,
  items: [
    item({ featureId: resumeScore.id, included: 3, reset: { interval: "month" } }),
    item({ featureId: resumeTailor.id, included: 1, reset: { interval: "month" } }),
    item({ featureId: trackerSlots.id, included: 50 }),
  ],
});

export const pro = plan({
  id: "pro",
  name: "Pro",
  price: { amount: 999, interval: "month" },
  items: [
    item({ featureId: resumeScore.id, included: 30, reset: { interval: "month" } }),
    item({ featureId: resumeTailor.id, included: 15, reset: { interval: "month" } }),
    item({ featureId: trackerSlots.id, included: 100000 }),
    item({ featureId: weeklyDigest.id }),
  ],
});

export const premium = plan({
  id: "premium",
  name: "Premium",
  price: { amount: 1999, interval: "month" },
  items: [
    item({ featureId: resumeScore.id, included: 100, reset: { interval: "month" } }),
    item({ featureId: resumeTailor.id, included: 50, reset: { interval: "month" } }),
    item({ featureId: trackerSlots.id, included: 100000 }),
    item({ featureId: weeklyDigest.id }),
  ],
});

export const proAnnual = plan({
  id: "pro_annual",
  name: "Pro (annual)",
  price: { amount: 5900, interval: "year" },
  items: [
    item({ featureId: resumeScore.id, included: 30, reset: { interval: "month" } }),
    item({ featureId: resumeTailor.id, included: 15, reset: { interval: "month" } }),
    item({ featureId: trackerSlots.id, included: 100000 }),
    item({ featureId: weeklyDigest.id }),
  ],
});

export const premiumAnnual = plan({
  id: "premium_annual",
  name: "Premium (annual)",
  price: { amount: 11900, interval: "year" },
  items: [
    item({ featureId: resumeScore.id, included: 100, reset: { interval: "month" } }),
    item({ featureId: resumeTailor.id, included: 50, reset: { interval: "month" } }),
    item({ featureId: trackerSlots.id, included: 100000 }),
    item({ featureId: weeklyDigest.id }),
  ],
});

export default {
  features: [resumeScore, resumeTailor, trackerSlots, weeklyDigest],
  plans: [free, pro, proAnnual, premium, premiumAnnual],
};
