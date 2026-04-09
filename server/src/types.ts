/** Mirrors `src/domain/types.ts` AppState for JSON (de)serialization on the API. */
export interface AppState {
  users: Array<{
    userId: number;
    name: string;
    email: string;
    phoneNumber: string;
    role: string;
    department: string;
  }>;
  employees: Array<{
    userId: number;
    employeeID: number;
    name: string;
    email: string;
    phoneNumber: string;
    role: string;
    department: string;
  }>;
  managers: Array<{
    userId: number;
    managerId: number;
    name: string;
    email: string;
    phoneNumber: string;
    role: string;
    department: string;
  }>;
  shifts: Array<{
    shiftId: number;
    date: string;
    startTime: string;
    endTime: string;
    durationHours: number;
    position: string;
    location: string;
    assignedUserId: number;
    assignedByManagerUserId?: number;
  }>;
  availableShifts: Array<{
    availableShiftId: number;
    reason: string;
    isOpen: boolean;
    shiftId: number;
    postedByUserId: number;
  }>;
  shiftRequests: Array<{
    requestID: number;
    status: string;
    requesterId: number;
    availableShiftId: number;
    reviewedByManagerId?: number;
  }>;
  schedules: Array<{
    scheduleId: number;
    managerId: number;
    startDate: string;
    endDate: string;
    shifts: number[];
    published: boolean;
  }>;
  notifications: Array<{
    notificationId: number;
    userId: number;
    message: string;
    createdAt: string;
  }>;
  userCredentials: Record<string, string>;
  aiHandsOffMode: boolean;
  businessOpenTime: string;
  businessCloseTime: string;
  requiredPositions: string[];
  minimumOpeningManagers: number;
  minimumOpeningEmployees: number;
  dailyBusinessRules: Record<
    string,
    {
      businessOpenTime: string;
      businessCloseTime: string;
      minimumOpeningManagers: number;
      minimumOpeningEmployees: number;
    }
  >;
}
