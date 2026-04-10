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

/**
 * Check whether two date/time windows overlap.
 * @param aDate - First date.
 * @param aStart - First start time.
 * @param aEnd - First end time.
 * @param bDate - Second date.
 * @param bStart - Second start time.
 * @param bEnd - Second end time.
 * @returns True when the windows overlap.
 */
const sameWindow = (
  aDate: string,
  aStart: string,
  aEnd: string,
  bDate: string,
  bStart: string,
  bEnd: string,
) => aDate === bDate && !(aEnd <= bStart || bEnd <= aStart);

/**
 * Authenticate a user by email and password.
 * @param state - Current application state.
 * @param email - User email address.
 * @param password - User password.
 * @returns Logged in user or an error.
 */
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

/**
 * Register a new user and update app state.
 * @param state - Current application state.
 * @param input - User registration details.
 * @returns Updated state and created user or an error.
 */
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

/**
 * Post a shift as available for coverage.
 * @param state - Current application state.
 * @param user - User posting the shift.
 * @param shiftId - ID of the shift to post.
 * @param reason - Reason for coverage request.
 * @returns Updated state or an error.
 */
export const postShift = (
  state: AppState,
  user: User,
  shiftId: number,
  reason: string,
): { state: AppState; error?: string } => {
  const shift = state.shifts.find((item) => item.shiftId === shiftId);
  if (!shift) {
    return { state, error: "Shift not found." };
  }

  const result = markAsAvailable(state, shift, reason, user);
  if (result.error) {
    return { state, error: result.error };
  }

  let notifications = result.state.notifications;
  result.state.users
    .filter((item) => item.userId !== user.userId)
    .forEach((item) => {
      notifications = addNotification(
        notifications,
        item.userId,
        `New available shift on ${shift.date} (${formatTimeRange12h(shift.startTime, shift.endTime)}).`,
      );
    });
  notifications = addNotification(
    notifications,
    user.userId,
    `${user.name} posted a shift on ${shift.date} for coverage.`,
  );

  return { state: { ...result.state, notifications } };
};

/**
 * Submit a request to cover an available shift.
 * @param state - Current application state.
 * @param user - User requesting coverage.
 * @param availableShiftId - ID of the available shift.
 * @returns Updated state or an error.
 */
export const requestToCover = (
  state: AppState,
  user: User,
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

  const assignedUser = state.users.find((item) => item.userId === shift.assignedUserId);
  if (!assignedUser) {
    return { state, error: "Assigned user not found." };
  }

  if (assignedUser.role === "Employee" && user.role !== "Employee") {
    return { state, error: "Only employees can request to cover employee shifts." };
  }
  if (assignedUser.role === "Manager" && user.role !== "Manager") {
    return { state, error: "Only managers can request to cover manager shifts." };
  }

  const hasConflict = state.shifts
    .filter((item) => item.assignedUserId === user.userId)
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
    return { state, error: "User is already scheduled during this time." };
  }

  const shiftRequest: ShiftRequest = {
    requestID: nextId(state.shiftRequests.map((item) => item.requestID)),
    status: RequestStatus.PENDING,
    requesterId: user.userId,
    availableShiftId,
  };

  let notifications = [...state.notifications];
  state.managers.forEach((manager) => {
    notifications = addNotification(
      notifications,
      manager.userId,
      `${user.name} requested to cover a shift on ${shift.date}.`,
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

/**
 * Get shifts assigned to the specified user.
 * @param state - Current application state.
 * @param user - Target user.
 * @returns Shifts assigned to the user.
 */
export const getAssignedShifts = (state: AppState, user: User) =>
  state.shifts.filter((item) => item.assignedUserId === user.userId);

/**
 * Get available shifts posted by a specific user.
 * @param state - Current application state.
 * @param user - Shift poster.
 * @returns Available shifts posted by the user.
 */
export const getPostedAvailableShifts = (state: AppState, user: User) =>
  state.availableShifts.filter((item) => item.postedByUserId === user.userId);

/**
 * Return the current schedule list.
 * @param state - Current application state.
 * @returns Schedule records.
 */
export const getSchedules = (state: AppState) => state.schedules;

/**
 * Get shift requests reviewed by a given manager.
 * @param state - Current application state.
 * @param managerUserId - Manager user ID.
 * @returns Reviewed shift requests.
 */
export const getReviewedRequests = (state: AppState, managerUserId: number) =>
  state.shiftRequests.filter((item) => item.reviewedByManagerId === managerUserId);
