import type { ComposerSelection, OpenCodeConnection, SessionSummary } from "../contracts.js";
import { OpenCodeStateStore } from "../state/openCodeStateStore.js";
import { selectionFromSession, validateComposerSelection, hasComposerSelection } from "./validateComposerSelection.js";

const emptyCatalog = (): import("../contracts.js").ModelCatalog => ({
  loaded: false,
  providers: [],
  models: [],
  agents: []
});

export class CatalogModule {
  #catalogDirectory: string | undefined;

  constructor(
    private readonly state: OpenCodeStateStore,
    private readonly connection: () => OpenCodeConnection | undefined
  ) {}

  /**
   * 从 OpenCode Server 刷新模型与智能体目录。
   */
  async refresh(directory?: string): Promise<void> {
    const connection = this.connection();
    if (!connection?.listCatalog) {
      this.state.update({ catalog: { ...emptyCatalog(), loaded: true, error: "当前 OpenCode Server 不支持模型目录。" } });
      return;
    }
    const catalog = await connection.listCatalog(directory);
    this.#catalogDirectory = directory;
    this.state.update({ catalog });
    await this.ensureDefaultSelection(directory);
    this.revalidateSelection();
  }

  /**
   * 从 OpenCode 配置同步默认模型，供初次加载与无会话时展示。
   */
  private async ensureDefaultSelection(directory?: string): Promise<void> {
    const connection = this.connection();
    if (!connection?.getDefaultComposerSelection) {
      return;
    }
    const defaultSelection = await connection.getDefaultComposerSelection(directory);
    if (!hasComposerSelection(defaultSelection)) {
      return;
    }
    const validated = validateComposerSelection(
      { ...defaultSelection },
      this.state.current.catalog
    ).selection;
    const updates: Partial<import("../contracts.js").OpenCodeState> = {};
    if (!hasComposerSelection(this.state.current.composerPreference)) {
      updates.composerPreference = validated;
    }
    if (!hasComposerSelection(this.state.current.composerSelection)) {
      updates.composerSelection = validated;
    }
    if (Object.keys(updates).length > 0) {
      this.state.update(updates);
    }
  }

  /**
   * 将编写区选择与活动会话对齐：会话有配置则跟会话，否则沿用用户偏好。
   */
  applySessionSelection(session: SessionSummary): void {
    const sessionSelection = selectionFromSession(session);
    const hasSessionSelection = hasComposerSelection(sessionSelection);
    if (hasSessionSelection) {
      const validated = validateComposerSelection(sessionSelection, this.state.current.catalog).selection;
      this.state.update({
        composerSelection: validated,
        composerPreference: validated
      });
      return;
    }

    const preference = this.state.current.composerPreference;
    const fallback = hasComposerSelection(preference)
      ? preference
      : this.state.current.composerSelection;
    if (!hasComposerSelection(fallback)) {
      return;
    }

    const validated = validateComposerSelection(fallback, this.state.current.catalog).selection;
    this.state.update({ composerSelection: validated });
  }

  /**
   * 配置未声明默认值时，优先沿用当前目录最近一次实际运行过的模型；
   * 当前目录没有模型记录时再回退到全局最近模型。OpenCode CLI 会把临时选择
   * 记录在会话中，而不一定写入 opencode.json。
   */
  restoreRecentSessionPreference(sessions: SessionSummary[], directory?: string): void {
    if (
      hasComposerSelection(this.state.current.composerPreference)
      || hasComposerSelection(this.state.current.composerSelection)
    ) {
      return;
    }
    const candidates = sessions
      .filter((session) => hasComposerSelection(selectionFromSession(session)))
      .sort((left, right) => right.updatedAt - left.updatedAt);
    const modelCandidates = candidates.filter((session) => Boolean(session.model));
    const recent = modelCandidates.find((session) => !directory || session.directory === directory)
      ?? modelCandidates[0]
      ?? candidates.find((session) => !directory || session.directory === directory)
      ?? candidates[0];
    if (recent) {
      this.applySessionSelection(recent);
    }
  }

  /**
   * 无活动会话时也将偏好写入 OpenCode 配置。
   */
  async persistPreference(selection: ComposerSelection): Promise<void> {
    const connection = this.connection();
    if (!connection?.persistDefaultComposerSelection || !hasComposerSelection(selection)) {
      return;
    }
    await connection.persistDefaultComposerSelection(selection, this.resolveConfigDirectory());
  }

  /**
   * 激活会话时应用编写区选择，并在新会话上同步到 OpenCode Server。
   */
  async adoptSession(session: SessionSummary): Promise<void> {
    this.applySessionSelection(session);
    if (hasComposerSelection(selectionFromSession(session))) {
      return;
    }
    const validated = this.state.current.composerSelection;
    if (!hasComposerSelection(validated)) {
      return;
    }

    const connection = this.connection();
    if (!connection?.applyComposerSelection) {
      return;
    }
    try {
      await connection.applyComposerSelection(session, validated);
    } catch {
      // 保留本地选择；发送消息时仍会附带模型参数。
    }
  }

  /**
   * @deprecated 使用 {@link applySessionSelection} 或 {@link adoptSession}。
   */
  syncFromSession(session: SessionSummary): void {
    this.applySessionSelection(session);
  }

  /**
   * 更新用户选择并尝试应用到当前活动会话。
   */
  async updateSelection(patch: Partial<ComposerSelection>): Promise<void> {
    const merged: ComposerSelection = {
      ...this.state.current.composerSelection,
      ...patch,
      notice: undefined
    };
    if (patch.providerID !== undefined && patch.providerID !== this.state.current.composerSelection.providerID) {
      merged.modelID = patch.modelID;
      merged.variant = patch.variant;
    }
    if (patch.modelID !== undefined && patch.modelID !== this.state.current.composerSelection.modelID) {
      merged.variant = patch.variant;
    }

    const validated = validateComposerSelection(merged, this.state.current.catalog).selection;
    this.state.update({
      composerSelection: validated,
      composerPreference: validated
    });

    const session = this.activeSession();
    const connection = this.connection();
    if (session && connection?.applyComposerSelection) {
      try {
        await connection.applyComposerSelection(session, validated);
      } catch (error) {
        this.state.update({
          composerSelection: {
            ...validated,
            notice: error instanceof Error ? error.message : "切换模型或智能体失败。"
          }
        });
        return;
      }
    }

    await this.persistPreference(validated);
  }

  /**
   * 返回发送消息时应附带的模型与智能体参数。
   */
  messageOptions(): import("../contracts.js").SendMessageOptions {
    const { providerID, modelID, variant, agent } = this.state.current.composerSelection;
    return {
      ...(providerID && modelID ? { model: { providerID, modelID } } : {}),
      ...(variant ? { variant } : {}),
      ...(agent ? { agent } : {})
    };
  }

  revalidateSelection(): void {
    const { selection, changed } = validateComposerSelection(
      this.state.current.composerSelection,
      this.state.current.catalog
    );
    if (!changed) {
      return;
    }
    this.state.update({ composerSelection: selection });
  }

  private activeSession(): SessionSummary | undefined {
    return this.state.current.sessions.find((session) => session.id === this.state.current.activeSessionId);
  }

  private resolveConfigDirectory(): string | undefined {
    return this.activeSession()?.directory ?? this.#catalogDirectory;
  }
}
