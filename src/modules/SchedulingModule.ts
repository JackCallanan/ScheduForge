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

export const notifyUsers = (state: AppState, message: string): AppState => {
  let notifications = [...state.notifications];
  state.users.forEach((user) => {
    notifications = addNotification(notifications, user.userId, message);
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

const hasUserOverlap = (state: AppState, input: NewShiftInput, ignoreShiftId?: number) =>
  state.shifts.some(
    (shift) =>
      shift.shiftId !== ignoreShiftId &&
      shift.date === input.date &&
      shift.assignedUserId === input.assignedUserId &&
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
    (item) => getUserRoleByAssignedId(state, item.assignedUserId) === "Manager",
  ).length;
  const employeeCount = openingShifts.filter(
    (item) => getUserRoleByAssignedId(state, item.assignedUserId) === "Employee",
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
    (item) => getUserRoleByAssignedId(state, item.assignedUserId) === "Manager",
  ).length;
  const employeeCount = slotShifts.filter(
    (item) => getUserRoleByAssignedId(state, item.assignedUserId) === "Employee",
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
  if (hasUserOverlap(state, input)) {
    return { state, error: "This employee already has an overlapping shift." };
  }

  const schedule = findOrCreateDailySchedule(state, manager, input.date);
  const shiftId = nextId(state.shifts.map((item) => item.shiftId));
  const derivedPosition = input.position?.trim() || state.requiredPositions[0] || "";
  const derivedLocation = input.location?.trim() || "Primary Site";
  const shift: Shift = {
    shiftId,
    date: input.date,
    startTime: input.startTime,
    endTime: input.endTime,
    durationHours: calculateDurationHours(input.startTime, input.endTime),
    position: derivedPosition,
    location: derivedLocation,
    assignedUserId: input.assignedUserId,
    assignedByManagerUserId: manager.userId,
  };

  const scheduleExists = state.schedules.some((item) => item.scheduleId === schedule.scheduleId);
  const schedules = scheduleExists
    ? state.schedules.map((item) =>
        item.scheduleId === schedule.scheduleId ? { ...item, shifts: [...item.shifts, shiftId] } : item,
      )
    : [...state.schedules, { ...schedule, shifts: [shiftId] }];

  return {
    state: notifyUsers(
      { ...state, shifts: [...state.shifts, shift], schedules },
      `New shift assigned by ${manager.name} on ${input.date}.`,
    ),
  };
};

/** Keep schedules / availableShifts / shiftRequests in sync when bulk-removing shifts (e.g. AI combine step). */
function removeShiftIdsFromState(state: AppState, shiftIds: number[]): AppState {
  const idSet = new Set(shiftIds);
  const availableForRemoved = state.availableShifts.filter((a) => idSet.has(a.shiftId));
  const availableIdSet = new Set(availableForRemoved.map((a) => a.availableShiftId));
  return {
    ...state,
    shifts: state.shifts.filter((s) => !idSet.has(s.shiftId)),
    schedules: state.schedules.map((s) => ({
      ...s,
      shifts: s.shifts.filter((sid) => !idSet.has(sid)),
    })),
    availableShifts: state.availableShifts.filter((a) => !idSet.has(a.shiftId)),
    shiftRequests: state.shiftRequests.filter((r) => !availableIdSet.has(r.availableShiftId)),
  };
}

export const deleteShift = (
  state: AppState,
  shiftId: number,
): { state: AppState; error?: string } => {
  const shift = state.shifts.find((s) => s.shiftId === shiftId);
  if (!shift) {
    return { state, error: "Shift not found." };
  }
  const availableForShift = state.availableShifts.filter((a) => a.shiftId === shiftId);
  const availableIds = new Set(availableForShift.map((a) => a.availableShiftId));

  let notifications = [...state.notifications];

  // Notify the assigned user
  const assignedUser = state.users.find((u) => u.userId === shift.assignedUserId);
  if (assignedUser) {
    const message = `Your shift on ${shift.date} from ${formatTime12h(shift.startTime)} to ${formatTime12h(shift.endTime)} has been deleted.`;
    notifications = addNotification(notifications, assignedUser.userId, message);
  }

  // Optionally notify the manager who assigned it, if different from the assigned user
  if (shift.assignedByManagerUserId && shift.assignedByManagerUserId !== assignedUser?.userId) {
    const manager = state.managers.find((m) => m.userId === shift.assignedByManagerUserId);
    if (manager) {
      const message = `The shift on ${shift.date} from ${formatTime12h(shift.startTime)} to ${formatTime12h(shift.endTime)} assigned to ${assignedUser?.name || 'a user'} has been deleted.`;
      notifications = addNotification(notifications, manager.userId, message);
    }
  }

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
      notifications,
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

  const dayRules = getBusinessRulesForDate(state, date);
  const { businessOpenTime, businessCloseTime } = dayRules;

  // Create realistic shift blocks instead of 1-hour slots
  const createShiftBlocks = () => {
    const blocks: Array<{ startTime: string; endTime: string; type: 'morning' | 'afternoon' | 'evening' }> = [];
    const [openHour] = businessOpenTime.split(':').map(Number);
    const [closeHour] = businessCloseTime.split(':').map(Number);

    // Morning shift: open time to ~2-3 hours before noon
    const morningEndHour = Math.min(openHour + 4, Math.max(openHour + 2, 12));
    if (morningEndHour > openHour) {
      blocks.push({
        startTime: businessOpenTime,
        endTime: `${String(morningEndHour).padStart(2, '0')}:00`,
        type: 'morning'
      });
    }

    // Afternoon shift: morning end to ~4-5 hours before close
    const afternoonStartHour = morningEndHour;
    const afternoonEndHour = Math.max(afternoonStartHour + 4, closeHour - 2);
    if (afternoonEndHour > afternoonStartHour && afternoonEndHour <= closeHour) {
      blocks.push({
        startTime: `${String(afternoonStartHour).padStart(2, '0')}:00`,
        endTime: `${String(afternoonEndHour).padStart(2, '0')}:00`,
        type: 'afternoon'
      });
    }

    // Evening shift: afternoon end to close (if there's gap)
    const eveningStartHour = afternoonEndHour;
    if (eveningStartHour < closeHour) {
      blocks.push({
        startTime: `${String(eveningStartHour).padStart(2, '0')}:00`,
        endTime: businessCloseTime,
        type: 'evening'
      });
    }

    // If no blocks were created (very short day), create one full shift
    if (blocks.length === 0) {
      blocks.push({
        startTime: businessOpenTime,
        endTime: businessCloseTime,
        type: 'morning'
      });
    }

    return blocks;
  };

  const shiftBlocks = createShiftBlocks();

  let nextState = state;

  // Improved shift assignment that ensures coverage first, then combines consecutive shifts
  const assignShiftsEfficiently = (
    users: Array<{ userId: number; role: 'Manager' | 'Employee' }>,
    minPerBlock: number,
    positionPrefix: string
  ) => {
    // Step 1: Assign individual shifts to meet minimum coverage requirements
    const usersPerBlock = Math.max(1, Math.min(users.length, minPerBlock));

    for (const block of shiftBlocks) {
      // Shuffle users for variety
      const shuffledUsers = [...users].sort(() => Math.random() - 0.5);

      // Count current coverage for this block
      let currentCoverage = nextState.shifts.filter(shift =>
        shift.date === date &&
        overlaps(shift.startTime, shift.endTime, block.startTime, block.endTime) &&
        users.some(u => u.userId === shift.assignedUserId)
      ).length;

      // Assign additional users to meet minimum requirements
      for (let i = 0; i < usersPerBlock && currentCoverage < minPerBlock; i++) {
        const user = shuffledUsers[i];

        // Check for conflicts
        const hasConflict = nextState.shifts.some(shift =>
          shift.assignedUserId === user.userId &&
          shift.date === date &&
          overlaps(shift.startTime, shift.endTime, block.startTime, block.endTime)
        );

        if (!hasConflict) {
          const created = addManagerShift(nextState, manager, {
            date,
            startTime: block.startTime,
            endTime: block.endTime,
            position: `${positionPrefix} Coverage`,
            location: "Primary Site",
            assignedUserId: user.userId,
          });

          if (!created.error) {
            nextState = created.state;
            currentCoverage++;
          } else {
            // Try fallback users
            for (const fallbackUser of users) {
              if (fallbackUser.userId === user.userId) continue;

              const fallbackConflict = nextState.shifts.some(shift =>
                shift.assignedUserId === fallbackUser.userId &&
                shift.date === date &&
                overlaps(shift.startTime, shift.endTime, block.startTime, block.endTime)
              );

              if (!fallbackConflict) {
                const fallbackCreated = addManagerShift(nextState, manager, {
                  date,
                  startTime: block.startTime,
                  endTime: block.endTime,
                  position: `${positionPrefix} Coverage`,
                  location: "Primary Site",
                  assignedUserId: fallbackUser.userId,
                });

                if (!fallbackCreated.error) {
                  nextState = fallbackCreated.state;
                  currentCoverage++;
                  break;
                }
              }
            }
          }
        }
      }
    }

    // Step 2: Combine consecutive shifts for the same user to create longer shifts
    const combineConsecutiveShifts = () => {
      // Group shifts by user for this date
      const userShifts = new Map<number, Array<{ shiftId: number; startTime: string; endTime: string; position: string }>>();

      nextState.shifts
        .filter(shift => shift.date === date && users.some(u => u.userId === shift.assignedUserId))
        .forEach(shift => {
          if (!userShifts.has(shift.assignedUserId)) {
            userShifts.set(shift.assignedUserId, []);
          }
          userShifts.get(shift.assignedUserId)!.push({
            shiftId: shift.shiftId,
            startTime: shift.startTime,
            endTime: shift.endTime,
            position: shift.position
          });
        });

      // For each user, look for consecutive shifts to combine
      for (const [userId, shifts] of userShifts) {
        if (shifts.length < 2) continue;

        // Sort shifts by start time
        shifts.sort((a, b) => a.startTime.localeCompare(b.startTime));

        // Find consecutive sequences
        const sequences: Array<{ shifts: typeof shifts; startTime: string; endTime: string }> = [];

        let currentSequence = [shifts[0]];

        for (let i = 1; i < shifts.length; i++) {
          const prevShift = shifts[i - 1];
          const currentShift = shifts[i];

          // Check if shifts are consecutive (end time of previous equals start time of current)
          if (prevShift.endTime === currentShift.startTime) {
            currentSequence.push(currentShift);
          } else {
            // End current sequence and start new one
            if (currentSequence.length > 1) {
              sequences.push({
                shifts: [...currentSequence],
                startTime: currentSequence[0].startTime,
                endTime: currentSequence[currentSequence.length - 1].endTime
              });
            }
            currentSequence = [currentShift];
          }
        }

        // Don't forget the last sequence
        if (currentSequence.length > 1) {
          sequences.push({
            shifts: [...currentSequence],
            startTime: currentSequence[0].startTime,
            endTime: currentSequence[currentSequence.length - 1].endTime
          });
        }

        // Combine sequences (replace multiple shifts with one combined shift)
        for (const sequence of sequences) {
          // Remove individual shifts (must update schedules[] shift id lists too, or DB FK save fails)
          const shiftsToRemove = sequence.shifts.map((s) => s.shiftId);
          nextState = removeShiftIdsFromState(nextState, shiftsToRemove);

          // Add combined shift
          const created = addManagerShift(nextState, manager, {
            date,
            startTime: sequence.startTime,
            endTime: sequence.endTime,
            position: `${positionPrefix} Coverage`,
            location: "Primary Site",
            assignedUserId: userId,
          });

          if (!created.error) {
            nextState = created.state;
          } else {
            // If combining fails, restore individual shifts
            for (const shift of sequence.shifts) {
              const restoreCreated = addManagerShift(nextState, manager, {
                date,
                startTime: shift.startTime,
                endTime: shift.endTime,
                position: shift.position,
                location: "Primary Site",
                assignedUserId: userId,
              });
              if (!restoreCreated.error) {
                nextState = restoreCreated.state;
              }
            }
          }
        }
      }
    };

    // Combine consecutive shifts
    combineConsecutiveShifts();
  };

  // Assign manager shifts efficiently
  const managerUsers = state.managers.map(m => ({ userId: m.userId, role: 'Manager' as const }));
  assignShiftsEfficiently(managerUsers, dayRules.minimumOpeningManagers, "Manager");

  // Assign employee shifts efficiently
  const employeeUsers = state.employees.map(e => ({ userId: e.userId, role: 'Employee' as const }));
  assignShiftsEfficiently(employeeUsers, dayRules.minimumOpeningEmployees, "Employee");

  // Final verification: ensure minimum coverage requirements are met
  const slots = buildCoverageSlots(state, date); // Use original slots for verification
  for (const slot of slots) {
    let slotCoverage = getCoverageForSlot(nextState, date, slot.startTime, slot.endTime);

    // Add additional managers if needed
    while (slotCoverage.managerCount < dayRules.minimumOpeningManagers) {
      const availableManagers = state.managers.filter(manager =>
        !nextState.shifts.some(shift =>
          shift.assignedUserId === manager.userId &&
          shift.date === date &&
          overlaps(shift.startTime, shift.endTime, slot.startTime, slot.endTime)
        )
      );

      if (availableManagers.length === 0) break;

      const managerToAssign = availableManagers[0];
      const created = addManagerShift(nextState, manager, {
        date,
        startTime: slot.startTime,
        endTime: slot.endTime,
        position: "Manager Coverage",
        location: "Primary Site",
        assignedUserId: managerToAssign.userId,
      });

      if (created.error) break;
      nextState = created.state;
      slotCoverage = getCoverageForSlot(nextState, date, slot.startTime, slot.endTime);
    }

    // Add additional employees if needed
    while (slotCoverage.employeeCount < dayRules.minimumOpeningEmployees) {
      const availableEmployees = state.employees.filter(employee =>
        !nextState.shifts.some(shift =>
          shift.assignedUserId === employee.userId &&
          shift.date === date &&
          overlaps(shift.startTime, shift.endTime, slot.startTime, slot.endTime)
        )
      );

      if (availableEmployees.length === 0) break;

      const employeeToAssign = availableEmployees[0];
      const created = addManagerShift(nextState, manager, {
        date,
        startTime: slot.startTime,
        endTime: slot.endTime,
        position: "Employee Coverage",
        location: "Primary Site",
        assignedUserId: employeeToAssign.userId,
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
