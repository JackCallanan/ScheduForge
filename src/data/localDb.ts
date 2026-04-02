import { initialState } from "./seed";
import type { AppState } from "../domain/types";

const STORAGE_KEY = "scheduforge.appState.v1";

export const loadAppState = (): AppState => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialState;
    const parsed = JSON.parse(raw) as Partial<AppState>;
    if (!parsed.users || !parsed.shifts || !parsed.schedules) return initialState;
    return {
      ...initialState,
      ...parsed,
      businessOpenTime: parsed.businessOpenTime ?? initialState.businessOpenTime,
      businessCloseTime: parsed.businessCloseTime ?? initialState.businessCloseTime,
      requiredPositions: parsed.requiredPositions ?? initialState.requiredPositions,
      minimumOpeningManagers:
        parsed.minimumOpeningManagers ?? initialState.minimumOpeningManagers,
      minimumOpeningEmployees:
        parsed.minimumOpeningEmployees ?? initialState.minimumOpeningEmployees,
      dailyBusinessRules: {
        ...initialState.dailyBusinessRules,
        ...(parsed.dailyBusinessRules ?? {}),
      },
    } as AppState;
  } catch {
    return initialState;
  }
};

export const saveAppState = (state: AppState) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
};

export const resetAppStateStorage = () => {
  localStorage.removeItem(STORAGE_KEY);
};
