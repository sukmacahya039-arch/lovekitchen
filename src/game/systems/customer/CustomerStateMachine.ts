export type CustomerState =
  | 'SPAWNING'
  | 'ENTERING'
  | 'QUEUING'
  | 'SEARCHING_TABLE'
  | 'WALKING_TO_TABLE'
  | 'SEATING'
  | 'SEATED'
  | 'WAITING_FOR_WAITER'
  | 'WAITING_FOR_ORDER'
  | 'WAITING_FOR_FOOD'
  | 'EATING'
  | 'WAITING_FOR_BILL'
  | 'LEAVING_TABLE'
  | 'WALKING_TO_EXIT'
  | 'EXITING'
  | 'COMPLETED'
  | 'ANGRY'
  | 'CANCELLED';

export type CustomerAnimState =
  | 'IDLE'
  | 'WALK'
  | 'SIT'
  | 'SITTING_IDLE'
  | 'EAT'
  | 'HAPPY'
  | 'NEUTRAL'
  | 'IMPATIENT'
  | 'ANGRY'
  | 'STAND_UP'
  | 'WALK_AWAY'
  | 'EXIT';

export type CustomerExpression =
  | 'HAPPY'
  | 'NORMAL'
  | 'WAITING'
  | 'IMPATIENT'
  | 'ANGRY'
  | 'SATISFIED'
  | 'DISAPPOINTED';

/**
 * Valid finite state machine transition table (§3).
 * Prevents accidental random state jumps while supporting normal, angry, and cancelled flows.
 */
export const VALID_CUSTOMER_TRANSITIONS: Record<CustomerState, CustomerState[]> = {
  SPAWNING: ['ENTERING', 'CANCELLED'],
  ENTERING: ['SEARCHING_TABLE', 'QUEUING', 'WALKING_TO_TABLE', 'WALKING_TO_EXIT', 'ANGRY', 'CANCELLED'],
  QUEUING: ['SEARCHING_TABLE', 'WALKING_TO_TABLE', 'ANGRY', 'WALKING_TO_EXIT', 'CANCELLED'],
  SEARCHING_TABLE: ['WALKING_TO_TABLE', 'QUEUING', 'ANGRY', 'WALKING_TO_EXIT', 'CANCELLED'],
  WALKING_TO_TABLE: ['SEATING', 'SEARCHING_TABLE', 'QUEUING', 'ANGRY', 'WALKING_TO_EXIT', 'CANCELLED'],
  SEATING: ['SEATED', 'LEAVING_TABLE', 'ANGRY', 'CANCELLED'],
  SEATED: ['WAITING_FOR_WAITER', 'WAITING_FOR_ORDER', 'LEAVING_TABLE', 'ANGRY', 'CANCELLED'],
  WAITING_FOR_WAITER: ['WAITING_FOR_ORDER', 'WAITING_FOR_FOOD', 'LEAVING_TABLE', 'ANGRY', 'CANCELLED'],
  WAITING_FOR_ORDER: ['WAITING_FOR_FOOD', 'LEAVING_TABLE', 'ANGRY', 'CANCELLED'],
  WAITING_FOR_FOOD: ['EATING', 'LEAVING_TABLE', 'ANGRY', 'CANCELLED'],
  EATING: ['WAITING_FOR_BILL', 'LEAVING_TABLE', 'CANCELLED'],
  WAITING_FOR_BILL: ['LEAVING_TABLE', 'ANGRY', 'CANCELLED'],
  LEAVING_TABLE: ['WALKING_TO_EXIT', 'EXITING', 'CANCELLED'],
  ANGRY: ['LEAVING_TABLE', 'WALKING_TO_EXIT', 'EXITING', 'CANCELLED'],
  WALKING_TO_EXIT: ['EXITING', 'COMPLETED', 'CANCELLED'],
  EXITING: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

export interface StateHooks {
  onEnter?: (from: CustomerState) => void;
  onExit?: (to: CustomerState) => void;
}

/**
 * Modular Finite State Machine for each CustomerAI instance.
 * Guarantees validated transitions, single-fire entry/exit hooks, and state duration tracking.
 */
export class CustomerStateMachine {
  private current: CustomerState = 'SPAWNING';
  private previous: CustomerState | null = null;
  private timeInStateSec = 0;
  private hooks = new Map<CustomerState, StateHooks>();

  constructor(initial: CustomerState = 'SPAWNING') {
    this.current = initial;
  }

  public registerHooks(state: CustomerState, hooks: StateHooks): void {
    this.hooks.set(state, hooks);
  }

  public getState(): CustomerState {
    return this.current;
  }

  public getPreviousState(): CustomerState | null {
    return this.previous;
  }

  public getTimeInState(): number {
    return this.timeInStateSec;
  }

  public canTransitionTo(next: CustomerState): boolean {
    if (next === this.current) return false;
    return VALID_CUSTOMER_TRANSITIONS[this.current].includes(next);
  }

  public transitionTo(next: CustomerState): boolean {
    if (!this.canTransitionTo(next)) {
      return false;
    }
    const from = this.current;
    this.hooks.get(from)?.onExit?.(next);
    this.previous = from;
    this.current = next;
    this.timeInStateSec = 0;
    this.hooks.get(next)?.onEnter?.(from);
    return true;
  }

  public advanceTime(dtSeconds: number): void {
    this.timeInStateSec += Math.max(0, dtSeconds);
  }

  public isTerminal(): boolean {
    return this.current === 'COMPLETED' || this.current === 'CANCELLED';
  }

  public isSeatedState(): boolean {
    return (
      this.current === 'SEATING' ||
      this.current === 'SEATED' ||
      this.current === 'WAITING_FOR_WAITER' ||
      this.current === 'WAITING_FOR_ORDER' ||
      this.current === 'WAITING_FOR_FOOD' ||
      this.current === 'EATING' ||
      this.current === 'WAITING_FOR_BILL'
    );
  }

  public isPatienceActiveState(): boolean {
    return (
      this.current === 'QUEUING' ||
      this.current === 'WAITING_FOR_WAITER' ||
      this.current === 'WAITING_FOR_ORDER' ||
      this.current === 'WAITING_FOR_FOOD' ||
      this.current === 'WAITING_FOR_BILL'
    );
  }
}

export function getCustomerAnimationForState(
  state: CustomerState,
  isMoving: boolean,
  patienceRatio: number,
  isAngry: boolean
): CustomerAnimState {
  switch (state) {
    case 'SPAWNING':
    case 'ENTERING':
    case 'WALKING_TO_TABLE':
      return isMoving ? 'WALK' : 'IDLE';
    case 'QUEUING':
    case 'SEARCHING_TABLE':
      if (isMoving) return 'WALK';
      if (patienceRatio <= 0.28) return 'IMPATIENT';
      return 'IDLE';
    case 'SEATING':
      return 'SIT';
    case 'SEATED':
      return 'SITTING_IDLE';
    case 'WAITING_FOR_WAITER':
    case 'WAITING_FOR_ORDER':
    case 'WAITING_FOR_FOOD':
    case 'WAITING_FOR_BILL':
      if (patienceRatio <= 0.25) return 'IMPATIENT';
      return 'SITTING_IDLE';
    case 'EATING':
      return 'EAT';
    case 'ANGRY':
      return 'ANGRY';
    case 'LEAVING_TABLE':
      return 'STAND_UP';
    case 'WALKING_TO_EXIT':
      return isAngry ? 'ANGRY' : 'WALK_AWAY';
    case 'EXITING':
      return 'EXIT';
    case 'COMPLETED':
    case 'CANCELLED':
    default:
      return 'IDLE';
  }
}

export function getCustomerExpressionAndBubble(
  state: CustomerState,
  patienceRatio: number,
  isAngry: boolean
): { expression: CustomerExpression; thoughtBubble: string | null } {
  if (isAngry || state === 'ANGRY') {
    return { expression: 'ANGRY', thoughtBubble: '😤' };
  }

  switch (state) {
    case 'SPAWNING':
    case 'ENTERING':
      return { expression: 'HAPPY', thoughtBubble: 'Hi!' };
    case 'SEARCHING_TABLE':
      return { expression: 'NORMAL', thoughtBubble: 'Cari meja...' };
    case 'WALKING_TO_TABLE':
      return { expression: 'HAPPY', thoughtBubble: 'Meja kosong!' };
    case 'QUEUING':
      if (patienceRatio <= 0.25) return { expression: 'IMPATIENT', thoughtBubble: 'Sudah lama nih...' };
      if (patienceRatio <= 0.55) return { expression: 'WAITING', thoughtBubble: 'Antre dulu...' };
      return { expression: 'NORMAL', thoughtBubble: 'Hi!' };
    case 'SEATING':
    case 'SEATED':
      return { expression: 'HAPPY', thoughtBubble: 'Menu...' };
    case 'WAITING_FOR_WAITER':
    case 'WAITING_FOR_ORDER':
      if (patienceRatio <= 0.22) return { expression: 'ANGRY', thoughtBubble: '😤' };
      if (patienceRatio <= 0.45) return { expression: 'IMPATIENT', thoughtBubble: 'Sudah lama nih...' };
      return { expression: 'WAITING', thoughtBubble: 'Pesan dulu ya...' };
    case 'WAITING_FOR_FOOD':
      if (patienceRatio <= 0.22) return { expression: 'ANGRY', thoughtBubble: '😤' };
      if (patienceRatio <= 0.48) return { expression: 'IMPATIENT', thoughtBubble: 'Lapar nih...' };
      return { expression: 'WAITING', thoughtBubble: null };
    case 'EATING':
      return { expression: 'SATISFIED', thoughtBubble: 'Enak banget!' };
    case 'WAITING_FOR_BILL':
      if (patienceRatio <= 0.25) return { expression: 'IMPATIENT', thoughtBubble: 'Bayar dong...' };
      return { expression: 'SATISFIED', thoughtBubble: 'Pay $' };
    case 'LEAVING_TABLE':
    case 'WALKING_TO_EXIT':
    case 'EXITING':
      return { expression: 'SATISFIED', thoughtBubble: 'Makasih!' };
    case 'CANCELLED':
      return { expression: 'DISAPPOINTED', thoughtBubble: null };
    case 'COMPLETED':
    default:
      return { expression: 'NORMAL', thoughtBubble: null };
  }
}
