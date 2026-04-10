import { assignUser, close, getShift, isAvailable } from "./ShiftManagementModule";
import type {
  AppState,
  AvailableShift,
  Employee,
  RequestStatus,
  ShiftRequest,
} from "../domain/types";
import { RequestStatus as RequestStatusEnum } from "../domain/types";
import { addNotification } from "./moduleUtils";

/**
 * Approve a shift coverage request and assign the requester.
 * @param state - Current application state.
 * @param request - Shift request to approve.
 * @param managerId - Manager performing approval.
 * @returns Updated state or error.
 */
export const approve = (
  state: AppState,
  request: ShiftRequest,
  managerId: number,
): { state: AppState; error?: string } => {
  const availableShift = state.availableShifts.find(
    (item) => item.availableShiftId === request.availableShiftId,
  );
  if (!availableShift || !isAvailable(availableShift)) {
    return { state, error: "Available shift is closed." };
  }

  const requester = state.users.find((item) => item.userId === request.requesterId);
  if (!requester) {
    return { state, error: "Requester not found." };
  }

  const shift = getShift(state, availableShift);
  if (!shift) {
    return { state, error: "Shift not found." };
  }

  let nextState = assignUser(state, shift.shiftId, requester, managerId);
  nextState = close(nextState, availableShift.availableShiftId);
  nextState = {
    ...nextState,
    shiftRequests: nextState.shiftRequests.map((item) =>
      item.requestID === request.requestID
        ? { ...item, status: RequestStatusEnum.APPROVED, reviewedByManagerId: managerId }
        : item,
    ),
  };
  return { state: nextState };
};

/**
 * Deny a shift coverage request.
 * @param state - Current application state.
 * @param request - Shift request to deny.
 * @param managerId - Manager performing denial.
 * @returns Updated application state.
 */
export const deny = (state: AppState, request: ShiftRequest, managerId: number): AppState => ({
  ...state,
  shiftRequests: state.shiftRequests.map((item) =>
    item.requestID === request.requestID
      ? { ...item, status: RequestStatusEnum.DENIED, reviewedByManagerId: managerId }
      : item,
  ),
});

/**
 * Get the current status of a shift request.
 * @param request - Shift request object.
 * @returns Request status.
 */
export const getStatus = (request: ShiftRequest): RequestStatus => request.status;

/**
 * Resolve the employee who requested a shift.
 * @param state - Current application state.
 * @param request - Shift request object.
 * @returns Requesting employee or undefined.
 */
export const getRequester = (state: AppState, request: ShiftRequest): Employee | undefined =>
  state.employees.find((item) => item.employeeID === request.requesterId);

/**
 * Find the available shift referenced by a request.
 * @param state - Current application state.
 * @param request - Shift request object.
 * @returns Available shift or undefined.
 */
export const getAvailableShift = (
  state: AppState,
  request: ShiftRequest,
): AvailableShift | undefined =>
  state.availableShifts.find((item) => item.availableShiftId === request.availableShiftId);

/**
 * Review a pending shift coverage request.
 * @param state - Current application state.
 * @param requestID - ID of the request.
 * @param managerId - Manager reviewing the request.
 * @param decision - Approval or denial.
 * @returns Updated state or error.
 */
export const reviewRequest = (
  state: AppState,
  requestID: number,
  managerId: number,
  decision: RequestStatus,
): { state: AppState; error?: string } => {
  const request = state.shiftRequests.find((item) => item.requestID === requestID);
  if (!request || request.status !== RequestStatusEnum.PENDING) {
    return { state, error: "Request is not pending." };
  }

  const decisionState =
    decision === RequestStatusEnum.APPROVED
      ? approve(state, request, managerId)
      : { state: deny(state, request, managerId) };
  if (decisionState.error) {
    return decisionState;
  }

  const requester = getRequester(decisionState.state, request);
  const availableShift = getAvailableShift(decisionState.state, request);
  const shift = availableShift
    ? decisionState.state.shifts.find((s) => s.shiftId === availableShift.shiftId)
    : undefined;

  let notifications = decisionState.state.notifications;
  if (requester && shift) {
    notifications = addNotification(
      notifications,
      requester.userId,
      `Your request to cover a shift on ${shift.date} was ${decision.toLowerCase()}.`,
    );
  }
  if (availableShift && shift) {
    notifications = addNotification(
      notifications,
      availableShift.postedByUserId,
      `Coverage request for your shift on ${shift.date} was ${decision.toLowerCase()}.`,
    );
  }

  return { state: { ...decisionState.state, notifications } };
};
