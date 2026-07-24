/**
 * 编写区底栏药丸按钮。
 */
export function ComposerPill({
  label,
  prefix,
  disabled,
  active,
  expanded,
  onClick,
  ariaLabel
}: {
  label: string;
  prefix?: string;
  disabled?: boolean;
  active?: boolean;
  expanded?: boolean;
  onClick: () => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      className={`composer__pill${active ? " composer__pill--active" : ""}`}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-expanded={expanded}
      onClick={onClick}
    >
      {prefix ? <span className="composer__pill-prefix" aria-hidden="true">{prefix}</span> : null}
      <span className="composer__pill-label">{label}</span>
      <span className="composer__pill-chevron" aria-hidden="true">▾</span>
    </button>
  );
}
