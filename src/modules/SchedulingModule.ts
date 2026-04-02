import type {
  AppState,
  DailyBusinessRules,
  Manager,
  NewShiftInput,
  Schedule,
  Shift,
} from "../domain/types";
import { addNotification, calculateDurationHours, formatTime12h, nextId } from "./moduleUtils";

export const getBusinessRulesForDate = (state: AppState, date: string): DailyBusinessRules => {
  const day = date ? state.dailyBusinessRules[date] : undefined;
  return {
    businessOpenTime: day?.businessOpenTime ?? state.businessOpenTime,
    businessCloseTime: day?.businessCloseTime ?? state.businessCloseTime,
    minimumOpeningManagers: day?.minimumOpeningManagers ?? state.minimumOpeningManagers,
    minimumOpeningEmployees: day?.minimumOpeningEmployees ?? state.minimumOpeningEmployees,
  };
};

export const notifyEmployees = (state: AppState, message: string): AppState => {
  let notifications = [...state.notifications];
  state.employees.forEach((employee) => {
    notifications = addNotification(notifications, employee.userId, message);
  });
  return { ...state, notifications };
};

export const isPublished = (schedule: Schedule): boolean => schedule.published;

const overlaps = (startA: string, endA: string, startB: string, endB: string) =>
  !(endA <= startB || endB <= startA);

const withinBusinessHours = (
  state: AppState,
  date: string,
  startTime: string,
  endTime: string,
) => {
  const rules = getBusinessRulesForDate(state, date);
  return startTime >= rules.businessOpenTime && endTime <= rules.businessCloseTime;
};

const getUserRoleByAssignedId = (state: AppState, assignedUserId: number) =>
  state.users.find((item) => item.userId === assignedUserId)?.role;

const hasEmployeeOverlap = (state: AppState, input: NewShiftInput, ignoreShiftId?: number) =>
  state.shifts.some(
    (shift) =>
      shift.shiftId !== ignoreShiftId &&
      shift.date === input.date &&
      shift.assignedEmployeeId === input.assignedEmployeeId &&
      overlaps(shift.startTime, shift.endTime, input.startTime, input.endTime),
  );

const findOrCreateDailySchedule = (state: AppState, manager: Manager, date: string): Schedule => {
  const existing = state.schedules.find(
    (item) => item.managerId === manager.managerId && item.startDate === date && item.endDate === date,
  );
  if (existing) return existing;
  return {
    scheduleId: nextId(state.schedules.map((item) => item.scheduleId)),
    managerId: manager.managerId,
    startDate: date,
    endDate: date,
    shifts: [],
    published: true,
  };
};

export const updateBusinessRules = (
  state: AppState,
  date: string,
  openTime: string,
  closeTime: string,
  minimumOpeningManagers: number,
  minimumOpeningEmployees: number,
): { state: AppState; error?: string } => {
  if (!date) {
    return { state, error: "Select a date to save business hours and staffing for that day." };
  }
  if (!openTime || !closeTime || openTime >= closeTime) {
    return { state, error: "Business open and close times are invalid." };
  }
  if (minimumOpeningManagers < 0 || minimumOpeningEmployees < 0) {
    return { state, error: "Minimum opening staffing cannot be negative." };
  }
  const entry: DailyBusinessRules = {
    businessOpenTime: openTime,
    businessCloseTime: closeTime,
    minimumOpeningManagers,
    minimumOpeningEmployees,
  };
  return {
    state: {
      ...state,
      dailyBusinessRules: { ...state.dailyBusinessRules, [date]: entry },
    },
  };
};

export const updateGlobalBusinessBaseline = (
  state: AppState,
  openTime: string,
  closeTime: string,
  minimumOpeningManagers: number,
  minimumOpeningEmployees: number,
): { state: AppState; error?: string } => {
  if (!openTime || !closeTime || openTime >= closeTime) {
    return { state, error: "Business open and close times are invalid." };
  }
  if (minimumOpeningManagers < 0 || minimumOpeningEmployees < 0) {
    return { state, error: "Minimum opening staffing cannot be negative." };
  }
  return {
    state: {
      ...state,
      businessOpenTime: openTime,
      businessCloseTime: closeTime,
      minimumOpeningManagers,
      minimumOpeningEmployees,
    },
  };
};

export const getOpeningCoverage = (state: AppState, date: string) => {
  const { businessOpenTime } = getBusinessRulesForDate(state, date);
  const openingShifts = state.shifts.filter(
    (item) => item.date === date && item.startTime <= businessOpenTime && item.endTime > businessOpenTime,
  );
  const managerCount = openingShifts.filter(
    (item) => getUserRoleByAssignedId(state, item.assignedEmployeeId) === "Manager",
  ).length;
  const employeeCount = openingShifts.filter(
    (item) => getUserRoleByAssignedId(state, item.assignedEmployeeId) === "Employee",
  ).length;
  return { managerCount, employeeCount };
};

const buildCoverageSlots = (state: AppState, date: string) => {
  const { businessOpenTime, businessCloseTime } = getBusinessRulesForDate(state, date);
  const slots: Array<{ startTime: string; endTime: string }> = [];
  let slotStart = businessOpenTime;
  while (slotStart < businessCloseTime) {
    const [h, m] = slotStart.split(":").map(Number);
    const endDate = new Date(2000, 0, 1, h, m + 60);
    const endTime = `${String(endDate.getHours()).padStart(2, "0")}:${String(
      endDate.getMinutes(),
    ).padStart(2, "0")}`;
    const slotEnd = endTime > businessCloseTime ? businessCloseTime : endTime;
    if (slotStart < slotEnd) slots.push({ startTime: slotStart, endTime: slotEnd });
    if (slotEnd === businessCloseTime) break;
    slotStart = slotEnd;
  }
  return slots;
};

const getCoverageForSlot = (
  state: AppState,
  date: string,
  startTime: string,
  endTime: string,
) => {
  const slotShifts = state.shifts.filter(
    (item) =>
      item.date === date &&
      item.startTime <= startTime &&
      item.endTime >= endTime,
  );
  const managerCount = slotShifts.filter(
    (item) => getUserRoleByAssignedId(state, item.assignedEmployeeId) === "Manager",
  ).length;
  const employeeCount = slotShifts.filter(
    (item) => getUserRoleByAssignedId(state, item.assignedEmployeeId) === "Employee",
  ).length;
  return { managerCount, employeeCount };
};

export const getDailyOperationalStatus = (state: AppState, date: string) => {
  if (!date) {
    return { canOperate: false, message: "Select a date to evaluate operations." };
  }

  const rules = getBusinessRulesForDate(state, date);
  const slots = buildCoverageSlots(state, date);
  if (slots.length === 0) {
    return { canOperate: false, message: "Business hours are invalid for this date." };
  }

  const slotFailures = slots
    .map((slot) => {
      const coverage = getCoverageForSlot(state, date, slot.startTime, slot.endTime);
      const managerOk = coverage.managerCount >= rules.minimumOpeningManagers;
      const employeeOk = coverage.employeeCount >= rules.minimumOpeningEmployees;
      return { slot, coverage, managerOk, employeeOk };
    })
    .filter((item) => !item.managerOk || !item.employeeOk);

  const canOperate = slotFailures.length === 0;
  if (canOperate) {
    return { canOperate: true, message: "Schedule is operational for the full business day." };
  }

  const firstFailure = slotFailures[0];
  const issues: string[] = [];
  if (!firstFailure.managerOk) {
    issues.push(
      `managers ${firstFailure.coverage.managerCount}/${rules.minimumOpeningManagers}`,
    );
  }
  if (!firstFailure.employeeOk) {
    issues.push(
      `employees ${firstFailure.coverage.employeeCount}/${rules.minimumOpeningEmployees}`,
    );
  }
  return {
    canOperate: false,
    message: `Business cannot operate all day. First gap ${formatTime12h(firstFailure.slot.startTime)}–${formatTime12h(firstFailure.slot.endTime)}: ${issues.join(
      "; ",
    )}.`,
  };
};

export const addManagerShift = (
  state: AppState,
  manager: Manager,
  input: NewShiftInput,
): { state: AppState; error?: string } => {
  if (!input.date) {
    return { state, error: "Shift date is required." };
  }
  if (calculateDurationHours(input.startTime, input.endTime) <= 0) {
    return { state, error: "Shift end time must be after start time." };
  }
  if (!withinBusinessHours(state, input.date, input.startTime, input.endTime)) {
    return { state, error: "Shift must stay within business open and close hours." };
  }
  if (hasEmployeeOverlap(state, input)) {
    return { state, error: "This employee already has an overlapping shift." };
  }

  const schedule = findOrCreateDailySchedule(state, manager, input.date);
  const shiftId = nextId(state.shifts.map((item) => item.shiftId));
  const derivedPosition = input.position?.trim() || state.requiredPositions[0] || "General Employee";
  const derivedLocation = input.location?.trim() || "Primary Site";
  const shift: Shift = {
    shiftId,
    date: input.date,
    startTime: input.startTime,
    endTime: input.endTime,
    durationHours: calculateDurationHours(input.startTime, input.endTime),
    position: derivedPosition,
    location: derivedLocation,
    assignedEmployeeId: input.assignedEmployeeId,
    assignedByManagerUserId: manager.userId,
  };

  const scheduleExists = state.schedules.some((item) => item.scheduleId === schedule.scheduleId);
  const schedules = scheduleExists
    ? state.schedules.map((item) =>
        item.scheduleId === schedule.scheduleId ? { ...item, shifts: [...item.shifts, shiftId] } : item,
      )
    : [...state.schedules, { ...schedule, shifts: [shiftId] }];

  return {
    state: notifyEmployees(
      { ...state, shifts: [...state.shifts, shift], schedules },
      `New manager-assigned shift on ${input.date}: ${derivedPosition}.`,
    ),
  };
};

export const deleteShift = (
  state: AppState,
  shiftId: number,
): { state: AppState; error?: string } => {
  const exists = state.shifts.some((s) => s.shiftId === shiftId);
  if (!exists) {
    return { state, error: "Shift not found." };
  }
  const availableForShift = state.availableShifts.filter((a) => a.shiftId === shiftId);
  const availableIds = new Set(availableForShift.map((a) => a.availableShiftId));
  return {
    state: {
      ...state,
      shifts: state.shifts.filter((s) => s.shiftId !== shiftId),
      schedules: state.schedules.map((s) => ({
        ...s,
        shifts: s.shifts.filter((id) => id !== shiftId),
      })),
      availableShifts: state.availableShifts.filter((a) => a.shiftId !== shiftId),
      shiftRequests: state.shiftRequests.filter((r) => !availableIds.has(r.availableShiftId)),
    },
  };
};

export const createSchedule = (
  state: AppState,
  manager: Manager,
  plannedShifts: NewShiftInput[],
): { state: AppState; error?: string } => {
  if (plannedShifts.length === 0) return { state, error: "Add shifts first." };
  let nextState = state;
  for (const shiftInput of plannedShifts) {
    const created = addManagerShift(nextState, manager, shiftInput);
    if (created.error) return created;
    nextState = created.state;
  }
  return { state: nextState };
};

export const generateAIHandsOffSchedule = (
  state: AppState,
  manager: Manager,
  date: string,
): { state: AppState; error?: string } => {
  if (!date) return { state, error: "Select a date for AI schedule generation." };
  if (state.employees.length === 0) return { state, error: "No employees available." };
  if (state.managers.length === 0) return { state, error: "No managers available." };

  const slots = buildCoverageSlots(state, date);

  let nextState = state;
  let assigneePointer = 0;
  const assignees = [...nextState.managers.map((item) => item.userId), ...nextState.employees.map((item) => item.employeeID)];
  for (const slot of slots) {
    const assignedEmployeeId = assignees[assigneePointer % assignees.length];
    assigneePointer += 1;
    let created = addManagerShift(nextState, manager, {
      date,
      startTime: slot.startTime,
      endTime: slot.endTime,
      position: "Coverage",
      location: "Primary Site",
      assignedEmployeeId,
    });

    if (created.error) {
      for (const fallbackAssignedEmployeeId of assignees) {
        created = addManagerShift(nextState, manager, {
          date,
          startTime: slot.startTime,
          endTime: slot.endTime,
          position: "Coverage",
          location: "Primary Site",
          assignedEmployeeId: fallbackAssignedEmployeeId,
        });
        if (!created.error) break;
      }
    }
    if (created.error) {
      return { state: nextState, error: "AI could not fill time coverage without overlap." };
    }
    nextState = created.state;
  }

  for (const slot of slots) {
    let slotCoverage = getCoverageForSlot(nextState, date, slot.startTime, slot.endTime);
    const dayRules = () => getBusinessRulesForDate(nextState, date);
    while (slotCoverage.managerCount < dayRules().minimumOpeningManagers) {
      const managerAssignee =
        nextState.managers[slotCoverage.managerCount % nextState.managers.length];
      const created = addManagerShift(nextState, manager, {
        date,
        startTime: slot.startTime,
        endTime: slot.endTime,
        position: "Manager Coverage",
        location: "Primary Site",
        assignedEmployeeId: managerAssignee.userId,
      });
      if (created.error) break;
      nextState = created.state;
      slotCoverage = getCoverageForSlot(nextState, date, slot.startTime, slot.endTime);
    }
    while (slotCoverage.employeeCount < dayRules().minimumOpeningEmployees) {
      const employeeAssignee =
        nextState.employees[slotCoverage.employeeCount % nextState.employees.length];
      const created = addManagerShift(nextState, manager, {
        date,
        startTime: slot.startTime,
        endTime: slot.endTime,
        position: "Employee Coverage",
        location: "Primary Site",
        assignedEmployeeId: employeeAssignee.employeeID,
      });
      if (created.error) break;
      nextState = created.state;
      slotCoverage = getCoverageForSlot(nextState, date, slot.startTime, slot.endTime);
    }
  }

  const operationCheck = getDailyOperationalStatus(nextState, date);
  if (!operationCheck.canOperate) {
    return {
      state: nextState,
      error: operationCheck.message,
    };
  }

  return { state: nextState };
};
