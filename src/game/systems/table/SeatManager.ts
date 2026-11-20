import type { SeatConfig } from './TableConfig.ts';

export interface SeatRuntimeState {
  config: SeatConfig;
  occupiedByCustomerId: string | null;
  reservedByCustomerId: string | null;
}

/**
 * Manages seat reservations, occupancy, and atomic assignment for a single dining table.
 * Guarantees no duplicate seat assignments and never lets occupancy drop below 0 or exceed capacity.
 */
export class SeatManager {
  private seats: SeatRuntimeState[];

  constructor(seatConfigs: SeatConfig[]) {
    this.seats = seatConfigs.map((config) => ({
      config: { ...config },
      occupiedByCustomerId: null,
      reservedByCustomerId: null,
    }));
  }

  public getCapacity(): number {
    return this.seats.length;
  }

  public getOccupiedCount(): number {
    let count = 0;
    for (const s of this.seats) {
      if (s.occupiedByCustomerId !== null) count += 1;
    }
    return count;
  }

  public getReservedCount(): number {
    let count = 0;
    for (const s of this.seats) {
      if (s.reservedByCustomerId !== null) count += 1;
    }
    return count;
  }

  public getAvailableSeatCount(): number {
    return Math.max(0, this.seats.length - this.getOccupiedCount());
  }

  public getSeatByIndex(index: number): SeatRuntimeState | null {
    return this.seats[index] ?? null;
  }

  public getSeatForCustomer(customerId: string): SeatRuntimeState | null {
    return (
      this.seats.find(
        (s) => s.occupiedByCustomerId === customerId || s.reservedByCustomerId === customerId
      ) ?? null
    );
  }

  public getAllSeats(): SeatRuntimeState[] {
    return this.seats.map((s) => ({
      config: { ...s.config },
      occupiedByCustomerId: s.occupiedByCustomerId,
      reservedByCustomerId: s.reservedByCustomerId,
    }));
  }

  public reserveSeat(customerId: string): SeatRuntimeState | null {
    const existing = this.getSeatForCustomer(customerId);
    if (existing) return existing;

    const free = this.seats.find(
      (s) => s.occupiedByCustomerId === null && s.reservedByCustomerId === null
    );
    if (!free) return null;

    free.reservedByCustomerId = customerId;
    return free;
  }

  public occupySeat(customerId: string): SeatRuntimeState | null {
    // Prefer the seat already reserved for this customer
    const reserved = this.seats.find((s) => s.reservedByCustomerId === customerId);
    if (reserved) {
      if (reserved.occupiedByCustomerId && reserved.occupiedByCustomerId !== customerId) {
        return null;
      }
      reserved.occupiedByCustomerId = customerId;
      reserved.reservedByCustomerId = null;
      return reserved;
    }

    const alreadyOccupied = this.seats.find((s) => s.occupiedByCustomerId === customerId);
    if (alreadyOccupied) return alreadyOccupied;

    const free = this.seats.find(
      (s) => s.occupiedByCustomerId === null && s.reservedByCustomerId === null
    );
    if (!free) return null;

    free.occupiedByCustomerId = customerId;
    return free;
  }

  public releaseCustomer(customerId: string): boolean {
    let released = false;
    for (const s of this.seats) {
      if (s.occupiedByCustomerId === customerId) {
        s.occupiedByCustomerId = null;
        released = true;
      }
      if (s.reservedByCustomerId === customerId) {
        s.reservedByCustomerId = null;
        released = true;
      }
    }
    return released;
  }

  public releaseAll(): void {
    for (const s of this.seats) {
      s.occupiedByCustomerId = null;
      s.reservedByCustomerId = null;
    }
  }
}
