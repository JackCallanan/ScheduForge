export type UserRole = "Employee" | "Manager";

export const RequestStatus = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  DENIED: "DENIED",
} as const;
export type RequestStatus = (typeof RequestStatus)[keyof typeof RequestStatus];

export interface User {
  userId: number;
  name: string;
  email: string;
  phoneNumber: string;
  role: UserRole;
  department: string;
}

export interface Employee extends User {
  employeeID: number;
}

export interface Manager extends User {
  managerId: number;
}

export interface Shift {
  shiftId: number;
  date: string;
  startTime: string;
  endTime: string;
  durationHours: number;
  position: string;
  location: string;
  assignedEmployeeId: number;
  /** User id of the manager who created or last assigned this shift (optional for legacy persisted data). */
  assignedByManagerUserId?: number;
}

export interface AvailableShift {
  availableShiftId: number;
  reason: string;
  isOpen: boolean;
  shiftId: number;
  postedByEmployeeId: number;
}

export interface ShiftRequest {
  requestID: number;
  status: RequestStatus;
  requesterId: number;
  availableShiftId: number;
  reviewedByManagerId?: number;
}

export interface Schedule {
  scheduleId: number;
  managerId: number;
  startDate: string;
  endDate: string;
  shifts: number[];
  published: boolean;
}

export interface Notification {
  notificationId: number;
  userId: number;
  message: string;
  createdAt: string;
}

export interface NewShiftInput {
  date: string;
  startTime: string;
  endTime: string;
  position: string;
  location: string;
  assignedEmployeeId: number;
}

/** Defaults for any date not listed in `dailyBusinessRules`. */
export interface DailyBusinessRules {
  businessOpenTime: string;
  businessCloseTime: string;
  minimumOpeningManagers: number;
  minimumOpeningEmployees: number;
}

export interface AppState {
  users: User[];
  employees: Employee[];
  managers: Manager[];
  shifts: Shift[];
  availableShifts: AvailableShift[];
  shiftRequests: ShiftRequest[];
  schedules: Schedule[];
  notifications: Notification[];
  userCredentials: Record<string, string>;
  aiHandsOffMode: boolean;
  businessOpenTime: string;
  businessCloseTime: string;
  requiredPositions: string[];
  minimumOpeningManagers: number;
  minimumOpeningEmployees: number;
  /** ISO date string (YYYY-MM-DD) → rules for that day; missing keys use global defaults above. */
  dailyBusinessRules: Record<string, DailyBusinessRules>;
}
