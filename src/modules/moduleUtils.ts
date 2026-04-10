import type { Notification } from "../domain/types";

/**
 * Generate the next numeric ID from a list.
 * @param items - Numeric items to base the next ID on.
 * @returns Next sequential ID.
 */
export const nextId = (items: number[]) => (items.length ? Math.max(...items) : 0) + 1;

/**
 * Display "HH:MM" (24h) as "h:mm AM/PM".
 * @param time24 - Time in 24-hour format.
 * @returns Formatted 12-hour time string.
 */
export const formatTime12h = (time24: string): string => {
  const [hStr, mStr] = time24.trim().split(":");
  const h = parseInt(hStr ?? "0", 10);
  const m = parseInt(mStr ?? "0", 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return time24;
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  const mm = String(m).padStart(2, "0");
  return `${hour12}:${mm} ${period}`;
};

/**
 * Format a 24-hour time range as a 12-hour range.
 * @param start24 - Start time in 24-hour format.
 * @param end24 - End time in 24-hour format.
 * @returns Formatted time range.
 */
export const formatTimeRange12h = (start24: string, end24: string): string =>
  `${formatTime12h(start24)}–${formatTime12h(end24)}`;

/**
 * Parse a 24-hour time string into 12-hour components.
 * @param time24 - Time in HH:MM format.
 * @returns Parsed hour, minute, and AM/PM flag.
 */
export const partsFromTime24 = (time24: string): { hour12: number; minute: number; isPm: boolean } => {
  const [hStr, mStr] = time24.trim().split(":");
  const hRaw = parseInt(hStr ?? "0", 10);
  const mRaw = parseInt(mStr ?? "0", 10);
  const h = Number.isNaN(hRaw) ? 0 : hRaw;
  const m = Number.isNaN(mRaw) ? 0 : mRaw;
  const isPm = h >= 12;
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return { hour12, minute: m, isPm };
};

/**
 * Convert 12-hour time components into 24-hour format.
 * @param hour12 - Hour in 12-hour clock.
 * @param minute - Minute value.
 * @param isPm - Whether the time is PM.
 * @returns Time in HH:MM 24-hour format.
 */
export const toTime24 = (hour12: number, minute: number, isPm: boolean): string => {
  let h: number;
  if (hour12 === 12) {
    h = isPm ? 12 : 0;
  } else {
    h = isPm ? hour12 + 12 : hour12;
  }
  return `${String(h).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
};

/**
 * Calculate the duration between two times in hours.
 * @param startTime - Start time in HH:MM.
 * @param endTime - End time in HH:MM.
 * @returns Duration in decimal hours.
 */
export const calculateDurationHours = (startTime: string, endTime: string) => {
  const [sH, sM] = startTime.split(":").map(Number);
  const [eH, eM] = endTime.split(":").map(Number);
  const startMinutes = sH * 60 + sM;
  const endMinutes = eH * 60 + eM;
  return Math.max(0, (endMinutes - startMinutes) / 60);
};

/**
 * Add a notification entry to the notifications list.
 * @param notifications - Existing notifications.
 * @param userId - User ID for the notification.
 * @param message - Notification message.
 * @returns Updated notification list.
 */
export const addNotification = (
  notifications: Notification[],
  userId: number,
  message: string,
): Notification[] => {
  const notification: Notification = {
    notificationId: nextId(notifications.map((item) => item.notificationId)),
    userId,
    message,
    createdAt: new Date().toISOString(),
  };
  return [...notifications, notification];
};
