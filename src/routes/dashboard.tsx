import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppLayout, PageHeader, formatIDR } from "@/components/app-layout";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp, ShoppingBag, Hourglass, TrendingDown, AlertCircle } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, Legend,
} from "recharts";

export const Route = createFileRoute("/dashboard")({
  component: DashboardPage,
});

type Order = {
  id: string; date: string; item_name: string;
  status: string; income: number; profit: number; hpp: number;
};
type Expense = { id: string; date: string; amount: number };

const BULAN_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const BULAN_FULL  = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

function monthLabelShort(ym: string) {
  const [, m] = ym.split("-");
  return BULAN_SHORT[parseInt(m, 10) - 1] ?? ym;
}

function last6Months(): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return months;
}

const STATUS_COLORS: Record<string, string> = {
  "Selesai": "#10b981",
  "Menunggu Selesai": "#f59e0b",
  "Diterima pembeli belum cair": "#38bdf8",
  "GAGAL COD/RTS": "#f43f5e",
  "Komplain pengembalian": "#94a3b8",
};

function DashboardPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  // Filter bulan — default bulan ini
  const [filterMonth, setFilterMonth] = useState(() => new Date().toISOString().slice(0, 7));

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [o, e] = await Promise.all([
        supabase.from("orders").select("id,date,item_name,status,income,profit,hpp"),
        supabase.from("expenses").select("id,date,amount"),
      ]);
      setOrders((o.data ?? []) as Order[]);
      setExpenses((e.data ?? []) as Expense[]);
      setLoading(false);
    })();
  }, []);

  // ── Label bulan terpilih ──
  const [fy, fm] = filterMonth.split("-");
  const filterLabel = `${BULAN_FULL[parseInt(fm, 10) - 1]} ${fy}`;

  // ── KPI bulan terpilih ──
  const kpi = useMemo(() => {
    const mo = orders.filter((o) => o.date.slice(0, 7) === filterMonth);
    const selesai = mo.filter(o => o.status === "Selesai");
    const totalPesanan   = mo.length;
    const totalPenghasilan = selesai.reduce((a, o) => a + Number(o.income), 0);
    const totalProfit    = selesai.reduce((a, o) => a + Number(o.profit), 0);
    const pesananPending = mo.filter(o => o.status === "Menunggu Selesai" || o.status === "Diterima pembeli belum cair").length;
    const rtsList        = mo.filter(o => o.status === "GAGAL COD/RTS");
    const totalRTS       = rtsList.length;
    const totalRTSLoss   = rtsList.reduce((a, o) => a + Math.abs(Number(o.profit)), 0);
    return { totalPesanan, totalPenghasilan, totalProfit, pesananPending, totalRTS, totalRTSLoss };
  }, [orders, filterMonth]);

  // ── Trend 6 bulan ──
  const trendData = useMemo(() => {
    const months = last6Months();
    return months.map((ym) => {
      const mo = orders.filter((o) => o.date.slice(0, 7) === ym && o.status === "Selesai");
      const me = expenses.filter((e) => e.date.slice(0, 7) === ym);
      const profit = mo.reduce((a, o) => a + Number(o.profit), 0);
      const exp    = me.reduce((a, e) => a + Number(e.amount), 0);
      const rts    = orders.filter(o => o.date.slice(0, 7) === ym && o.status === "GAGAL COD/RTS")
        .reduce((a, o) => a + Math.abs(Number(o.profit)), 0);
      return { bulan: monthLabelShort(ym), profit, netProfit: profit - rts - exp };
    });
  }, [orders, expenses]);

  // ── Status breakdown bulan terpilih ──
  const statusData = useMemo(() => {
    const mo = orders.filter(o => o.date.slice(0, 7) === filterMonth);
    const counts: Record<string, number> = {};
    mo.forEach((o) => { counts[o.status] = (counts[o.status] ?? 0) + 1; });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [orders, filterMonth]);

  // ── Top 5 produk bulan terpilih ──
  const topProducts = useMemo(() => {
    const mo = orders.filter(o => o.date.slice(0, 7) === filterMonth && o.status === "Selesai");
    const map: Record<string, { profit: number; count: number }> = {};
    mo.forEach((o) => {
      if (!map[o.item_name]) map[o.item_name] = { profit: 0, count: 0 };
      map[o.item_name].profit += Number(o.profit);
      map[o.item_name].count  += 1;
    });
    return Object.entries(map)
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 5);
  }, [orders, filterMonth]);

  const shimmer = "animate-pulse bg-muted rounded-lg";

  return (
    <AppLayout>
      {/* Header + Filter Bulan */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <PageHeader title="Dashboard" subtitle={`Ringkasan performa — ${filterLabel}`} />
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-muted-foreground">Filter Bulan:</label>
          <input
            type="month"
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
            className="rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </div>
      </div>

      {/* ── KPI Cards (5 cards) ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <KPICard label="Total Pesanan"     value={String(kpi.totalPesanan)}           icon={ShoppingBag}  color="bg-sky-50 text-sky-600"     loading={loading} suffix="pesanan" />
        <KPICard label="Total Penghasilan" value={formatIDR(kpi.totalPenghasilan)}    icon={TrendingUp}   color="bg-emerald-50 text-emerald-600" loading={loading} />
        <KPICard label="Total Profit"      value={formatIDR(kpi.totalProfit)}         icon={TrendingUp}   color="bg-violet-50 text-violet-600"   loading={loading} />
        <KPICard label="Pesanan Pending"   value={String(kpi.pesananPending)}         icon={Hourglass}    color="bg-amber-50 text-amber-600"    loading={loading} suffix="pesanan" />
        <KPICard
          label="Total RTS / Gagal"
          value={`${kpi.totalRTS} pesanan`}
          subValue={kpi.totalRTSLoss > 0 ? `Rugi ${formatIDR(kpi.totalRTSLoss)}` : undefined}
          icon={AlertCircle}
          color="bg-rose-50 text-rose-600"
          loading={loading}
        />
      </div>

      {/* ── Charts Row ── */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">

        {/* Line Chart: Trend 6 bulan (selalu 6 bulan, tidak difilter) */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-1 text-sm font-semibold">Trend Profit — 6 Bulan Terakhir</h2>
          <p className="mb-4 text-xs text-muted-foreground">Profit kotor vs profit bersih (setelah RTS & pengeluaran)</p>
          {loading ? (
            <div className={`h-48 ${shimmer}`} />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={trendData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.015 240)" />
                <XAxis dataKey="bulan" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => formatIDR(v)} />
                <Line type="monotone" dataKey="profit"    stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} name="Profit Kotor" />
                <Line type="monotone" dataKey="netProfit" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} name="Profit Bersih" strokeDasharray="4 2" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Pie Chart: Status breakdown bulan terpilih */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-1 text-sm font-semibold">Breakdown Status — {filterLabel}</h2>
          <p className="mb-4 text-xs text-muted-foreground">Distribusi pesanan berdasarkan status pada bulan ini</p>
          {loading ? (
            <div className={`h-48 ${shimmer}`} />
          ) : statusData.length === 0 ? (
            <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">Belum ada data bulan ini</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={statusData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" nameKey="name">
                  {statusData.map((entry) => (
                    <Cell key={entry.name} fill={STATUS_COLORS[entry.name] ?? "#94a3b8"} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number, name: string) => [`${v} pesanan`, name]} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── Top 5 Produk ── */}
      <div className="mt-6 rounded-2xl border border-border bg-card shadow-sm">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">🏆 Top 5 Produk — {filterLabel}</h2>
          <p className="text-xs text-muted-foreground">Berdasarkan pesanan berstatus Selesai pada bulan terpilih</p>
        </div>
        {loading ? (
          <div className="space-y-3 p-5">{[1,2,3].map(i => <div key={i} className={`h-10 ${shimmer}`} />)}</div>
        ) : topProducts.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">Belum ada produk selesai di bulan ini</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-secondary text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-5 py-3">#</th>
                <th className="px-5 py-3">Nama Produk</th>
                <th className="px-5 py-3 text-center">Terjual</th>
                <th className="px-5 py-3 text-right">Total Profit</th>
              </tr>
            </thead>
            <tbody>
              {topProducts.map((p, i) => (
                <tr key={p.name} className="border-t border-border hover:bg-secondary/30 transition-colors">
                  <td className="px-5 py-3 font-bold text-muted-foreground">#{i + 1}</td>
                  <td className="px-5 py-3 font-medium">{p.name}</td>
                  <td className="px-5 py-3 text-center text-muted-foreground">{p.count}×</td>
                  <td className="px-5 py-3 text-right font-semibold text-emerald-600">{formatIDR(p.profit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AppLayout>
  );
}

function KPICard({ label, value, subValue, icon: Icon, color, loading, suffix }: {
  label: string; value: string; subValue?: string; icon: any;
  color: string; loading: boolean; suffix?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground leading-tight">{label}</p>
        <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${color}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      {loading ? (
        <div className="mt-2 h-6 w-20 animate-pulse rounded-md bg-muted" />
      ) : (
        <>
          <p className="mt-2 text-lg font-bold leading-tight">
            {value}
            {suffix && <span className="ml-1 text-xs font-normal text-muted-foreground">{suffix}</span>}
          </p>
          {subValue && <p className="mt-0.5 text-xs text-rose-500 font-medium">{subValue}</p>}
        </>
      )}
    </div>
  );
}
