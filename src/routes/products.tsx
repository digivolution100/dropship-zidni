import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { AppLayout, PageHeader, formatIDR } from "@/components/app-layout";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Plus, Search, Pencil, Trash2, X, Check, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/products")({
  component: ProductsPage,
});

type Product = {
  id: string;
  name: string;
  price: number;
  created_at: string;
};

const inputCls = "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20";

function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  // Modals
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editModal, setEditModal] = useState<Product | null>(null);
  const [deleteModal, setDeleteModal] = useState<Product | null>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .order("name", { ascending: true });
    setLoading(false);
    if (error) return toast.error(error.message);
    setProducts((data ?? []) as Product[]);
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    if (!q) return products;
    const lowerQ = q.toLowerCase();
    return products.filter((p) => p.name.toLowerCase().includes(lowerQ));
  }, [products, q]);

  return (
    <AppLayout>
      <PageHeader title="Data Harga Produk" subtitle="Kelola harga pokok dari supplier untuk referensi." />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-bold flex-1">Daftar Produk</h2>
        
        <div className="relative min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input 
            value={q} 
            onChange={(e) => setQ(e.target.value)} 
            placeholder="Cari nama produk..." 
            className="w-full rounded-lg border border-input bg-card py-2 pl-9 pr-3 text-sm outline-none focus:border-primary" 
          />
        </div>
        
        <button
          onClick={() => setAddModalOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          Tambah Produk
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Nama Produk</th>
                <th className="px-4 py-3 text-right">Harga Pokok (HPP)</th>
                <th className="px-4 py-3 text-center w-24">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={3} className="px-4 py-10 text-center text-muted-foreground"><Loader2 className="inline h-5 w-5 animate-spin mr-2" />Memuat data…</td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={3} className="px-4 py-10 text-center text-muted-foreground">Tidak ada produk ditemukan</td></tr>
              )}
              {filtered.map((p) => (
                <tr key={p.id} className="border-t border-border hover:bg-secondary/40 transition-colors">
                  <td className="px-4 py-3 font-medium">{p.name}</td>
                  <td className="px-4 py-3 text-right font-mono">{formatIDR(p.price)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => setEditModal(p)} title="Edit" className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => setDeleteModal(p)} title="Hapus" className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition">
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

      {addModalOpen && <AddModal onClose={() => setAddModalOpen(false)} onSaved={() => { setAddModalOpen(false); load(); }} />}
      {editModal && <EditModal product={editModal} onClose={() => setEditModal(null)} onSaved={() => { setEditModal(null); load(); }} />}
      {deleteModal && <DeleteModal product={deleteModal} onClose={() => setDeleteModal(null)} onDeleted={() => { setDeleteModal(null); load(); }} />}

    </AppLayout>
  );
}

// ═══ MODAL: Tambah ═══
function AddModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !price) return toast.error("Semua field harus diisi");
    setSaving(true);
    const numPrice = Number(price) || 0;
    
    const { error } = await supabase.from("products").insert({ name, price: numPrice });
    setSaving(false);
    
    if (error) return toast.error(error.message);
    toast.success("Produk berhasil ditambahkan");
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold">Tambah Produk Baru</h3>
          <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <form onSubmit={save} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Nama Produk / Tipe Motor</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Contoh: beat esp" className={inputCls} required autoFocus />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Harga Beli / Pokok (Rp)</label>
            <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="35000" className={inputCls} required />
          </div>
          <div className="mt-5 flex justify-end gap-2 pt-2">
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

// ═══ MODAL: Edit ═══
function EditModal({ product, onClose, onSaved }: { product: Product; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(product.name);
  const [price, setPrice] = useState(String(product.price));
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !price) return toast.error("Semua field harus diisi");
    setSaving(true);
    const numPrice = Number(price) || 0;
    
    const { error } = await supabase.from("products").update({ name, price: numPrice }).eq("id", product.id);
    setSaving(false);
    
    if (error) return toast.error(error.message);
    toast.success("Harga produk berhasil diubah");
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold">Edit Harga Produk</h3>
          <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <form onSubmit={save} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Nama Produk</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} required />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Harga Beli Baru (Rp)</label>
            <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} className={inputCls} required />
          </div>
          <div className="mt-5 flex justify-end gap-2 pt-2">
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

// ═══ MODAL: Delete ═══
function DeleteModal({ product, onClose, onDeleted }: { product: Product; onClose: () => void; onDeleted: () => void }) {
  const [deleting, setDeleting] = useState(false);

  async function confirmDelete() {
    setDeleting(true);
    const { error } = await supabase.from("products").delete().eq("id", product.id);
    setDeleting(false);
    if (error) return toast.error(error.message);
    toast.success("Produk dihapus");
    onDeleted();
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-5 w-5 text-destructive" />
          </div>
          <div>
            <h3 className="text-base font-semibold">Hapus Produk?</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Yakin ingin menghapus <strong className="font-medium text-foreground">{product.name}</strong> dari daftar harga?
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} disabled={deleting} className="rounded-lg border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60">Batal</button>
          <button onClick={confirmDelete} disabled={deleting} className="inline-flex items-center gap-2 rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60">
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Hapus
          </button>
        </div>
      </div>
    </div>
  );
}
