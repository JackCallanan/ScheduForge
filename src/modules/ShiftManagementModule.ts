import type { AppState, AvailableShift, Shift, User } from "../domain/types";
import { nextId } from "./moduleUtils";

/**
 * Mark a shift as available for coverage.
 * @param state - Current application state.
 * @param shift - Shift to post.
 * @param reason - Reason the shift is available.
 * @param user - User posting the shift.
 * @returns Updated state and posted available shift or error.
 */
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

/**
 * Assign a user to a shift.
 * @param state - Current application state.
 * @param shiftId - ID of the shift.
 * @param user - User to assign.
 * @param assignedByManagerUserId - Optional manager ID performing the assignment.
 * @returns Updated application state.
 */
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

/**
 * Get the duration of a shift.
 * @param shift - Shift object.
 * @returns Duration in hours.
 */
export const getShiftDuration = (shift: Shift): number => shift.durationHours;

/**
 * Resolve the assigned user for a given shift.
 * @param state - Current application state.
 * @param shift - Shift object.
 * @returns User assigned to the shift, if found.
 */
export const getAssignedUser = (state: AppState, shift: Shift): User | undefined =>
  state.users.find((item) => item.userId === shift.assignedUserId);

/**
 * Close an available shift so it is no longer open for coverage.
 * @param state - Current application state.
 * @param availableShiftId - Available shift ID.
 * @returns Updated application state.
 */
export const close = (state: AppState, availableShiftId: number): AppState => ({
  ...state,
  availableShifts: state.availableShifts.map((item) =>
    item.availableShiftId === availableShiftId ? { ...item, isOpen: false } : item,
  ),
});

/**
 * Reopen an available shift for coverage.
 * @param state - Current application state.
 * @param availableShiftId - Available shift ID.
 * @returns Updated application state.
 */
export const reopen = (state: AppState, availableShiftId: number): AppState => ({
  ...state,
  availableShifts: state.availableShifts.map((item) =>
    item.availableShiftId === availableShiftId ? { ...item, isOpen: true } : item,
  ),
});

/**
 * Check whether an available shift is still open.
 * @param availableShift - Available shift record.
 * @returns True when the shift remains open.
 */
export const isAvailable = (availableShift: AvailableShift): boolean => availableShift.isOpen;

/**
 * Find the shift corresponding to an available shift.
 * @param state - Current application state.
 * @param availableShift - Available shift record.
 * @returns The matching shift, if any.
 */
export const getShift = (state: AppState, availableShift: AvailableShift): Shift | undefined =>
  state.shifts.find((item) => item.shiftId === availableShift.shiftId);

