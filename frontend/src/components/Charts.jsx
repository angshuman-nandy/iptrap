import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const GRID = "#2c2c2a";
const AXIS = "#383835";
const MUTED = "#898781";
const TOOLTIP_BG = "#1a1a19";
const TOOLTIP_BORDER = "rgba(255,255,255,0.10)";

const tickStyle = { fill: MUTED, fontSize: 12 };

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-label">{label}</div>
      <div className="chart-tooltip-value">{payload[0].value.toLocaleString()}</div>
    </div>
  );
}

export function VisitsOverTimeChart({ data }) {
  if (data.length === 0) return <div className="map-empty">No visits yet.</div>;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis
          dataKey="label"
          tick={tickStyle}
          axisLine={{ stroke: AXIS }}
          tickLine={false}
        />
        <YAxis
          tick={tickStyle}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
          width={32}
        />
        <Tooltip
          cursor={{ fill: "rgba(255,255,255,0.04)" }}
          content={<ChartTooltip />}
          wrapperStyle={{ outline: "none" }}
        />
        <Bar dataKey="count" fill="#3987e5" radius={[4, 4, 0, 0]} maxBarSize={36} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function RankedBarChart({ data, color = "#d95926" }) {
  if (data.length === 0) return <div className="map-empty">No data yet.</div>;
  const height = Math.max(120, data.length * 34);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
      >
        <CartesianGrid horizontal={false} stroke={GRID} />
        <XAxis
          type="number"
          tick={tickStyle}
          axisLine={{ stroke: AXIS }}
          tickLine={false}
          allowDecimals={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          tick={tickStyle}
          axisLine={false}
          tickLine={false}
          width={110}
        />
        <Tooltip
          cursor={{ fill: "rgba(255,255,255,0.04)" }}
          content={<ChartTooltip />}
          wrapperStyle={{ outline: "none" }}
        />
        <Bar dataKey="count" fill={color} radius={[0, 4, 4, 0]} maxBarSize={20} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export const tooltipStyleVars = { TOOLTIP_BG, TOOLTIP_BORDER };
