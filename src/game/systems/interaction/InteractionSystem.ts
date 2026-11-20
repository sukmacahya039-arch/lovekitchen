import type { GridCoord } from '../../../shared/layout.ts';
import type { PlayerRole } from '../../../shared/types.ts';
import {
  canRoleInteractWithType,
  getInteractionLabel,
  ROLE_PERMISSION_RULES,
  type AllowedRoles,
  type InteractableType,
} from './RolePermissions.ts';

export type InteractionLifecycleState = 'idle' | 'pending' | 'active';

export interface InteractionContext {
  characterId: string;
  role: PlayerRole;
  object: InteractableObject;
}

export interface InteractableObject {
  id: string;
  type: InteractableType;
  col: number;
  row: number;
  interactionRadius: number;
  priority: number;
  enabled: boolean;
  requiredRole: AllowedRoles;
  label?: string;
  interactionDurationMs: number;
  state: InteractionLifecycleState;
  onInteract: (ctx: InteractionContext) => void | Promise<void>;
  onCancel?: (ctx: InteractionContext) => void;
}

export interface RegisterInteractableInput {
  id: string;
  type: InteractableType;
  col: number;
  row: number;
  interactionRadius?: number;
  priority?: number;
  enabled?: boolean;
  requiredRole?: AllowedRoles;
  label?: string;
  interactionDurationMs?: number;
  onInteract: (ctx: InteractionContext) => void | Promise<void>;
  onCancel?: (ctx: InteractionContext) => void;
}

export interface InteractionValidationResult {
  allowed: boolean;
  reason?: 'not_found' | 'disabled' | 'role_restricted' | 'out_of_range';
}

interface ActiveInteractionHandle {
  token: number;
  characterId: string;
  role: PlayerRole;
  objectId: string;
  endsAtMs: number;
  completed: boolean;
}

/**
 * Reusable, role-aware generic interaction registry & execution manager.
 * Guarantees single-fire callback execution, clean cancellation, priority resolution,
 * and decoupled role permission validation.
 */
export class InteractionSystem {
  private objects = new Map<string, InteractableObject>();
  private activeByCharacter = new Map<string, ActiveInteractionHandle>();
  private nextToken = 1;

  public register(input: RegisterInteractableInput): InteractableObject {
    const rule = ROLE_PERMISSION_RULES[input.type];
    const obj: InteractableObject = {
      id: input.id,
      type: input.type,
      col: input.col,
      row: input.row,
      interactionRadius: input.interactionRadius ?? rule.defaultRadius,
      priority: input.priority ?? rule.priority,
      enabled: input.enabled ?? true,
      requiredRole: input.requiredRole ?? rule.allowedRoles,
      label: input.label,
      interactionDurationMs: input.interactionDurationMs ?? 0,
      state: 'idle',
      onInteract: input.onInteract,
      onCancel: input.onCancel,
    };
    this.objects.set(obj.id, obj);
    return obj;
  }

  public unregister(id: string): boolean {
    for (const [charId, active] of this.activeByCharacter.entries()) {
      if (active.objectId === id) {
        this.cancelForCharacter(charId);
      }
    }
    return this.objects.delete(id);
  }

  public clear(): void {
    for (const charId of Array.from(this.activeByCharacter.keys())) {
      this.cancelForCharacter(charId);
    }
    this.objects.clear();
  }

  public getById(id: string): InteractableObject | undefined {
    return this.objects.get(id);
  }

  public getAll(): InteractableObject[] {
    return Array.from(this.objects.values());
  }

  public setEnabled(id: string, enabled: boolean): void {
    const obj = this.objects.get(id);
    if (!obj) return;
    obj.enabled = enabled;
    if (!enabled) {
      for (const [charId, active] of this.activeByCharacter.entries()) {
        if (active.objectId === id) {
          this.cancelForCharacter(charId);
        }
      }
    }
  }

  public setLabel(id: string, label: string | undefined): void {
    const obj = this.objects.get(id);
    if (obj) obj.label = label;
  }

  public validateAccess(
    role: PlayerRole,
    objectId: string,
    characterPos?: GridCoord,
    checkRange = false
  ): InteractionValidationResult {
    const obj = this.objects.get(objectId);
    if (!obj) return { allowed: false, reason: 'not_found' };
    if (!obj.enabled) return { allowed: false, reason: 'disabled' };
    if (!canRoleInteractWithType(role, obj.type, obj.requiredRole)) {
      return { allowed: false, reason: 'role_restricted' };
    }
    if (checkRange && characterPos) {
      const dist = Math.hypot(characterPos.col - obj.col, characterPos.row - obj.row);
      if (dist > obj.interactionRadius + 0.25) {
        return { allowed: false, reason: 'out_of_range' };
      }
    }
    return { allowed: true };
  }

  public getActionLabel(role: PlayerRole, obj: InteractableObject): string {
    return getInteractionLabel(role, obj.type, obj.label);
  }

  /**
   * Finds the highest-priority enabled interactable within range of a character's ground position.
   */
  public findNearestInteractable(
    role: PlayerRole,
    pos: GridCoord,
    extraReach = 0.35
  ): InteractableObject | null {
    let best: InteractableObject | null = null;
    let bestScore = -Infinity;

    for (const obj of this.objects.values()) {
      if (!obj.enabled) continue;
      if (!canRoleInteractWithType(role, obj.type, obj.requiredRole)) continue;

      const dist = Math.hypot(pos.col - obj.col, pos.row - obj.row);
      const maxRange = obj.interactionRadius + extraReach;
      if (dist > maxRange) continue;

      // Combine priority with proximity so closest high-priority station wins cleanly
      const score = obj.priority * 0.25 - dist * 10;
      if (score > bestScore) {
        bestScore = score;
        best = obj;
      }
    }

    return best;
  }

  /**
   * Finds an interactable near a tapped grid coordinate (used by InputController priority 2).
   */
  public findInteractableAtGrid(
    col: number,
    row: number,
    pickRadius = 0.72
  ): InteractableObject | null {
    let best: InteractableObject | null = null;
    let bestDist = pickRadius;

    for (const obj of this.objects.values()) {
      const d = Math.hypot(col - obj.col, row - obj.row);
      if (d <= bestDist) {
        bestDist = d;
        best = obj;
      }
    }
    return best;
  }

  /**
   * Begins an interaction for a character. Executes the callback ONCE cleanly and
   * tracks timed duration when interactionDurationMs > 0.
   */
  public executeInteraction(
    characterId: string,
    role: PlayerRole,
    objectId: string,
    characterPos: GridCoord,
    nowMs = Date.now()
  ): { started: boolean; token?: number; reason?: InteractionValidationResult['reason'] } {
    const check = this.validateAccess(role, objectId, characterPos, true);
    if (!check.allowed) {
      return { started: false, reason: check.reason };
    }

    const obj = this.objects.get(objectId)!;

    // Prevent duplicate execution if this character is already interacting with the same object
    const existing = this.activeByCharacter.get(characterId);
    if (existing && !existing.completed && existing.objectId === objectId) {
      return { started: false };
    }
    if (existing) {
      this.cancelForCharacter(characterId);
    }

    const token = this.nextToken++;
    const duration = Math.max(0, obj.interactionDurationMs);
    const handle: ActiveInteractionHandle = {
      token,
      characterId,
      role,
      objectId: obj.id,
      endsAtMs: nowMs + duration,
      completed: duration === 0,
    };

    obj.state = duration > 0 ? 'active' : 'idle';
    if (duration > 0) {
      this.activeByCharacter.set(characterId, handle);
    }

    void obj.onInteract({ characterId, role, object: obj });
    return { started: true, token };
  }

  /**
   * Advances active timed interactions and returns IDs of characters whose interaction completed.
   */
  public update(nowMs = Date.now()): string[] {
    const finishedCharacters: string[] = [];
    for (const [charId, handle] of this.activeByCharacter.entries()) {
      if (nowMs >= handle.endsAtMs) {
        handle.completed = true;
        const obj = this.objects.get(handle.objectId);
        if (obj) obj.state = 'idle';
        this.activeByCharacter.delete(charId);
        finishedCharacters.push(charId);
      }
    }
    return finishedCharacters;
  }

  public isCharacterInteracting(characterId: string): boolean {
    const active = this.activeByCharacter.get(characterId);
    return Boolean(active && !active.completed);
  }

  public getActiveObjectId(characterId: string): string | null {
    return this.activeByCharacter.get(characterId)?.objectId ?? null;
  }

  /**
   * Safely cancels any active interaction for a character without allowing stale callbacks.
   */
  public cancelForCharacter(characterId: string): boolean {
    const active = this.activeByCharacter.get(characterId);
    if (!active) return false;
    active.completed = true;
    this.activeByCharacter.delete(characterId);

    const obj = this.objects.get(active.objectId);
    if (obj) {
      obj.state = 'idle';
      obj.onCancel?.({ characterId, role: active.role, object: obj });
    }
    return true;
  }
}
