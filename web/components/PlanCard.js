export default function PlanCard({
  option,
  loadingPlan,
  onSelect,
  ctaLabel = "Upgrade now",
  priceSuffix,
}) {
  const { plan, label, price, detail, helper, primary, badge } = option;
  const isLoading = loadingPlan === plan;
  const isBlocked = loadingPlan !== null && loadingPlan !== plan;
  const suffix = typeof priceSuffix === "string" ? priceSuffix : "";
  const badgeCopy = badge || (primary ? "Best value" : "Flexible");

  return (
    <button
      type="button"
      className="aa-plan-card"
      data-primary={primary ? "true" : "false"}
      onClick={() => onSelect(plan)}
      disabled={isBlocked}
    >
      {badgeCopy && <span className="aa-plan-card__label">{badgeCopy}</span>}
      <div className="aa-plan-card__price">
        {price} {suffix ? <small>{suffix}</small> : null}
      </div>
      <div className="aa-plan-card__title">{label}</div>
      <p className="aa-plan-card__detail">{detail}</p>
      {helper && <p className="aa-plan-card__helper">{helper}</p>}
      <div className="aa-plan-card__badge">
        <span>{isLoading ? "Opening Stripe…" : ctaLabel}</span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="5" y1="12" x2="19" y2="12" />
          <polyline points="12 5 19 12 12 19" />
        </svg>
      </div>
    </button>
  );
}

