import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../state/AuthContext";

export default function ProfilePage() {
  const { teacher, refreshTeacher } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(teacher?.name || "");
    setEmail(teacher?.email || "");
  }, [teacher]);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setStatus("");
    setSaving(true);
    try {
      await api("/me", {
        method: "PUT",
        body: JSON.stringify({ name, email, password }),
      });
      setPassword("");
      await refreshTeacher();
      setStatus("Profile updated.");
    } catch (e: any) {
      setStatus(e.message || "Failed to update profile.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="profile-head">
        <h2>Profile</h2>
        <p className="muted">Update your account details and keep your profile current.</p>
      </div>

      <section className="panel profile-card">
        <div className="profile-banner">
          <div className="profile-avatar">{(name || teacher?.name || "T").charAt(0).toUpperCase()}</div>
          <div>
            <h3>{name || teacher?.name || "Teacher"}</h3>
            <p>{email || teacher?.email || ""}</p>
          </div>
        </div>

        <form className="profile-form" onSubmit={saveProfile}>
          <div className="profile-grid">
            <label>
              Full Name
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <label>
              Email Address
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
          </div>

          <label>
            New Password (optional)
            <input
              type="password"
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Leave blank to keep current password"
            />
          </label>

          <div className="profile-actions">
            <button className="btn" type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save Profile"}
            </button>
          </div>
        </form>

        {!!status && <p className="profile-status">{status}</p>}
      </section>
    </div>
  );
}
