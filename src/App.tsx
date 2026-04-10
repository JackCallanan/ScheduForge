import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import logo from "./images/ScheduForge Logo.png";
import { loadAppState, resetAppStateStorage, saveAppState } from "./data/localDb";
import { pullAppStateFromApi, pushAppStateToApi, resetMysqlDatabase } from "./data/mysqlSync";
import { formatSaveErrorForUser } from "./data/saveErrorMessage";
import type { AppState, Manager, NewShiftInput, Shift, User, UserRole } from "./domain/types";
import { RequestStatus } from "./domain/types";
import {
  addManagerShift,
  deleteShift,
  generateAIHandsOffSchedule,
  getBusinessRulesForDate,
  updateBusinessRules,
  updateGlobalBusinessBaseline,
} from "./modules/SchedulingModule";
import { close } from "./modules/ShiftManagementModule";
import { reviewRequest } from "./modules/ShiftRequestModule";
import {
  authenticateUser,
  getAssignedShifts,
  postShift,
  registerUser,
  requestToCover,
} from "./modules/UserManagementModule";
import { LoginPage } from "./pages/LoginPage";
import { EmployeePage } from "./pages/EmployeePage";
import { ManagerPage } from "./pages/ManagerPage";

type AuthMode = "login" | "signup";

function assignmentLabels(state: AppState, shift: Shift): { assignedBy: string; assignedTo: string } {
  const assignedTo = state.users.find((u) => u.userId === shift.assignedUserId)?.name ?? "—";
  const assignedBy =
    shift.assignedByManagerUserId != null
      ? state.users.find((u) => u.userId === shift.assignedByManagerUserId)?.name ?? "—"
      : "—";
  return { assignedBy, assignedTo };
}

type ThemeChoice = "light" | "dark";

function App() {
  const [state, setState] = useState(loadAppState);
  const [remoteReady, setRemoteReady] = useState(false);
  const [theme, setTheme] = useState<ThemeChoice>(() => {
    try {
      const s = localStorage.getItem("scheduforge.theme");
      if (s === "dark" || s === "light") return s;
    } catch {
      /* ignore */
    }
    return "light";
  });
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [loggedInUserId, setLoggedInUserId] = useState<number | null>(null);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [signupForm, setSignupForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "Employee" as UserRole,
  });
  const [postReasonByShiftId, setPostReasonByShiftId] = useState<Record<number, string>>({});
  const [error, setError] = useState<string>("");
  const [dbSyncError, setDbSyncError] = useState<string | null>(null);
  const [managerSaveError, setManagerSaveError] = useState<{
    text: string;
    at: "add-shift" | "ai-schedule" | "post-coverage";
  } | null>(null);
  const [businessRulesDate, setBusinessRulesDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [openTimeDraft, setOpenTimeDraft] = useState(state.businessOpenTime);
  const [closeTimeDraft, setCloseTimeDraft] = useState(state.businessCloseTime);
  const [minimumOpeningManagersDraft, setMinimumOpeningManagersDraft] = useState(
    state.minimumOpeningManagers,
  );
  const [minimumOpeningEmployeesDraft, setMinimumOpeningEmployeesDraft] = useState(
    state.minimumOpeningEmployees,
  );
  const [baselineOpenDraft, setBaselineOpenDraft] = useState(state.businessOpenTime);
  const [baselineCloseDraft, setBaselineCloseDraft] = useState(state.businessCloseTime);
  const [baselineMinManagersDraft, setBaselineMinManagersDraft] = useState(
    state.minimumOpeningManagers,
  );
  const [baselineMinEmployeesDraft, setBaselineMinEmployeesDraft] = useState(
    state.minimumOpeningEmployees,
  );
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  /** Which manager action triggered the last state change (for inline DB error placement). */
  const lastManagerSaveContextRef = useRef<"add-shift" | "ai-schedule" | "post-coverage" | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("scheduforge.theme", theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const remote = await pullAppStateFromApi();
        if (cancelled) return;
        if (remote) {
          setState(remote);
          saveAppState(remote);
        }
      } finally {
        if (!cancelled) {
          setRemoteReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!remoteReady) return;
    saveAppState(state);
    const id = window.setTimeout(() => {
      void pushAppStateToApi(state).then((r) => {
        if (r.ok) {
          setDbSyncError(null);
          setManagerSaveError(null);
          lastManagerSaveContextRef.current = null;
          return;
        }
        const raw = r.detail ?? r.message;
        const { userMessage, isDuplicate } = formatSaveErrorForUser(raw);
        const anchor = lastManagerSaveContextRef.current;
        const role = state.users.find((u) => u.userId === loggedInUserId)?.role;
        const showInline = isDuplicate && role === "Manager" && anchor != null;
        if (showInline) {
          setManagerSaveError({ text: userMessage, at: anchor });
          setDbSyncError(null);
        } else {
          setDbSyncError(userMessage);
          setManagerSaveError(null);
        }
        lastManagerSaveContextRef.current = null;
      });
    }, 450);
    return () => window.clearTimeout(id);
  }, [state, remoteReady, loggedInUserId]);

  useEffect(() => {
    setBaselineOpenDraft(state.businessOpenTime);
    setBaselineCloseDraft(state.businessCloseTime);
    setBaselineMinManagersDraft(state.minimumOpeningManagers);
    setBaselineMinEmployeesDraft(state.minimumOpeningEmployees);
  }, [
    state.businessOpenTime,
    state.businessCloseTime,
    state.minimumOpeningManagers,
    state.minimumOpeningEmployees,
  ]);

  useEffect(() => {
    const r = getBusinessRulesForDate(stateRef.current, businessRulesDate);
    setOpenTimeDraft(r.businessOpenTime);
    setCloseTimeDraft(r.businessCloseTime);
    setMinimumOpeningManagersDraft(r.minimumOpeningManagers);
    setMinimumOpeningEmployeesDraft(r.minimumOpeningEmployees);
  }, [
    businessRulesDate,
    state.businessOpenTime,
    state.businessCloseTime,
    state.minimumOpeningManagers,
    state.minimumOpeningEmployees,
  ]);
  const [aiDate, setAiDate] = useState("");
  const [operationsCheckDate, setOperationsCheckDate] = useState("");
  const [managerShiftViewDate, setManagerShiftViewDate] = useState("");
  const [employeeShiftViewDate, setEmployeeShiftViewDate] = useState("");
  const [managerShiftDraft, setManagerShiftDraft] = useState<NewShiftInput>({
    date: "",
    startTime: "09:00",
    endTime: "13:00",
    position: "",
    location: "",
    assignedUserId: 2,
  });

  const selectedUser = state.users.find((item) => item.userId === loggedInUserId) as User | undefined;
  const isManager = selectedUser?.role === "Manager";

  const myShifts = useMemo(() => {
    let shifts = selectedUser ? getAssignedShifts(state, selectedUser) : [];
    if (employeeShiftViewDate) {
      shifts = shifts.filter((item) => item.date === employeeShiftViewDate);
    }
    return shifts;
  }, [state, selectedUser, employeeShiftViewDate]);

  const managerFilteredShifts = useMemo(
    () =>
      selectedUser?.role === "Manager"
        ? managerShiftViewDate
          ? state.shifts.filter((item) => item.date === managerShiftViewDate)
          : state.shifts
        : myShifts,
    [selectedUser, managerShiftViewDate, state.shifts, myShifts],
  );

  const openShiftRows = useMemo(
    () =>
      state.availableShifts
        .filter((item) => item.isOpen)
        .map((item) => ({
          availableShift: item,
          shift: state.shifts.find((s) => s.shiftId === item.shiftId),
          postedBy: state.users.find((u) => u.userId === item.postedByUserId),
        }))
        .filter((row) => row.shift && row.postedBy),
    [state.availableShifts, state.shifts, state.users],
  );

  const myNotifications = state.notifications
    .filter((item) => item.userId === loggedInUserId)
    .slice()
    .reverse()
    .slice(0, 8);

  const pendingRequests = state.shiftRequests
    .filter((item) => item.status === RequestStatus.PENDING)
    .map((request) => {
      const availableShift = state.availableShifts.find(
        (item) => item.availableShiftId === request.availableShiftId,
      );
      const shift = state.shifts.find((item) => item.shiftId === availableShift?.shiftId);
      const requester = state.users.find((item) => item.userId === request.requesterId);
      const poster = state.users.find((item) => item.userId === availableShift?.postedByUserId);
      return { request, shift, requester, poster };
    })
    .filter((row) => row.shift && row.requester && row.poster);

  const handleLogin = () => {
    const result = authenticateUser(state, loginEmail, loginPassword);
    if (result.error || !result.user) {
      setError(result.error ?? "Login failed.");
      return;
    }
    setLoggedInUserId(result.user.userId);
    setLoginPassword("");
    setError("");
  };

  const handleSignUp = () => {
    const result = registerUser(state, signupForm);
    if (result.error || !result.user) {
      setError(result.error ?? "Could not create account.");
      return;
    }
    setState(result.state);
    void pushAppStateToApi(result.state).then((r) => {
      if (r.ok) {
        setDbSyncError(null);
        setManagerSaveError(null);
      } else {
        const raw = r.detail ?? r.message;
        setDbSyncError(formatSaveErrorForUser(raw).userMessage);
      }
    });
    setLoggedInUserId(result.user.userId);
    setSignupForm({
      name: "",
      email: "",
      password: "",
      role: "Employee",
    });
    setAuthMode("login");
    setError("");
  };

  const handleLogout = () => {
    setLoggedInUserId(null);
    setLoginEmail("");
    setLoginPassword("");
    setError("");
  };

  const handleResetDatabase = async () => {
    await resetMysqlDatabase();
    resetAppStateStorage();
    window.location.reload();
  };

  const handlePostShift = (shiftId: number) => {
    if (!selectedUser) return;
    const reason = postReasonByShiftId[shiftId] ?? "";
    const result = postShift(state, selectedUser, shiftId, reason);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (selectedUser.role === "Manager") {
      lastManagerSaveContextRef.current = "post-coverage";
    }
    setState(result.state);
    setError("");
    setPostReasonByShiftId((prev) => ({ ...prev, [shiftId]: "" }));
  };

  const handleRequestToCover = (availableShiftId: number) => {
    if (!selectedUser) return;
    const result = requestToCover(state, selectedUser, availableShiftId);
    if (result.error) {
      setError(result.error);
      return;
    }
    setState(result.state);
    setError("");
  };

  const handleUnpostShift = (availableShiftId: number) => {
    const newState = close(state, availableShiftId);
    setState(newState);
    setError("");
  };

  const handleReviewRequest = (requestId: number, decision: (typeof RequestStatus)[keyof typeof RequestStatus]) => {
    if (!selectedUser || selectedUser.role !== "Manager") return;
    const result = reviewRequest(state, requestId, selectedUser.userId, decision);
    if (result.error) {
      setError(result.error);
      return;
    }
    setState(result.state);
    setError("");
  };

  const handleSaveBusinessSettings = () => {
    const withRules = updateBusinessRules(
      state,
      businessRulesDate,
      openTimeDraft,
      closeTimeDraft,
      minimumOpeningManagersDraft,
      minimumOpeningEmployeesDraft,
    );
    if (withRules.error) {
      setError(withRules.error);
      return;
    }
    setState(withRules.state);
    setError("");
  };

  const handleSaveGlobalBaseline = () => {
    const result = updateGlobalBusinessBaseline(
      state,
      baselineOpenDraft,
      baselineCloseDraft,
      baselineMinManagersDraft,
      baselineMinEmployeesDraft,
    );
    if (result.error) {
      setError(result.error);
      return;
    }
    setState(result.state);
    setError("");
  };

  const handleDeleteShift = (shiftId: number) => {
    if (!selectedUser || selectedUser.role !== "Manager") return;
    const result = deleteShift(state, shiftId);
    if (result.error) {
      setError(result.error);
      return;
    }
    setState(result.state);
    setPostReasonByShiftId((prev) => {
      const next = { ...prev };
      delete next[shiftId];
      return next;
    });
    setError("");
  };

  const handleAddManagerShift = () => {
    if (!selectedUser || selectedUser.role !== "Manager") return;
    const manager = state.managers.find((item) => item.userId === selectedUser.userId) as Manager;
    const result = addManagerShift(state, manager, {
      ...managerShiftDraft,
      position: state.requiredPositions[0] ?? "General Employee",
      location: "Primary Site",
    });
    if (result.error) {
      setError(result.error);
      return;
    }
    lastManagerSaveContextRef.current = "add-shift";
    setState(result.state);
    setError("");
  };

  const handleGenerateAI = () => {
    if (!selectedUser || selectedUser.role !== "Manager") return;
    const manager = state.managers.find((item) => item.userId === selectedUser.userId) as Manager;
    const result = generateAIHandsOffSchedule(state, manager, aiDate);
    if (result.error) {
      setError(result.error);
      return;
    }
    lastManagerSaveContextRef.current = "ai-schedule";
    setState(result.state);
    setError("");
  };

  if (!selectedUser) {
    return (
      <LoginPage
        authMode={authMode}
        setAuthMode={setAuthMode}
        loginEmail={loginEmail}
        setLoginEmail={setLoginEmail}
        loginPassword={loginPassword}
        setLoginPassword={setLoginPassword}
        signupForm={signupForm}
        setSignupForm={setSignupForm}
        error={error}
        dbSyncError={dbSyncError}
        handleLogin={handleLogin}
        handleSignUp={handleSignUp}
        handleResetDatabase={handleResetDatabase}
        theme={theme}
        setTheme={setTheme}
      />
    );
  }

  if (isManager) {
    return (
      <ManagerPage
        state={state}
        selectedUser={selectedUser}
        error={error}
        dbSyncError={dbSyncError}
        theme={theme}
        employeeShiftViewDate={employeeShiftViewDate}
        setEmployeeShiftViewDate={setEmployeeShiftViewDate}
        managerShiftViewDate={managerShiftViewDate}
        setManagerShiftViewDate={setManagerShiftViewDate}
        postReasonByShiftId={postReasonByShiftId}
        setPostReasonByShiftId={(reasons: Record<number, string>) =>
          setPostReasonByShiftId(reasons)
        }
        myShifts={myShifts}
        managerFilteredShifts={managerFilteredShifts}
        openShiftRows={openShiftRows}
        businessRulesDate={businessRulesDate}
        setBusinessRulesDate={setBusinessRulesDate}
        openTimeDraft={openTimeDraft}
        setOpenTimeDraft={setOpenTimeDraft}
        closeTimeDraft={closeTimeDraft}
        setCloseTimeDraft={setCloseTimeDraft}
        minimumOpeningManagersDraft={minimumOpeningManagersDraft}
        setMinimumOpeningManagersDraft={setMinimumOpeningManagersDraft}
        minimumOpeningEmployeesDraft={minimumOpeningEmployeesDraft}
        setMinimumOpeningEmployeesDraft={setMinimumOpeningEmployeesDraft}
        baselineOpenDraft={baselineOpenDraft}
        setBaselineOpenDraft={setBaselineOpenDraft}
        baselineCloseDraft={baselineCloseDraft}
        setBaselineCloseDraft={setBaselineCloseDraft}
        baselineMinManagersDraft={baselineMinManagersDraft}
        setBaselineMinManagersDraft={setBaselineMinManagersDraft}
        baselineMinEmployeesDraft={baselineMinEmployeesDraft}
        setBaselineMinEmployeesDraft={setBaselineMinEmployeesDraft}
        aiDate={aiDate}
        setAiDate={setAiDate}
        operationsCheckDate={operationsCheckDate}
        setOperationsCheckDate={setOperationsCheckDate}
        managerShiftDraft={managerShiftDraft}
        setManagerShiftDraft={setManagerShiftDraft}
        managerSaveError={managerSaveError}
        myNotifications={myNotifications}
        pendingRequests={pendingRequests}
        handlePostShift={handlePostShift}
        handleDeleteShift={handleDeleteShift}
        handleRequestToCover={handleRequestToCover}
        handleUnpostShift={handleUnpostShift}
        handleAddManagerShift={handleAddManagerShift}
        handleGenerateAI={handleGenerateAI}
        handleSaveBusinessSettings={handleSaveBusinessSettings}
        handleSaveGlobalBaseline={handleSaveGlobalBaseline}
        handleReviewRequest={handleReviewRequest}
        handleLogout={handleLogout}
        setTheme={setTheme}
        logo={logo}
        assignmentLabelsFunc={assignmentLabels}
      />
    );
  }

  return (
    <EmployeePage
      state={state}
      selectedUser={selectedUser}
      error={error}
      dbSyncError={dbSyncError}
      theme={theme}
      employeeShiftViewDate={employeeShiftViewDate}
      setEmployeeShiftViewDate={setEmployeeShiftViewDate}
      postReasonByShiftId={postReasonByShiftId}
      setPostReasonByShiftId={(reasons: Record<number, string>) =>
        setPostReasonByShiftId(reasons)
      }
      myShifts={myShifts}
      openShiftRows={openShiftRows}
      handlePostShift={handlePostShift}
      handleRequestToCover={handleRequestToCover}
      handleUnpostShift={handleUnpostShift}
      handleLogout={handleLogout}
      setTheme={setTheme}
      logo={logo}
      myNotifications={myNotifications}
      assignmentLabelsFunc={assignmentLabels}
    />
  );
}

export default App;
