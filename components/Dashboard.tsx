import React, { useState, useEffect } from "react";
import { Card, CardTitle } from "@/components/ui/card";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

interface DrilldownRow {
  item_id: string | number;
  ad_spend: string | number;
  ad_sales: string | number;
  impressions: string | number;
  clicks: string | number;
  units_sold: string | number;
  roas: string | number;
  eligibility: boolean;
}

function KpiCard({ label, value, unit, color, icon }: { label: string; value: string | number; unit?: string; color: string; icon: React.ReactNode }) {
  return (
    <div className="relative bg-white rounded-2xl shadow-md border border-gray-100 flex flex-col items-start justify-center px-8 py-6 min-h-[120px] group hover:shadow-xl transition-shadow duration-300">
      <div className="absolute left-0 top-0 h-full w-1.5 rounded-l-2xl" style={{ background: color }} />
      <div className="flex items-center gap-3 mb-2">
        <span className="text-2xl" style={{ color }}>{icon}</span>
        <span className="text-gray-500 text-xs font-semibold uppercase tracking-wider">{label}</span>
      </div>
      <div className="flex items-end gap-2">
        <span className="text-3xl font-extrabold text-gray-900">{value}</span>
        <span className="text-3xl font-medium text-gray-400 ">{unit}</span>
      </div>
    </div>
  );
}

function colorByROAS(roas: number) {
  if (roas >= 2) return "#10b981"; // green
  if (roas >= 1) return "#6366f1"; // blue
  return "#f43f5e"; // red
}

function DrilldownTable({ data }: { data: DrilldownRow[] }) {
  const [search, setSearch] = useState("");
  const [showLowROAS, setShowLowROAS] = useState(false);
  const [showEligible, setShowEligible] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const filtered = data.filter((row) => {
    if (showLowROAS && Number(row.roas) >= 1) return false;
    if (showEligible && !row.eligibility) return false;
    if (search && !String(row.item_id).includes(search)) return false;
    return true;
  });

  const totalPages = Math.ceil(filtered.length / pageSize);
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <Card className="rounded-2xl shadow-md border border-gray-100 p-10 mt-8">
      <CardTitle className="text-2xl font-bold text-gray-900 mb-4">Product Drill-down</CardTitle>
      <div className="flex flex-wrap gap-4 mb-4 items-center">
        <input
          className="border rounded px-3 py-1 text-sm"
          placeholder="Search Item ID..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showLowROAS} onChange={e => { setShowLowROAS(e.target.checked); setPage(1); }} /> Show low ROAS
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showEligible} onChange={e => { setShowEligible(e.target.checked); setPage(1); }} /> Only Eligible
        </label>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item ID</TableHead>
              <TableHead>Ad Spend</TableHead>
              <TableHead>Ad Sales</TableHead>
              <TableHead>Impressions</TableHead>
              <TableHead>Clicks</TableHead>
              <TableHead>Units Sold</TableHead>
              <TableHead>ROAS</TableHead>
              <TableHead>Eligibility</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginated.map((row, i) => (
              <TableRow key={row.item_id} className={i % 2 ? "bg-slate-50" : ""}>
                <TableCell className="font-mono">{row.item_id}</TableCell>
                <TableCell>${Number(row.ad_spend).toLocaleString()}</TableCell>
                <TableCell>${Number(row.ad_sales).toLocaleString()}</TableCell>
                <TableCell>{row.impressions}</TableCell>
                <TableCell>{row.clicks}</TableCell>
                <TableCell>{row.units_sold}</TableCell>
                <TableCell className="font-bold" style={{ color: colorByROAS(Number(row.roas)) }}>{Number(row.roas).toFixed(2)}</TableCell>
                <TableCell>{row.eligibility ? "✔️" : "❌"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {/* Pagination Controls */}
      <div className="flex justify-between items-center mt-4">
        <span className="text-xs text-gray-500">
          Showing {filtered.length === 0 ? 0 : (page - 1) * pageSize + 1}-{Math.min(page * pageSize, filtered.length)} of {filtered.length}
        </span>
        <div className="flex gap-2">
          <button
            className="px-2 py-1 rounded bg-blue-100 text-blue-700 disabled:opacity-50"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            Previous
          </button>
          <span className="text-xs text-gray-700">Page {page} of {totalPages}</span>
          <button
            className="px-2 py-1 rounded bg-blue-100 text-blue-700 disabled:opacity-50"
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
          >
            Next
          </button>
        </div>
      </div>
    </Card>
  );
}

interface DashboardData {
  kpis: {
    totalSales: number | string;
    totalAdSales: number | string;
    totalAdSpend: number | string;
    roas: number | string;
    netProfit: number | string;
  };
  salesAdTime: Array<Record<string, unknown>>;
  topProductsByROAS: DrilldownRow[];
  topProductsBySales: Array<{ item_id: string | number; total_sales: string | number }>;
  bottomProductsByROAS: DrilldownRow[];
  eligibility: {
    counts: Array<{ eligibility: boolean; count: number }>;
    topMessage: string | null;
  };
  adPerfByWeek: Array<Record<string, unknown>>;
  drilldown: DrilldownRow[];
}

export function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch("/api/dashboard-data")
      .then((res) => res.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load dashboard data");
        setLoading(false);
      });
  }, []);

  if (loading) return <div className="text-center py-20 text-lg text-blue-700">Loading dashboard…</div>;
  if (error) return <div className="text-center py-20 text-lg text-red-600">{error}</div>;
  if (!data) return null;

  return (
    <div className="w-full min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 py-8 px-2 md:px-8 flex flex-col gap-12">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-8 mb-2">
        <KpiCard
          label="Total Sales"
          value={Number(data.kpis.totalSales).toLocaleString()}
          unit="$"
          color="#6366f1"
          icon={
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" />
              <path d="M3 10h18" stroke="currentColor" />
              <path d="M8 15h.01M12 15h.01M16 15h.01" stroke="currentColor" strokeLinecap="round" />
            </svg>
          }
        />
        <KpiCard
          label="Total Ad Sales"
          value={Number(data.kpis.totalAdSales).toLocaleString()}
          unit="$"
          color="#a5b4fc"
          icon={
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path d="M4 17V7a2 2 0 0 1 2-2h12" stroke="currentColor" />
              <path d="M20 17V7a2 2 0 0 0-2-2H6" stroke="currentColor" />
              <path d="M8 13l3 3 5-5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          }
        />
        <KpiCard
          label="Total Ad Spend"
          value={Number(data.kpis.totalAdSpend).toLocaleString()}
          unit="$"
          color="#f59e42"
          icon={
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <rect x="4" y="4" width="16" height="16" rx="2" stroke="currentColor" />
              <path d="M8 12h8" stroke="currentColor" strokeLinecap="round" />
              <path d="M12 8v8" stroke="currentColor" strokeLinecap="round" />
            </svg>
          }
        />
        <KpiCard
          label="ROAS"
          value={Number(data.kpis.roas).toFixed(2)}
          color={colorByROAS(Number(data.kpis.roas))}
          icon={
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <rect x="4" y="4" width="16" height="16" rx="2" stroke="currentColor" />
              <path d="M8 16v-4m4 4V8m4 8v-2" stroke="currentColor" strokeLinecap="round" />
            </svg>
          }
        />
        <KpiCard
          label="Net Profit"
          value={Number(data.kpis.netProfit).toLocaleString()}
          unit="$"
          color="#10b981"
          icon={
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="9" stroke="currentColor" />
              <path d="M8 13l3 3 5-5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          }
        />
      </div>
      {/* Compact Charts Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {/* Sales & Ad Spend Over Time */}
        <Card className="rounded-2xl shadow-lg border-0 bg-white/95 p-4 col-span-1">
          <CardTitle className="text-base font-bold text-blue-900 mb-2">Sales & Ad Spend Over Time</CardTitle>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data.salesAdTime} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e0e7ff" />
              <XAxis dataKey="week" tickFormatter={d => d?.slice(0, 10)} stroke="#6366f1" />
              <YAxis stroke="#6366f1" />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="total_sales" stroke="#6366f1" name="Total Sales" strokeWidth={2} />
              <Line type="monotone" dataKey="ad_sales" stroke="#a5b4fc" name="Ad Sales" strokeWidth={2} />
              <Line type="monotone" dataKey="ad_spend" stroke="#f59e42" name="Ad Spend" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
        {/* Top 10 Products by ROAS */}
        <Card className="rounded-2xl shadow-lg border-0 bg-white/95 p-4 col-span-1">
          <CardTitle className="text-base font-bold text-blue-900 mb-2">Top 10 Products by ROAS</CardTitle>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.topProductsByROAS} layout="vertical" margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e0e7ff" />
              <XAxis type="number" />
              <YAxis dataKey="item_id" type="category" />
              <Tooltip />
              <Legend />
              <Bar dataKey="roas" name="ROAS">
                {(data.topProductsByROAS as DrilldownRow[]).map((entry) => (
                  <Cell key={entry.item_id} fill={colorByROAS(Number(entry.roas))} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
        {/* Top 10 Products by Sales */}
        <Card className="rounded-2xl shadow-lg border-0 bg-white/95 p-4 col-span-1">
          <CardTitle className="text-base font-bold text-blue-900 mb-2">Top 10 Products by Sales</CardTitle>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.topProductsBySales} layout="vertical" margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e0e7ff" />
              <XAxis type="number" />
              <YAxis dataKey="item_id" type="category" />
              <Tooltip />
              <Legend />
              <Bar dataKey="total_sales" name="Total Sales" fill="#6366f1" />
            </BarChart>
          </ResponsiveContainer>
        </Card>     
       
      </div>
      {/* Drill-down Table */}
      <DrilldownTable data={data.drilldown} />
    </div>
  );
} 