import type { Notification } from "../domain/types";

export const nextId = (items: number[]) => (items.length ? Math.max(...items) : 0) + 1;

/** Display "HH:MM" (24h) as "h:mm AM/PM". */
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

export const formatTimeRange12h = (start24: string, end24: string): string =>
  `${formatTime12h(start24)}–${formatTime12h(end24)}`;

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

export const toTime24 = (hour12: number, minute: number, isPm: boolean): string => {
  let h: number;
  if (hour12 === 12) {
    h = isPm ? 12 : 0;
  } else {
    h = isPm ? hour12 + 12 : hour12;
  }
  return `${String(h).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
};

export const calculateDurationHours = (startTime: string, endTime: string) => {
  const [sH, sM] = startTime.split(":").map(Number);
  const [eH, eM] = endTime.split(":").map(Number);
  const startMinutes = sH * 60 + sM;
  const endMinutes = eH * 60 + eM;
  return Math.max(0, (endMinutes - startMinutes) / 60);
};

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
