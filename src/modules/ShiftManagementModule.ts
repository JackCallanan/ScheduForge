import type { AppState, AvailableShift, Shift, User } from "../domain/types";
import { nextId } from "./moduleUtils";

export const markAsAvailable = (
  state: AppState,
  shift: Shift,
  reason: string,
  user: User,
): { state: AppState; availableShift?: AvailableShift; error?: string } => {
  if (!reason.trim()) {
    return { state, error: "Reason is required." };
  }

  if (shift.assignedUserId !== user.userId) {
    return { state, error: "User is not assigned to this shift." };
  }

  const existing = state.availableShifts.find(
    (item) => item.shiftId === shift.shiftId && item.isOpen,
  );
  if (existing) {
    return { state, error: "Shift is already available." };
  }

  const availableShift: AvailableShift = {
    availableShiftId: nextId(state.availableShifts.map((item) => item.availableShiftId)),
    reason: reason.trim(),
    isOpen: true,
    shiftId: shift.shiftId,
    postedByUserId: user.userId,
  };

  return {
    state: { ...state, availableShifts: [...state.availableShifts, availableShift] },
    availableShift,
  };
};

export const assignUser = (
  state: AppState,
  shiftId: number,
  user: User,
  assignedByManagerUserId?: number,
): AppState => ({
  ...state,
  shifts: state.shifts.map((item) =>
    item.shiftId === shiftId
      ? {
          ...item,
          assignedUserId: user.userId,
          ...(assignedByManagerUserId !== undefined ? { assignedByManagerUserId } : {}),
        }
      : item,
  ),
});

export const getShiftDuration = (shift: Shift): number => shift.durationHours;

export const getAssignedUser = (state: AppState, shift: Shift): User | undefined =>
  state.users.find((item) => item.userId === shift.assignedUserId);

export const close = (state: AppState, availableShiftId: number): AppState => ({
  ...state,
  availableShifts: state.availableShifts.map((item) =>
    item.availableShiftId === availableShiftId ? { ...item, isOpen: false } : item,
  ),
});

export const reopen = (state: AppState, availableShiftId: number): AppState => ({
  ...state,
  availableShifts: state.availableShifts.map((item) =>
    item.availableShiftId === availableShiftId ? { ...item, isOpen: true } : item,
  ),
});

export const isAvailable = (availableShift: AvailableShift): boolean => availableShift.isOpen;

export const getShift = (state: AppState, availableShift: AvailableShift): Shift | undefined =>
  state.shifts.find((item) => item.shiftId === availableShift.shiftId);
