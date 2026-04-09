import type { RowDataPacket } from "mysql2";
import { joinDisplayName, splitDisplayName } from "./nameUtils.js";
import { pool } from "./db.js";
import type { AppState } from "./types.js";

function toDateOnly(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

function toTimeHm(v: unknown): string {
  if (v == null) return "00:00";
  const s = String(v);
  if (s.length >= 5 && s[2] === ":") return s.slice(0, 5);
  return s;
}

/** HH:MM or HH:MM:SS -> HH:MM:SS for MySQL TIME (avoids double :00 like 08:00:00:00). */
function toMysqlTime(h: string | undefined): string {
  const t = (h ?? "00:00").trim();
  if (/^\d{2}:\d{2}:\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (m) {
    return `${m[1]!.padStart(2, "0")}:${m[2]}:00`;
  }
  return "00:00:00";
}

function toMysqlDateTime(iso: string): string {
  const d = new Date(iso);
  if (!Number.isNaN(d.getTime())) {
    return d.toISOString().slice(0, 23).replace("T", " ");
  }
  return iso.trim().replace("T", " ").replace(/\.\d{3}Z?$/, "").slice(0, 26);
}

export async function isDatabaseEmpty(): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS c FROM employees");
  return Number(rows[0]?.c ?? 0) === 0;
}

export async function loadAppState(): Promise<AppState> {
  const [empRows] = await pool.query<
    RowDataPacket[]
  >("SELECT employee_id, first_name, last_name, email, phone_number, role, department FROM employees ORDER BY employee_id");

  const users = empRows.map((r) => ({
    userId: r.employee_id,
    name: joinDisplayName(r.first_name, r.last_name),
    email: r.email,
    phoneNumber: r.phone_number,
    role: r.role,
    department: r.department,
  }));

  const employees = users
    .filter((u) => u.role === "Employee")
    .map((u) => ({
      userId: u.userId,
      employeeID: u.userId,
      name: u.name,
      email: u.email,
      phoneNumber: u.phoneNumber,
      role: u.role,
      department: u.department,
    }));

  const [mgrRows] = await pool.query<
    RowDataPacket[]
  >("SELECT m.manager_id, m.employee_id, e.first_name, e.last_name, e.email, e.phone_number, e.role, e.department FROM managers m JOIN employees e ON e.employee_id = m.employee_id");

  const managers = mgrRows.map((r) => ({
    userId: r.employee_id,
    managerId: r.manager_id,
    name: joinDisplayName(r.first_name, r.last_name),
    email: r.email,
    phoneNumber: r.phone_number,
    role: r.role,
    department: r.department,
  }));

  const [credRows] = await pool.query<RowDataPacket[]>("SELECT email, password FROM user_credentials");
  const userCredentials: Record<string, string> = {};
  for (const r of credRows) {
    userCredentials[String(r.email).toLowerCase()] = r.password;
  }

  const [shiftRows] = await pool.query<RowDataPacket[]>(
    "SELECT shift_id, assigned_employee_id, shift_date, start_time, end_time, duration_hours, position, location, assigned_by_manager_employee_id FROM shifts ORDER BY shift_id",
  );
  const shifts = shiftRows.map((r) => ({
    shiftId: r.shift_id,
    date: toDateOnly(r.shift_date),
    startTime: toTimeHm(r.start_time),
    endTime: toTimeHm(r.end_time),
    durationHours: Number(r.duration_hours),
    position: r.position,
    location: r.location,
    assignedUserId: r.assigned_employee_id,
    assignedByManagerUserId: r.assigned_by_manager_employee_id ?? undefined,
  }));

  const [schedRows] = await pool.query<RowDataPacket[]>(
    "SELECT schedule_id, manager_id, start_date, end_date, published FROM schedules ORDER BY schedule_id",
  );
  const schedules = [];
  for (const s of schedRows) {
    const [ss] = await pool.query<RowDataPacket[]>(
      "SELECT shift_id FROM schedule_shifts WHERE schedule_id = ? ORDER BY sort_order, shift_id",
      [s.schedule_id],
    );
    schedules.push({
      scheduleId: s.schedule_id,
      managerId: s.manager_id,
      startDate: toDateOnly(s.start_date),
      endDate: toDateOnly(s.end_date),
      shifts: ss.map((x) => x.shift_id),
      published: Boolean(s.published),
    });
  }

  const [availRows] = await pool.query<RowDataPacket[]>(
    "SELECT available_shift_id, shift_id, reason, is_open, posted_by_employee_id FROM available_shifts ORDER BY available_shift_id",
  );
  const availableShifts = availRows.map((r) => ({
    availableShiftId: r.available_shift_id,
    shiftId: r.shift_id,
    reason: r.reason,
    isOpen: Boolean(r.is_open),
    postedByUserId: r.posted_by_employee_id,
  }));

  const [reqRows] = await pool.query<RowDataPacket[]>(
    "SELECT request_id, shift_id, available_shift_id, requester_id, status, reviewed_by_manager_id FROM shift_requests ORDER BY request_id",
  );
  const shiftRequests = reqRows.map((r) => ({
    requestID: r.request_id,
    status: r.status,
    requesterId: r.requester_id,
    availableShiftId: r.available_shift_id,
    reviewedByManagerId: r.reviewed_by_manager_id ?? undefined,
  }));

  const [notifRows] = await pool.query<RowDataPacket[]>(
    "SELECT notification_id, user_id, message, created_at FROM notifications ORDER BY notification_id",
  );
  const notifications = notifRows.map((r) => ({
    notificationId: r.notification_id,
    userId: r.user_id,
    message: r.message,
    createdAt:
      r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  }));

  const [setRows] = await pool.query<RowDataPacket[]>("SELECT * FROM app_settings WHERE id = 1 LIMIT 1");
  const st = setRows[0];
  if (!st) {
    throw new Error("app_settings row missing; run schema migration.");
  }

  let dailyBusinessRules: AppState["dailyBusinessRules"] = {};
  try {
    dailyBusinessRules =
      typeof st.daily_business_rules === "string"
        ? JSON.parse(st.daily_business_rules)
        : st.daily_business_rules;
  } catch {
    dailyBusinessRules = {};
  }

  let requiredPositions: string[] = [];
  try {
    requiredPositions =
      typeof st.required_positions === "string" ? JSON.parse(st.required_positions) : st.required_positions;
  } catch {
    requiredPositions = [];
  }

  return {
    users,
    employees,
    managers,
    shifts,
    availableShifts,
    shiftRequests,
    schedules,
    notifications,
    userCredentials,
    aiHandsOffMode: Boolean(st.ai_hands_off_mode),
    businessOpenTime: toTimeHm(st.business_open_time),
    businessCloseTime: toTimeHm(st.business_close_time),
    requiredPositions,
    minimumOpeningManagers: st.minimum_opening_managers,
    minimumOpeningEmployees: st.minimum_opening_employees,
    dailyBusinessRules,
  };
}

export async function replaceAppState(state: AppState): Promise<void> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query("SET FOREIGN_KEY_CHECKS = 0");
    // DELETE (not TRUNCATE) — TRUNCATE often fails on InnoDB tables with FKs on Windows/MySQL 8.
    await conn.query("DELETE FROM shift_requests");
    await conn.query("DELETE FROM available_shifts");
    await conn.query("DELETE FROM schedule_shifts");
    await conn.query("DELETE FROM notifications");
    await conn.query("DELETE FROM shifts");
    await conn.query("DELETE FROM schedules");
    await conn.query("DELETE FROM user_credentials");
    await conn.query("DELETE FROM managers");
    await conn.query("DELETE FROM app_settings");
    await conn.query("DELETE FROM employees");
    await conn.query("SET FOREIGN_KEY_CHECKS = 1");

    for (const u of state.users) {
      const { first, last } = splitDisplayName(u.name);
      const email = String(u.email).toLowerCase();
      await conn.execute(
        `INSERT INTO employees (employee_id, first_name, last_name, email, phone_number, role, department)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [u.userId, first, last, email, u.phoneNumber, u.role, u.department],
      );
    }

    for (const m of state.managers) {
      await conn.execute(`INSERT INTO managers (manager_id, employee_id) VALUES (?, ?)`, [
        m.managerId,
        m.userId,
      ]);
    }

    for (const [email, password] of Object.entries(state.userCredentials)) {
      await conn.execute(`INSERT INTO user_credentials (email, password) VALUES (?, ?)`, [
        String(email).toLowerCase(),
        password,
      ]);
    }

    await conn.execute(
      `INSERT INTO app_settings (id, ai_hands_off_mode, business_open_time, business_close_time, required_positions, minimum_opening_managers, minimum_opening_employees, daily_business_rules)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?)`,
      [
        state.aiHandsOffMode,
        toMysqlTime(state.businessOpenTime),
        toMysqlTime(state.businessCloseTime),
        JSON.stringify(state.requiredPositions),
        state.minimumOpeningManagers,
        state.minimumOpeningEmployees,
        JSON.stringify(state.dailyBusinessRules),
      ],
    );

    for (const sh of state.shifts) {
      await conn.execute(
        `INSERT INTO shifts (shift_id, assigned_employee_id, shift_date, start_time, end_time, duration_hours, position, location, assigned_by_manager_employee_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          sh.shiftId,
          sh.assignedUserId,
          sh.date,
          toMysqlTime(sh.startTime),
          toMysqlTime(sh.endTime),
          sh.durationHours,
          sh.position,
          sh.location,
          sh.assignedByManagerUserId ?? null,
        ],
      );
    }

    for (const sc of state.schedules) {
      await conn.execute(
        `INSERT INTO schedules (schedule_id, manager_id, start_date, end_date, published) VALUES (?, ?, ?, ?, ?)`,
        [sc.scheduleId, sc.managerId, sc.startDate, sc.endDate, sc.published],
      );
      for (let idx = 0; idx < sc.shifts.length; idx++) {
        await conn.execute(
          `INSERT INTO schedule_shifts (schedule_id, shift_id, sort_order) VALUES (?, ?, ?)`,
          [sc.scheduleId, sc.shifts[idx], idx],
        );
      }
    }

    for (const a of state.availableShifts) {
      await conn.execute(
        `INSERT INTO available_shifts (available_shift_id, shift_id, reason, is_open, posted_by_employee_id) VALUES (?, ?, ?, ?, ?)`,
        [a.availableShiftId, a.shiftId, a.reason, a.isOpen, a.postedByUserId],
      );
    }

    for (const r of state.shiftRequests) {
      const shiftId = state.availableShifts.find((x) => x.availableShiftId === r.availableShiftId)?.shiftId;
      if (shiftId == null) continue;
      await conn.execute(
        `INSERT INTO shift_requests (request_id, shift_id, available_shift_id, requester_id, status, reviewed_by_manager_id) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          r.requestID,
          shiftId,
          r.availableShiftId,
          r.requesterId,
          r.status,
          r.reviewedByManagerId ?? null,
        ],
      );
    }

    for (const n of state.notifications) {
      await conn.execute(
        `INSERT INTO notifications (notification_id, user_id, message, created_at) VALUES (?, ?, ?, ?)`,
        [n.notificationId, n.userId, n.message, toMysqlDateTime(n.createdAt)],
      );
    }

    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

export async function ensureSeeded(seed: AppState): Promise<void> {
  if (await isDatabaseEmpty()) {
    await replaceAppState(seed);
  }
}
