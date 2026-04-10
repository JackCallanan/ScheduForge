import type { AppState, Shift, User } from "../domain/types";
import { formatTimeRange12h } from "../modules/moduleUtils";

interface EmployeePageProps {
  state: AppState;
  selectedUser: User;
  error: string;
  dbSyncError: string | null;
  theme: "light" | "dark";
  employeeShiftViewDate: string;
  setEmployeeShiftViewDate: (date: string) => void;
  postReasonByShiftId: Record<number, string>;
  setPostReasonByShiftId: (reasons: Record<number, string>) => void;
  myShifts: Shift[];
  openShiftRows: Array<{
    availableShift: any;
    shift: Shift | undefined;
    postedBy: User | undefined;
  }>;
  handlePostShift: (shiftId: number) => void;
  handleRequestToCover: (availableShiftId: number) => void;
  handleUnpostShift: (availableShiftId: number) => void;
  handleLogout: () => void;
  setTheme: (theme: "light" | "dark") => void;
  logo: string;
  myNotifications: any[];
  assignmentLabelsFunc: (state: AppState, shift: Shift) => { assignedBy: string; assignedTo: string };
}

/**
 * Render the employee-facing schedule page.
 * @param props - Props required to show employee schedule and actions.
 * @returns Employee page UI.
 */
export function EmployeePage({
  state,
  selectedUser,
  error,
  dbSyncError,
  theme,
  employeeShiftViewDate,
  setEmployeeShiftViewDate,
  postReasonByShiftId,
  setPostReasonByShiftId,
  myShifts,
  openShiftRows,
  handlePostShift,
  handleRequestToCover,
  handleUnpostShift,
  handleLogout,
  setTheme,
  logo,
  myNotifications,
  assignmentLabelsFunc,
}: EmployeePageProps) {
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
          <h2>My Schedule</h2>
          <div className="list">
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
            <div>
              {myShifts.map((shift) => {
                const isMine = selectedUser != null && shift.assignedUserId === selectedUser.userId;
                const { assignedBy, assignedTo } = assignmentLabelsFunc(state, shift);
                return (
                  <div key={shift.shiftId} className="card">
                    <p>
                      <strong>{shift.date}</strong> {formatTimeRange12h(shift.startTime, shift.endTime)}
                    </p>
                    <p>{shift.position}</p>
                    <p>Assigned By: {assignedBy}</p>
                    <p>Assigned To: {assignedTo}</p>
                    {isMine ? (
                      <div className="actions">
                        <input
                          placeholder="Reason for coverage"
                          value={postReasonByShiftId[shift.shiftId] ?? ""}
                          onChange={(event) =>
                            setPostReasonByShiftId({
                              ...postReasonByShiftId,
                              [shift.shiftId]: event.target.value,
                            })
                          }
                        />
                        <button onClick={() => handlePostShift(shift.shiftId)}>Post Shift</button>
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
          <h2>My Request History</h2>
          <div className="list">
            {state.shiftRequests.filter((item) => item.requesterId === selectedUser.userId).map((request) => {
              const availableShift = state.availableShifts.find(
                (a) => a.availableShiftId === request.availableShiftId,
              );
              const shiftForRequest = availableShift
                ? state.shifts.find((s) => s.shiftId === availableShift.shiftId)
                : undefined;
              const { assignedBy, assignedTo } = shiftForRequest
                ? assignmentLabelsFunc(state, shiftForRequest)
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
            {state.shiftRequests.filter((item) => item.requesterId === selectedUser.userId).length === 0 ? (
              <p>No requests yet.</p>
            ) : null}
          </div>
        </article>

        <article className="panel">
          <h2>Notifications</h2>
          <div className="list">
            {myNotifications.length === 0 ? <p>No notifications yet.</p> : null}
            {myNotifications.map((item) => (
              <div key={item.notificationId} className="card">
                <p>{item.message}</p>
              </div>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}
