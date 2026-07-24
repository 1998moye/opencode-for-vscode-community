import type { ComposerSuggestionsState, Locale } from "../../../src/runtime/contracts";
import { t } from "../i18n";

const kindLabel = (locale: Locale, kind: string): string => {
  switch (kind) {
    case "agent":
      return t(locale, "assistKindAgent");
    case "file":
      return t(locale, "assistKindFile");
    case "symbol":
      return t(locale, "assistKindSymbol");
    default:
      return kind;
  }
};

export function ComposerAutocomplete({
  locale,
  listboxId,
  activeIndex,
  suggestions,
  onSelect
}: {
  locale: Locale;
  listboxId: string;
  activeIndex: number;
  suggestions: ComposerSuggestionsState & { displayStatus: ComposerSuggestionsState["status"] | "loading" };
  onSelect: (index: number) => void;
}) {
  const showKind = suggestions.trigger === "mention";
  const statusMessage = suggestions.displayStatus === "loading"
    ? t(locale, "assistLoading")
    : suggestions.displayStatus === "error"
      ? ("error" in suggestions ? suggestions.error : t(locale, "assistEmpty"))
      : suggestions.displayStatus === "ready" && suggestions.items.length === 0
        ? t(locale, "assistEmpty")
        : "";

  return (
    <div className="composer-assist" role="presentation">
      <div className="composer-assist__status" aria-live="polite" aria-atomic="true">
        {statusMessage}
      </div>
      {suggestions.displayStatus === "ready" && suggestions.items.length > 0 ? (
        <ul className="composer-assist__list" role="listbox" id={listboxId} aria-label={t(locale, "assistListLabel")}>
          {suggestions.items.map((item, index) => (
            <li key={item.id}>
              <button
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                className={`composer-assist__item${index === activeIndex ? " composer-assist__item--active" : ""}${showKind ? "" : " composer-assist__item--slash"}`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  onSelect(index);
                }}
                aria-label={showKind
                  ? `${kindLabel(locale, item.kind)} ${item.label}${item.detail ? ` ${item.detail}` : ""}`
                  : `/${item.label}${item.detail ? ` ${item.detail}` : ""}`}
              >
                {showKind ? <span className="composer-assist__kind">{kindLabel(locale, item.kind)}</span> : null}
                <span className={`composer-assist__label${showKind ? "" : " composer-assist__label--slash"}`}>
                  {showKind ? item.label : `/${item.label}`}
                </span>
                {item.detail ? <span className="composer-assist__detail">{item.detail}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
