export const PLAN_OPTIONS = [
  {
    plan: "annual",
    label: "Premium Annual",
    price: "$19.99/mo",
    detail: "Billed annually · $239.88 per year",
    helper: "Save ~$60/year vs paying monthly",
    badge: "Best value",
    primary: true,
  },
  {
    plan: "monthly",
    label: "Premium Monthly",
    price: "$24.99/mo",
    detail: "Billed monthly · Flexible",
    helper: "Cancel anytime",
    badge: "Flexible",
    primary: false,
  },
];

export function getPlanLabel(plan) {
  return PLAN_OPTIONS.find((option) => option.plan === plan)?.label || "Premium";
}

