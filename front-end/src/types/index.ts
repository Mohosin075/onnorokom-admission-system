export type HoldStatus = 'HELD' | 'CONFIRMED' | 'EXPIRED' | 'CANCELLED';

export interface ClassItem {
  id: string;
  name: string;
  totalSeats: number;
  heldSeats: number;
  confirmedSeats: number;
  availableSeats: number;
}

export interface CreateClassPayload {
  name: string;
  totalSeats: number;
}

export interface HoldItem {
  holdId: string;
  classId: string;
  studentId?: string;
  className?: string;
  status: HoldStatus;
  expiresAt: string;
}

export interface ConfirmHoldResponse {
  holdId: string;
  status: HoldStatus;
}

