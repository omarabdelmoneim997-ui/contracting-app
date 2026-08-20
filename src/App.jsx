import React, { useState, useMemo, useEffect } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import {
  Building2, LayoutGrid, Hammer, Receipt, FileStack, Wallet, Plus, X,
  TrendingUp, TrendingDown, ChevronDown, ChevronRight, Package, HardHat,
  Landmark, CircleDollarSign, CheckCircle2, Clock, Ruler, Users, Loader2,
} from "lucide-react";
import { supabase } from "./supabaseClient";

/* ---------------------------------- data ---------------------------------- */

const COST_TYPES = [
  { key: "مشتريات", label: "مشتريات وكميات", icon: Package, color: "#3F7D63" },
  { key: "مصنعيات", label: "مصنعيات", icon: HardHat, color: "#E8672C" },
  { key: "مصروفات", label: "مصروفات", icon: Receipt, color: "#D6A23C" },
  { key: "عهد", label: "عهد", icon: Landmark, color: "#6B5CA5" },
  { key: "مصروفات عمومية", label: "مصروفات عمومية", icon: Users, color: "#A0522D" },
];

// بنود فرعية جاهزة تظهر عند اختيار نوع "مصروفات عمومية"
const GENERAL_EXPENSE_ITEMS = [
  "أجور العمال",
  "مرتبات العاملين بالمشروع",
  "مصروفات الانتقالات",
  "إكراميات",
  "مصروفات نثرية",
  "أخرى",
];

const seedProjects = [
  { id: "p1", name: "برج النخيل السكني", client: "شركة الدلتا للتعمير", location: "الإسكندرية", budget: 8500000, status: "جارٍ" },
  { id: "p2", name: "فيلا التل الأخضر", client: "المهندس / كريم فوزي", location: "القاهرة الجديدة", budget: 2100000, status: "جارٍ" },
];

const seedWorkItems = [
  { id: "w1", projectId: "p1", name: "أعمال الحفر والردم", unit: "م3", qty: 1200, price: 180 },
  { id: "w2", projectId: "p1", name: "أعمال الخرسانة المسلحة", unit: "م3", qty: 950, price: 2400 },
  { id: "w3", projectId: "p1", name: "أعمال المباني (بلوك)", unit: "م2", qty: 3200, price: 210 },
  { id: "w4", projectId: "p1", name: "التشطيبات الداخلية", unit: "م2", qty: 2600, price: 950 },
  { id: "w5", projectId: "p2", name: "أعمال الخرسانة", unit: "م3", qty: 220, price: 2500 },
  { id: "w6", projectId: "p2", name: "التشطيبات والدهانات", unit: "م2", qty: 480, price: 880 },
];

const seedCosts = [
  { id: "c1", projectId: "p1", workItemId: "w1", type: "مشتريات", desc: "سولار وتشغيل معدات", qty: 4, unit: "شهر", price: 22000, date: "2026-05-10" },
  { id: "c2", projectId: "p1", workItemId: "w2", type: "مشتريات", desc: "حديد تسليح 16مم", qty: 85, unit: "طن", price: 34500, date: "2026-06-02" },
  { id: "c3", projectId: "p1", workItemId: "w2", type: "مصنعيات", desc: "مقاول باطن صب أعمدة", qty: 1, unit: "دفعة", price: 310000, date: "2026-06-15" },
  { id: "c4", projectId: "p1", workItemId: "w3", type: "مشتريات", desc: "طوب بلوك أسمنتي", qty: 60000, unit: "طوبة", price: 6.5, date: "2026-07-01" },
  { id: "c5", projectId: "p1", workItemId: "w3", type: "مصنعيات", desc: "أجرة عمالة بناء", qty: 1, unit: "دفعة", price: 145000, date: "2026-07-20" },
  { id: "c6", projectId: "p1", workItemId: "w4", type: "عهد", desc: "عهدة مهندس الموقع - تشطيبات", qty: 1, unit: "عهدة", price: 40000, date: "2026-08-01" },
  { id: "c7", projectId: "p1", workItemId: null, type: "مصروفات", desc: "رسوم تراخيص ومتابعة", qty: 1, unit: "دفعة", price: 28000, date: "2026-05-05" },
  { id: "c8", projectId: "p2", workItemId: "w5", type: "مشتريات", desc: "خرسانة جاهزة 30 نيوتن", qty: 210, unit: "م3", price: 2350, date: "2026-06-20" },
  { id: "c9", projectId: "p2", workItemId: "w6", type: "مصنعيات", desc: "مقاول دهانات", qty: 1, unit: "دفعة", price: 95000, date: "2026-07-25" },
  { id: "c10", projectId: "p1", workItemId: null, type: "مصروفات عمومية", desc: "أجور العمال", qty: 1, unit: "دفعة", price: 62000, date: "2026-07-10" },
  { id: "c11", projectId: "p1", workItemId: null, type: "مصروفات عمومية", desc: "مرتبات العاملين بالمشروع", qty: 1, unit: "دفعة", price: 54000, date: "2026-07-30" },
  { id: "c12", projectId: "p1", workItemId: null, type: "مصروفات عمومية", desc: "مصروفات الانتقالات", qty: 1, unit: "دفعة", price: 9500, date: "2026-08-01" },
  { id: "c13", projectId: "p1", workItemId: null, type: "مصروفات عمومية", desc: "إكراميات", qty: 1, unit: "دفعة", price: 3200, date: "2026-08-05" },
];

const seedExtracts = [
  { id: "e1", projectId: "p1", number: 1, date: "2026-05-31", percentage: 15, amount: 1275000 },
  { id: "e2", projectId: "p1", number: 2, date: "2026-06-30", percentage: 28, amount: 1105000 },
  { id: "e3", projectId: "p2", number: 1, date: "2026-06-30", percentage: 20, amount: 420000 },
];

const seedCollections = [
  { id: "cl1", extractId: "e1", amount: 1275000, date: "2026-06-05", method: "تحويل بنكي" },
  { id: "cl2", extractId: "e2", amount: 700000, date: "2026-07-04", method: "شيك" },
  { id: "cl3", extractId: "e3", amount: 420000, date: "2026-07-02", method: "تحويل بنكي" },
];

/* --------------------------------- helpers --------------------------------- */

const money = (n) =>
  (Math.round(n || 0)).toLocaleString("en-US") + " ج.م";

const fmt = (n, d = 0) =>
  (n || 0).toLocaleString("en-US", { maximumFractionDigits: d });

function useId(prefix) {
  return () => `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

/* ---------------------------------- app ---------------------------------- */

export default function ContractingApp() {
  const [projects, setProjects] = useState([]);
  const [workItems, setWorkItems] = useState([]);
  const [costs, setCosts] = useState([]);
  const [extracts, setExtracts] = useState([]);
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState(null);

  const [activeProjectId, setActiveProjectId] = useState("p1");
  const [tab, setTab] = useState("dashboard");
  const [showNewProject, setShowNewProject] = useState(false);

  useEffect(() => {
    async function loadAll() {
      const [projRes, wiRes, costRes, extRes, colRes] = await Promise.all([
        supabase.from("projects").select("*").order("created_at"),
        supabase.from("work_items").select("*").order("created_at"),
        supabase.from("costs").select("*").order("created_at"),
        supabase.from("extracts").select("*").order("created_at"),
        supabase.from("collections").select("*").order("created_at"),
      ]);

      const firstError = [projRes, wiRes, costRes, extRes, colRes].find((r) => r.error);
      if (firstError) {
        setDbError(firstError.error.message);
        setLoading(false);
        return;
      }

      setProjects(projRes.data || []);
      setWorkItems(
        (wiRes.data || []).map((w) => ({ id: w.id, projectId: w.project_id, name: w.name, unit: w.unit, qty: Number(w.qty), price: Number(w.price) }))
      );
      setCosts(
        (costRes.data || []).map((c) => ({ id: c.id, projectId: c.project_id, workItemId: c.work_item_id, type: c.type, desc: c.description, qty: Number(c.qty), unit: c.unit, price: Number(c.price), date: c.date }))
      );
      setExtracts(
        (extRes.data || []).map((e) => ({ id: e.id, projectId: e.project_id, number: e.number, date: e.date, percentage: Number(e.percentage), amount: Number(e.amount) }))
      );
      setCollections(
        (colRes.data || []).map((c) => ({ id: c.id, extractId: c.extract_id, amount: Number(c.amount), date: c.date, method: c.method }))
      );

      if (projRes.data && projRes.data.length > 0) {
        setActiveProjectId(projRes.data[0].id);
      }
      setLoading(false);
    }
    loadAll();
  }, []);

  async function addProject(p) {
    const { error } = await supabase.from("projects").insert([{ id: p.id, name: p.name, client: p.client, location: p.location, budget: p.budget, status: p.status }]);
    if (error) { alert("حصل خطأ أثناء حفظ المشروع: " + error.message); return; }
    setProjects((prev) => [...prev, p]);
  }

  async function addWorkItem(w) {
    const { error } = await supabase.from("work_items").insert([{ id: w.id, project_id: w.projectId, name: w.name, unit: w.unit, qty: w.qty, price: w.price }]);
    if (error) { alert("حصل خطأ أثناء حفظ بند العمل: " + error.message); return; }
    setWorkItems((prev) => [...prev, w]);
  }

  async function addCost(c) {
    const { error } = await supabase.from("costs").insert([{ id: c.id, project_id: c.projectId, work_item_id: c.workItemId, type: c.type, description: c.desc, qty: c.qty, unit: c.unit, price: c.price, date: c.date }]);
    if (error) { alert("حصل خطأ أثناء حفظ التكلفة: " + error.message); return; }
    setCosts((prev) => [...prev, c]);
  }

  async function addExtract(e) {
    const { error } = await supabase.from("extracts").insert([{ id: e.id, project_id: e.projectId, number: e.number, date: e.date, percentage: e.percentage, amount: e.amount }]);
    if (error) { alert("حصل خطأ أثناء حفظ المستخلص: " + error.message); return; }
    setExtracts((prev) => [...prev, e]);
  }

  async function addCollection(cl) {
    const { error } = await supabase.from("collections").insert([{ id: cl.id, extract_id: cl.extractId, amount: cl.amount, date: cl.date, method: cl.method }]);
    if (error) { alert("حصل خطأ أثناء حفظ التحصيل: " + error.message); return; }
    setCollections((prev) => [...prev, cl]);
  }

  const project = projects.find((p) => p.id === activeProjectId);
  const pWorkItems = workItems.filter((w) => w.projectId === activeProjectId);
  const pCosts = costs.filter((c) => c.projectId === activeProjectId);
  const pExtracts = extracts.filter((e) => e.projectId === activeProjectId);

  const totals = useMemo(() => {
    const budgetTotal = pWorkItems.reduce((s, w) => s + w.qty * w.price, 0);
    const actualTotal = pCosts.reduce((s, c) => s + c.qty * c.price, 0);
    const extractsTotal = pExtracts.reduce((s, e) => s + e.amount, 0);
    const collectedTotal = pExtracts.reduce((s, e) => {
      const cs = collections.filter((c) => c.extractId === e.id);
      return s + cs.reduce((ss, c) => ss + c.amount, 0);
    }, 0);
    return { budgetTotal, actualTotal, extractsTotal, collectedTotal };
  }, [pWorkItems, pCosts, pExtracts, collections]);

  const tabs = [
    { key: "dashboard", label: "لوحة التحكم", icon: LayoutGrid },
    { key: "items", label: "بنود الأعمال", icon: Ruler },
    { key: "costs", label: "التكاليف", icon: Hammer },
    { key: "extracts", label: "المستخلصات", icon: FileStack },
    { key: "budget", label: "المقايسة / Budget", icon: Wallet },
  ];

  return (
    <div dir="rtl" style={{ fontFamily: "'Cairo', sans-serif" }} className="w-full min-h-screen flex" >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
        .mono { font-family: 'IBM Plex Mono', monospace; }
        .blueprint-bg {
          background-color: #14212C;
          background-image:
            linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px);
          background-size: 28px 28px;
        }
        .paper-bg {
          background-color: #F6F3EA;
          background-image: linear-gradient(rgba(20,33,44,0.025) 1px, transparent 1px);
          background-size: 100% 32px;
        }
        .dim-line { border-top: 1px dashed #C9C1AC; }
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-thumb { background: #D8D3C7; border-radius: 4px; }
      `}</style>

      {loading && (
        <div className="fixed inset-0 bg-[#F6F3EA] flex items-center justify-center z-50 gap-2 text-[#1E2530]">
          <Loader2 size={20} className="animate-spin" />
          <span className="font-semibold text-sm">جاري تحميل بيانات المشروعات...</span>
        </div>
      )}

      {!loading && dbError && (
        <div className="fixed inset-0 bg-[#F6F3EA] flex items-center justify-center z-50 p-8" dir="rtl">
          <div className="bg-white border border-[#E1DACB] rounded-xl p-6 max-w-md text-center">
            <div className="font-bold text-[#C1453B] mb-2">تعذّر الاتصال بقاعدة البيانات</div>
            <div className="text-sm text-[#6B7280]">{dbError}</div>
          </div>
        </div>
      )}

      {/* SIDEBAR */}
      <aside className="blueprint-bg w-64 shrink-0 flex flex-col text-[#E7ECEF]" style={{ minHeight: "100vh" }}>
        <div className="px-5 pt-6 pb-5 border-b border-white/10">
          <div className="flex items-center gap-2 text-[#E8672C]">
            <div className="w-8 h-8 rounded border border-[#E8672C]/60 flex items-center justify-center">
              <Building2 size={16} strokeWidth={2.5} />
            </div>
            <span className="font-extrabold tracking-wide text-sm">دفتر المقاول</span>
          </div>
          <p className="text-[10px] text-white/40 mt-2 mono tracking-wider">CONTRACTING LEDGER — REV.01</p>
        </div>

        <div className="px-4 pt-4">
          <div className="text-[11px] text-white/40 font-semibold mb-2 px-1">المشروعات</div>
          <div className="space-y-1">
            {projects.map((p) => (
              <button
                key={p.id}
                onClick={() => setActiveProjectId(p.id)}
                className={`w-full text-right px-3 py-2 rounded-lg text-sm transition flex items-center justify-between ${
                  p.id === activeProjectId
                    ? "bg-[#E8672C] text-white font-bold"
                    : "text-white/70 hover:bg-white/5"
                }`}
              >
                <span className="truncate">{p.name}</span>
                {p.id === activeProjectId && <ChevronRight size={14} />}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowNewProject(true)}
            className="w-full mt-2 px-3 py-2 rounded-lg text-xs font-semibold text-white/60 border border-dashed border-white/15 hover:border-[#E8672C]/60 hover:text-[#E8672C] flex items-center justify-center gap-1 transition"
          >
            <Plus size={13} /> مشروع جديد
          </button>
        </div>

        <div className="mt-6 px-4">
          <div className="text-[11px] text-white/40 font-semibold mb-2 px-1">الأقسام</div>
          <nav className="space-y-1">
            {tabs.map((t) => {
              const Icon = t.icon;
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`w-full text-right px-3 py-2.5 rounded-lg text-sm flex items-center gap-2.5 transition ${
                    active ? "bg-white/10 text-white font-bold" : "text-white/60 hover:bg-white/5 hover:text-white/90"
                  }`}
                >
                  <Icon size={16} className={active ? "text-[#E8672C]" : ""} />
                  {t.label}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="mt-auto p-4">
          <div className="rounded-lg border border-white/10 p-3 text-[11px] text-white/40 leading-relaxed">
            <div className="font-semibold text-white/60 mb-1">{project?.name}</div>
            {project?.client} · {project?.location}
          </div>
        </div>
      </aside>

      {/* MAIN */}
      <main className="flex-1 paper-bg min-h-screen">
        <header className="px-8 pt-7 pb-5 border-b border-[#E1DACB] bg-[#F6F3EA]/80 sticky top-0 backdrop-blur z-10">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[11px] mono text-[#9A9483] mb-1">
                {project?.status} · {project?.location}
              </div>
              <h1 className="text-2xl font-extrabold text-[#1E2530]">{project?.name}</h1>
            </div>
            <div className="text-left">
              <div className="text-[11px] text-[#9A9483] mb-1">إجمالي عقد المشروع</div>
              <div className="text-xl font-bold mono text-[#1E2530]">{money(project?.budget)}</div>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-3 mt-5">
            <StatCard label="ميزانية بنود الأعمال" value={money(totals.budgetTotal)} icon={Wallet} color="#1E2530" />
            <StatCard
              label="إجمالي التكاليف الفعلية"
              value={money(totals.actualTotal)}
              icon={totals.actualTotal > totals.budgetTotal ? TrendingUp : TrendingDown}
              color={totals.actualTotal > totals.budgetTotal ? "#C1453B" : "#3F7D63"}
            />
            <StatCard label="إجمالي المستخلصات" value={money(totals.extractsTotal)} icon={FileStack} color="#E8672C" />
            <StatCard label="المُحصَّل" value={money(totals.collectedTotal)} icon={CircleDollarSign} color="#3F7D63" />
          </div>
        </header>

        <div className="p-8">
          {tab === "dashboard" && (
            <Dashboard totals={totals} pWorkItems={pWorkItems} pCosts={pCosts} pExtracts={pExtracts} collections={collections} />
          )}
          {tab === "items" && (
            <WorkItemsTab
              pWorkItems={pWorkItems}
              pCosts={pCosts}
              activeProjectId={activeProjectId}
              onAddWorkItem={addWorkItem}
            />
          )}
          {tab === "costs" && (
            <CostsTab
              pCosts={pCosts}
              pWorkItems={pWorkItems}
              activeProjectId={activeProjectId}
              onAddCost={addCost}
            />
          )}
          {tab === "extracts" && (
            <ExtractsTab
              pExtracts={pExtracts}
              collections={collections}
              onAddExtract={addExtract}
              onAddCollection={addCollection}
              activeProjectId={activeProjectId}
              projectBudget={project?.budget}
            />
          )}
          {tab === "budget" && (
            <BudgetTab pWorkItems={pWorkItems} pCosts={pCosts} />
          )}
        </div>
      </main>

      {showNewProject && (
        <NewProjectModal
          onClose={() => setShowNewProject(false)}
          onCreate={async (p) => {
            await addProject(p);
            setActiveProjectId(p.id);
            setShowNewProject(false);
          }}
        />
      )}
    </div>

  );
}

/* ------------------------------- stat card ------------------------------- */

function StatCard({ label, value, icon: Icon, color }) {
  return (
    <div className="bg-white rounded-xl border border-[#E1DACB] px-4 py-3 flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: color + "18" }}>
        <Icon size={17} style={{ color }} />
      </div>
      <div className="min-w-0">
        <div className="text-[11px] text-[#9A9483] truncate">{label}</div>
        <div className="text-sm font-bold mono text-[#1E2530] truncate">{value}</div>
      </div>
    </div>
  );
}

/* -------------------------------- dashboard -------------------------------- */

function Dashboard({ totals, pWorkItems, pCosts, pExtracts, collections }) {
  const chartData = pWorkItems.map((w) => {
    const actual = pCosts.filter((c) => c.workItemId === w.id).reduce((s, c) => s + c.qty * c.price, 0);
    return { name: w.name.length > 14 ? w.name.slice(0, 14) + "…" : w.name, الميزانية: w.qty * w.price, الفعلي: actual };
  });

  const recentCosts = [...pCosts].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 6);
  const variance = totals.budgetTotal - totals.actualTotal;

  return (
    <div className="space-y-6">
      <section className="bg-white rounded-xl border border-[#E1DACB] p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-[#1E2530]">الميزانية مقابل الفعلي — حسب بند العمل</h2>
          <div className={`text-sm font-bold mono flex items-center gap-1 ${variance >= 0 ? "text-[#3F7D63]" : "text-[#C1453B]"}`}>
            {variance >= 0 ? <TrendingDown size={14} /> : <TrendingUp size={14} />}
            {variance >= 0 ? "وفر" : "تجاوز"} {money(Math.abs(variance))}
          </div>
        </div>
        <div style={{ width: "100%", height: 280 }}>
          <ResponsiveContainer>
            <BarChart data={chartData} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E1DACB" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fontFamily: "Cairo" }} stroke="#9A9483" />
              <YAxis tick={{ fontSize: 10 }} stroke="#9A9483" tickFormatter={(v) => (v / 1000) + "k"} />
              <Tooltip formatter={(v) => money(v)} contentStyle={{ fontFamily: "Cairo", fontSize: 12, borderRadius: 8, border: "1px solid #E1DACB" }} />
              <Bar dataKey="الميزانية" fill="#1E2530" radius={[4, 4, 0, 0]} />
              <Bar dataKey="الفعلي" radius={[4, 4, 0, 0]}>
                {chartData.map((d, i) => (
                  <Cell key={i} fill={d.الفعلي > d.الميزانية ? "#C1453B" : "#E8672C"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="bg-white rounded-xl border border-[#E1DACB] p-5">
        <h2 className="font-bold text-[#1E2530] mb-3">آخر التكاليف المسجّلة</h2>
        <div className="divide-y divide-[#EFEBDF]">
          {recentCosts.length === 0 && <div className="text-sm text-[#9A9483] py-4">لا توجد تكاليف مسجّلة بعد.</div>}
          {recentCosts.map((c) => {
            const meta = COST_TYPES.find((t) => t.key === c.type);
            const Icon = meta?.icon || Receipt;
            return (
              <div key={c.id} className="py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: meta?.color + "18" }}>
                    <Icon size={14} style={{ color: meta?.color }} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-[#1E2530] truncate">{c.desc}</div>
                    <div className="text-[11px] text-[#9A9483]">{meta?.label} · {c.date}</div>
                  </div>
                </div>
                <div className="text-sm font-bold mono shrink-0">{money(c.qty * c.price)}</div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

/* ------------------------------- work items -------------------------------- */

function WorkItemsTab({ pWorkItems, pCosts, activeProjectId, onAddWorkItem }) {
  const [form, setForm] = useState({ name: "", unit: "", qty: "", price: "" });
  const [open, setOpen] = useState(false);

  const submit = () => {
    if (!form.name || !form.qty || !form.price) return;
    onAddWorkItem({ id: "w_" + Math.random().toString(36).slice(2, 8), projectId: activeProjectId, name: form.name, unit: form.unit || "-", qty: Number(form.qty), price: Number(form.price) });
    setForm({ name: "", unit: "", qty: "", price: "" });
    setOpen(false);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-[#1E2530] text-lg">بنود الأعمال</h2>
        <button onClick={() => setOpen((o) => !o)} className="px-3 py-2 rounded-lg bg-[#1E2530] text-white text-sm font-semibold flex items-center gap-1.5 hover:bg-[#2b3543] transition">
          <Plus size={15} /> إضافة بند عمل
        </button>
      </div>

      {open && (
        <div className="bg-white rounded-xl border border-[#E1DACB] p-4 grid grid-cols-4 gap-3">
          <Field label="اسم البند" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="مثال: أعمال العزل" />
          <Field label="الوحدة" value={form.unit} onChange={(v) => setForm((f) => ({ ...f, unit: v }))} placeholder="م2 / م3 / قطعة" />
          <Field label="الكمية" value={form.qty} onChange={(v) => setForm((f) => ({ ...f, qty: v }))} type="number" />
          <Field label="سعر الوحدة" value={form.price} onChange={(v) => setForm((f) => ({ ...f, price: v }))} type="number" />
          <div className="col-span-4 flex justify-end">
            <button onClick={submit} className="px-4 py-2 rounded-lg bg-[#E8672C] text-white text-sm font-semibold hover:bg-[#C8511E] transition">حفظ البند</button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-[#E1DACB] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#F6F3EA] text-[#6B7280] text-[12px]">
              <th className="text-right py-3 px-4 font-semibold">بند العمل</th>
              <th className="text-right py-3 px-4 font-semibold">الوحدة</th>
              <th className="text-right py-3 px-4 font-semibold">الكمية</th>
              <th className="text-right py-3 px-4 font-semibold">سعر الوحدة</th>
              <th className="text-right py-3 px-4 font-semibold">إجمالي الميزانية</th>
              <th className="text-right py-3 px-4 font-semibold">التكلفة الفعلية</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EFEBDF]">
            {pWorkItems.map((w) => {
              const actual = pCosts.filter((c) => c.workItemId === w.id).reduce((s, c) => s + c.qty * c.price, 0);
              const budget = w.qty * w.price;
              return (
                <tr key={w.id} className="hover:bg-[#FAF8F2] transition">
                  <td className="py-3 px-4 font-semibold text-[#1E2530]">{w.name}</td>
                  <td className="py-3 px-4 text-[#6B7280]">{w.unit}</td>
                  <td className="py-3 px-4 mono">{fmt(w.qty)}</td>
                  <td className="py-3 px-4 mono">{fmt(w.price)}</td>
                  <td className="py-3 px-4 mono font-bold">{money(budget)}</td>
                  <td className={`py-3 px-4 mono font-bold ${actual > budget ? "text-[#C1453B]" : "text-[#3F7D63]"}`}>{money(actual)}</td>
                </tr>
              );
            })}
            {pWorkItems.length === 0 && (
              <tr><td colSpan={6} className="text-center py-8 text-[#9A9483]">لا توجد بنود أعمال بعد.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* --------------------------------- costs --------------------------------- */

function CostsTab({ pCosts, pWorkItems, activeProjectId, onAddCost }) {
  const [filter, setFilter] = useState("الكل");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ type: "مشتريات", workItemId: "", desc: "", customDesc: "", qty: "1", unit: "", price: "", date: "" });

  const isGeneral = form.type === "مصروفات عمومية";
  const finalDesc = isGeneral ? (form.desc === "أخرى" ? form.customDesc : form.desc) : form.desc;

  const submit = () => {
    if (!finalDesc || !form.price) return;
    onAddCost({
      id: "c_" + Math.random().toString(36).slice(2, 8),
      projectId: activeProjectId,
      workItemId: form.workItemId || null,
      type: form.type,
      desc: finalDesc,
      qty: Number(form.qty) || 1,
      unit: form.unit || "-",
      price: Number(form.price),
      date: form.date || new Date().toISOString().slice(0, 10),
    });
    setForm({ type: "مشتريات", workItemId: "", desc: "", customDesc: "", qty: "1", unit: "", price: "", date: "" });
    setOpen(false);
  };

  const filtered = filter === "الكل" ? pCosts : pCosts.filter((c) => c.type === filter);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-[#1E2530] text-lg">التكاليف</h2>
        <button onClick={() => setOpen((o) => !o)} className="px-3 py-2 rounded-lg bg-[#1E2530] text-white text-sm font-semibold flex items-center gap-1.5 hover:bg-[#2b3543] transition">
          <Plus size={15} /> تسجيل تكلفة
        </button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {["الكل", ...COST_TYPES.map((t) => t.key)].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
              filter === f ? "bg-[#1E2530] text-white border-[#1E2530]" : "bg-white text-[#6B7280] border-[#E1DACB] hover:border-[#1E2530]/40"
            }`}
          >
            {f === "الكل" ? "الكل" : COST_TYPES.find((t) => t.key === f).label}
          </button>
        ))}
      </div>

      {open && (
        <div className="bg-white rounded-xl border border-[#E1DACB] p-4 grid grid-cols-3 gap-3">
          <SelectField label="نوع التكلفة" value={form.type} onChange={(v) => setForm((f) => ({ ...f, type: v }))} options={COST_TYPES.map((t) => ({ value: t.key, label: t.label }))} />
          <SelectField
            label="بند العمل (اختياري)"
            value={form.workItemId}
            onChange={(v) => setForm((f) => ({ ...f, workItemId: v }))}
            options={[{ value: "", label: "— غير مرتبط ببند —" }, ...pWorkItems.map((w) => ({ value: w.id, label: w.name }))]}
          />
          <Field label="التاريخ" value={form.date} onChange={(v) => setForm((f) => ({ ...f, date: v }))} type="date" />

          {isGeneral ? (
            <>
              <div className="col-span-3">
                <SelectField
                  label="بند المصروف العمومي"
                  value={form.desc}
                  onChange={(v) => setForm((f) => ({ ...f, desc: v }))}
                  options={[{ value: "", label: "— اختر البند —" }, ...GENERAL_EXPENSE_ITEMS.map((i) => ({ value: i, label: i }))]}
                />
              </div>
              {form.desc === "أخرى" && (
                <div className="col-span-3">
                  <Field label="وصف المصروف" value={form.customDesc} onChange={(v) => setForm((f) => ({ ...f, customDesc: v }))} placeholder="اكتب وصف المصروف" />
                </div>
              )}
            </>
          ) : (
            <div className="col-span-3">
              <Field label="تفاصيل التكلفة / الوصف" value={form.desc} onChange={(v) => setForm((f) => ({ ...f, desc: v }))} placeholder="مثال: توريد أسمنت بورتلاندي" />
            </div>
          )}

          <Field label="الكمية" value={form.qty} onChange={(v) => setForm((f) => ({ ...f, qty: v }))} type="number" />
          <Field label="الوحدة" value={form.unit} onChange={(v) => setForm((f) => ({ ...f, unit: v }))} placeholder="طن / دفعة / يوم" />
          <Field label="سعر الوحدة / القيمة" value={form.price} onChange={(v) => setForm((f) => ({ ...f, price: v }))} type="number" />
          <div className="col-span-3 flex justify-end">
            <button onClick={submit} className="px-4 py-2 rounded-lg bg-[#E8672C] text-white text-sm font-semibold hover:bg-[#C8511E] transition">حفظ التكلفة</button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-[#E1DACB] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#F6F3EA] text-[#6B7280] text-[12px]">
              <th className="text-right py-3 px-4 font-semibold">النوع</th>
              <th className="text-right py-3 px-4 font-semibold">التفاصيل</th>
              <th className="text-right py-3 px-4 font-semibold">بند العمل</th>
              <th className="text-right py-3 px-4 font-semibold">الكمية</th>
              <th className="text-right py-3 px-4 font-semibold">سعر الوحدة</th>
              <th className="text-right py-3 px-4 font-semibold">القيمة</th>
              <th className="text-right py-3 px-4 font-semibold">التاريخ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EFEBDF]">
            {filtered.map((c) => {
              const meta = COST_TYPES.find((t) => t.key === c.type);
              const w = pWorkItems.find((w) => w.id === c.workItemId);
              return (
                <tr key={c.id} className="hover:bg-[#FAF8F2] transition">
                  <td className="py-3 px-4">
                    <span className="text-[11px] font-semibold px-2 py-1 rounded-md" style={{ backgroundColor: meta?.color + "18", color: meta?.color }}>{meta?.label}</span>
                  </td>
                  <td className="py-3 px-4 font-medium text-[#1E2530]">{c.desc}</td>
                  <td className="py-3 px-4 text-[#6B7280]">{w ? w.name : "—"}</td>
                  <td className="py-3 px-4 mono">{fmt(c.qty)} {c.unit}</td>
                  <td className="py-3 px-4 mono">{fmt(c.price)}</td>
                  <td className="py-3 px-4 mono font-bold">{money(c.qty * c.price)}</td>
                  <td className="py-3 px-4 text-[#9A9483] mono text-xs">{c.date}</td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="text-center py-8 text-[#9A9483]">لا توجد تكاليف في هذا التصنيف.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* -------------------------------- extracts -------------------------------- */

function ExtractsTab({ pExtracts, collections, onAddExtract, onAddCollection, activeProjectId, projectBudget }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ number: "", date: "", percentage: "", amount: "" });
  const [expanded, setExpanded] = useState(null);
  const [collForm, setCollForm] = useState({ amount: "", date: "", method: "تحويل بنكي" });

  const submit = () => {
    if (!form.number || !form.amount) return;
    onAddExtract({ id: "e_" + Math.random().toString(36).slice(2, 8), projectId: activeProjectId, number: Number(form.number), date: form.date || new Date().toISOString().slice(0, 10), percentage: Number(form.percentage) || 0, amount: Number(form.amount) });
    setForm({ number: "", date: "", percentage: "", amount: "" });
    setOpen(false);
  };

  const addCollectionForExtract = (extractId) => {
    if (!collForm.amount) return;
    onAddCollection({ id: "cl_" + Math.random().toString(36).slice(2, 8), extractId, amount: Number(collForm.amount), date: collForm.date || new Date().toISOString().slice(0, 10), method: collForm.method });
    setCollForm({ amount: "", date: "", method: "تحويل بنكي" });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-[#1E2530] text-lg">المستخلصات والتحصيلات</h2>
        <button onClick={() => setOpen((o) => !o)} className="px-3 py-2 rounded-lg bg-[#1E2530] text-white text-sm font-semibold flex items-center gap-1.5 hover:bg-[#2b3543] transition">
          <Plus size={15} /> مستخلص جديد
        </button>
      </div>

      {open && (
        <div className="bg-white rounded-xl border border-[#E1DACB] p-4 grid grid-cols-4 gap-3">
          <Field label="رقم المستخلص" value={form.number} onChange={(v) => setForm((f) => ({ ...f, number: v }))} type="number" />
          <Field label="التاريخ" value={form.date} onChange={(v) => setForm((f) => ({ ...f, date: v }))} type="date" />
          <Field label="نسبة الإنجاز %" value={form.percentage} onChange={(v) => setForm((f) => ({ ...f, percentage: v }))} type="number" />
          <Field label="قيمة المستخلص" value={form.amount} onChange={(v) => setForm((f) => ({ ...f, amount: v }))} type="number" />
          <div className="col-span-4 flex justify-end">
            <button onClick={submit} className="px-4 py-2 rounded-lg bg-[#E8672C] text-white text-sm font-semibold hover:bg-[#C8511E] transition">حفظ المستخلص</button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {pExtracts.length === 0 && (
          <div className="bg-white rounded-xl border border-[#E1DACB] p-8 text-center text-[#9A9483] text-sm">لا توجد مستخلصات مسجّلة بعد.</div>
        )}
        {[...pExtracts].sort((a, b) => a.number - b.number).map((e) => {
          const eColls = collections.filter((c) => c.extractId === e.id);
          const collected = eColls.reduce((s, c) => s + c.amount, 0);
          const outstanding = e.amount - collected;
          const isOpen = expanded === e.id;
          return (
            <div key={e.id} className="bg-white rounded-xl border border-[#E1DACB] overflow-hidden">
              <button onClick={() => setExpanded(isOpen ? null : e.id)} className="w-full flex items-center justify-between px-5 py-4 hover:bg-[#FAF8F2] transition">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-[#E8672C]/10 flex items-center justify-center text-[#E8672C] font-extrabold mono text-sm">#{e.number}</div>
                  <div className="text-right">
                    <div className="font-bold text-[#1E2530]">مستخلص رقم {e.number}</div>
                    <div className="text-[11px] text-[#9A9483] mono">{e.date} · نسبة إنجاز {e.percentage}%</div>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <div className="text-[11px] text-[#9A9483]">قيمة المستخلص</div>
                    <div className="font-bold mono">{money(e.amount)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] text-[#9A9483]">المحصَّل</div>
                    <div className="font-bold mono text-[#3F7D63]">{money(collected)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] text-[#9A9483]">المتبقي</div>
                    <div className={`font-bold mono ${outstanding > 0 ? "text-[#D6A23C]" : "text-[#3F7D63]"}`}>{money(outstanding)}</div>
                  </div>
                  {outstanding <= 0 ? (
                    <CheckCircle2 size={18} className="text-[#3F7D63]" />
                  ) : (
                    <Clock size={18} className="text-[#D6A23C]" />
                  )}
                  <ChevronDown size={16} className={`text-[#9A9483] transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-[#EFEBDF] px-5 py-4 bg-[#FAF8F2]">
                  <div className="text-xs font-semibold text-[#6B7280] mb-2">التحصيلات</div>
                  <div className="space-y-1.5 mb-4">
                    {eColls.map((c) => (
                      <div key={c.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-[#E1DACB] text-sm">
                        <span className="text-[#6B7280]">{c.method} · {c.date}</span>
                        <span className="font-bold mono text-[#3F7D63]">{money(c.amount)}</span>
                      </div>
                    ))}
                    {eColls.length === 0 && <div className="text-xs text-[#9A9483] py-1">لم يتم تحصيل أي مبلغ بعد.</div>}
                  </div>
                  <div className="grid grid-cols-4 gap-2 items-end">
                    <Field label="المبلغ" value={collForm.amount} onChange={(v) => setCollForm((f) => ({ ...f, amount: v }))} type="number" small />
                    <Field label="التاريخ" value={collForm.date} onChange={(v) => setCollForm((f) => ({ ...f, date: v }))} type="date" small />
                    <SelectField label="طريقة التحصيل" value={collForm.method} onChange={(v) => setCollForm((f) => ({ ...f, method: v }))} options={[{ value: "تحويل بنكي", label: "تحويل بنكي" }, { value: "شيك", label: "شيك" }, { value: "نقدي", label: "نقدي" }]} small />
                    <button onClick={() => addCollectionForExtract(e.id)} className="px-3 py-2 rounded-lg bg-[#3F7D63] text-white text-xs font-semibold hover:bg-[#356A54] transition h-[38px]">تسجيل تحصيل</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* --------------------------------- budget --------------------------------- */

function BudgetTab({ pWorkItems, pCosts }) {
  const rows = pWorkItems.map((w) => {
    const actual = pCosts.filter((c) => c.workItemId === w.id).reduce((s, c) => s + c.qty * c.price, 0);
    const budget = w.qty * w.price;
    const variance = budget - actual;
    const pct = budget > 0 ? (actual / budget) * 100 : 0;
    return { ...w, budget, actual, variance, pct };
  });

  const unassigned = pCosts.filter((c) => !c.workItemId).reduce((s, c) => s + c.qty * c.price, 0);
  const totalBudget = rows.reduce((s, r) => s + r.budget, 0);
  const totalActual = rows.reduce((s, r) => s + r.actual, 0) + unassigned;

  return (
    <div className="space-y-5">
      <h2 className="font-bold text-[#1E2530] text-lg">المقايسة — مقارنة الفعلي بالميزانية</h2>

      <div className="bg-white rounded-xl border border-[#E1DACB] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#F6F3EA] text-[#6B7280] text-[12px]">
              <th className="text-right py-3 px-4 font-semibold">بند العمل</th>
              <th className="text-right py-3 px-4 font-semibold">الميزانية</th>
              <th className="text-right py-3 px-4 font-semibold">الفعلي</th>
              <th className="text-right py-3 px-4 font-semibold">الانحراف</th>
              <th className="text-right py-3 px-4 font-semibold w-56">نسبة الصرف</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EFEBDF]">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-[#FAF8F2] transition">
                <td className="py-3 px-4 font-semibold text-[#1E2530]">{r.name}</td>
                <td className="py-3 px-4 mono">{money(r.budget)}</td>
                <td className="py-3 px-4 mono">{money(r.actual)}</td>
                <td className={`py-3 px-4 mono font-bold ${r.variance >= 0 ? "text-[#3F7D63]" : "text-[#C1453B]"}`}>
                  {r.variance >= 0 ? "+" : ""}{money(r.variance)}
                </td>
                <td className="py-3 px-4">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 rounded-full bg-[#EFEBDF] overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: Math.min(r.pct, 100) + "%", backgroundColor: r.pct > 100 ? "#C1453B" : r.pct > 85 ? "#D6A23C" : "#3F7D63" }}
                      />
                    </div>
                    <span className="mono text-xs w-12 text-left shrink-0">{fmt(r.pct, 0)}%</span>
                  </div>
                </td>
              </tr>
            ))}
            {unassigned > 0 && (
              <tr className="bg-[#FAF8F2]">
                <td className="py-3 px-4 font-semibold text-[#9A9483]">تكاليف غير مرتبطة ببند (مصروفات عامة)</td>
                <td className="py-3 px-4 mono text-[#9A9483]">—</td>
                <td className="py-3 px-4 mono">{money(unassigned)}</td>
                <td className="py-3 px-4 mono">—</td>
                <td className="py-3 px-4 text-[#9A9483] text-xs">غير محسوب ضمن بند</td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="bg-[#1E2530] text-white">
              <td className="py-3 px-4 font-bold">الإجمالي</td>
              <td className="py-3 px-4 mono font-bold">{money(totalBudget)}</td>
              <td className="py-3 px-4 mono font-bold">{money(totalActual)}</td>
              <td className={`py-3 px-4 mono font-bold ${totalBudget - totalActual >= 0 ? "text-[#7FD9B0]" : "text-[#F0918A]"}`}>
                {totalBudget - totalActual >= 0 ? "+" : ""}{money(totalBudget - totalActual)}
              </td>
              <td className="py-3 px-4 mono font-bold">{totalBudget > 0 ? fmt((totalActual / totalBudget) * 100, 0) : 0}%</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

/* -------------------------------- new project ------------------------------- */

function NewProjectModal({ onClose, onCreate }) {
  const [form, setForm] = useState({ name: "", client: "", location: "", budget: "" });

  const submit = () => {
    if (!form.name) return;
    onCreate({ id: "p_" + Math.random().toString(36).slice(2, 8), name: form.name, client: form.client, location: form.location, budget: Number(form.budget) || 0, status: "جارٍ" });
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" dir="rtl">
      <div className="bg-white rounded-xl w-full max-w-md p-6 relative" style={{ fontFamily: "'Cairo', sans-serif" }}>
        <button onClick={onClose} className="absolute left-4 top-4 text-[#9A9483] hover:text-[#1E2530]"><X size={18} /></button>
        <h3 className="font-bold text-lg text-[#1E2530] mb-4">مشروع جديد</h3>
        <div className="space-y-3">
          <Field label="اسم المشروع" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} />
          <Field label="العميل" value={form.client} onChange={(v) => setForm((f) => ({ ...f, client: v }))} />
          <Field label="الموقع" value={form.location} onChange={(v) => setForm((f) => ({ ...f, location: v }))} />
          <Field label="قيمة العقد" value={form.budget} onChange={(v) => setForm((f) => ({ ...f, budget: v }))} type="number" />
        </div>
        <button onClick={submit} className="w-full mt-5 py-2.5 rounded-lg bg-[#E8672C] text-white font-semibold hover:bg-[#C8511E] transition">إنشاء المشروع</button>
      </div>
    </div>
  );
}

/* -------------------------------- form fields ------------------------------- */

function Field({ label, value, onChange, type = "text", placeholder = "", small }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-[#6B7280] mb-1">{label}</label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full border border-[#E1DACB] rounded-lg px-3 ${small ? "py-1.5 text-xs" : "py-2 text-sm"} outline-none focus:border-[#E8672C] transition bg-white`}
      />
    </div>
  );
}

function SelectField({ label, value, onChange, options, small }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-[#6B7280] mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full border border-[#E1DACB] rounded-lg px-3 ${small ? "py-1.5 text-xs" : "py-2 text-sm"} outline-none focus:border-[#E8672C] transition bg-white`}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}
