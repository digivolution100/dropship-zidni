import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppLayout, PageHeader, formatIDR } from "@/components/app-layout";
import { supabase } from "@/integrations/supabase/client";
import {
  TrendingUp, Hourglass, TrendingDown, Wallet,
  Plus, Loader2, Trash2, Pencil, X, AlertTriangle, Check
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/finance")({
  component: FinancePage,
});

type Order = { id: string; date: string; status: string; income: number; profit: number; hpp: number };
type Expense = { id: string; date: string; expense_name: string; amount: number };

/** Ubah format yyyy-mm-dd → dd-mm-yyyy untuk tampilan */
function formatDate(dateStr: string): string {
  if (!dateStr) return "-";
  const [y, m, d] = dateStr.split("-");
  return `${d}-${m}-${y}`;
}

const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const emptyForm = { date: new Date().toISOString().slice(0, 10), expense_name: "", amount: "" };

function monthKey(d: string) { return d.slice(0, 7); }

function last6Months(): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return months;
}

function monthLabel(ym: string) {
  const [y, m] = ym.split("-");
  return `${BULAN[parseInt(m, 10) - 1]} ${y}`;
}

function FinancePage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [editForm, setEditForm] = useState({ date: "", expense_name: "", amount: "" });
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function load() {
    setLoading(true);
    const [o, e] = await Promise.all([
      supabase.from("orders").select("id,date,status,income,profit,hpp"),
      supabase.from("expenses").select("*").order("date", { ascending: false }),
    ]);
    setLoading(false);
    if (o.error) toast.error(o.error.message);
    if (e.error) toast.error(e.error.message);
    setOrders((o.data ?? []) as Order[]);
    setExpenses((e.data ?? []) as Expense[]);
  }
  useEffect(() => { load(); }, []);

  const stats = useMemo(() => {
    const mOrders = orders.filter((o) => monthKey(o.date) === month);
    const mExpenses = expenses.filter((x) => monthKey(x.date) === month);
    const profitSelesai = mOrders.filter((o) => o.status === "Selesai").reduce((a, o) => a + Number(o.profit || 0), 0);
    const pending = mOrders
      .filter((o) => o.status === "Menunggu Selesai" || o.status === "Diterima pembeli belum cair")
      .reduce((a, o) => a + Number(o.income || o.hpp || 0), 0);
    const rtsLoss = mOrders.filter((o) => o.status === "GAGAL COD/RTS").reduce((a, o) => a + Math.abs(Number(o.profit || 0)), 0);
    const totalExpenses = mExpenses.reduce((a, x) => a + Number(x.amount || 0), 0);
    const net = profitSelesai - rtsLoss - totalExpenses;
    return { profitSelesai, pending, rtsLoss, totalExpenses, net, mExpenses };
  }, [orders, expenses, month]);

  // ── Kilasan 6 bulan ──
  const monthlySnapshot = useMemo(() => {
    return last6Months().map((ym) => {
      const mo = orders.filter((o) => monthKey(o.date) === ym);
      const me = expenses.filter((x) => monthKey(x.date) === ym);
      const profit = mo.filter(o => o.status === "Selesai").reduce((a, o) => a + Number(o.profit), 0);
      const rts = mo.filter(o => o.status === "GAGAL COD/RTS").reduce((a, o) => a + Math.abs(Number(o.profit)), 0);
      const exp = me.reduce((a, x) => a + Number(x.amount), 0);
      const net = profit - rts - exp;
      return { ym, label: monthLabel(ym), profit, rts, exp, net, isCurrentMonth: ym === month };
    });
  }, [orders, expenses, month]);

  async function addExpense(e: React.FormEvent) {
    e.preventDefault();
    if (!form.expense_name || !form.amount) return toast.error("Nama dan jumlah wajib diisi");
    setSaving(true);
    const { error } = await supabase.from("expenses").insert({
      date: form.date, expense_name: form.expense_name, amount: Number(form.amount) || 0,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    setForm(emptyForm);
    toast.success("Pengeluaran ditambahkan");
    load();
  }

  function openEdit(expense: Expense) {
    setEditingExpense(expense);
    setEditForm({ date: expense.date, expense_name: expense.expense_name, amount: String(expense.amount) });
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingExpense) return;
    setSaving(true);
    const { error } = await supabase.from("expenses")
      .update({ date: editForm.date, expense_name: editForm.expense_name, amount: Number(editForm.amount) || 0 })
      .eq("id", editingExpense.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Pengeluaran diperbarui");
    setEditingExpense(null);
    load();
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from("expenses").delete().eq("id", deleteTarget.id);
    setDeleting(false);
    if (error) return toast.error(error.message);
    toast.success("Pengeluaran dihapus");
    setDeleteTarget(null);
    load();
  }

  return (
    <AppLayout>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <PageHeader title="Keuangan" subtitle="Pantau profit, dana mengambang, kerugian RTS, dan pengeluaran." />
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)}
          className="rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary" />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Profit Selesai" value={formatIDR(stats.profitSelesai)} icon={TrendingUp} tone="emerald" loading={loading} />
        <StatCard label="Pending (floating)" value={formatIDR(stats.pending)} icon={Hourglass} tone="sky" loading={loading} />
        <StatCard label="Kerugian RTS" value={formatIDR(stats.rtsLoss)} icon={TrendingDown} tone="rose" loading={loading} />
        <StatCard label="Total Pengeluaran" value={formatIDR(stats.totalExpenses)} icon={Wallet} tone="amber" loading={loading} />
      </div>

      {/* Net Profit Banner */}
      <div className="mt-4 rounded-2xl border border-primary/30 bg-gradient-to-br from-primary to-primary/80 p-6 text-primary-foreground shadow-sm">
        <p className="text-xs uppercase tracking-wider opacity-80">Profit Bersih Bulan Ini</p>
        <p className="mt-1 text-3xl font-bold md:text-4xl">{formatIDR(stats.net)}</p>
        <p className="mt-2 text-xs opacity-80">= Profit Selesai − Kerugian RTS − Pengeluaran</p>
      </div>

      {/* Add Expense + List */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="mb-4 text-base font-semibold">Tambah Pengeluaran</h2>
          <form onSubmit={addExpense} className="space-y-3">
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={inputCls} required />
            <input placeholder="Keterangan (Ads, Internet, dll…)" value={form.expense_name} onChange={(e) => setForm({ ...form, expense_name: e.target.value })} className={inputCls} required />
            <input type="number" inputMode="numeric" placeholder="Jumlah" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className={inputCls} required />
            <button disabled={saving} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Tambah Pengeluaran
            </button>
          </form>
        </section>

        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="mb-4 text-base font-semibold">Pengeluaran Bulan Ini</h2>
          {stats.mExpenses.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada pengeluaran.</p>
          ) : (
            <ul className="divide-y divide-border">
              {stats.mExpenses.map((x) => (
                <li key={x.id} className="flex items-center justify-between py-2.5 gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{x.expense_name}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(x.date)}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm font-semibold">{formatIDR(Number(x.amount))}</span>
                    <button onClick={() => openEdit(x)} title="Edit" className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => setDeleteTarget(x)} title="Hapus" className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* ── Kilasan Profit Bersih Per Bulan ── */}
      <div className="mt-6 rounded-2xl border border-border bg-card shadow-sm">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">📊 Kilasan Profit Bersih — 6 Bulan Terakhir</h2>
          <p className="text-xs text-muted-foreground">Ringkasan keuangan bulanan setelah semua pengurangan</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-5 py-3">Bulan</th>
                <th className="px-5 py-3 text-right">Profit Selesai</th>
                <th className="px-5 py-3 text-right">Kerugian RTS</th>
                <th className="px-5 py-3 text-right">Pengeluaran</th>
                <th className="px-5 py-3 text-right font-bold">Profit Bersih</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">Memuat data…</td></tr>
              ) : monthlySnapshot.map((row) => (
                <tr key={row.ym} className={`border-t border-border transition-colors ${row.isCurrentMonth ? "bg-primary/5 font-semibold" : "hover:bg-secondary/30"}`}>
                  <td className="px-5 py-3">
                    {row.label}
                    {row.isCurrentMonth && <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">Bulan ini</span>}
                  </td>
                  <td className="px-5 py-3 text-right text-emerald-600">{formatIDR(row.profit)}</td>
                  <td className="px-5 py-3 text-right text-rose-500">{row.rts > 0 ? `−${formatIDR(row.rts)}` : "-"}</td>
                  <td className="px-5 py-3 text-right text-amber-600">{row.exp > 0 ? `−${formatIDR(row.exp)}` : "-"}</td>
                  <td className={`px-5 py-3 text-right font-bold ${row.net >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    {formatIDR(row.net)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Modal */}
      {editingExpense && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={() => setEditingExpense(null)}>
          <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold">Edit Pengeluaran</h3>
              <button onClick={() => setEditingExpense(null)} className="rounded-md p-1 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
            </div>
            <form onSubmit={saveEdit} className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Tanggal</label>
                <input type="date" value={editForm.date} onChange={(e) => setEditForm({ ...editForm, date: e.target.value })} className={inputCls} required />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Keterangan</label>
                <input value={editForm.expense_name} onChange={(e) => setEditForm({ ...editForm, expense_name: e.target.value })} className={inputCls} required />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Jumlah</label>
                <input type="number" value={editForm.amount} onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })} className={inputCls} required />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setEditingExpense(null)} className="rounded-lg border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-muted">Batal</button>
                <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Simpan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={() => setDeleteTarget(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <h3 className="text-base font-semibold">Hapus Pengeluaran?</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Hapus <strong>"{deleteTarget.expense_name}"</strong> ({formatIDR(Number(deleteTarget.amount))})? Tidak bisa dibatalkan.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteTarget(null)} disabled={deleting} className="rounded-lg border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60">Batal</button>
              <button onClick={confirmDelete} disabled={deleting} className="inline-flex items-center gap-2 rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60">
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}

const inputCls = "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20";
const toneMap: Record<string, string> = {
  emerald: "bg-emerald-50 text-emerald-700",
  sky: "bg-sky-50 text-sky-700",
  rose: "bg-rose-50 text-rose-700",
  amber: "bg-amber-50 text-amber-700",
};

function StatCard({ label, value, icon: Icon, tone, loading }: { label: string; value: string; icon: any; tone: string; loading: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <div className={`grid h-8 w-8 place-items-center rounded-lg ${toneMap[tone] ?? "bg-muted"}`}><Icon className="h-4 w-4" /></div>
      </div>
      <p className="mt-2 text-lg font-bold md:text-xl">{loading ? "…" : value}</p>
    </div>
  );
}