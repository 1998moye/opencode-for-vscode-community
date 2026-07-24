import type { OpenCodeState } from "../../../src/runtime/contracts";
import {
  formatAgentDescription,
  formatAgentPillLabel,
  formatModelPillLabel,
  isOfficialOpencodeChannel,
  selectableProviders,
  selectionForModelChange,
  selectionForProviderChange
} from "../composer/composerSelectionHelpers";
import { useToolbarPopover } from "../composer/useToolbarPopover";
import { t } from "../i18n";
import { useChatStore } from "../store";
import { postToHost } from "../vscodeApi";
import { ComposerPill } from "./ComposerPill";
import { ComposerPopover } from "./ComposerPopover";

/**
 * 编写区底栏左侧：智能体与模型药丸。
 */
export function ComposerToolbarControls({ state }: { state: OpenCodeState }) {
  const dispatch = useChatStore((store) => store.dispatch);
  const agentPopover = useToolbarPopover("agent");
  const modelPopover = useToolbarPopover("model");
  const { catalog, composerSelection, locale } = state;
  const disabled = state.phase !== "ready" || !catalog.loaded;
  const providerModels = catalog.models.filter((model) => model.providerID === composerSelection.providerID);
  const hasLockedModels = providerModels.some((model) => !model.available);
  const activeModel = catalog.models.find((model) =>
    model.providerID === composerSelection.providerID && model.id === composerSelection.modelID
  );
  const variants = activeModel?.variants ?? [];
  const activeProvider = catalog.providers.find((provider) => provider.id === composerSelection.providerID);
  const officialChannel = activeProvider ? isOfficialOpencodeChannel(activeProvider) : undefined;
  const connectedProviders = selectableProviders(catalog);

  const update = (selection: Partial<typeof composerSelection>): void => {
    dispatch({ type: "update-composer-selection", selection });
  };

  const selectAgent = (agentId: string | undefined): void => {
    update({ agent: agentId });
    agentPopover.close();
  };

  return (
    <div className="composer__toolbar-controls" aria-label={t(locale, "composerSelectors")}>
      <div ref={agentPopover.rootRef} className="composer__popover-anchor">
        <ComposerPill
          prefix="∞"
          label={formatAgentPillLabel(state)}
          ariaLabel={t(locale, "agentLabel")}
          disabled={disabled || catalog.agents.length === 0}
          active={agentPopover.open}
          expanded={agentPopover.open}
          onClick={() => agentPopover.toggle()}
        />
        <ComposerPopover
          anchorRef={agentPopover.rootRef}
          panelRef={agentPopover.panelRef}
          open={agentPopover.open}
          title={t(locale, "agentLabel")}
        >
          <div className="composer__popover-list" role="listbox" aria-label={t(locale, "agentLabel")}>
            <button
              type="button"
              role="option"
              aria-selected={!composerSelection.agent}
              className={`composer__popover-option${!composerSelection.agent ? " composer__popover-option--selected" : ""}`}
              onClick={() => selectAgent(undefined)}
            >
              <span className="composer__popover-option-title">{t(locale, "agentDefault")}</span>
              <span className="composer__popover-option-desc">{t(locale, "agentDefaultHint")}</span>
            </button>
            {catalog.agents.map((agent) => (
              <button
                key={agent.id}
                type="button"
                role="option"
                aria-selected={composerSelection.agent === agent.id}
                className={`composer__popover-option${composerSelection.agent === agent.id ? " composer__popover-option--selected" : ""}`}
                onClick={() => selectAgent(agent.id)}
              >
                <span className="composer__popover-option-title">{agent.name}</span>
                {formatAgentDescription(agent, locale) ? (
                  <span className="composer__popover-option-desc">{formatAgentDescription(agent, locale)}</span>
                ) : null}
              </button>
            ))}
          </div>
        </ComposerPopover>
      </div>

      <div ref={modelPopover.rootRef} className="composer__popover-anchor">
        <ComposerPill
          label={formatModelPillLabel(state)}
          ariaLabel={t(locale, "modelLabel")}
          disabled={disabled}
          active={modelPopover.open}
          expanded={modelPopover.open}
          onClick={() => modelPopover.toggle()}
        />
        <ComposerPopover
          anchorRef={modelPopover.rootRef}
          panelRef={modelPopover.panelRef}
          open={modelPopover.open}
          title={t(locale, "modelPickerTitle")}
        >
          <section className="composer__popover-section">
            <h4 className="composer__popover-section-title">{t(locale, "providerLabel")}</h4>
            <div className="composer__popover-list composer__popover-list--compact">
              {connectedProviders.length === 0 ? (
                <p className="composer__popover-hint composer__popover-hint--muted">{t(locale, "modelNoConnectedProviders")}</p>
              ) : null}
              {connectedProviders.map((provider) => (
                <button
                  key={provider.id}
                  type="button"
                  className={`composer__popover-option composer__popover-option--compact${composerSelection.providerID === provider.id ? " composer__popover-option--selected" : ""}`}
                  onClick={() => update(selectionForProviderChange(catalog, provider.id))}
                >
                  <span className="composer__popover-option-title">{provider.name}</span>
                </button>
              ))}
            </div>
          </section>

          {composerSelection.providerID ? (
            <section className="composer__popover-section">
              <h4 className="composer__popover-section-title">{t(locale, "modelLabel")}</h4>
              <div className="composer__popover-list composer__popover-list--compact">
                {providerModels.length === 0 ? (
                  <p className="composer__popover-hint composer__popover-hint--muted">{t(locale, "modelProviderEmpty")}</p>
                ) : null}
                {providerModels.map((model) => {
                  const locked = !model.available;
                  return (
                  <button
                    key={model.id}
                    type="button"
                    className={`composer__popover-option composer__popover-option--compact${
                      composerSelection.modelID === model.id ? " composer__popover-option--selected" : ""
                    }${locked ? " composer__popover-option--locked" : ""}`}
                    onClick={() => {
                      if (locked) {
                        modelPopover.close();
                        postToHost({ type: "connect-opencode-provider" });
                        return;
                      }
                      update(selectionForModelChange(catalog, composerSelection, model.id));
                    }}
                  >
                    <span className="composer__popover-option-title">
                      {model.name}
                      {locked ? (
                        <span className="composer__popover-option-badge">{t(locale, "modelLocked")}</span>
                      ) : null}
                    </span>
                  </button>
                  );
                })}
              </div>
            </section>
          ) : null}

          {variants.length > 0 ? (
            <section className="composer__popover-section">
              <h4 className="composer__popover-section-title">{t(locale, "variantLabel")}</h4>
              <div className="composer__popover-chips">
                <button
                  type="button"
                  className={`composer__popover-chip${!composerSelection.variant ? " composer__popover-chip--selected" : ""}`}
                  onClick={() => update({ variant: undefined })}
                >
                  {t(locale, "variantDefault")}
                </button>
                {variants.map((variant) => (
                  <button
                    key={variant}
                    type="button"
                    className={`composer__popover-chip${composerSelection.variant === variant ? " composer__popover-chip--selected" : ""}`}
                    onClick={() => update({ variant })}
                  >
                    {variant}
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          <p className="composer__popover-hint">{t(locale, "modelSettingsHint")}</p>
          {officialChannel === "zen" ? (
            <p className="composer__popover-hint composer__popover-hint--muted">{t(locale, "providerZenHint")}</p>
          ) : null}
          {officialChannel === "go" ? (
            <p className="composer__popover-hint composer__popover-hint--muted">{t(locale, "providerGoHint")}</p>
          ) : null}
          {hasLockedModels ? (
            <p className="composer__popover-hint composer__popover-hint--muted">{t(locale, "modelPaidHint")}</p>
          ) : null}
          <div className="composer__popover-actions">
            <button
              type="button"
              className="composer__popover-action"
              onClick={() => {
                modelPopover.close();
                postToHost({ type: "connect-opencode-provider" });
              }}
            >
              {t(locale, "modelConnectProvider")}
            </button>
            <button
              type="button"
              className="composer__popover-action"
              onClick={() => {
                modelPopover.close();
                postToHost({ type: "open-opencode-config" });
              }}
            >
              {t(locale, "modelOpenConfig")}
            </button>
            <button
              type="button"
              className="composer__popover-action composer__popover-action--secondary"
              onClick={() => postToHost({ type: "open-opencode-model-docs" })}
            >
              {t(locale, "modelOpenDocs")}
            </button>
          </div>
        </ComposerPopover>
      </div>

      {composerSelection.notice ? (
        <span className="composer__selection-notice" role="status">{composerSelection.notice}</span>
      ) : null}
    </div>
  );
}
