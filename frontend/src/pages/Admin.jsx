import { Fragment, useMemo, useState } from "react";
import JsonView from "../JsonView.jsx";
import MapView from "../components/MapView.jsx";
import { VisitsOverTimeChart, RankedBarChart } from "../components/Charts.jsx";

const TOP_N = 6;

function rankedCounts(visits, field) {
  const counts = new Map();
  for (const v of visits) {
    const key = (v[field] || "").trim();
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, TOP_N).map(([name, count]) => ({ name, count }));
  const rest = sorted.slice(TOP_N).reduce((sum, [, c]) => sum + c, 0);
  if (rest > 0) top.push({ name: "Other", count: rest });
  return top;
}

function visitsByDay(visits) {
  const counts = new Map();
  for (const v of visits) {
    const d = new Date(v.ts * 1000);
    const key = d.toISOString().slice(0, 10);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .slice(-30)
    .map(([key, count]) => ({
      label: new Date(key).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      count,
    }));
}

const SEARCH_FIELDS = [
  "ip",
  "geo_country",
  "geo_region",
  "geo_city",
  "geo_isp",
  "geo_org",
  "user_agent",
  "referer",
];

const COLUMNS = [
  { key: "ts", label: "Time" },
  { key: "ip", label: "IP" },
  { key: "geo_country", label: "Country" },
  { key: "geo_city", label: "City" },
  { key: "geo_isp", label: "ISP" },
];

// Everything worth showing about one visit, as a single JSON object for
// JsonView: every column (including geo/location fields, which live
// alongside — not inside — headers_json) plus the parsed raw headers.
// Strips fields that only exist on synthetic rows (grouped `visits`).
function visitDetails(v) {
  const { headers_json, visits, ...rest } = v;
  return { ...rest, headers: JSON.parse(headers_json || "{}") };
}

// One row per unique IP: count + first/last seen, geo fields taken from
// the most recent visit from that IP. Keeps the same field names as a
// plain visit row (ts = last seen) so sorting/columns can treat both
// grouped and ungrouped rows the same way.
function groupByIp(visits) {
  const byIp = new Map();
  for (const v of visits) {
    if (!byIp.has(v.ip)) byIp.set(v.ip, []);
    byIp.get(v.ip).push(v);
  }
  return [...byIp.entries()].map(([ip, vs]) => {
    const byTsDesc = [...vs].sort((a, b) => b.ts - a.ts);
    const latest = byTsDesc[0];
    return {
      ...latest,
      ip,
      count: vs.length,
      firstSeen: Math.min(...vs.map((v) => v.ts)),
      visits: byTsDesc,
    };
  });
}

// A panel that can be collapsed to just its header. Remembers its state
// per-panel (via `id`) across reloads; collapsed panels don't render their
// (potentially heavy — chart/map) children at all.
function Panel({ id, title, children }) {
  const storageKey = `admin.panel.${id}.collapsed`;
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(storageKey) === "1";
    } catch {
      return false;
    }
  });

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(storageKey, next ? "1" : "0");
      } catch {
        // ignore (private browsing / storage disabled)
      }
      return next;
    });
  }

  return (
    <section className={`panel${collapsed ? " panel-collapsed" : ""}`}>
      <button type="button" className="panel-header" onClick={toggle}>
        <h3>{title}</h3>
        <span className="panel-toggle">{collapsed ? "▸" : "▾"}</span>
      </button>
      {!collapsed && <div className="panel-body">{children}</div>}
    </section>
  );
}

export default function Admin() {
  const [password, setPassword] = useState("");
  const [token, setToken] = useState(null);
  const [visits, setVisits] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState(() => new Set());
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("ts");
  const [sortDir, setSortDir] = useState("desc");
  const [grouped, setGrouped] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState(() => new Set());
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearPassword, setClearPassword] = useState("");
  const [clearError, setClearError] = useState("");
  const [clearing, setClearing] = useState(false);

  async function fetchVisits(pw) {
    const res = await fetch("/api/admin/visits", {
      headers: { Authorization: `Bearer ${pw}` },
    });
    if (res.status === 403) {
      const err = new Error("forbidden");
      err.forbidden = true;
      throw err;
    }
    if (!res.ok) throw new Error(`status ${res.status}`);
    return res.json();
  }

  async function handleLogin(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await fetchVisits(password);
      setVisits(data);
      setToken(password);
    } catch (err) {
      setError(err.forbidden ? "Wrong password." : "Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    setError("");
    try {
      const data = await fetchVisits(token);
      setVisits(data);
    } catch (err) {
      if (err.forbidden) {
        setToken(null);
        setError("Session no longer valid — please log in again.");
      } else {
        setError("Could not refresh — server unreachable.");
      }
    } finally {
      setRefreshing(false);
    }
  }

  function openClearConfirm() {
    setClearPassword("");
    setClearError("");
    setShowClearConfirm(true);
  }

  async function handleClearConfirm(e) {
    e.preventDefault();
    setClearing(true);
    setClearError("");
    try {
      const res = await fetch("/api/admin/clear", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${clearPassword}` },
      });
      if (res.status === 403) {
        setClearError("Wrong password.");
        return;
      }
      if (!res.ok) {
        setClearError(`Unexpected error (${res.status}).`);
        return;
      }
      setVisits([]);
      setSelectedId(null);
      setShowClearConfirm(false);
      setClearPassword("");
    } catch {
      setClearError("Could not reach the server.");
    } finally {
      setClearing(false);
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

  function toggleGroupExpanded(ip) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(ip)) next.delete(ip);
      else next.add(ip);
      return next;
    });
  }

  function toggleSort(key) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return visits;
    return visits.filter((v) =>
      SEARCH_FIELDS.some((f) => (v[f] || "").toLowerCase().includes(q))
    );
  }, [visits, search]);

  const displayRows = useMemo(
    () => (grouped ? groupByIp(filtered) : filtered),
    [filtered, grouped]
  );

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...displayRows].sort((a, b) => {
      const av = a[sortKey] ?? "";
      const bv = b[sortKey] ?? "";
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }, [displayRows, sortKey, sortDir]);

  // expand col + COLUMNS + (Visits, only when grouped) + Zip/Coordinates/Org/ASN/Language/Referer/User agent
  const colCount = 1 + COLUMNS.length + (grouped ? 1 : 0) + 7;

  const dayCounts = useMemo(() => visitsByDay(visits), [visits]);
  const topCountries = useMemo(() => rankedCounts(visits, "geo_country"), [visits]);
  const topIsps = useMemo(() => rankedCounts(visits, "geo_isp"), [visits]);

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
        <div className="admin-actions">
          <button onClick={handleRefresh} disabled={refreshing}>
            {refreshing ? "Refreshing..." : "↻ Refresh"}
          </button>
          <a
            className="button-link"
            href={`/api/admin/export.csv?token=${encodeURIComponent(token)}`}
          >
            Download CSV
          </a>
          <button className="button-danger" onClick={openClearConfirm}>
            Clear records
          </button>
        </div>
      </div>
      {error && <p className="error">{error}</p>}

      {showClearConfirm && (
        <div className="modal-overlay" onClick={() => setShowClearConfirm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Clear all records?</h3>
            <p>
              This permanently deletes all {visits.length} captured visit
              {visits.length === 1 ? "" : "s"}. Re-enter the admin password to confirm.
            </p>
            <form onSubmit={handleClearConfirm}>
              <input
                type="password"
                placeholder="Password"
                value={clearPassword}
                onChange={(e) => setClearPassword(e.target.value)}
                autoFocus
              />
              <div className="modal-actions">
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => setShowClearConfirm(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="button-danger" disabled={clearing}>
                  {clearing ? "Clearing..." : "Delete all records"}
                </button>
              </div>
            </form>
            {clearError && <p className="error">{clearError}</p>}
          </div>
        </div>
      )}

      <div className="analytics-grid">
        <Panel id="visits-per-day" title="Visits per day">
          <VisitsOverTimeChart data={dayCounts} />
        </Panel>
        <Panel id="top-countries" title="Top countries">
          <RankedBarChart data={topCountries} color="#3987e5" />
        </Panel>
        <Panel id="top-isps" title="Top ISPs">
          <RankedBarChart data={topIsps} color="#d95926" />
        </Panel>
      </div>

      <Panel id="map" title="Map">
        <MapView visits={visits} selectedId={selectedId} onSelect={setSelectedId} />
      </Panel>

      <div className="list-controls">
        <input
          type="text"
          className="search-input"
          placeholder="Search IP, country, city, ISP, user agent, referer..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label className="group-toggle">
          <input
            type="checkbox"
            checked={grouped}
            onChange={(e) => setGrouped(e.target.checked)}
          />
          Group by IP
        </label>
        <span className="result-count">
          {grouped
            ? `${sorted.length} unique IP${sorted.length === 1 ? "" : "s"} (${filtered.length} visits)`
            : `${sorted.length} of ${visits.length}`}
        </span>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th></th>
              {COLUMNS.map((c) => (
                <th key={c.key} className="sortable" onClick={() => toggleSort(c.key)}>
                  {c.label}
                  {sortKey === c.key && (sortDir === "asc" ? " ▲" : " ▼")}
                </th>
              ))}
              {grouped && (
                <th className="sortable" onClick={() => toggleSort("count")}>
                  Visits
                  {sortKey === "count" && (sortDir === "asc" ? " ▲" : " ▼")}
                </th>
              )}
              <th className="col-extra">Zip</th>
              <th className="col-extra">Coordinates</th>
              <th className="col-extra">Org</th>
              <th className="col-extra">ASN</th>
              <th className="col-extra">Language</th>
              <th className="col-extra">Referer</th>
              <th className="col-extra">User agent</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((v) =>
              grouped ? (
                <GroupRow
                  key={v.ip}
                  group={v}
                  isOpen={expandedGroups.has(v.ip)}
                  onToggle={() => toggleGroupExpanded(v.ip)}
                  expanded={expanded}
                  onToggleVisit={toggleExpanded}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  colCount={colCount}
                />
              ) : (
                <VisitRow
                  key={v.id}
                  v={v}
                  isOpen={expanded.has(v.id)}
                  onToggle={() => toggleExpanded(v.id)}
                  isSelected={v.id === selectedId}
                  onSelect={() => setSelectedId(v.id)}
                  colSpan={colCount}
                />
              )
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// A single visit's row + its optional raw-headers detail row. `showCount`
// renders the "Visits" cell used when this row sits inside an expanded
// group (grouped mode); standalone rows in ungrouped mode omit it since
// there's no "Visits" column in that mode.
function VisitRow({ v, isOpen, onToggle, isSelected, onSelect, colSpan }) {
  const hasCoords = v.geo_lat != null && v.geo_lon != null;
  return (
    <Fragment>
      <tr className={isSelected ? "row-selected" : ""} onClick={onSelect}>
        <td>
          <button
            className="expand-btn"
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            title="Show raw request headers"
          >
            {isOpen ? "▾" : "▸"}
          </button>
        </td>
        <td>{new Date(v.ts * 1000).toLocaleString()}</td>
        <td>{v.ip}</td>
        <td>{v.geo_country}</td>
        <td>{v.geo_city}</td>
        <td>{v.geo_isp}</td>
        <td className="col-extra">{v.geo_zip}</td>
        <td className="col-extra">
          {hasCoords ? (
            <a
              href={`https://www.google.com/maps?q=${v.geo_lat},${v.geo_lon}`}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
            >
              {v.geo_lat.toFixed(2)}, {v.geo_lon.toFixed(2)}
            </a>
          ) : (
            ""
          )}
        </td>
        <td className="col-extra">{v.geo_org}</td>
        <td className="col-extra">{v.geo_as}</td>
        <td className="col-extra">{v.accept_language}</td>
        <td className="col-extra ellipsis">{v.referer}</td>
        <td className="col-extra ellipsis">{v.user_agent}</td>
      </tr>
      {isOpen && (
        <tr className="detail-row">
          <td colSpan={colSpan}>
            <JsonView data={visitDetails(v)} />
          </td>
        </tr>
      )}
    </Fragment>
  );
}

// One row per unique IP. Expanding it reveals every individual visit from
// that IP as its own nested mini-table, each still able to show its raw
// headers via the same expand mechanism as ungrouped mode.
function GroupRow({ group, isOpen, onToggle, expanded, onToggleVisit, selectedId, onSelect, colCount }) {
  const hasCoords = group.geo_lat != null && group.geo_lon != null;
  return (
    <Fragment>
      <tr className={group.id === selectedId ? "row-selected" : ""} onClick={() => onSelect(group.id)}>
        <td>
          <button
            className="expand-btn"
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            title="Show individual visits from this IP"
          >
            {isOpen ? "▾" : "▸"}
          </button>
        </td>
        <td>{new Date(group.ts * 1000).toLocaleString()}</td>
        <td>{group.ip}</td>
        <td>{group.geo_country}</td>
        <td>{group.geo_city}</td>
        <td>{group.geo_isp}</td>
        <td>{group.count}</td>
        <td className="col-extra">{group.geo_zip}</td>
        <td className="col-extra">
          {hasCoords ? (
            <a
              href={`https://www.google.com/maps?q=${group.geo_lat},${group.geo_lon}`}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
            >
              {group.geo_lat.toFixed(2)}, {group.geo_lon.toFixed(2)}
            </a>
          ) : (
            ""
          )}
        </td>
        <td className="col-extra">{group.geo_org}</td>
        <td className="col-extra">{group.geo_as}</td>
        <td className="col-extra">{group.accept_language}</td>
        <td className="col-extra ellipsis">{group.referer}</td>
        <td className="col-extra ellipsis">{group.user_agent}</td>
      </tr>
      {isOpen && (
        <tr className="detail-row">
          <td colSpan={colCount}>
            <div className="nested-visits">
              {group.visits.map((v) => (
                <VisitRowNested
                  key={v.id}
                  v={v}
                  isOpen={expanded.has(v.id)}
                  onToggle={() => onToggleVisit(v.id)}
                />
              ))}
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  );
}

function VisitRowNested({ v, isOpen, onToggle }) {
  return (
    <div className="nested-visit">
      <div className="nested-visit-row" onClick={onToggle}>
        <button className="expand-btn" title="Show raw request headers">
          {isOpen ? "▾" : "▸"}
        </button>
        <span>{new Date(v.ts * 1000).toLocaleString()}</span>
      </div>
      {isOpen && <JsonView data={visitDetails(v)} />}
    </div>
  );
}
