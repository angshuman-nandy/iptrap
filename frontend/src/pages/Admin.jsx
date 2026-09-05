import { useState } from "react";

export default function Admin() {
  const [password, setPassword] = useState("");
  const [token, setToken] = useState(null);
  const [visits, setVisits] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin/visits", {
        headers: { Authorization: `Bearer ${password}` },
      });
      if (res.status === 403) {
        setError("Wrong password.");
        return;
      }
      if (!res.ok) {
        setError(`Unexpected error (${res.status}).`);
        return;
      }
      const data = await res.json();
      setVisits(data);
      setToken(password);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="card">
        <h2>Admin</h2>
        <form onSubmit={handleLogin}>
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
          <button type="submit" disabled={loading}>
            {loading ? "Checking..." : "Log in"}
          </button>
        </form>
        {error && <p className="error">{error}</p>}
      </div>
    );
  }

  return (
    <div className="admin-wrap">
      <div className="admin-header">
        <h2>Logged visitors ({visits.length})</h2>
        <a
          className="button-link"
          href={`/api/admin/export.csv?token=${encodeURIComponent(token)}`}
        >
          Download CSV
        </a>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>IP</th>
              <th>Country</th>
              <th>Region</th>
              <th>City</th>
              <th>ISP</th>
              <th>User agent</th>
            </tr>
          </thead>
          <tbody>
            {visits.map((v) => (
              <tr key={v.id}>
                <td>{new Date(v.ts * 1000).toLocaleString()}</td>
                <td>{v.ip}</td>
                <td>{v.geo_country}</td>
                <td>{v.geo_region}</td>
                <td>{v.geo_city}</td>
                <td>{v.geo_isp}</td>
                <td className="ua">{v.user_agent}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
