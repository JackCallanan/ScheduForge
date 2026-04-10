import type { AppState, NewShiftInput, Shift, User } from "../domain/types";
import { RequestStatus } from "../domain/types";
import { getDailyOperationalStatus } from "../modules/SchedulingModule";
import { formatTime12h, formatTimeRange12h } from "../modules/moduleUtils";
import { TimeField12h } from "../components/TimeField12h";
import { useMemo, useState } from "react";

interface ManagerPageProps {
  state: AppState;
  selectedUser: User;
  error: string;
  dbSyncError: string | null;
  theme: "light" | "dark";
  employeeShiftViewDate: string;
  setEmployeeShiftViewDate: (date: string) => void;
  managerShiftViewDate: string;
  setManagerShiftViewDate: (date: string) => void;
  postReasonByShiftId: Record<number, string>;
  setPostReasonByShiftId: (reasons: Record<number, string>) => void;
  myShifts: Shift[];
  managerFilteredShifts: Shift[];
  openShiftRows: Array<{
    availableShift: any;
    shift: Shift | undefined;
    postedBy: User | undefined;
  }>;
  businessRulesDate: string;
  setBusinessRulesDate: (date: string) => void;
  openTimeDraft: string;
  setOpenTimeDraft: (time: string) => void;
  closeTimeDraft: string;
  setCloseTimeDraft: (time: string) => void;
  minimumOpeningManagersDraft: number;
  setMinimumOpeningManagersDraft: (value: number) => void;
  minimumOpeningEmployeesDraft: number;
  setMinimumOpeningEmployeesDraft: (value: number) => void;
  baselineOpenDraft: string;
  setBaselineOpenDraft: (time: string) => void;
  baselineCloseDraft: string;
  setBaselineCloseDraft: (time: string) => void;
  baselineMinManagersDraft: number;
  setBaselineMinManagersDraft: (value: number) => void;
  baselineMinEmployeesDraft: number;
  setBaselineMinEmployeesDraft: (value: number) => void;
  aiDate: string;
  setAiDate: (date: string) => void;
  operationsCheckDate: string;
  setOperationsCheckDate: (date: string) => void;
  managerShiftDraft: NewShiftInput;
  setManagerShiftDraft: (draft: NewShiftInput | ((prev: NewShiftInput) => NewShiftInput)) => void;
  managerSaveError: { text: string; at: "add-shift" | "ai-schedule" | "post-coverage" } | null;
  myNotifications: any[];
  pendingRequests: Array<{
    request: any;
    shift: Shift | undefined;
    requester: User | undefined;
    poster: User | undefined;
  }>;
  handlePostShift: (shiftId: number) => void;
  handleDeleteShift: (shiftId: number) => void;
  handleRequestToCover: (availableShiftId: number) => void;
  handleUnpostShift: (availableShiftId: number) => void;
  handleAddManagerShift: () => void;
  handleGenerateAI: () => void;
  handleSaveBusinessSettings: () => void;
  handleSaveGlobalBaseline: () => void;
  handleReviewRequest: (requestId: number, decision: typeof RequestStatus.APPROVED | typeof RequestStatus.DENIED) => void;
  handleLogout: () => void;
  setTheme: (theme: "light" | "dark") => void;
  logo: string;
  assignmentLabelsFunc: (state: AppState, shift: Shift) => { assignedBy: string; assignedTo: string };
}

/**
 * Render the manager page with scheduling controls and approvals.
 * @param props - Props used by the manager page.
 * @returns Manager page UI.
 */
export function ManagerPage({
  state,
  selectedUser,
  error,
  dbSyncError,
  theme,
  employeeShiftViewDate,
  setEmployeeShiftViewDate,
  managerShiftViewDate,
  setManagerShiftViewDate,
  postReasonByShiftId,
  setPostReasonByShiftId,
  myShifts,
  managerFilteredShifts,
  openShiftRows,
  businessRulesDate,
  setBusinessRulesDate,
  openTimeDraft,
  setOpenTimeDraft,
  closeTimeDraft,
  setCloseTimeDraft,
  minimumOpeningManagersDraft,
  setMinimumOpeningManagersDraft,
  minimumOpeningEmployeesDraft,
  setMinimumOpeningEmployeesDraft,
  baselineOpenDraft,
  setBaselineOpenDraft,
  baselineCloseDraft,
  setBaselineCloseDraft,
  baselineMinManagersDraft,
  setBaselineMinManagersDraft,
  baselineMinEmployeesDraft,
  setBaselineMinEmployeesDraft,
  aiDate,
  setAiDate,
  operationsCheckDate,
  setOperationsCheckDate,
  managerShiftDraft,
  setManagerShiftDraft,
  managerSaveError,
  myNotifications,
  pendingRequests,
  handlePostShift,
  handleDeleteShift,
  handleRequestToCover,
  handleUnpostShift,
  handleAddManagerShift,
  handleGenerateAI,
  handleSaveBusinessSettings,
  handleSaveGlobalBaseline,
  handleReviewRequest,
  handleLogout,
  setTheme,
  logo,
  assignmentLabelsFunc,
}: ManagerPageProps) {
  const [openEmployeeSections, setOpenEmployeeSections] = useState<Record<string, boolean>>({});

  const groupedShifts = useMemo(() => {
    const groups = managerFilteredShifts.reduce((acc, shift) => {
      const { assignedTo } = assignmentLabelsFunc(state, shift);
      if (!acc.has(assignedTo)) {
        acc.set(assignedTo, []);
      }
      acc.get(assignedTo)!.push(shift);
      return acc;
    }, new Map<string, Shift[]>());
    return groups;
  }, [managerFilteredShifts, state, assignmentLabelsFunc]);

  const toggleEmployeeSection = (employeeName: string) => {
    setOpenEmployeeSections(prev => ({
      ...prev,
      [employeeName]: !prev[employeeName]
    }));
  };

  return (
    <main className="app">
      <header className="topBar">
        <div className="brand">
          <img src={logo} alt="ScheduForge logo" />
          <div>
            <h1>ScheduForge</h1>
            <p className="topBar-tagline">Shift scheduling, simplified</p>
          </div>
        </div>
        <div className="loginPanel">
          <p>Signed in: {selectedUser.name} ({selectedUser.role})</p>
          <div className="topBar-actions">
            <button
              type="button"
              className="ghost themeToggle"
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
              aria-label={theme === "light" ? "Switch to dark theme" : "Switch to light theme"}
            >
              {theme === "light" ? "◐" : "◑"}
            </button>
            <button type="button" className="ghost" onClick={handleLogout}>
              Log Out
            </button>
          </div>
        </div>
      </header>

      {error ? <p className="error">{error}</p> : null}
      {dbSyncError ? <p className="error">{dbSyncError}</p> : null}

      <section className="grid">
        <article className="panel">
          <h2>All Assigned Shifts</h2>
          <div className="list">
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
              {managerShiftViewDate && (
                <span
                  className={
                    getDailyOperationalStatus(state, managerShiftViewDate).canOperate
                      ? "sf-status sf-status--ok"
                      : "sf-status sf-status--bad"
                  }
                >
                  {getDailyOperationalStatus(state, managerShiftViewDate).canOperate
                    ? "✓ Operational"
                    : "✗ Not Operational"}
                </span>
              )}
            </div>
            <div className="list-scroll--shifts">
              {Array.from(groupedShifts.entries()).map(([employeeName, shifts]) => {
                const isOpen = openEmployeeSections[employeeName] ?? false;
                return (
                  <div key={employeeName}>
                    <div
                      className="card employee-header"
                      onClick={() => toggleEmployeeSection(employeeName)}
                      style={{ cursor: 'pointer' }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <p style={{ margin: 0, fontWeight: 'bold' }}>
                          {employeeName} ({shifts.length} shift{shifts.length !== 1 ? 's' : ''})
                        </p>
                        <span style={{ fontSize: '1.2em', userSelect: 'none' }}>
                          {isOpen ? '▼' : '▶'}
                        </span>
                      </div>
                    </div>
                    {isOpen && shifts.map((shift) => {
                      const { assignedBy, assignedTo } = assignmentLabelsFunc(state, shift);
                      return (
                        <div key={shift.shiftId} className="card shift-card">
                          <p>
                            <strong>{shift.date}</strong> {formatTimeRange12h(shift.startTime, shift.endTime)}
                          </p>
                          <p>{shift.position}</p>
                          <p>Assigned By: {assignedBy}</p>
                          <p>Assigned To: {assignedTo}</p>
                          <div className="actions">
                            <button
                              type="button"
                              className="ghost danger"
                              onClick={() => handleDeleteShift(shift.shiftId)}
                            >
                              Delete shift
                            </button>
                          </div>
                        </div>
                      );
                    })}
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
              const { assignedBy, assignedTo } = assignmentLabelsFunc(state, row.shift!);
              return (
                <div key={row.availableShift.availableShiftId} className="card">
                  <p>
                    <strong>{row.shift!.date}</strong>{" "}
                    {formatTimeRange12h(row.shift!.startTime, row.shift!.endTime)}
                  </p>
                  <p>{row.shift!.position}</p>
                  <p>Assigned By: {assignedBy}</p>
                  <p>Assigned To: {assignedTo}</p>
                  <p>Posted by: {row.postedBy!.name}</p>
                  <p>Reason: {row.availableShift.reason}</p>
                  {row.postedBy!.userId !== selectedUser.userId ? (
                    <button onClick={() => handleRequestToCover(row.availableShift.availableShiftId)}>
                      Request to Cover
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

        <article className="panel">
          <h2>My Shifts</h2>
          {managerSaveError?.at === "post-coverage" ? (
            <p className="error inline-save-error" role="alert">
              {managerSaveError.text}
            </p>
          ) : null}
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
              const { assignedBy, assignedTo } = assignmentLabelsFunc(state, shift);
              return (
                <div key={shift.shiftId} className="card">
                  <p>
                    <strong>
                      {shift.date} {formatTimeRange12h(shift.startTime, shift.endTime)}
                    </strong>
                  </p>
                  <p>
                    {shift.position} @ {shift.location}
                  </p>
                  <p>Assigned By: {assignedBy}</p>
                  <p>Assigned To: {assignedTo}</p>
                  <textarea
                    placeholder="Reason for posting (required)"
                    value={postReasonByShiftId[shift.shiftId] ?? ""}
                    onChange={(e) =>
                      setPostReasonByShiftId({
                        ...postReasonByShiftId,
                        [shift.shiftId]: e.target.value,
                      })
                    }
                  />
                  <button onClick={() => handlePostShift(shift.shiftId)}>Post for Coverage</button>
                </div>
              );
            })}
            {myShifts.length === 0 && <p>No shifts assigned.</p>}
          </div>
        </article>

        <article className="panel">
          <h2>Shift Creation</h2>
          <div className="list">
            <div className="card">
              <p>
                <strong>Manager Shift Builder</strong>
              </p>
              <div className="actions">
                <label>Date</label>
                <input
                  type="date"
                  value={managerShiftDraft.date}
                  onChange={(e) => setManagerShiftDraft((p) => ({ ...p, date: e.target.value }))}
                />
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
                <button onClick={handleAddManagerShift}>Add Shift</button>
              </div>
              {managerSaveError?.at === "add-shift" ? (
                <p className="error inline-save-error" role="alert">
                  {managerSaveError.text}
                </p>
              ) : null}
            </div>

            <div className="card">
              <p>
                <strong>AI Hands-Off Mode</strong>
              </p>
              <p>Auto-create shifts by required roles and time slots.</p>
              <div className="actions">
                <input type="date" value={aiDate} onChange={(e) => setAiDate(e.target.value)} />
                <button onClick={handleGenerateAI}>Generate AI Schedule</button>
              </div>
              {managerSaveError?.at === "ai-schedule" ? (
                <p className="error inline-save-error" role="alert">
                  {managerSaveError.text}
                </p>
              ) : null}
            </div>

            <div className="card">
              <p>
                <strong>Operational Status Check</strong>
              </p>
              <div className="actions">
                <input
                  type="date"
                  value={operationsCheckDate}
                  onChange={(e) => setOperationsCheckDate(e.target.value)}
                />
              </div>
              {operationsCheckDate ? (
                <p
                  className={
                    getDailyOperationalStatus(state, operationsCheckDate).canOperate
                      ? "sf-status sf-status--ok"
                      : "sf-status sf-status--bad"
                  }
                >
                  {getDailyOperationalStatus(state, operationsCheckDate).message}
                </p>
              ) : (
                <p>Select a date to see if the business can operate.</p>
              )}
            </div>
          </div>
        </article>

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

        <article className="panel">
          <h2>Manager Requests Queue</h2>
          <div className="list">
            {pendingRequests.length === 0 ? <p>No pending requests.</p> : null}
            {pendingRequests.map((row) => {
              const { assignedBy, assignedTo } = assignmentLabelsFunc(state, row.shift!);
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
                    <button onClick={() => handleReviewRequest(row.request.requestID, RequestStatus.APPROVED)}>
                      Approve
                    </button>
                    <button
                      className="ghost"
                      onClick={() => handleReviewRequest(row.request.requestID, RequestStatus.DENIED)}
                    >
                      Deny
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </article>

        <article className="panel">
          <h2>Schedule Controls</h2>
          <div className="list">
            <div className="card">
              <p>
                <strong>Global baseline (default for all dates)</strong>
              </p>
              <p className="hint">
                Used whenever a date has no custom rules below. Edit here to change the business-wide default hours
                and staffing minimums.
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
              <p>
                <strong>Per-date overrides</strong>
              </p>
              <p className="hint">
                Pick a date on the calendar; open/close times and minimums apply to that day only. Other dates follow
                the global baseline ({formatTime12h(state.businessOpenTime)}–{formatTime12h(state.businessCloseTime)},{" "}
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
          </div>
        </article>
      </section>
    </main>
  );
}
