import React, { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ChartContainer } from "@/components/ui/chart";
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
} from "recharts";

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="rounded-2xl shadow-lg border-0 bg-white/95 hover:shadow-2xl transition-shadow duration-300">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-bold text-blue-900 flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-gradient-to-br from-blue-400 to-purple-400 mr-2"></span>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 pb-4">{children}</CardContent>
    </Card>
  );
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
        <span className="text-4xl font-extrabold text-gray-900">{value}</span>
        {unit && <span className="text-lg font-medium text-gray-400 mb-1">{unit}</span>}
      </div>
    </div>
  );
}

export function Dashboard() {
  const [data, setData] = useState<any>(null);
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
      .catch((e) => {
        setError("Failed to load dashboard data");
        setLoading(false);
      });
  }, []);

  return (
    <div className="w-full min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 py-8 px-2 md:px-8 flex flex-col gap-12">
      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-2">
        <KpiCard
          label="Total Sales"
          value={data?.kpis?.totalSales ? Number(data.kpis.totalSales).toLocaleString() : "-"}
          unit="$"
          color="linear-gradient(135deg, #6366f1 60%, #a5b4fc 100%)"
          icon={<svg width="28" height="28" fill="none" viewBox="0 0 24 24"><path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
        />
        <KpiCard
          label="Total Ad Spend"
          value={data?.kpis?.totalAdSpend ? Number(data.kpis.totalAdSpend).toLocaleString() : "-"}
          unit="$"
          color="linear-gradient(135deg, #f59e42 60%, #fbbf24 100%)"
          icon={<svg width="28" height="28" fill="none" viewBox="0 0 24 24"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
        />
        <KpiCard
          label="Avg. Eligibility"
          value={data?.kpis?.avgEligibility ? (Number(data.kpis.avgEligibility) * 100).toFixed(1) : "-"}
          unit="%"
          color="linear-gradient(135deg, #10b981 60%, #6ee7b7 100%)"
          icon={<svg width="28" height="28" fill="none" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
        />
      </div>
      <div className="border-b border-blue-200/40 my-2" />
      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
        <ChartCard title="Sales Overview (Weekly)">
          <ChartContainer config={{}}>
            {loading ? (
              <div className="text-muted-foreground">Loading…</div>
            ) : error ? (
              <div className="text-destructive">{error}</div>
            ) : data && data.salesByWeek ? (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={data.salesByWeek} margin={{ top: 16, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e0e7ff" />
                  <XAxis dataKey="week" tickFormatter={d => d?.slice(0, 10)} stroke="#6366f1" />
                  <YAxis stroke="#6366f1" />
                  <Tooltip contentStyle={{ background: '#f1f5f9', borderRadius: 8, border: '1px solid #a5b4fc' }} />
                  <Legend />
                  <Line type="monotone" dataKey="total_sales" stroke="#6366f1" name="Total Sales" strokeWidth={3} dot={{ r: 5, fill: '#6366f1' }} />
                  <Line type="monotone" dataKey="total_units" stroke="#10b981" name="Total Units" strokeWidth={3} dot={{ r: 5, fill: '#10b981' }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <></>
            )}
          </ChartContainer>
        </ChartCard>
        <ChartCard title="Top 5 Products by Sales">
          <ChartContainer config={{}}>
            {loading ? (
              <div className="text-muted-foreground">Loading…</div>
            ) : error ? (
              <div className="text-destructive">{error}</div>
            ) : data && data.topProducts ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={data.topProducts} layout="vertical" margin={{ top: 16, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e0e7ff" />
                  <XAxis type="number" stroke="#6366f1" />
                  <YAxis dataKey="item_id" type="category" stroke="#6366f1" />
                  <Tooltip contentStyle={{ background: '#f1f5f9', borderRadius: 8, border: '1px solid #a5b4fc' }} />
                  <Legend />
                  <Bar dataKey="total_sales" fill="#6366f1" name="Total Sales" radius={[8, 8, 8, 8]} />
                  <Bar dataKey="total_units" fill="#10b981" name="Total Units" radius={[8, 8, 8, 8]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <></>
            )}
          </ChartContainer>
        </ChartCard>
        <ChartCard title="Ad Performance (Weekly)">
          <ChartContainer config={{}}>
            {loading ? (
              <div className="text-muted-foreground">Loading…</div>
            ) : error ? (
              <div className="text-destructive">{error}</div>
            ) : data && data.adByWeek ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={data.adByWeek} margin={{ top: 16, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e0e7ff" />
                  <XAxis dataKey="week" tickFormatter={d => d?.slice(0, 10)} stroke="#6366f1" />
                  <YAxis stroke="#6366f1" />
                  <Tooltip contentStyle={{ background: '#f1f5f9', borderRadius: 8, border: '1px solid #a5b4fc' }} />
                  <Legend />
                  <Bar dataKey="ad_sales" fill="#6366f1" name="Ad Sales" radius={[8, 8, 8, 8]} />
                  <Bar dataKey="ad_spend" fill="#f59e42" name="Ad Spend" radius={[8, 8, 8, 8]} />
                  <Bar dataKey="impressions" fill="#10b981" name="Impressions" radius={[8, 8, 8, 8]} />
                  <Bar dataKey="clicks" fill="#f43f5e" name="Clicks" radius={[8, 8, 8, 8]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <></>
            )}
          </ChartContainer>
        </ChartCard>
        <ChartCard title="Top 5 Products by Ad Sales">
          <ChartContainer config={{}}>
            {loading ? (
              <div className="text-muted-foreground">Loading…</div>
            ) : error ? (
              <div className="text-destructive">{error}</div>
            ) : data && data.topAdProducts ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={data.topAdProducts} layout="vertical" margin={{ top: 16, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e0e7ff" />
                  <XAxis type="number" stroke="#6366f1" />
                  <YAxis dataKey="item_id" type="category" stroke="#6366f1" />
                  <Tooltip contentStyle={{ background: '#f1f5f9', borderRadius: 8, border: '1px solid #a5b4fc' }} />
                  <Legend />
                  <Bar dataKey="ad_sales" fill="#6366f1" name="Ad Sales" radius={[8, 8, 8, 8]} />
                  <Bar dataKey="ad_spend" fill="#f59e42" name="Ad Spend" radius={[8, 8, 8, 8]} />
                  <Bar dataKey="impressions" fill="#10b981" name="Impressions" radius={[8, 8, 8, 8]} />
                  <Bar dataKey="clicks" fill="#f43f5e" name="Clicks" radius={[8, 8, 8, 8]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <></>
            )}
          </ChartContainer>
        </ChartCard>
        <ChartCard title="Eligibility Status (Weekly)">
          <ChartContainer config={{}}>
            {loading ? (
              <div className="text-muted-foreground">Loading…</div>
            ) : error ? (
              <div className="text-destructive">{error}</div>
            ) : data && data.eligibilityByWeek ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={data.eligibilityByWeek} margin={{ top: 16, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e0e7ff" />
                  <XAxis dataKey="week" tickFormatter={d => d?.slice(0, 10)} stroke="#6366f1" />
                  <YAxis stroke="#6366f1" />
                  <Tooltip contentStyle={{ background: '#f1f5f9', borderRadius: 8, border: '1px solid #a5b4fc' }} />
                  <Legend />
                  <Bar dataKey="eligible" stackId="a" fill="#10b981" name="Eligible" radius={[8, 8, 8, 8]} />
                  <Bar dataKey="ineligible" stackId="a" fill="#f43f5e" name="Ineligible" radius={[8, 8, 8, 8]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <></>
            )}
          </ChartContainer>
        </ChartCard>
      </div>
    </div>
  );
} 