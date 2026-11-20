import type {
  CharacterAnimState,
  GameSnapshot,
  MatchSummary,
  PlayerRole,
  SceneKey,
} from '../../../shared/types.ts';

export type LobbyMode = 'create' | 'join' | 'online';

export interface BridgeState {
  activeScene: SceneKey;
  preloadProgress: number;
  lobbyMode: LobbyMode;
  activeControlRole: PlayerRole;
  previewAnims: Record<PlayerRole, CharacterAnimState>;
  showHowToPlay: boolean;
  lastMatchSummary: MatchSummary | null;
  lastSnapshot: GameSnapshot | null;
  settingsReturnScene: SceneKey;
  toastMessage: string | null;
  isCharacterMoving: boolean;
  // Phase 06 UI overlay state (event-driven)
  orderMenuTableId: string | null;
  showKitchenBoard: boolean;
  selectedRecipeId: string | null;
}

type BridgeListener = (state: BridgeState) => void;
type SceneCommandHandler = (scene: SceneKey, data?: Record<string, unknown>) => void;
type ControlVectorHandler = (dx: number, dy: number) => void;
type ActionTriggerHandler = () => void;

class GameBridgeImpl {
  private state: BridgeState = {
    activeScene: 'BootScene',
    preloadProgress: 0,
    lobbyMode: 'create',
    activeControlRole: 'chef',
    previewAnims: {
      chef: 'frying',
      waiter: 'carrying_tray',
    },
    showHowToPlay: false,
    lastMatchSummary: null,
    lastSnapshot: null,
    settingsReturnScene: 'MainMenuScene',
    toastMessage: null,
    isCharacterMoving: false,
    orderMenuTableId: null,
    showKitchenBoard: false,
    selectedRecipeId: null,
  };

  private listeners = new Set<BridgeListener>();
  private sceneCommandHandler: SceneCommandHandler | null = null;
  private controlVectorHandler: ControlVectorHandler | null = null;
  private actionTriggerHandler: ActionTriggerHandler | null = null;
  private cancelMoveHandler: ActionTriggerHandler | null = null;
  private toastTimeout: number | null = null;

  public getState(): BridgeState {
    return { ...this.state };
  }

  public subscribe(listener: BridgeListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  public patch(partial: Partial<BridgeState>): void {
    this.state = { ...this.state, ...partial };
    this.listeners.forEach((fn) => fn(this.getState()));
  }

  public showToast(msg: string, durationMs = 2600): void {
    if (this.toastTimeout) window.clearTimeout(this.toastTimeout);
    this.patch({ toastMessage: msg });
    this.toastTimeout = window.setTimeout(() => {
      this.patch({ toastMessage: null });
    }, durationMs);
  }

  public registerSceneRouter(handler: SceneCommandHandler): void {
    this.sceneCommandHandler = handler;
  }

  public navigateTo(scene: SceneKey, data?: Record<string, unknown>): void {
    this.patch({ activeScene: scene, showHowToPlay: false });
    this.sceneCommandHandler?.(scene, data);
  }

  public registerControls(
    onVector: ControlVectorHandler | null,
    onAction: ActionTriggerHandler | null,
    onCancelMove: ActionTriggerHandler | null = null
  ): void {
    this.controlVectorHandler = onVector;
    this.actionTriggerHandler = onAction;
    this.cancelMoveHandler = onCancelMove;
  }

  public emitMoveVector(dx: number, dy: number): void {
    this.controlVectorHandler?.(dx, dy);
  }

  public emitActionPress(): void {
    this.actionTriggerHandler?.();
  }

  public emitCancelMove(): void {
    this.cancelMoveHandler?.();
  }

  public openOrderMenu(tableId: string): void {
    this.patch({ orderMenuTableId: tableId, showKitchenBoard: false });
  }

  public closeOrderMenu(): void {
    this.patch({ orderMenuTableId: null });
  }

  public setKitchenBoardOpen(open: boolean): void {
    this.patch({ showKitchenBoard: open, orderMenuTableId: open ? null : this.state.orderMenuTableId });
  }

  public openRecipePreview(recipeId: string | null): void {
    this.patch({ selectedRecipeId: recipeId });
  }
}

export const gameBridge = new GameBridgeImpl();
