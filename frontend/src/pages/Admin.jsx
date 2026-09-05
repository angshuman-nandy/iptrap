import { Fragment, useState } from "react";
import JsonView from "../JsonView.jsx";

export default function Admin() {
  const [password, setPassword] = useState("");
  const [token, setToken] = useState(null);
  const [visits, setVisits] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(() => new Set());

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

  function toggleExpanded(id) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
              <th></th>
              <th>Time</th>
              <th>IP</th>
              <th>X-Forwarded-For</th>
              <th>Country</th>
              <th>Region</th>
              <th>City</th>
              <th>Zip</th>
              <th>Coordinates</th>
              <th>ISP</th>
              <th>Org</th>
              <th>ASN</th>
              <th>Language</th>
              <th>Referer</th>
              <th>User agent</th>
            </tr>
          </thead>
          <tbody>
            {visits.map((v) => {
              const isOpen = expanded.has(v.id);
              const hasCoords = v.geo_lat != null && v.geo_lon != null;
              return (
                <Fragment key={v.id}>
                  <tr>
                    <td>
                      <button
                        className="expand-btn"
                        onClick={() => toggleExpanded(v.id)}
                        title="Show raw request headers"
                      >
                        {isOpen ? "▾" : "▸"}
                      </button>
                    </td>
                    <td>{new Date(v.ts * 1000).toLocaleString()}</td>
                    <td>{v.ip}</td>
                    <td className="ellipsis">{v.forwarded_for}</td>
                    <td>{v.geo_country}</td>
                    <td>{v.geo_region}</td>
                    <td>{v.geo_city}</td>
                    <td>{v.geo_zip}</td>
                    <td>
                      {hasCoords ? (
                        <a
                          href={`https://www.google.com/maps?q=${v.geo_lat},${v.geo_lon}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {v.geo_lat.toFixed(2)}, {v.geo_lon.toFixed(2)}
                        </a>
                      ) : (
                        ""
                      )}
                    </td>
                    <td>{v.geo_isp}</td>
                    <td>{v.geo_org}</td>
                    <td>{v.geo_as}</td>
                    <td>{v.accept_language}</td>
                    <td className="ellipsis">{v.referer}</td>
                    <td className="ellipsis">{v.user_agent}</td>
                  </tr>
                  {isOpen && (
                    <tr className="detail-row">
                      <td colSpan={15}>
                        <JsonView data={JSON.parse(v.headers_json || "{}")} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
