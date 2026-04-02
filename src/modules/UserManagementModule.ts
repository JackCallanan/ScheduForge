import type {
  AppState,
  Employee,
  Manager,
  ShiftRequest,
  User,
  UserRole,
} from "../domain/types";
import { RequestStatus } from "../domain/types";
import { markAsAvailable } from "./ShiftManagementModule";
import { addNotification, formatTimeRange12h, nextId } from "./moduleUtils";

const sameWindow = (
  aDate: string,
  aStart: string,
  aEnd: string,
  bDate: string,
  bStart: string,
  bEnd: string,
) => aDate === bDate && !(aEnd <= bStart || bEnd <= aStart);

export const authenticateUser = (
  state: AppState,
  email: string,
  password: string,
): { user?: User; error?: string } => {
  const storedPassword = state.userCredentials[email.trim().toLowerCase()];
  const user = state.users.find((item) => item.email.toLowerCase() === email.trim().toLowerCase());
  if (!storedPassword || !user || storedPassword !== password) {
    return { error: "Invalid email or password." };
  }
  return { user };
};

export const registerUser = (
  state: AppState,
  input: {
    name: string;
    email: string;
    password: string;
    role: UserRole;
  },
): { state: AppState; user?: User; error?: string } => {
  const normalizedEmail = input.email.trim().toLowerCase();
  if (!input.name.trim() || !normalizedEmail || !input.password) {
    return { state, error: "All sign up fields are required." };
  }

  const existing = state.users.find((item) => item.email.toLowerCase() === normalizedEmail);
  if (existing) {
    return { state, error: "An account with this email already exists." };
  }

  const nextUserId =
    (state.users.length ? Math.max(...state.users.map((item) => item.userId)) : 0) + 1;
  const user: User = {
    userId: nextUserId,
    name: input.name.trim(),
    email: normalizedEmail,
    phoneNumber: "N/A",
    role: input.role,
    department: "General",
  };

  let nextState: AppState = {
    ...state,
    users: [...state.users, user],
    userCredentials: { ...state.userCredentials, [normalizedEmail]: input.password },
  };

  if (input.role === "Employee") {
    const employee: Employee = { ...user, employeeID: user.userId };
    nextState = { ...nextState, employees: [...nextState.employees, employee] };
  } else {
    const manager: Manager = { ...user, managerId: user.userId };
    nextState = { ...nextState, managers: [...nextState.managers, manager] };
  }

  return { state: nextState, user };
};

export const postShift = (
  state: AppState,
  employee: Employee,
  shiftId: number,
  reason: string,
): { state: AppState; error?: string } => {
  const shift = state.shifts.find((item) => item.shiftId === shiftId);
  if (!shift) {
    return { state, error: "Shift not found." };
  }

  const result = markAsAvailable(state, shift, reason, employee);
  if (result.error) {
    return { state, error: result.error };
  }

  let notifications = result.state.notifications;
  result.state.employees
    .filter((item) => item.employeeID !== employee.employeeID)
    .forEach((item) => {
      notifications = addNotification(
        notifications,
        item.userId,
        `New available shift on ${shift.date} (${formatTimeRange12h(shift.startTime, shift.endTime)}).`,
      );
    });
  result.state.managers.forEach((manager) => {
    notifications = addNotification(
      notifications,
      manager.userId,
      `${employee.name} posted shift ${shift.shiftId} for coverage.`,
    );
  });

  return { state: { ...result.state, notifications } };
};

export const requestToCover = (
  state: AppState,
  employee: Employee,
  availableShiftId: number,
): { state: AppState; error?: string } => {
  const availableShift = state.availableShifts.find(
    (item) => item.availableShiftId === availableShiftId && item.isOpen,
  );
  if (!availableShift) {
    return { state, error: "Shift is no longer available." };
  }

  const shift = state.shifts.find((item) => item.shiftId === availableShift.shiftId);
  if (!shift) {
    return { state, error: "Shift was not found." };
  }

  const hasConflict = state.shifts
    .filter((item) => item.assignedEmployeeId === employee.employeeID)
    .some((item) =>
      sameWindow(
        item.date,
        item.startTime,
        item.endTime,
        shift.date,
        shift.startTime,
        shift.endTime,
      ),
    );
  if (hasConflict) {
    return { state, error: "Employee is already scheduled during this time." };
  }

  const shiftRequest: ShiftRequest = {
    requestID: nextId(state.shiftRequests.map((item) => item.requestID)),
    status: RequestStatus.PENDING,
    requesterId: employee.employeeID,
    availableShiftId,
  };

  let notifications = [...state.notifications];
  state.managers.forEach((manager) => {
    notifications = addNotification(
      notifications,
      manager.userId,
      `${employee.name} requested to cover shift ${shift.shiftId}.`,
    );
  });

  return {
    state: {
      ...state,
      shiftRequests: [...state.shiftRequests, shiftRequest],
      notifications,
    },
  };
};

export const getAssignedShifts = (state: AppState, employee: Employee) =>
  state.shifts.filter((item) => item.assignedEmployeeId === employee.employeeID);

export const getPostedAvailableShifts = (state: AppState, employee: Employee) =>
  state.availableShifts.filter((item) => item.postedByEmployeeId === employee.employeeID);

export const getSchedules = (state: AppState) => state.schedules;

export const getReviewedRequests = (state: AppState, managerUserId: number) =>
  state.shiftRequests.filter((item) => item.reviewedByManagerId === managerUserId);
