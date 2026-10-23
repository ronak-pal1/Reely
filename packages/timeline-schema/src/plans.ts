export const PLANS = {
  free: {
    name: "Free",
    watermark: true,
    maxHeight: 720,
    monthlyCredits: 30,
    maxDurationSeconds: 30,
    priority: false,
  },
  pro: {
    name: "Pro",
    watermark: false,
    maxHeight: 1080,
    monthlyCredits: 300,
    maxDurationSeconds: 180,
    priority: false,
  },
  studio: {
    name: "Studio",
    watermark: false,
    maxHeight: 2160,
    monthlyCredits: 1500,
    maxDurationSeconds: 600,
    priority: true,
  },
} as const;

export type PlanId = keyof typeof PLANS;

export const CREDIT_PACK_AMOUNT = 100;

export const CREDIT_COSTS = {
  transcribe: 2,
  director: 3,
  promptEdit: 4,
  smartTrim: 2,
  hooks: 1,
  extract: 5,
  translate: 2,
  silence: 1,
  beatSync: 2,
  broll: 2,
  reframe: 2,
  renderPer15s: {
    720: 1,
    1080: 2,
    2160: 4,
  },
} as const;

export type CreditAction = Exclude<keyof typeof CREDIT_COSTS, "renderPer15s">;

export function renderCreditCost(
  dimensions: { width: number; height: number },
  durationSeconds: number,
): number {
  const shortSide = Math.min(dimensions.width, dimensions.height);
  const bucket = shortSide > 1080 ? 2160 : shortSide > 720 ? 1080 : 720;
  const blocks = Math.max(1, Math.ceil(durationSeconds / 15));
  return CREDIT_COSTS.renderPer15s[bucket] * blocks;
}
