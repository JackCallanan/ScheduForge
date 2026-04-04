import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { TimeField12h } from "./components/TimeField12h";
import { loadAppState, resetAppStateStorage, saveAppState } from "./data/localDb";
import type { AppState, Manager, NewShiftInput, Shift, User, UserRole } from "./domain/types";
import { RequestStatus } from "./domain/types";
import {
  addManagerShift,
  deleteShift,
  generateAIHandsOffSchedule,
  getBusinessRulesForDate,
  getDailyOperationalStatus,
  isPublished,
  updateBusinessRules,
  updateGlobalBusinessBaseline,
} from "./modules/SchedulingModule";
import { close } from "./modules/ShiftManagementModule";
import { formatTime12h, formatTimeRange12h } from "./modules/moduleUtils";
import { reviewRequest } from "./modules/ShiftRequestModule";
import {
  authenticateUser,
  getAssignedShifts,
  getReviewedRequests,
  postShift,
  registerUser,
  requestToCover,
} from "./modules/UserManagementModule";

type AuthMode = "login" | "signup";

function assignmentLabels(state: AppState, shift: Shift): { assignedBy: string; assignedTo: string } {
  const assignedTo = state.users.find((u) => u.userId === shift.assignedUserId)?.name ?? "—";
  const assignedBy =
    shift.assignedByManagerUserId != null
      ? state.users.find((u) => u.userId === shift.assignedByManagerUserId)?.name ?? "—"
      : "—";
  return { assignedBy, assignedTo };
}

function App() {
  const [state, setState] = useState(loadAppState);
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
  stateRef.current = state;

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
  const [error, setError] = useState<string>("");

  useEffect(() => {
    saveAppState(state);
  }, [state]);

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

  const handleResetDatabase = () => {
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
    setState(result.state);
    setError("");
  };

  if (!selectedUser) {
    return (
      <main className="app authPage">
        <section className="panel authCard">
          <h1>ScheduForge Login</h1>
          <p>Create an account or sign in.</p>
          {error ? <p className="error">{error}</p> : null}
          <div className="actions">
            <button className={authMode === "login" ? "" : "ghost"} onClick={() => setAuthMode("login")}>
              Log In
            </button>
            <button className={authMode === "signup" ? "" : "ghost"} onClick={() => setAuthMode("signup")}>
              Sign Up
            </button>
          </div>
          {authMode === "login" ? (
            <>
              <label>Email</label>
              <input value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} />
              <label>Password</label>
              <input type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} />
              <button onClick={handleLogin}>Log In</button>
            </>
          ) : (
            <>
              <label>Name</label>
              <input value={signupForm.name} onChange={(e) => setSignupForm((p) => ({ ...p, name: e.target.value }))} />
              <label>Email</label>
              <input value={signupForm.email} onChange={(e) => setSignupForm((p) => ({ ...p, email: e.target.value }))} />
              <label>Role</label>
              <select value={signupForm.role} onChange={(e) => setSignupForm((p) => ({ ...p, role: e.target.value as UserRole }))}>
                <option value="Employee">Employee</option>
                <option value="Manager">Manager</option>
              </select>
              <label>Password</label>
              <input type="password" value={signupForm.password} onChange={(e) => setSignupForm((p) => ({ ...p, password: e.target.value }))} />
              <button onClick={handleSignUp}>Create Account</button>
            </>
          )}
          <button className="ghost" onClick={handleResetDatabase}>
            Reset Database
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="app">
      <header className="topBar">
        <div>
          <h1>ScheduForge</h1>
          <p>Shift trading and schedule management</p>
        </div>
        <div className="loginPanel">
          <p>Signed in: {selectedUser.name} ({selectedUser.role})</p>
          <button className="ghost" onClick={handleLogout}>Log Out</button>
        </div>
      </header>

      {error ? <p className="error">{error}</p> : null}

      <section className="grid">
        <article className="panel">
          <h2>{isManager ? "All Assigned Shifts" : "My Schedule"}</h2>
          <div className="list">
            {!isManager && (
              <div className="card">
                <label>View shifts for date (optional)</label>
                <input
                  type="date"
                  value={employeeShiftViewDate}
                  onChange={(e) => setEmployeeShiftViewDate(e.target.value)}
                />
                <button className="ghost" onClick={() => setEmployeeShiftViewDate("")}>
                  Clear
                </button>
              </div>
            )}
            {isManager ? (
              <div className="actions">
                <label>View Date</label>
                <input
                  type="date"
                  value={managerShiftViewDate}
                  onChange={(e) => setManagerShiftViewDate(e.target.value)}
                />
                <button className="ghost" onClick={() => setManagerShiftViewDate("")}>
                  Clear
                </button>
              </div>
            ) : null}
            <div className={isManager ? "list-scroll--shifts" : undefined}>
              {(isManager ? managerFilteredShifts : myShifts).map((shift) => {
                const isMine = selectedUser != null && shift.assignedUserId === selectedUser.userId;
                const { assignedBy, assignedTo } = assignmentLabels(state, shift);
                return (
                  <div key={shift.shiftId} className="card">
                    <p>
                      <strong>{shift.date}</strong> {formatTimeRange12h(shift.startTime, shift.endTime)}
                    </p>
                    <p>{shift.position} at {shift.location}</p>
                    <p>Assigned By: {assignedBy}</p>
                    <p>Assigned To: {assignedTo}</p>
                    {isManager ? (
                      <div className="actions">
                        <button
                          type="button"
                          className="ghost danger"
                          onClick={() => handleDeleteShift(shift.shiftId)}
                        >
                          Delete shift
                        </button>
                      </div>
                    ) : null}
                    {!isManager && isMine ? (
                      <div className="actions">
                        <input
                          placeholder="Reason for coverage"
                          value={postReasonByShiftId[shift.shiftId] ?? ""}
                          onChange={(event) =>
                            setPostReasonByShiftId((prev) => ({ ...prev, [shift.shiftId]: event.target.value }))
                          }
                        />
                        <button onClick={() => handlePostShift(shift.shiftId)}>postShift()</button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </article>

        <article className="panel">
          <h2>Available Shifts</h2>
          <div className="list">
            {openShiftRows.length === 0 ? <p>No open shifts.</p> : null}
            {openShiftRows.map((row) => {
              const { assignedBy, assignedTo } = assignmentLabels(state, row.shift!);
              return (
              <div key={row.availableShift.availableShiftId} className="card">
                <p>
                  <strong>{row.shift!.date}</strong>{" "}
                  {formatTimeRange12h(row.shift!.startTime, row.shift!.endTime)}
                </p>
                <p>{row.shift!.position} at {row.shift!.location}</p>
                <p>Assigned By: {assignedBy}</p>
                <p>Assigned To: {assignedTo}</p>
                <p>Posted by: {row.postedBy!.name}</p>
                <p>Reason: {row.availableShift.reason}</p>
                {row.postedBy!.userId !== selectedUser.userId ? (
                  <button onClick={() => handleRequestToCover(row.availableShift.availableShiftId)}>
                    requestToCover()
                  </button>
                ) : (
                  <button className="ghost" onClick={() => handleUnpostShift(row.availableShift.availableShiftId)}>
                    Unpost
                  </button>
                )}
              </div>
            );
            })}
          </div>
        </article>

        {isManager && (
          <article className="panel">
            <h2>My Shifts</h2>
            <div className="list-scroll--shifts">
              <div className="card">
                <label>View shifts for date (optional)</label>
                <input
                  type="date"
                  value={employeeShiftViewDate}
                  onChange={(e) => setEmployeeShiftViewDate(e.target.value)}
                />
                <button className="ghost" onClick={() => setEmployeeShiftViewDate("")}>
                  Clear
                </button>
              </div>
              {myShifts.map((shift) => {
                const { assignedBy, assignedTo } = assignmentLabels(state, shift);
                return (
                  <div key={shift.shiftId} className="card">
                    <p><strong>{shift.date} {formatTimeRange12h(shift.startTime, shift.endTime)}</strong></p>
                    <p>{shift.position} @ {shift.location}</p>
                    <p>Assigned By: {assignedBy}</p>
                    <p>Assigned To: {assignedTo}</p>
                    <textarea
                      placeholder="Reason for posting (required)"
                      value={postReasonByShiftId[shift.shiftId] ?? ""}
                      onChange={(e) => setPostReasonByShiftId((prev) => ({ ...prev, [shift.shiftId]: e.target.value }))}
                    />
                    <button onClick={() => handlePostShift(shift.shiftId)}>Post for Coverage</button>
                  </div>
                );
              })}
              {myShifts.length === 0 && <p>No shifts assigned.</p>}
            </div>
          </article>
        )}

        {isManager && (
          <article className="panel">
            <h2>Shift Creation</h2>
            <div className="list">
              <div className="card">
                <p><strong>Manager Shift Builder</strong></p>
                <div className="actions">
                  <label>Date</label>
                  <input type="date" value={managerShiftDraft.date} onChange={(e) => setManagerShiftDraft((p) => ({ ...p, date: e.target.value }))} />
                  <label>Assign To</label>
                  <select
                    value={managerShiftDraft.assignedUserId}
                    onChange={(e) => setManagerShiftDraft((p) => ({ ...p, assignedUserId: Number(e.target.value) }))}
                  >
                    {state.users.map((user) => (
                      <option key={`u-${user.userId}`} value={user.userId}>
                        {user.name} ({user.role})
                      </option>
                    ))}
                  </select>
                  <label>Start</label>
                  <TimeField12h
                    value={managerShiftDraft.startTime}
                    onChange={(v) => setManagerShiftDraft((p) => ({ ...p, startTime: v }))}
                  />
                  <label>End</label>
                  <TimeField12h
                    value={managerShiftDraft.endTime}
                    onChange={(v) => setManagerShiftDraft((p) => ({ ...p, endTime: v }))}
                  />
                  <button onClick={handleAddManagerShift}>addShift()</button>
                </div>
              </div>

              <div className="card">
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={state.aiHandsOffMode}
                    onChange={() => setState((prev) => ({ ...prev, aiHandsOffMode: !prev.aiHandsOffMode }))}
                  />
                  AI Hands-Off Mode
                </label>
                <p>Auto-create shifts by required roles and time slots.</p>
                {state.aiHandsOffMode ? (
                  <div className="actions">
                    <input type="date" value={aiDate} onChange={(e) => setAiDate(e.target.value)} />
                    <button onClick={handleGenerateAI}>Generate AI Schedule</button>
                  </div>
                ) : null}
                {aiDate ? (
                  <p>
                    {getDailyOperationalStatus(state, aiDate).canOperate
                      ? "AI day coverage: operational"
                      : `AI day coverage: ${getDailyOperationalStatus(state, aiDate).message}`}
                  </p>
                ) : null}
              </div>

              <div className="card">
                <p><strong>Operational Status Check</strong></p>
                <div className="actions">
                  <input
                    type="date"
                    value={operationsCheckDate}
                    onChange={(e) => setOperationsCheckDate(e.target.value)}
                  />
                </div>
                {operationsCheckDate ? (
                  <p
                    style={{
                      color: getDailyOperationalStatus(state, operationsCheckDate).canOperate
                        ? "#15803d"
                        : "#b91c1c",
                    }}
                  >
                    {getDailyOperationalStatus(state, operationsCheckDate).message}
                  </p>
                ) : (
                  <p>Select a date to see if the business can operate.</p>
                )}
              </div>
            </div>
          </article>
        )}

        {isManager && (
          <article className="panel">
            <h2>Notifications</h2>
            <div className="list">
              {myNotifications.length === 0 ? <p>No notifications yet.</p> : null}
              {myNotifications.map((item) => (
                <div key={item.notificationId} className="card">
                  <p>{item.message}</p>
                  <small>{new Date(item.createdAt).toLocaleString()}</small>
                </div>
              ))}
            </div>
          </article>
        )}

        <article className="panel">
          <h2>{isManager ? "Manager Requests Queue" : "My Request History"}</h2>
          <div className="list">
            {isManager ? (
              <>
                {pendingRequests.length === 0 ? <p>No pending requests.</p> : null}
                {pendingRequests.map((row) => {
                  const { assignedBy, assignedTo } = assignmentLabels(state, row.shift!);
                  return (
                  <div key={row.request.requestID} className="card">
                    <p>
                      Shift {row.shift!.shiftId}: {row.shift!.date}{" "}
                      {formatTimeRange12h(row.shift!.startTime, row.shift!.endTime)}
                    </p>
                    <p>Assigned By: {assignedBy}</p>
                    <p>Assigned To: {assignedTo}</p>
                    <p>Requested by {row.requester!.name} to cover {row.poster!.name}</p>
                    <div className="actions">
                      <button onClick={() => handleReviewRequest(row.request.requestID, RequestStatus.APPROVED)}>approve()</button>
                      <button className="ghost" onClick={() => handleReviewRequest(row.request.requestID, RequestStatus.DENIED)}>deny()</button>
                    </div>
                  </div>
                );
                })}
              </>
            ) : (
              <>
                {state.shiftRequests.filter((item) => item.requesterId === selectedUser.userId).map((request) => {
                  const availableShift = state.availableShifts.find(
                    (a) => a.availableShiftId === request.availableShiftId,
                  );
                  const shiftForRequest = availableShift
                    ? state.shifts.find((s) => s.shiftId === availableShift.shiftId)
                    : undefined;
                  const { assignedBy, assignedTo } = shiftForRequest
                    ? assignmentLabels(state, shiftForRequest)
                    : { assignedBy: "—", assignedTo: "—" };
                  return (
                    <div key={request.requestID} className="card">
                      <p>Request #{request.requestID}</p>
                      <p>Status: {request.status}</p>
                      {shiftForRequest ? (
                        <p>
                          <strong>{shiftForRequest.date}</strong>{" "}
                          {formatTimeRange12h(shiftForRequest.startTime, shiftForRequest.endTime)}
                        </p>
                      ) : null}
                      <p>Assigned By: {assignedBy}</p>
                      <p>Assigned To: {assignedTo}</p>
                    </div>
                  );
                })}
                {state.shiftRequests.filter((item) => item.requesterId === selectedUser.userId).length === 0 ? <p>No requests yet.</p> : null}
              </>
            )}
          </div>
        </article>

        <article className="panel">
          <h2>{isManager ? "Schedule Controls" : "Notifications"}</h2>
          {isManager ? (
            <div className="list">
              <div className="card">
                <p><strong>Global baseline (default for all dates)</strong></p>
                <p className="hint">
                  Used whenever a date has no custom rules below. Edit here to change the business-wide
                  default hours and staffing minimums.
                </p>
                <div className="actions">
                  <label>Open</label>
                  <TimeField12h value={baselineOpenDraft} onChange={setBaselineOpenDraft} />
                  <label>Close</label>
                  <TimeField12h value={baselineCloseDraft} onChange={setBaselineCloseDraft} />
                  <label>Min Managers @ Open</label>
                  <input
                    type="number"
                    min={0}
                    value={baselineMinManagersDraft}
                    onChange={(e) => setBaselineMinManagersDraft(Number(e.target.value))}
                  />
                  <label>Minimum Employees To Stay Open</label>
                  <input
                    type="number"
                    min={0}
                    value={baselineMinEmployeesDraft}
                    onChange={(e) => setBaselineMinEmployeesDraft(Number(e.target.value))}
                  />
                </div>
                <button onClick={handleSaveGlobalBaseline}>Save global baseline</button>
              </div>

              <div className="card">
                <p><strong>Per-date overrides</strong></p>
                <p className="hint">
                  Pick a date on the calendar; open/close times and minimums apply to that day only. Other
                  dates follow the global baseline (
                  {formatTime12h(state.businessOpenTime)}–{formatTime12h(state.businessCloseTime)},{" "}
                  {state.minimumOpeningManagers} manager
                  {state.minimumOpeningManagers === 1 ? "" : "s"}, {state.minimumOpeningEmployees} employees).
                </p>
                <div className="actions">
                  <label>Date</label>
                  <input
                    type="date"
                    value={businessRulesDate}
                    onChange={(e) => setBusinessRulesDate(e.target.value)}
                  />
                  <label>Open</label>
                  <TimeField12h value={openTimeDraft} onChange={setOpenTimeDraft} />
                  <label>Close</label>
                  <TimeField12h value={closeTimeDraft} onChange={setCloseTimeDraft} />
                  <label>Min Managers @ Open</label>
                  <input
                    type="number"
                    min={0}
                    value={minimumOpeningManagersDraft}
                    onChange={(e) => setMinimumOpeningManagersDraft(Number(e.target.value))}
                  />
                  <label>Minimum Employees To Stay Open</label>
                  <input
                    type="number"
                    min={0}
                    value={minimumOpeningEmployeesDraft}
                    onChange={(e) => setMinimumOpeningEmployeesDraft(Number(e.target.value))}
                  />
                </div>
                <button onClick={handleSaveBusinessSettings}>Save for this date</button>
              </div>

              <p>Total schedules: {state.schedules.length}</p>
              <p>Published schedules: {state.schedules.filter((item) => isPublished(item)).length}</p>
              <p>Reviewed requests: {getReviewedRequests(state, selectedUser.userId).length}</p>
            </div>
          ) : (
            <div className="list">
              {myNotifications.length === 0 ? <p>No notifications yet.</p> : null}
              {myNotifications.map((item) => (
                <div key={item.notificationId} className="card">
                  <p>{item.message}</p>
                </div>
              ))}
            </div>
          )}
        </article>
      </section>
    </main>
  );
}

export default App;
