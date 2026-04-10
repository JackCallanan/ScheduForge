import type { UserRole } from "../domain/types";

interface LoginPageProps {
  authMode: "login" | "signup";
  setAuthMode: (mode: "login" | "signup") => void;
  loginEmail: string;
  setLoginEmail: (email: string) => void;
  loginPassword: string;
  setLoginPassword: (password: string) => void;
  signupForm: {
    name: string;
    email: string;
    password: string;
    role: UserRole;
  };
  setSignupForm: (form: any) => void;
  error: string;
  dbSyncError: string | null;
  handleLogin: () => void;
  handleSignUp: () => void;
  handleResetDatabase: () => Promise<void>;
  theme: "light" | "dark";
  setTheme: (theme: "light" | "dark") => void;
}

export function LoginPage({
  authMode,
  setAuthMode,
  loginEmail,
  setLoginEmail,
  loginPassword,
  setLoginPassword,
  signupForm,
  setSignupForm,
  error,
  dbSyncError,
  handleLogin,
  handleSignUp,
  handleResetDatabase,
  theme,
  setTheme,
}: LoginPageProps) {
  return (
    <main className="app authPage">
      <section className="panel authCard">
        <h1>ScheduForge Login</h1>
        <p>Create an account or sign in.</p>
        {error ? <p className="error">{error}</p> : null}
        {dbSyncError ? <p className="error">{dbSyncError}</p> : null}
        <div className="actions">
          <select value={authMode} onChange={(e) => setAuthMode(e.target.value as "login" | "signup")}>
            <option value="login">Log In</option>
            <option value="signup">Sign Up</option>
          </select>
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
            <input value={signupForm.name} onChange={(e) => setSignupForm((p: any) => ({ ...p, name: e.target.value }))} />
            <label>Email</label>
            <input value={signupForm.email} onChange={(e) => setSignupForm((p: any) => ({ ...p, email: e.target.value }))} />
            <label>Role</label>
            <select value={signupForm.role} onChange={(e) => setSignupForm((p: any) => ({ ...p, role: e.target.value as UserRole }))}>
              <option value="Employee">Employee</option>
              <option value="Manager">Manager</option>
            </select>
            <label>Password</label>
            <input type="password" value={signupForm.password} onChange={(e) => setSignupForm((p: any) => ({ ...p, password: e.target.value }))} />
            <button onClick={handleSignUp}>Create Account</button>
          </>
        )}
        <button className="ghost" type="button" onClick={() => setTheme(theme === "light" ? "dark" : "light")}>
          {theme === "light" ? "Dark mode" : "Light mode"}
        </button>
        <button className="ghost" type="button" onClick={() => void handleResetDatabase()}>
          Reset Database
        </button>
      </section>
    </main>
  );
}
