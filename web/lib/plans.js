export const PLAN_OPTIONS = [
  {
    plan: "annual",
    label: "Premium Annual",
    price: "$24/mo",
    detail: "Billed annually · Best value",
    helper: "Save ~17% vs paying monthly",
    badge: "Best value",
    primary: true,
  },
  {
    plan: "monthly",
    label: "Premium Monthly",
    price: "$29/mo",
    detail: "Billed monthly · Flexible",
    helper: "Cancel anytime",
    badge: "Flexible",
    primary: false,
  },
];

export function getPlanLabel(plan) {
  return PLAN_OPTIONS.find((option) => option.plan === plan)?.label || "Premium";
}

