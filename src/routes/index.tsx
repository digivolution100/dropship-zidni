import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppLayout, PageHeader, formatIDR } from "@/components/app-layout";
import { supabase } from "@/integrations/supabase/client";
import {
  Send, Loader2, Upload, Search, CheckCircle2,
  X, Pencil, Trash2, AlertTriangle, Check, Save
} from "lucide-react";
import { toast } from "sonner";
import Papa from "papaparse";
import * as XLSX from "xlsx";

export const Route = createFileRoute("/")({
  component: InputAndOrdersPage,
});

type Order = {
  id: string;
  date: string;
  nomer: string | null;
  item_name: string;
  hpp: number;
  order_no: string;
  resi_no: string | null;
  status: string;
  income: number;
  profit: number;
  catatan: string | null;
};

const STATUSES = [
  "Menunggu Selesai",
  "Selesai",
  "Diterima pembeli belum cair",
  "GAGAL COD/RTS",
  "Komplain pengembalian",
];

const statusColor: Record<string, string> = {
  "Selesai": "bg-emerald-100 text-emerald-700 border-emerald-200",
  "Menunggu Selesai": "bg-amber-100 text-amber-700 border-amber-200",
  "Diterima pembeli belum cair": "bg-sky-100 text-sky-700 border-sky-200",
  "GAGAL COD/RTS": "bg-rose-100 text-rose-700 border-rose-200",
  "Komplain pengembalian": "bg-slate-200 text-slate-700 border-slate-300",
};

const today = () => new Date().toISOString().slice(0, 10);
const emptyForm = () => ({ date: today(), nomer: "", order_no: "", item_name: "", hpp: "", resi_no: "", catatan: "" });

const inputCls = "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20";

/** Ubah format yyyy-mm-dd → dd-mm-yyyy untuk tampilan */
function formatDate(dateStr: string): string {
  if (!dateStr) return "-";
  const [y, m, d] = dateStr.split("-");
  return `${d}-${m}-${y}`;
}

function InputAndOrdersPage() {
  // ── Form input ──
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState<"save" | "wa" | null>(null);

  // ── Orders list ──
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [syncing, setSyncing] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // ── Modal states ──
  const [statusModal, setStatusModal] = useState<Order | null>(null);
  const [editModal, setEditModal] = useState<Order | null>(null);
  const [deleteModal, setDeleteModal] = useState<Order | null>(null);
  const [deleting, setDeleting] = useState(false);

  const upd = (k: keyof typeof form, v: string) => setForm((p) => ({ ...p, [k]: v }));

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .order("date", { ascending: false })
      .order("created_at", { ascending: false });
    setLoading(false);
    if (error) return toast.error(error.message);
    setOrders((data ?? []) as Order[]);
  }
  useEffect(() => { load(); }, []);

  // ── Submit form ──
  async function handleSubmit(mode: "save" | "wa") {
    if (!form.item_name || !form.order_no) {
      toast.error("Nama produk dan nomor pesanan wajib diisi");
      return;
    }
    setSaving(mode);
    const hppNum = Number(form.hpp) || 0;
    const { error } = await supabase.from("orders").insert({
      date: form.date,
      nomer: form.nomer || null,
      order_no: form.order_no,
      item_name: form.item_name,
      hpp: hppNum,
      resi_no: form.resi_no || null,
      catatan: form.catatan || null,
      status: "Menunggu Selesai",
    });
    setSaving(null);
    if (error) { toast.error(error.message); return; }
    toast.success("Pesanan berhasil disimpan");
    if (mode === "wa") {
      const text =
        `tanggal ${form.date}\n` +
        `nomer : ${form.nomer || "-"}\n` +
        `pesanan : ${form.item_name}\n` +
        `total Harga : ${hppNum}\n` +
        `nomer pesanan : ${form.order_no}\n` +
        `no resi : ${form.resi_no || "-"}`;
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
    }
    setForm(emptyForm());
    load();
  }

  // ── File upload sync ──
  async function handleFile(f: File) {
    setSyncing(true);
    try {
      const cleanCell = (c: string) => c.trim().toLowerCase().replace(/\s+/g, " ");
      const isOrderNoHeader = (c: string) => {
        const v = cleanCell(c);
        return v === "no. pesanan" || v === "no pesanan" || v === "nomor pesanan";
      };

      // ── 1. Baca file → array-of-array ──
      let allRows: string[][] = [];
      let foundSheetName = "";

      if (f.name.toLowerCase().endsWith(".csv")) {
        const text = await f.text();
        const parsed = Papa.parse<string[]>(text, { header: false, skipEmptyLines: false });
        allRows = parsed.data.map((r) => r.map((c) => String(c ?? "").trim()));
        foundSheetName = "CSV";
      } else {
        // Excel: coba SEMUA sheet, pakai sheet_to_csv agar tidak ada kolom yang hilang
        const buf = await f.arrayBuffer();
        const wb  = XLSX.read(buf, { type: "array" });

        for (const sheetName of wb.SheetNames) {
          const csv   = XLSX.utils.sheet_to_csv(wb.Sheets[sheetName], { FS: ",", RS: "\n" });
          const rows  = Papa.parse<string[]>(csv, { header: false, skipEmptyLines: false })
                          .data.map((r) => r.map((c) => String(c ?? "").trim()));
          const hasIt = rows.some((row) => row.some(isOrderNoHeader));
          console.log(`[Sync] Sheet "${sheetName}": ada No. Pesanan? ${hasIt} | kolom maks: ${Math.max(...rows.map(r=>r.length))}`);
          if (hasIt) {
            allRows = rows;
            foundSheetName = sheetName;
            break;
          }
        }

        // Fallback: pakai sheet pertama jika tidak ada yang cocok
        if (!foundSheetName) {
          const csv  = XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]], { FS: ",", RS: "\n" });
          allRows = Papa.parse<string[]>(csv, { header: false, skipEmptyLines: false })
                      .data.map((r) => r.map((c) => String(c ?? "").trim()));
          foundSheetName = wb.SheetNames[0] + " (fallback)";
        }
      }

      console.log(`[Sync] Membaca sheet: "${foundSheetName}" | total baris: ${allRows.length}`);

      // ── 2. Cari baris header yang ada sel persis "No. Pesanan" ──
      const headerRowIdx = allRows.findIndex((row) => row.some(isOrderNoHeader));

      if (headerRowIdx === -1) {
        // Debug: tampilkan semua sel yang mengandung "pesanan"
        const hits = allRows
          .flatMap((row, i) => row
            .filter(c => c.toLowerCase().includes("pesanan"))
            .map(c => `baris ${i}: "${c}"`)
          );
        console.log("[Sync] Sel yang mengandung 'pesanan':", hits);
        toast.error(`Header 'No. Pesanan' tidak ditemukan di sheet "${foundSheetName}". Cek F12 console.`);
        return;
      }

      const headers = allRows[headerRowIdx];
      console.log(`[Sync] ✅ Header di baris ${headerRowIdx}:`, headers);

      // ── 3. Index kolom ──
      const idxOrderNo = headers.findIndex(isOrderNoHeader);
      const idxIncome  = headers.findIndex((h) =>
        cleanCell(h).includes("penghasilan") && !cleanCell(h).includes("subtotal")
      );

      console.log(`[Sync] No. Pesanan  → col ${idxOrderNo}: "${headers[idxOrderNo]}"`);
      console.log(`[Sync] Penghasilan  → col ${idxIncome}: "${headers[idxIncome]}"`);

      if (idxOrderNo === -1) {
        toast.error(`Kolom No. Pesanan tidak ada. Headers: ${headers.slice(0,8).join(" | ")}`);
        return;
      }

      // ── 4. Fetch pesanan dari DB ──
      const { data: freshOrders, error: fetchErr } = await supabase
        .from("orders").select("id, order_no, hpp");
      if (fetchErr || !freshOrders) {
        toast.error("Gagal memuat pesanan dari database");
        return;
      }

      const norm = (s: string) => String(s ?? "").replace(/\s+/g, "").toUpperCase();
      const dbMap = new Map(freshOrders.map((o) => [norm(o.order_no), o]));

      // ── 5. Proses baris data ──
      let matched = 0, skipped = 0;

      for (const row of allRows.slice(headerRowIdx + 1)) {
        const orderNoStr = String(row[idxOrderNo] ?? "").trim();
        if (!orderNoStr || cleanCell(orderNoStr).startsWith("total") || cleanCell(orderNoStr).startsWith("subtotal")) continue;

        const existing = dbMap.get(norm(orderNoStr));
        if (!existing) { skipped++; continue; }

        const incomeRaw = idxIncome >= 0 ? String(row[idxIncome] ?? "0") : "0";
        const income    = Number(incomeRaw.replace(/[^0-9.]/g, "")) || 0;
        const profit    = income - Number(existing.hpp || 0);

        const { error } = await supabase
          .from("orders")
          .update({ status: "Selesai", income, profit })
          .eq("id", existing.id);

        if (!error) matched++;
        else console.error("[Sync] Update gagal:", error.message);
      }

      if (matched > 0) {
        toast.success(
          `✅ ${matched} pesanan berhasil diubah ke Selesai` +
          (skipped > 0 ? ` · ${skipped} tidak cocok` : "")
        );
      } else {
        const sampleFile = allRows.slice(headerRowIdx + 1, headerRowIdx + 4).map(r => r[idxOrderNo]).filter(Boolean);
        const sampleDb   = [...dbMap.keys()].slice(0, 3);
        console.log("[Sync] Sample No. Pesanan dari file:", sampleFile);
        console.log("[Sync] Sample No. Pesanan dari DB  :", sampleDb);
        toast.error("Tidak ada pesanan cocok. Cek F12 console → 'Sample No. Pesanan' untuk perbandingan.");
      }

      await load();
    } catch (err: any) {
      console.error("[Sync] Error:", err);
      toast.error(err?.message ?? "Gagal membaca file");
    } finally {
      setSyncing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }


  // ── Delete ──
  async function confirmDelete() {
    if (!deleteModal) return;
    setDeleting(true);
    const { error } = await supabase.from("orders").delete().eq("id", deleteModal.id);
    setDeleting(false);
    if (error) return toast.error(error.message);
    toast.success("Pesanan dihapus");
    setDeleteModal(null);
    load();
  }

  // ── Filter ──
  const filtered = useMemo(() => orders.filter((o) => {
    const matchQ = !q
      || o.order_no.toLowerCase().includes(q.toLowerCase())
      || (o.resi_no ?? "").toLowerCase().includes(q.toLowerCase())
      || o.item_name.toLowerCase().includes(q.toLowerCase());
    const matchS = statusFilter === "all" || o.status === statusFilter;
    return matchQ && matchS;
  }), [orders, q, statusFilter]);

  return (
    <AppLayout>
      {/* ═══ SECTION: Input Form ═══ */}
      <PageHeader title="Input & Pesanan" subtitle="Tambah pesanan baru dan kelola semua pesanan Anda." />

      <div className="mb-8 rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-muted-foreground uppercase tracking-wide">Form Input Pesanan</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Tanggal">
            <input type="date" value={form.date} onChange={(e) => upd("date", e.target.value)} className={inputCls} required />
          </Field>
          <Field label="Nomer">
            <input value={form.nomer} onChange={(e) => upd("nomer", e.target.value)} placeholder="1, 2, 3..." className={inputCls} />
          </Field>
          <Field label="Nama Produk">
            <input value={form.item_name} onChange={(e) => upd("item_name", e.target.value)} placeholder="Serum Vitamin C" className={inputCls} required />
          </Field>
          <Field label="HPP (Harga Pokok)">
            <input type="number" inputMode="numeric" value={form.hpp} onChange={(e) => upd("hpp", e.target.value)} placeholder="25000" className={inputCls} />
          </Field>
          <Field label="Nomor Pesanan">
            <input value={form.order_no} onChange={(e) => upd("order_no", e.target.value)} placeholder="240701ABCDEF" className={inputCls} required />
          </Field>
          <Field label="Nomor Resi">
            <input value={form.resi_no} onChange={(e) => upd("resi_no", e.target.value)} placeholder="JNE12345678" className={inputCls} />
          </Field>
          <Field label="Catatan">
            <input value={form.catatan} onChange={(e) => upd("catatan", e.target.value)} placeholder="Catatan opsional..." className={inputCls} />
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={() => handleSubmit("save")}
            disabled={saving !== null}
            className="inline-flex items-center gap-2 rounded-lg border border-input bg-background px-4 py-2.5 text-sm font-semibold text-foreground shadow-sm transition hover:bg-accent disabled:opacity-60"
          >
            {saving === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Simpan Saja
          </button>
          <button
            onClick={() => handleSubmit("wa")}
            disabled={saving !== null}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 disabled:opacity-60"
          >
            {saving === "wa" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Simpan & Kirim WA
          </button>
        </div>
      </div>

      {/* ═══ SECTION: Daftar Pesanan ═══ */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-bold flex-1">Daftar Pesanan</h2>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-secondary border border-border px-3 py-2 text-sm font-medium text-foreground transition hover:bg-accent">
          {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          Sinkron CSV/Excel
          <input ref={fileRef} type="file" accept=".csv,.xls,.xlsx" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
        </label>
        <div className="relative min-w-[180px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari pesanan..." className="w-full rounded-lg border border-input bg-card py-2 pl-9 pr-3 text-sm outline-none focus:border-primary" />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary">
          <option value="all">Semua status</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Tanggal</th>
                <th className="px-4 py-3">Nomer</th>
                <th className="px-4 py-3">No. Pesanan</th>
                <th className="px-4 py-3">Produk</th>
                <th className="px-4 py-3">No. Resi</th>
                <th className="px-4 py-3 text-right">HPP</th>
                <th className="px-4 py-3 text-right">Penghasilan</th>
                <th className="px-4 py-3 text-right">Profit</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Catatan</th>
                <th className="px-4 py-3 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={11} className="px-4 py-10 text-center text-muted-foreground"><Loader2 className="inline h-5 w-5 animate-spin mr-2" />Memuat data…</td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={11} className="px-4 py-10 text-center text-muted-foreground">Tidak ada pesanan ditemukan</td></tr>
              )}
              {filtered.map((o) => (
                <tr key={o.id} className="border-t border-border hover:bg-secondary/40 transition-colors">
                  <td className="whitespace-nowrap px-4 py-3 text-sm">{formatDate(o.date)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm">{o.nomer ?? "-"}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">{o.order_no}</td>
                  <td className="px-4 py-3 max-w-[140px] truncate">{o.item_name}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">{o.resi_no ?? "-"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">{formatIDR(Number(o.hpp))}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">{formatIDR(Number(o.income))}</td>
                  <td className={"whitespace-nowrap px-4 py-3 text-right font-semibold " + (Number(o.profit) < 0 ? "text-rose-600" : Number(o.profit) > 0 ? "text-emerald-600" : "text-muted-foreground")}>
                    {formatIDR(Number(o.profit))}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setStatusModal(o)}
                      className={"rounded-full border px-2.5 py-1 text-xs font-medium transition hover:opacity-80 " + (statusColor[o.status] ?? "bg-muted text-muted-foreground border-border")}
                    >
                      {o.status}
                    </button>
                  </td>
                  <td className="px-4 py-3 max-w-[120px]">
                    <span title={o.catatan ?? ""} className="block truncate text-xs text-muted-foreground">
                      {o.catatan || "-"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => setEditModal(o)} title="Edit" className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => setDeleteModal(o)} title="Hapus" className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ═══ MODAL: Status ═══ */}
      {statusModal && (
        <StatusModal order={statusModal} onClose={() => setStatusModal(null)} onSaved={() => { setStatusModal(null); load(); }} />
      )}

      {/* ═══ MODAL: Edit ═══ */}
      {editModal && (
        <EditModal order={editModal} onClose={() => setEditModal(null)} onSaved={() => { setEditModal(null); load(); }} />
      )}

      {/* ═══ MODAL: Delete ═══ */}
      {deleteModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={() => setDeleteModal(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <h3 className="text-base font-semibold">Hapus Pesanan?</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Hapus pesanan <strong className="font-mono">{deleteModal.order_no}</strong>? Tindakan ini tidak bisa dibatalkan.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteModal(null)} disabled={deleting} className="rounded-lg border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60">Batal</button>
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

// ═══ COMPONENT: Field ═══
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

// ═══ MODAL: Status ═══
function StatusModal({ order, onClose, onSaved }: { order: Order; onClose: () => void; onSaved: () => void }) {
  const [status, setStatus] = useState(order.status);
  const [rtsFee, setRtsFee] = useState<number>(4000);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const patch: Partial<Order> = { status };
    if (status === "GAGAL COD/RTS") patch.profit = -Math.abs(rtsFee);
    if (status === "Komplain pengembalian") patch.profit = 0;
    if (status === "Selesai") patch.profit = Number(order.income) - Number(order.hpp);
    const { error } = await supabase.from("orders").update(patch).eq("id", order.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Status berhasil diperbarui");
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold">Ubah Status</h3>
          <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <p className="mb-3 font-mono text-xs text-muted-foreground">{order.order_no}</p>
        <div className="space-y-2">
          {STATUSES.map((s) => (
            <label key={s} className={"flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm transition " + (status === s ? "border-primary bg-accent/40" : "border-border hover:bg-muted/50")}>
              <input type="radio" name="status" checked={status === s} onChange={() => setStatus(s)} className="accent-primary" />
              <span className="flex-1">{s}</span>
              {status === s && <CheckCircle2 className="h-4 w-4 text-primary" />}
            </label>
          ))}
        </div>
        {status === "GAGAL COD/RTS" && (
          <div className="mt-4">
            <label className="mb-1.5 block text-sm font-medium">Biaya RTS (kerugian)</label>
            <input type="number" value={rtsFee} onChange={(e) => setRtsFee(Number(e.target.value))} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
            <p className="mt-1 text-xs text-muted-foreground">Profit akan menjadi −{formatIDR(rtsFee)}</p>
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-muted">Batal</button>
          <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Simpan
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══ MODAL: Edit ═══
function EditModal({ order, onClose, onSaved }: { order: Order; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    date: order.date,
    nomer: order.nomer ?? "",
    order_no: order.order_no,
    item_name: order.item_name,
    hpp: String(order.hpp),
    resi_no: order.resi_no ?? "",
    income: String(order.income),
    catatan: order.catatan ?? "",
  });
  const [saving, setSaving] = useState(false);
  const upd = (k: keyof typeof form, v: string) => setForm((p) => ({ ...p, [k]: v }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const hpp = Number(form.hpp) || 0;
    const income = Number(form.income) || 0;
    const { error } = await supabase.from("orders").update({
      date: form.date,
      nomer: form.nomer || null,
      order_no: form.order_no,
      item_name: form.item_name,
      hpp,
      resi_no: form.resi_no || null,
      income,
      profit: income - hpp,
      catatan: form.catatan || null,
    }).eq("id", order.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Pesanan berhasil diperbarui");
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-card p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold">Edit Pesanan</h3>
          <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <form onSubmit={save} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Tanggal</label>
            <input type="date" value={form.date} onChange={(e) => upd("date", e.target.value)} className={inputCls} required />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Nomer</label>
            <input value={form.nomer} onChange={(e) => upd("nomer", e.target.value)} placeholder="1, 2, 3..." className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Nomor Pesanan</label>
            <input value={form.order_no} onChange={(e) => upd("order_no", e.target.value)} className={inputCls} required />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Nama Produk</label>
            <input value={form.item_name} onChange={(e) => upd("item_name", e.target.value)} className={inputCls} required />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">HPP</label>
            <input type="number" value={form.hpp} onChange={(e) => upd("hpp", e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Penghasilan</label>
            <input type="number" value={form.income} onChange={(e) => upd("income", e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Nomor Resi</label>
            <input value={form.resi_no} onChange={(e) => upd("resi_no", e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Catatan</label>
            <input value={form.catatan} onChange={(e) => upd("catatan", e.target.value)} className={inputCls} />
          </div>
          <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-muted">Batal</button>
            <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Simpan
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
