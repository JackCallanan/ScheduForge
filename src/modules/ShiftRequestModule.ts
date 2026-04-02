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

  const requester = state.employees.find((item) => item.employeeID === request.requesterId);
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

export const deny = (state: AppState, request: ShiftRequest, managerId: number): AppState => ({
  ...state,
  shiftRequests: state.shiftRequests.map((item) =>
    item.requestID === request.requestID
      ? { ...item, status: RequestStatusEnum.DENIED, reviewedByManagerId: managerId }
      : item,
  ),
});

export const getStatus = (request: ShiftRequest): RequestStatus => request.status;

export const getRequester = (state: AppState, request: ShiftRequest): Employee | undefined =>
  state.employees.find((item) => item.employeeID === request.requesterId);

export const getAvailableShift = (
  state: AppState,
  request: ShiftRequest,
): AvailableShift | undefined =>
  state.availableShifts.find((item) => item.availableShiftId === request.availableShiftId);

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

  let notifications = decisionState.state.notifications;
  if (requester) {
    notifications = addNotification(
      notifications,
      requester.userId,
      `Shift request ${request.requestID} was ${decision.toLowerCase()}.`,
    );
  }
  if (availableShift) {
    notifications = addNotification(
      notifications,
      availableShift.postedByUserId,
      `Coverage request for available shift ${availableShift.availableShiftId} was ${decision.toLowerCase()}.`,
    );
  }

  return { state: { ...decisionState.state, notifications } };
};
