import React, { useState, useMemo, useEffect } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  PieChart as RePieChart, Pie, Legend, LineChart, Line,
} from "recharts";
import {
  Building2, LayoutGrid, Hammer, Receipt, FileStack, Wallet, Plus, X,
  TrendingUp, TrendingDown, ChevronDown, ChevronRight, Package, HardHat,
  Landmark, CircleDollarSign, CheckCircle2, Clock, Ruler, Users, Loader2,
  Trash2, Pencil, Printer, Banknote, Upload, ShieldCheck, LogOut,
  LayoutDashboard, ClipboardList, ReceiptText, FileCheck2, HandCoins, Vault, BarChart3,
  Gauge, Layers, FileSignature, Percent, Hourglass, FolderKanban, UserCircle2, Palette, RotateCcw,
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

/* --------------------------------- helpers --------------------------------- */

const money = (n) =>
  (Math.round(n || 0)).toLocaleString("en-US") + " ج.م";

const fmt = (n, d = 0) =>
  (n || 0).toLocaleString("en-US", { maximumFractionDigits: d });

/* ------------------------ استيراد التكاليف من إكسيل ------------------------ */
// مكتبة قراءة الإكسل (SheetJS) بتتحمّل من CDN وقت الحاجة، مفيش أي تعديل في package.json

let sheetJSPromise = null;
function loadSheetJS() {
  if (typeof window !== "undefined" && window.XLSX) return Promise.resolve(window.XLSX);
  if (sheetJSPromise) return sheetJSPromise;
  sheetJSPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
    script.async = true;
    script.onload = () => resolve(window.XLSX);
    script.onerror = () => { sheetJSPromise = null; reject(new Error("تعذّر تحميل مكتبة قراءة الإكسل. تأكد من اتصالك بالإنترنت وحاول تاني.")); };
    document.body.appendChild(script);
  });
  return sheetJSPromise;
}

const COST_TEMPLATE_HEADERS = ["التاريخ", "بند العمل", "النوع", "الوصف", "المستوى الأول", "المستوى الثاني", "الكمية", "الوحدة", "السعر"];

function downloadCostExcelTemplate(pWorkItems) {
  loadSheetJS()
    .then((XLSX) => {
      const sample = [
        {
          "التاريخ": "2026-08-01",
          "بند العمل": pWorkItems[0]?.name || "أعمال المباني",
          "النوع": "مشتريات وكميات",
          "الوصف": "توريد طوب",
          "المستوى الأول": "",
          "المستوى الثاني": "",
          "الكمية": 1000,
          "الوحدة": "طوبة",
          "السعر": 2.5,
        },
      ];
      const ws = XLSX.utils.json_to_sheet(sample, { header: COST_TEMPLATE_HEADERS });
      ws["!cols"] = COST_TEMPLATE_HEADERS.map(() => ({ wch: 18 }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "التكاليف");
      XLSX.writeFile(wb, "قالب استيراد التكاليف.xlsx");
    })
    .catch((err) => alert(err.message));
}

function parseCostExcelFile(file, pWorkItems) {
  return loadSheetJS().then((XLSX) =>
    file.arrayBuffer().then((buf) => {
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

      const formatDate = (v) => {
        if (!v) return "";
        if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10);
        const s = String(v).trim();
        if (!s) return "";
        const parsed = new Date(s);
        if (!isNaN(parsed.getTime()) && /\d{4}/.test(s)) return parsed.toISOString().slice(0, 10);
        return s;
      };

      return rows.map((r, i) => {
        const warnings = [];
        const errors = [];
        const descRaw = String(r["الوصف"] || "").trim();
        const typeRaw = String(r["النوع"] || "").trim();
        const workItemRaw = String(r["بند العمل"] || "").trim();
        const qtyRaw = r["الكمية"];
        const priceRaw = r["السعر"];

        let type = COST_TYPES.find((t) => t.key === typeRaw || t.label === typeRaw)?.key;
        if (!type) {
          type = "مصروفات";
          if (typeRaw) warnings.push(`نوع "${typeRaw}" غير معروف، اتحطت كـ"مصروفات"`);
        }

        let workItemId = null;
        if (workItemRaw) {
          const match = pWorkItems.find((w) => w.name.trim() === workItemRaw);
          if (match) workItemId = match.id;
          else warnings.push(`بند العمل "${workItemRaw}" غير موجود، هتتسجل بدون ربط ببند`);
        }

        const qty = Number(qtyRaw) || 1;
        const price = Number(priceRaw);

        if (!descRaw) errors.push("الوصف مطلوب");
        if (!priceRaw && priceRaw !== 0) errors.push("السعر مطلوب");
        else if (isNaN(price) || price <= 0) errors.push("السعر لازم يكون رقم أكبر من صفر");

        return {
          rowIndex: i + 2,
          valid: errors.length === 0,
          errors,
          warnings,
          data: {
            date: formatDate(r["التاريخ"]) || new Date().toISOString().slice(0, 10),
            workItemId,
            type,
            desc: descRaw,
            costLevel1: String(r["المستوى الأول"] || "").trim(),
            costLevel2: String(r["المستوى الثاني"] || "").trim(),
            qty,
            unit: String(r["الوحدة"] || "").trim() || "-",
            price: isNaN(price) ? 0 : price,
          },
        };
      });
    })
  );
}

/* ------------------------------ إعدادات المظهر ------------------------------ */
const THEME_KEY = "cl-theme-v1";
const THEME_DEFAULT = { bg: "#050505", card: "", text: "", accent: "#f0c85a", font: "ibm" };
const THEME_FONTS = {
  ibm: { label: "IBM Plex Sans Arabic", q: "IBM+Plex+Sans+Arabic:wght@400;500;600;700", css: "'IBM Plex Sans Arabic'" },
  cairo: { label: "Cairo", q: "Cairo:wght@400;500;600;700;800", css: "'Cairo'" },
  tajawal: { label: "Tajawal", q: "Tajawal:wght@400;500;700;800", css: "'Tajawal'" },
  almarai: { label: "Almarai", q: "Almarai:wght@400;700;800", css: "'Almarai'" },
  kufi: { label: "Noto Kufi Arabic", q: "Noto+Kufi+Arabic:wght@400;500;600;700", css: "'Noto Kufi Arabic'" },
  readex: { label: "Readex Pro", q: "Readex+Pro:wght@400;500;600;700", css: "'Readex Pro'" },
  alex: { label: "Alexandria", q: "Alexandria:wght@400;500;600;700", css: "'Alexandria'" },
  naskh: { label: "Noto Naskh Arabic (نسخ)", q: "Noto+Naskh+Arabic:wght@400;500;600;700", css: "'Noto Naskh Arabic'" },
  system: { label: "خط النظام", q: "", css: "system-ui" },
};
const THEME_PRESETS = [
  { l: "داكن", bg: "#050505" },
  { l: "داكن فاتح", bg: "#1b1c22" },
  { l: "رمادي", bg: "#2c2e38" },
  { l: "فاتح", bg: "#f3f1ec" },
];

const clampN = (n, a = 0, b = 100) => Math.min(b, Math.max(a, n));
function hexToHsl(hex) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16) / 255, g = parseInt(h.slice(2, 4), 16) / 255, b = parseInt(h.slice(4, 6), 16) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, L = (mx + mn) / 2;
  let H = 0, S = 0;
  if (d) {
    S = d / (1 - Math.abs(2 * L - 1));
    if (mx === r) H = ((g - b) / d) % 6; else if (mx === g) H = (b - r) / d + 2; else H = (r - g) / d + 4;
    H *= 60; if (H < 0) H += 360;
  }
  return [H, S * 100, L * 100];
}
function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n) => Math.round((l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))) * 255).toString(16).padStart(2, "0");
  return "#" + f(0) + f(8) + f(4);
}

function buildTheme(t) {
  const [h, s0, l] = hexToHsl(t.bg);
  const dark = l < 55;
  const s = Math.min(s0, dark ? 30 : 25);
  const c = (d) => hslToHex(h, s, clampN(l + d));
  const P = dark
    ? { card: c(4.5), input: c(1), sub: c(6.5), inset: c(1.5), line: c(13.5), sep: c(8), chip: c(9), hover: c(17), ink: c(17), inkH: c(24), side: c(2) }
    : { card: c(7), input: c(7), sub: c(3.5), inset: c(-1.5), line: c(-10), sep: c(-5), chip: c(-6), hover: c(-13), ink: "#1E2530", inkH: "#2b3543", side: "#14161c" };
  if (t.card) { P.card = t.card; P.input = t.card; }
  const text = t.text || (dark ? "#eeeeee" : "#1E2530");
  const muted = dark ? hslToHex(240, 6, Math.min(80, 56 + l * 0.5)) : "#8a8574";
  const soft = dark ? hslToHex(240, 6, Math.min(88, 66 + l * 0.5)) : "#6B7280";
  const [ah, as, al] = hexToHsl(t.accent);
  const accText = dark ? t.accent : hslToHex(ah, as, Math.min(al, 36));
  const accHover = hslToHex(ah, as, clampN(al - 7));
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(t.accent.slice(i, i + 2), 16));
  const onAcc = (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? "#1a1405" : "#ffffff";
  const f = THEME_FONTS[t.font] || THEME_FONTS.ibm;
  const css = `${f.q ? `@import url('https://fonts.googleapis.com/css2?family=${f.q}&display=swap');` : ""}
:root{color-scheme:${dark ? "dark" : "light"};--cl-bg:${t.bg};--cl-card:${P.card};--cl-input:${P.input};--cl-sub:${P.sub};--cl-inset:${P.inset};--cl-line:${P.line};--cl-sep:${P.sep};--cl-chip:${P.chip};--cl-hover:${P.hover};--cl-text:${text};--cl-muted:${muted};--cl-soft:${soft};--cl-ink:${P.ink};--cl-ink-hover:${P.inkH};--cl-side:${P.side};--cl-accent:${accText};--cl-accent-bg:${t.accent};--cl-accent-hover:${accHover};--cl-accent-rgb:${r} ${g} ${b};--cl-on-accent:${onAcc};--cl-red:${dark ? "#ff6b6b" : "#C1453B"};--cl-green:${dark ? "#5fd0a0" : "#3F7D63"};--cl-font:${f.css},'IBM Plex Sans Arabic','Cairo',system-ui,sans-serif;}
@media print{:root{color-scheme:light;--cl-bg:#F6F3EA;--cl-card:#ffffff;--cl-input:#ffffff;--cl-sub:#FAF8F2;--cl-inset:#F6F3EA;--cl-line:#E1DACB;--cl-sep:#EFEBDF;--cl-chip:#F1EDE1;--cl-hover:#D8D3C7;--cl-text:#1E2530;--cl-muted:#9A9483;--cl-soft:#6B7280;--cl-ink:#1E2530;--cl-ink-hover:#2b3543;--cl-side:#14212C;--cl-accent:#E8672C;--cl-accent-bg:#E8672C;--cl-accent-hover:#C8511E;--cl-accent-rgb:232 103 44;--cl-on-accent:#ffffff;--cl-red:#C1453B;--cl-green:#3F7D63;}}`;
  return { css, card: P.card, text };
}

function ThemeSettings() {
  const [t, setT] = useState(() => {
    try { return { ...THEME_DEFAULT, ...JSON.parse(localStorage.getItem(THEME_KEY) || "{}") }; } catch (e) { return { ...THEME_DEFAULT }; }
  });
  const [open, setOpen] = useState(false);
  const set = (patch) => setT((p) => {
    const n = { ...p, ...patch };
    try { localStorage.setItem(THEME_KEY, JSON.stringify(n)); } catch (e) { /* ignore */ }
    return n;
  });
  const reset = () => { try { localStorage.removeItem(THEME_KEY); } catch (e) { /* ignore */ } setT({ ...THEME_DEFAULT }); };
  const { css, card, text } = useMemo(() => buildTheme(t), [t]);
  const [bh, bs, bl] = hexToHsl(t.bg);
  const f = THEME_FONTS[t.font] || THEME_FONTS.ibm;
  const lbl = "text-[11px] font-semibold text-[color:var(--cl-muted)] mb-2";

  const pick = (label, value, onChange, onReset) => (
    <label className="flex items-center justify-between gap-2 py-1.5">
      <span className="text-[12px] text-[color:var(--cl-text)]">{label}</span>
      <span className="flex items-center gap-2">
        {onReset && <button type="button" onClick={(e) => { e.preventDefault(); onReset(); }} className="text-[10px] text-[color:var(--cl-accent)] hover:underline">تلقائي</button>}
        <span className="mono text-[10px] text-[color:var(--cl-muted)]">{value}</span>
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="w-8 h-6 p-0 border-0 rounded cursor-pointer bg-transparent" />
      </span>
    </label>
  );

  return (
    <>
      <style>{css}</style>
      <button type="button" onClick={() => setOpen((o) => !o)} title="مظهر البرنامج"
        className="no-print fixed bottom-14 left-4 z-[60] w-11 h-11 rounded-full flex items-center justify-center shadow-lg shadow-black/40 bg-[color:var(--cl-accent-bg)] text-[color:var(--cl-on-accent)] hover:brightness-110 transition">
        <Palette size={20} />
      </button>
      {open && (
        <div dir="rtl" className="no-print fixed bottom-28 left-4 z-[60] w-80 max-h-[75vh] overflow-y-auto rounded-xl border border-[color:var(--cl-line)] bg-[color:var(--cl-card)] text-[color:var(--cl-text)] shadow-2xl shadow-black/50 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="font-bold text-sm flex items-center gap-2"><Palette size={16} className="text-[color:var(--cl-accent)]" /> مظهر البرنامج</div>
            <div className="flex items-center gap-1">
              <button type="button" onClick={reset} title="رجوع للأصل" className="p-1.5 rounded-lg text-[color:var(--cl-muted)] hover:bg-[color:var(--cl-line)] hover:text-[color:var(--cl-text)]"><RotateCcw size={15} /></button>
              <button type="button" onClick={() => setOpen(false)} className="p-1.5 rounded-lg text-[color:var(--cl-muted)] hover:bg-[color:var(--cl-line)] hover:text-[color:var(--cl-text)]"><X size={15} /></button>
            </div>
          </div>

          <div className={lbl}>أنماط جاهزة</div>
          <div className="grid grid-cols-4 gap-2 mb-4">
            {THEME_PRESETS.map((p) => {
              const on = t.bg.toLowerCase() === p.bg;
              return (
                <button key={p.bg} type="button" onClick={() => set({ bg: p.bg, card: "", text: "" })}
                  className={`flex flex-col items-center gap-1.5 py-2 rounded-lg border text-[11px] transition ${on ? "border-[color:var(--cl-accent-bg)]" : "border-[color:var(--cl-line)] hover:bg-[color:var(--cl-sub)]"}`}>
                  <span className="w-6 h-6 rounded-full border border-white/20" style={{ background: p.bg }} />
                  {p.l}
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between">
            <div className={lbl}>درجة تفتيح الخلفية</div>
            <div className="mono text-[11px] text-[color:var(--cl-muted)] mb-2">{Math.round(bl)}%</div>
          </div>
          <input type="range" min="1" max="97" value={Math.round(bl)} onChange={(e) => set({ bg: hslToHex(bh, Math.min(bs, 30), +e.target.value), card: "", text: "" })} className="w-full mb-4 accent-[color:var(--cl-accent-bg)]" />

          <div className={lbl}>الألوان (يدويًا)</div>
          <div className="mb-4 divide-y divide-[color:var(--cl-sep)]">
            {pick("الخلفية", t.bg, (v) => set({ bg: v }))}
            {pick("الكروت والجداول", t.card || card, (v) => set({ card: v }), t.card ? () => set({ card: "" }) : null)}
            {pick("لون النص", t.text || text, (v) => set({ text: v }), t.text ? () => set({ text: "" }) : null)}
            {pick("لون التمييز (الأزرار)", t.accent, (v) => set({ accent: v }))}
          </div>

          <div className={lbl}>نوع الخط</div>
          <select value={t.font} onChange={(e) => set({ font: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-[color:var(--cl-line)] text-sm outline-none">
            {Object.entries(THEME_FONTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <div className="mt-2 px-3 py-2 rounded-lg bg-[color:var(--cl-sub)] border border-[color:var(--cl-sep)] text-sm" style={{ fontFamily: `${f.css}, sans-serif` }}>
            تجربة الخط — إجمالي المستخلصات 1,250,000 ج.م
          </div>
        </div>
      )}
    </>
  );
}

/* ---------------------------------- app ---------------------------------- */

function ContractingApp({ currentUsername, onLogout }) {
  const [projects, setProjects] = useState([]);
  const [workItems, setWorkItems] = useState([]);
  const [costs, setCosts] = useState([]);
  const [extracts, setExtracts] = useState([]);
  const [collections, setCollections] = useState([]);
  const [treasuryEntries, setTreasuryEntries] = useState([]);
  const [financePersons, setFinancePersons] = useState([]);
  const [financeTransactions, setFinanceTransactions] = useState([]);
  const [custodies, setCustodies] = useState([]);
  const [custodyCategories, setCustodyCategories] = useState([]);
  const [expectedCosts, setExpectedCosts] = useState([]);
  const [statements, setStatements] = useState([]);
  const [statementPayments, setStatementPayments] = useState([]);
  const [statementsDbError, setStatementsDbError] = useState(null);
  const [view, setView] = useState("project"); // 'project' | 'finance' | 'reports' | 'users' | 'contractor_statements' | 'supplier_statements'
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState(null);

  const [activeProjectId, setActiveProjectId] = useState("p1");
  const [tab, setTab] = useState("dashboard");
  const [showNewProject, setShowNewProject] = useState(false);

  useEffect(() => {
    async function loadAll() {
      const [projRes, wiRes, costRes, extRes, colRes, treRes, fpRes, ftRes, custRes, ccRes, ecRes] = await Promise.all([
        supabase.from("projects").select("*").order("created_at"),
        supabase.from("work_items").select("*").order("created_at"),
        supabase.from("costs").select("*").order("created_at"),
        supabase.from("extracts").select("*").order("created_at"),
        supabase.from("collections").select("*").order("created_at"),
        supabase.from("treasury_entries").select("*").order("date"),
        supabase.from("finance_persons").select("*").order("created_at"),
        supabase.from("finance_transactions").select("*").order("date"),
        supabase.from("custodies").select("*").order("created_at"),
        supabase.from("custody_categories").select("*").order("created_at"),
        supabase.from("expected_costs").select("*").order("created_at"),
      ]);

      const firstError = [projRes, wiRes, costRes, extRes, colRes, treRes, fpRes, ftRes, custRes, ccRes, ecRes].find((r) => r.error);
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
        (costRes.data || []).map((c) => ({ id: c.id, projectId: c.project_id, workItemId: c.work_item_id, custodyId: c.custody_id || null, type: c.type, desc: c.description, costLevel1: c.cost_level_1 || "", costLevel2: c.cost_level_2 || "", qty: Number(c.qty), unit: c.unit, price: Number(c.price), date: c.date }))
      );
      setExtracts(
        (extRes.data || []).map((e) => ({ id: e.id, projectId: e.project_id, number: e.number, date: e.date, percentage: Number(e.percentage), amount: Number(e.amount) }))
      );
      setCollections(
        (colRes.data || []).map((c) => ({ id: c.id, projectId: c.project_id, extractId: c.extract_id || null, amount: Number(c.amount), date: c.date, method: c.method, note: c.note || "" }))
      );
      setTreasuryEntries(
        (treRes.data || []).map((t) => ({ id: t.id, projectId: t.project_id, date: t.date, type: t.type, amount: Number(t.amount), note: t.note }))
      );
      setFinancePersons((fpRes.data || []).map((p) => ({ id: p.id, name: p.name, note: p.note })));
      setFinanceTransactions(
        (ftRes.data || []).map((t) => ({ id: t.id, personId: t.person_id, date: t.date, type: t.type, amount: Number(t.amount), note: t.note }))
      );
      setCustodies(
        (custRes.data || []).map((c) => ({ id: c.id, projectId: c.project_id, personName: c.person_name, amountGiven: Number(c.amount_given), dateGiven: c.date_given, status: c.status, notes: c.notes || "", sourceCostId: c.source_cost_id || null }))
      );
      setCustodyCategories((ccRes.data || []).map((c) => ({ id: c.id, name: c.name })));
      setExpectedCosts(
        (ecRes.data || []).map((e) => ({ id: e.id, projectId: e.project_id, workItemId: e.work_item_id || null, desc: e.description, amount: Number(e.amount), expectedDate: e.expected_date || "", notes: e.notes || "" }))
      );

      if (projRes.data && projRes.data.length > 0) {
        setActiveProjectId(projRes.data[0].id);
      }
      setLoading(false);
    }
    loadAll();
  }, []);

  useEffect(() => {
    async function loadStatements() {
      const [stRes, spRes] = await Promise.all([
        supabase.from("party_statements").select("*").order("statement_date", { ascending: false }),
        supabase.from("party_payments").select("*").order("payment_date"),
      ]);
      const err = stRes.error || spRes.error;
      if (err) { setStatementsDbError(err.message); return; }
      setStatementsDbError(null);
      setStatements((stRes.data || []).map((s) => ({ id: s.id, kind: s.kind, partyName: s.party_name, date: s.statement_date, number: s.number || "", projectId: s.project_id || null, status: s.status || "", notes: s.notes || "", items: s.items || [], adjustments: s.adjustments || [], subtotal: Number(s.subtotal), netTotal: Number(s.net_total) })));
      setStatementPayments((spRes.data || []).map((p) => ({ id: p.id, kind: p.kind, partyName: p.party_name, date: p.payment_date, amount: Number(p.amount), method: p.method || "", note: p.note || "", statementId: p.statement_id || null })));
    }
    loadStatements();
  }, []);

  async function saveStatement(st) {
    const row = { id: st.id, kind: st.kind, party_name: st.partyName, statement_date: st.date, number: st.number, project_id: st.projectId || null, status: st.status, notes: st.notes || null, items: st.items, adjustments: st.adjustments, subtotal: st.subtotal, net_total: st.netTotal };
    const { error } = await supabase.from("party_statements").upsert([row]);
    if (error) { alert("حصل خطأ أثناء حفظ المستخلص: " + error.message); return false; }
    setStatements((prev) => (prev.some((x) => x.id === st.id) ? prev.map((x) => (x.id === st.id ? st : x)) : [st, ...prev]));
    return true;
  }

  async function deleteStatement(id) {
    if (!window.confirm("متأكد إنك عايز تمسح المستخلص ده؟")) return;
    const { error } = await supabase.from("party_statements").delete().eq("id", id);
    if (error) { alert("حصل خطأ أثناء حذف المستخلص: " + error.message); return; }
    // الدفعات المرتبطة بالمستخلص تفضل كدفعات عامة على الطرف
    await supabase.from("party_payments").update({ statement_id: null }).eq("statement_id", id);
    setStatements((prev) => prev.filter((x) => x.id !== id));
    setStatementPayments((prev) => prev.map((p) => (p.statementId === id ? { ...p, statementId: null } : p)));
  }

  async function addStatementPayment(p) {
    const { error } = await supabase.from("party_payments").insert([{ id: p.id, kind: p.kind, party_name: p.partyName, payment_date: p.date, amount: p.amount, method: p.method || null, note: p.note || null, statement_id: p.statementId || null }]);
    if (error) { alert("حصل خطأ أثناء تسجيل الدفعة: " + error.message); return; }
    setStatementPayments((prev) => [...prev, p]);
  }

  async function deleteStatementPayment(id) {
    if (!window.confirm("متأكد إنك عايز تمسح الدفعة دي؟")) return;
    const { error } = await supabase.from("party_payments").delete().eq("id", id);
    if (error) { alert("حصل خطأ أثناء حذف الدفعة: " + error.message); return; }
    setStatementPayments((prev) => prev.filter((p) => p.id !== id));
  }

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
    const { error } = await supabase.from("costs").insert([{ id: c.id, project_id: c.projectId, work_item_id: c.workItemId, custody_id: c.custodyId || null, type: c.type, description: c.desc, cost_level_1: c.costLevel1 || null, cost_level_2: c.costLevel2 || null, qty: c.qty, unit: c.unit, price: c.price, date: c.date }]);
    if (error) { alert("حصل خطأ أثناء حفظ التكلفة: " + error.message); return; }
    setCosts((prev) => [...prev, c]);
  }

  async function addCostsBulk(list) {
    if (!list || list.length === 0) return;
    const payload = list.map((c) => ({ id: c.id, project_id: c.projectId, work_item_id: c.workItemId, custody_id: null, type: c.type, description: c.desc, cost_level_1: c.costLevel1 || null, cost_level_2: c.costLevel2 || null, qty: c.qty, unit: c.unit, price: c.price, date: c.date }));
    const { error } = await supabase.from("costs").insert(payload);
    if (error) { alert("حصل خطأ أثناء استيراد التكاليف من الإكسيل: " + error.message); return; }
    setCosts((prev) => [...prev, ...list]);
  }

  async function addExtract(e) {
    const { error } = await supabase.from("extracts").insert([{ id: e.id, project_id: e.projectId, number: e.number, date: e.date, percentage: e.percentage, amount: e.amount }]);
    if (error) { alert("حصل خطأ أثناء حفظ المستخلص: " + error.message); return; }
    setExtracts((prev) => [...prev, e]);
  }

  async function addCollection(cl) {
    const { error } = await supabase.from("collections").insert([{ id: cl.id, project_id: cl.projectId, extract_id: cl.extractId || null, amount: cl.amount, date: cl.date, method: cl.method, note: cl.note || null }]);
    if (error) { alert("حصل خطأ أثناء حفظ التحصيل: " + error.message); return; }
    setCollections((prev) => [...prev, cl]);
  }

  async function updateWorkItem(id, patch) {
    const updateData = { name: patch.name };
    if (patch.unit !== undefined) updateData.unit = patch.unit;
    if (patch.qty !== undefined) updateData.qty = patch.qty;
    if (patch.price !== undefined) updateData.price = patch.price;
    const { error } = await supabase.from("work_items").update(updateData).eq("id", id);
    if (error) { alert("حصل خطأ أثناء تعديل بند العمل: " + error.message); return; }
    setWorkItems((prev) => prev.map((w) => (w.id === id ? { ...w, ...patch } : w)));
  }

  async function deleteWorkItem(id) {
    if (!window.confirm("متأكد إنك عايز تمسح بند العمل ده؟ هيتمسح معاه أي تكاليف مرتبطة بيه.")) return;
    const { error: costsError } = await supabase.from("costs").delete().eq("work_item_id", id);
    if (costsError) { alert("حصل خطأ أثناء حذف التكاليف المرتبطة: " + costsError.message); return; }
    const { error: ecError } = await supabase.from("expected_costs").update({ work_item_id: null }).eq("work_item_id", id);
    if (ecError) { alert("حصل خطأ أثناء فك ربط المصاريف المتوقعة: " + ecError.message); return; }
    const { error } = await supabase.from("work_items").delete().eq("id", id);
    if (error) { alert("حصل خطأ أثناء حذف بند العمل: " + error.message); return; }
    setWorkItems((prev) => prev.filter((w) => w.id !== id));
    setCosts((prev) => prev.filter((c) => c.workItemId !== id));
    setExpectedCosts((prev) => prev.map((e) => (e.workItemId === id ? { ...e, workItemId: null } : e)));
  }

  async function updateCost(id, patch) {
    const { error } = await supabase.from("costs").update({ type: patch.type, work_item_id: patch.workItemId, description: patch.desc, cost_level_1: patch.costLevel1 || null, cost_level_2: patch.costLevel2 || null, qty: patch.qty, unit: patch.unit, price: patch.price, date: patch.date }).eq("id", id);
    if (error) { alert("حصل خطأ أثناء تعديل التكلفة: " + error.message); return; }
    setCosts((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  async function deleteCost(id) {
    if (!window.confirm("متأكد إنك عايز تمسح التكلفة دي؟")) return;
    const { error } = await supabase.from("costs").delete().eq("id", id);
    if (error) { alert("حصل خطأ أثناء حذف التكلفة: " + error.message); return; }
    setCosts((prev) => prev.filter((c) => c.id !== id));
  }

  async function updateExtract(id, patch) {
    const { error } = await supabase.from("extracts").update({ number: patch.number, date: patch.date, percentage: patch.percentage, amount: patch.amount }).eq("id", id);
    if (error) { alert("حصل خطأ أثناء تعديل المستخلص: " + error.message); return; }
    setExtracts((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }

  async function deleteExtract(id) {
    if (!window.confirm("متأكد إنك عايز تمسح المستخلص ده؟ هيتمسح معاه أي تحصيلات مرتبطة بيه.")) return;
    const { error } = await supabase.from("extracts").delete().eq("id", id);
    if (error) { alert("حصل خطأ أثناء حذف المستخلص: " + error.message); return; }
    setExtracts((prev) => prev.filter((e) => e.id !== id));
    setCollections((prev) => prev.filter((c) => c.extractId !== id));
  }

  async function deleteCollection(id) {
    if (!window.confirm("متأكد إنك عايز تمسح التحصيل ده؟")) return;
    const { error } = await supabase.from("collections").delete().eq("id", id);
    if (error) { alert("حصل خطأ أثناء حذف التحصيل: " + error.message); return; }
    setCollections((prev) => prev.filter((c) => c.id !== id));
  }

  async function deleteProject(id) {
    if (!window.confirm("متأكد إنك عايز تمسح المشروع ده بالكامل؟ هيتمسح معاه كل بنود الأعمال والتكاليف والمستخلصات والخزينة المرتبطة بيه. الإجراء ده لا يمكن التراجع عنه.")) return;
    const { error } = await supabase.from("projects").delete().eq("id", id);
    if (error) { alert("حصل خطأ أثناء حذف المشروع: " + error.message); return; }
    const remaining = projects.filter((p) => p.id !== id);
    setProjects(remaining);
    setWorkItems((prev) => prev.filter((w) => w.projectId !== id));
    setCosts((prev) => prev.filter((c) => c.projectId !== id));
    setExtracts((prev) => prev.filter((e) => e.projectId !== id));
    setCollections((prev) => prev.filter((c) => c.projectId !== id));
    setTreasuryEntries((prev) => prev.filter((t) => t.projectId !== id));
    setCustodies((prev) => prev.filter((c) => c.projectId !== id));
    setExpectedCosts((prev) => prev.filter((e) => e.projectId !== id));
    if (activeProjectId === id && remaining.length > 0) setActiveProjectId(remaining[0].id);
  }

  async function addTreasuryEntry(t) {
    const { error } = await supabase.from("treasury_entries").insert([{ id: t.id, project_id: t.projectId, date: t.date, type: t.type, amount: t.amount, note: t.note }]);
    if (error) { alert("حصل خطأ أثناء حفظ حركة الخزينة: " + error.message); return; }
    setTreasuryEntries((prev) => [...prev, t]);
  }

  async function updateTreasuryEntry(id, patch) {
    const { error } = await supabase.from("treasury_entries").update({ date: patch.date, type: patch.type, amount: patch.amount, note: patch.note }).eq("id", id);
    if (error) { alert("حصل خطأ أثناء تعديل حركة الخزينة: " + error.message); return; }
    setTreasuryEntries((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  async function deleteTreasuryEntry(id) {
    if (!window.confirm("متأكد إنك عايز تمسح حركة الخزينة دي؟")) return;
    const { error } = await supabase.from("treasury_entries").delete().eq("id", id);
    if (error) { alert("حصل خطأ أثناء حذف حركة الخزينة: " + error.message); return; }
    setTreasuryEntries((prev) => prev.filter((t) => t.id !== id));
  }

  async function updateOpeningBalance(projectId, value) {
    const { error } = await supabase.from("projects").update({ treasury_opening_balance: value }).eq("id", projectId);
    if (error) { alert("حصل خطأ أثناء تعديل رصيد البداية: " + error.message); return; }
    setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, treasury_opening_balance: value } : p)));
  }

  async function addFinancePerson(p) {
    const { error } = await supabase.from("finance_persons").insert([{ id: p.id, name: p.name, note: p.note || null }]);
    if (error) { alert("حصل خطأ أثناء إضافة الشخص: " + error.message); return null; }
    setFinancePersons((prev) => [...prev, p]);
    return p;
  }

  async function deleteFinancePerson(id) {
    if (!window.confirm("متأكد إنك عايز تمسح الحساب ده بالكامل؟ هيتمسح معاه كل حركاته.")) return;
    const { error } = await supabase.from("finance_persons").delete().eq("id", id);
    if (error) { alert("حصل خطأ أثناء حذف الحساب: " + error.message); return; }
    setFinancePersons((prev) => prev.filter((p) => p.id !== id));
    setFinanceTransactions((prev) => prev.filter((t) => t.personId !== id));
  }

  async function addFinanceTransaction(t) {
    const { error } = await supabase.from("finance_transactions").insert([{ id: t.id, person_id: t.personId, date: t.date, type: t.type, amount: t.amount, note: t.note || null }]);
    if (error) { alert("حصل خطأ أثناء حفظ الحركة: " + error.message); return; }
    setFinanceTransactions((prev) => [...prev, t]);
  }

  async function updateFinanceTransaction(id, patch) {
    const { error } = await supabase.from("finance_transactions").update({ date: patch.date, type: patch.type, amount: patch.amount, note: patch.note || null }).eq("id", id);
    if (error) { alert("حصل خطأ أثناء تعديل الحركة: " + error.message); return; }
    setFinanceTransactions((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  async function deleteFinanceTransaction(id) {
    if (!window.confirm("متأكد إنك عايز تمسح الحركة دي؟")) return;
    const { error } = await supabase.from("finance_transactions").delete().eq("id", id);
    if (error) { alert("حصل خطأ أثناء حذف الحركة: " + error.message); return; }
    setFinanceTransactions((prev) => prev.filter((t) => t.id !== id));
  }

  async function addCustody(c) {
    const { error } = await supabase.from("custodies").insert([{ id: c.id, project_id: c.projectId, person_name: c.personName, amount_given: c.amountGiven, date_given: c.dateGiven, status: c.status, notes: c.notes || null }]);
    if (error) { alert("حصل خطأ أثناء حفظ العهدة: " + error.message); return; }
    setCustodies((prev) => [...prev, c]);
  }

  async function updateCustody(id, patch) {
    const updateData = {};
    if (patch.personName !== undefined) updateData.person_name = patch.personName;
    if (patch.amountGiven !== undefined) updateData.amount_given = patch.amountGiven;
    if (patch.dateGiven !== undefined) updateData.date_given = patch.dateGiven;
    if (patch.notes !== undefined) updateData.notes = patch.notes || null;
    if (patch.status !== undefined) updateData.status = patch.status;
    const { error } = await supabase.from("custodies").update(updateData).eq("id", id);
    if (error) { alert("حصل خطأ أثناء تعديل العهدة: " + error.message); return; }
    setCustodies((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  async function deleteCustody(id) {
    if (!window.confirm("متأكد إنك عايز تمسح العهدة دي؟ بنود التصفية المسجّلة عليها هتفضل موجودة كتكاليف عادية، بس هتتفك من ربطها بالعهدة.")) return;
    const { error: unlinkError } = await supabase.from("costs").update({ custody_id: null }).eq("custody_id", id);
    if (unlinkError) { alert("حصل خطأ أثناء فك ربط التكاليف المرتبطة: " + unlinkError.message); return; }
    const { error } = await supabase.from("custodies").delete().eq("id", id);
    if (error) { alert("حصل خطأ أثناء حذف العهدة: " + error.message); return; }
    setCustodies((prev) => prev.filter((c) => c.id !== id));
    setCosts((prev) => prev.map((c) => (c.custodyId === id ? { ...c, custodyId: null } : c)));
  }

  async function settleCustody(id) {
    const custody = custodies.find((c) => c.id === id);
    if (!custody) return;
    if (custody.sourceCostId) {
      const { error: delError } = await supabase.from("costs").delete().eq("id", custody.sourceCostId);
      if (delError) { alert("حصل خطأ أثناء حذف قيد العهدة الأصلي: " + delError.message); return; }
      setCosts((prev) => prev.filter((c) => c.id !== custody.sourceCostId));
    }
    const { error } = await supabase.from("custodies").update({ status: "مصفاة" }).eq("id", id);
    if (error) { alert("حصل خطأ أثناء تصفية العهدة: " + error.message); return; }
    setCustodies((prev) => prev.map((c) => (c.id === id ? { ...c, status: "مصفاة" } : c)));
  }

  async function addCustodyCategory(cat) {
    const { error } = await supabase.from("custody_categories").insert([{ id: cat.id, name: cat.name }]);
    if (error) { alert("حصل خطأ أثناء إضافة التصنيف (ربما تصنيف بنفس الاسم موجود بالفعل): " + error.message); return; }
    setCustodyCategories((prev) => [...prev, cat]);
  }

  async function deleteCustodyCategory(id) {
    if (!window.confirm("متأكد إنك عايز تمسح التصنيف ده؟")) return;
    const { error } = await supabase.from("custody_categories").delete().eq("id", id);
    if (error) { alert("حصل خطأ أثناء حذف التصنيف: " + error.message); return; }
    setCustodyCategories((prev) => prev.filter((c) => c.id !== id));
  }

  async function addExpectedCost(ec) {
    const { error } = await supabase.from("expected_costs").insert([{ id: ec.id, project_id: ec.projectId, work_item_id: ec.workItemId || null, description: ec.desc, amount: ec.amount, expected_date: ec.expectedDate || null, notes: ec.notes || null }]);
    if (error) { alert("حصل خطأ أثناء إضافة المصروف المتوقع: " + error.message); return; }
    setExpectedCosts((prev) => [...prev, ec]);
  }

  async function updateExpectedCost(id, patch) {
    const updateData = {};
    if (patch.desc !== undefined) updateData.description = patch.desc;
    if (patch.amount !== undefined) updateData.amount = patch.amount;
    if (patch.expectedDate !== undefined) updateData.expected_date = patch.expectedDate || null;
    if (patch.notes !== undefined) updateData.notes = patch.notes || null;
    if (patch.workItemId !== undefined) updateData.work_item_id = patch.workItemId || null;
    const { error } = await supabase.from("expected_costs").update(updateData).eq("id", id);
    if (error) { alert("حصل خطأ أثناء تعديل المصروف المتوقع: " + error.message); return; }
    setExpectedCosts((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }

  async function deleteExpectedCost(id) {
    if (!window.confirm("متأكد إنك عايز تمسح المصروف المتوقع ده؟")) return;
    const { error } = await supabase.from("expected_costs").delete().eq("id", id);
    if (error) { alert("حصل خطأ أثناء حذف المصروف المتوقع: " + error.message); return; }
    setExpectedCosts((prev) => prev.filter((e) => e.id !== id));
  }

  const project = projects.find((p) => p.id === activeProjectId);
  const pWorkItems = workItems.filter((w) => w.projectId === activeProjectId);
  const pCosts = costs.filter((c) => c.projectId === activeProjectId);
  const pExtracts = extracts.filter((e) => e.projectId === activeProjectId);
  const pTreasuryEntries = treasuryEntries.filter((t) => t.projectId === activeProjectId);
  const pCustodies = custodies.filter((c) => c.projectId === activeProjectId);
  const pCollections = collections.filter((c) => c.projectId === activeProjectId);
  const pExpectedCosts = expectedCosts.filter((e) => e.projectId === activeProjectId);

  const totals = useMemo(() => {
    const budgetTotal = pWorkItems.reduce((s, w) => s + w.qty * w.price, 0);
    const actualTotal = pCosts.reduce((s, c) => s + c.qty * c.price, 0);
    const extractsTotal = pExtracts.reduce((s, e) => s + e.amount, 0);
    const collectedTotal = pCollections.reduce((s, c) => s + c.amount, 0);
    const netProfit = collectedTotal - actualTotal;
    const expectedCostsTotal = pExpectedCosts.reduce((s, e) => s + e.amount, 0);
    const projectedNetProfit = netProfit - expectedCostsTotal;
    return { budgetTotal, actualTotal, extractsTotal, collectedTotal, netProfit, expectedCostsTotal, projectedNetProfit };
  }, [pWorkItems, pCosts, pExtracts, pCollections, pExpectedCosts]);

  const tabs = [
    { key: "dashboard", label: "ملخص المشروع", icon: LayoutDashboard },
    { key: "analytics", label: "التحليلات والرسوم", icon: Gauge },
    { key: "items", label: "الأعمال والمقايسة", icon: ClipboardList },
    { key: "costs", label: "التكاليف الفعلية", icon: ReceiptText },
    { key: "extracts", label: "المستخلصات والتحصيلات", icon: FileCheck2 },
    { key: "custody", label: "تصفية العهد", icon: Landmark },
    { key: "treasury", label: "الخزينة والسيولة", icon: Vault },
    { key: "budget", label: "تحليل المقايسة", icon: BarChart3 },
  ];

  const navGroups = [
    { title: "نظرة عامة", keys: ["dashboard", "analytics"] },
    { title: "التخطيط والتنفيذ", keys: ["items", "budget", "costs"] },
    { title: "المالية والتحصيل", keys: ["extracts", "treasury", "custody"] },
  ];

  // رصيد الخزينة الحالي (نفس معادلة تبويب الخزينة: رصيد البداية + الإيداعات − المصروفات)
  const treasuryBalance = (Number(project?.treasury_opening_balance) || 0) +
    pTreasuryEntries.reduce((sum, t) => sum + (t.type === "ايداع" ? t.amount : -t.amount), 0);

  return (
    <div dir="rtl" style={{ fontFamily: "var(--cl-font)", color: "var(--cl-text)" }} className="w-full min-h-screen flex flex-col" >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
        :root {
          color-scheme: dark;
          --cl-bg:#050505; --cl-card:#111114; --cl-input:#0a0a0c; --cl-sub:#16161a; --cl-inset:#0b0b0e;
          --cl-line:#26262c; --cl-sep:#1c1c21; --cl-chip:#1a1a1f; --cl-hover:#2a2a31;
          --cl-text:#eeeeee; --cl-muted:#8b8b95; --cl-soft:#a3a3ad;
          --cl-ink:#2a2a31; --cl-ink-hover:#34343c;
          --cl-accent:#f0c85a; --cl-red:#ff6b6b; --cl-green:#5fd0a0;
          --cl-side:#0a0a0c; --cl-accent-bg:#f0c85a; --cl-accent-hover:#e3b53f; --cl-accent-rgb:240 200 90; --cl-on-accent:#1a1405;
          --cl-font:'IBM Plex Sans Arabic','Cairo',system-ui,sans-serif;
        }
        @media print {
          :root {
            color-scheme: light;
            --cl-bg:#F6F3EA; --cl-card:#ffffff; --cl-input:#ffffff; --cl-sub:#FAF8F2; --cl-inset:#F6F3EA;
            --cl-line:#E1DACB; --cl-sep:#EFEBDF; --cl-chip:#F1EDE1; --cl-hover:#D8D3C7;
            --cl-text:#1E2530; --cl-muted:#9A9483; --cl-soft:#6B7280;
            --cl-ink:#1E2530; --cl-ink-hover:#2b3543;
            --cl-accent:#E8672C; --cl-red:#C1453B; --cl-green:#3F7D63;
            --cl-side:#14212C; --cl-accent-bg:#E8672C; --cl-accent-hover:#C8511E; --cl-accent-rgb:232 103 44; --cl-on-accent:#ffffff;
          }
        }
        body { background: var(--cl-bg); -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; }
        .mono { font-family: 'IBM Plex Mono', monospace; font-variant-numeric: tabular-nums; }
        .tracking-wide:not(.mono):not([dir="ltr"]), .tracking-wider:not(.mono):not([dir="ltr"]) { letter-spacing: 0; }
        :where(input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]), select, textarea) { background-color: var(--cl-input); color: var(--cl-text); }
        ::placeholder { color: var(--cl-muted); opacity: 1; }
        select option { background: var(--cl-card); color: var(--cl-text); }
        .blueprint-bg {
          background-color: var(--cl-side, #0a0a0c);
          background-image:
            linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px);
          background-size: 28px 28px;
        }
        .paper-bg {
          background-color: var(--cl-bg);
          background-image: linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px);
          background-size: 100% 32px;
        }
        .dim-line { border-top: 1px dashed #33333b; }
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-thumb { background: #2a2a31; border-radius: 4px; }
      `}</style>
      <ThemeSettings />

      {loading && (
        <div className="fixed inset-0 bg-[color:var(--cl-inset)] flex items-center justify-center z-50 gap-2 text-[color:var(--cl-text)]">
          <Loader2 size={20} className="animate-spin" />
          <span className="font-semibold text-sm">جاري تحميل بيانات المشروعات...</span>
        </div>
      )}

      {!loading && dbError && (
        <div className="fixed inset-0 bg-[color:var(--cl-inset)] flex items-center justify-center z-50 p-8" dir="rtl">
          <div className="bg-[color:var(--cl-card)] border border-[color:var(--cl-line)] rounded-xl p-6 max-w-md text-center">
            <div className="font-bold text-[color:var(--cl-red)] mb-2">تعذّر الاتصال بقاعدة البيانات</div>
            <div className="text-sm text-[color:var(--cl-soft)]">{dbError}</div>
          </div>
        </div>
      )}

      <div className="flex flex-1 min-w-0">
      {/* SIDEBAR */}
      <aside style={{ height: "calc(100vh - 48px)" }} className="blueprint-bg w-72 shrink-0 flex flex-col text-[#E7ECEF] sticky top-0 self-start overflow-y-auto border-l border-white/10">
        {/* الشعار */}
        <div className="px-5 pt-6 pb-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <CostLineMark size={42} />
            <div className="min-w-0">
              <div className="font-extrabold text-[15px] text-white leading-tight tracking-wide" dir="ltr">Cost<span className="text-[color:var(--cl-accent)]">Line</span></div>
              <div className="text-[10px] text-white/45 mono tracking-wider mt-0.5">CONSTRUCTION ERP</div>
            </div>
          </div>
        </div>

        {/* المشروعات */}
        <div className="px-4 pt-5">
          <div className="flex items-center justify-between px-1 mb-2">
            <div className="text-[11px] text-white/45 font-bold tracking-wide flex items-center gap-1.5">
              <FolderKanban size={12} /> المشروعات
            </div>
            <span className="mono text-[10px] text-white/50 bg-white/10 rounded-full px-2 py-0.5">{projects.length}</span>
          </div>
          <div className="space-y-1 max-h-48 overflow-y-auto pl-1">
            {projects.map((p) => {
              const on = p.id === activeProjectId && view === "project";
              return (
                <button
                  key={p.id}
                  onClick={() => { setActiveProjectId(p.id); setView("project"); }}
                  className={`w-full text-right px-3 py-2 rounded-lg text-sm transition flex items-center justify-between gap-2 ${
                    on ? "bg-[color:var(--cl-accent-bg)] text-[color:var(--cl-on-accent)] font-bold shadow-md shadow-[color:rgb(var(--cl-accent-rgb)/0.2)]" : "text-white/70 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${on ? "bg-[color:var(--cl-card)]" : "bg-white/30"}`} />
                    <span className="truncate">{p.name}</span>
                  </span>
                  {on && <ChevronRight size={14} className="shrink-0" />}
                </button>
              );
            })}
          </div>
          <button
            onClick={() => setShowNewProject(true)}
            className="w-full mt-2 px-3 py-2 rounded-lg text-xs font-semibold text-white/60 border border-dashed border-white/15 hover:border-[color:rgb(var(--cl-accent-rgb)/0.6)] hover:text-[color:var(--cl-accent)] flex items-center justify-center gap-1 transition"
          >
            <Plus size={13} /> مشروع جديد
          </button>
        </div>

        {/* أقسام المشروع الحالي */}
        <nav className="mt-5 px-4 space-y-4">
          {navGroups.map((g) => (
            <div key={g.title}>
              <div className="text-[11px] text-white/45 font-bold tracking-wide mb-1.5 px-1">{g.title}</div>
              <div className="space-y-0.5">
                {g.keys.map((k) => {
                  const t = tabs.find((x) => x.key === k);
                  return (
                    <SidebarItem
                      key={t.key}
                      icon={t.icon}
                      label={t.label}
                      active={tab === t.key && view === "project"}
                      onClick={() => { setTab(t.key); setView("project"); }}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* المستخلصات: مقاولين وموردين */}
        <div className="mt-4 px-4 pt-4 border-t border-white/10 space-y-0.5">
          <div className="text-[11px] text-white/45 font-bold tracking-wide mb-1.5 px-1">المستخلصات</div>
          <SidebarItem icon={HardHat} label="مستخلصات المقاولين" active={view === "contractor_statements"} onClick={() => setView("contractor_statements")} />
          <SidebarItem icon={Package} label="مستخلصات الموردين" active={view === "supplier_statements"} onClick={() => setView("supplier_statements")} />
        </div>

        {/* عام */}
        <div className="mt-4 px-4 pt-4 border-t border-white/10 space-y-0.5">
          <div className="text-[11px] text-white/45 font-bold tracking-wide mb-1.5 px-1">الحسابات العامة</div>
          <SidebarItem icon={BarChart3} label="مركز التقارير" active={view === "reports"} onClick={() => setView("reports")} />
          <SidebarItem icon={HandCoins} label="التمويلات والسلف" active={view === "finance"} onClick={() => setView("finance")} />
          <SidebarItem icon={ShieldCheck} label="إدارة المستخدمين" active={view === "users"} onClick={() => setView("users")} />
        </div>

        {/* أسفل القائمة */}
        <div className="mt-auto p-4">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-[11px] text-white/45 leading-relaxed">
            <div className="font-bold text-white/80 text-xs mb-1 truncate">{project?.name}</div>
            <div className="truncate">{project?.client}{project?.client && project?.location ? " · " : ""}{project?.location}</div>
          </div>
          {project && view === "project" && (
            <button
              onClick={() => deleteProject(project.id)}
              className="w-full mt-2 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-[#F0918A] hover:bg-[#C1453B]/10 flex items-center justify-center gap-1.5 transition"
            >
              <Trash2 size={12} /> حذف هذا المشروع
            </button>
          )}
          <div className="mt-2 flex items-center gap-2">
            <div className="flex-1 min-w-0 flex items-center gap-2 rounded-lg bg-white/5 px-2.5 py-2">
              <UserCircle2 size={16} className="text-white/60 shrink-0" />
              <span className="text-[11px] text-white/70 truncate mono">{currentUsername}</span>
            </div>
            <button
              onClick={() => { if (window.confirm("متأكد إنك عايز تسجّل خروج؟")) onLogout(); }}
              title="تسجيل خروج"
              className="px-3 py-2 rounded-lg text-xs font-semibold text-white/70 border border-white/10 hover:bg-white/5 hover:text-white flex items-center justify-center gap-1.5 transition"
            >
              <LogOut size={13} /> خروج
            </button>
          </div>
        </div>
      </aside>

      {/* MAIN */}
      <main className="flex-1 paper-bg min-h-screen">
        {view === "reports" ? (
          <div className="p-8">
            <ReportsCenter
              projects={projects}
              workItems={workItems}
              costs={costs}
              extracts={extracts}
              collections={collections}
              treasuryEntries={treasuryEntries}
              financePersons={financePersons}
              financeTransactions={financeTransactions}
              expectedCosts={expectedCosts}
              defaultProjectId={activeProjectId}
            />
          </div>
        ) : view === "finance" ? (
          <div className="p-8">
            <FinanceAccountsModule
              financePersons={financePersons}
              financeTransactions={financeTransactions}
              onAddPerson={addFinancePerson}
              onDeletePerson={deleteFinancePerson}
              onAddTransaction={addFinanceTransaction}
              onUpdateTransaction={updateFinanceTransaction}
              onDeleteTransaction={deleteFinanceTransaction}
            />
          </div>
        ) : view === "users" ? (
          <div className="p-8">
            <UsersManagementModule currentUsername={currentUsername} />
          </div>
        ) : view === "contractor_statements" || view === "supplier_statements" ? (
          <div className="p-8">
            <StatementsModule
              kind={view === "contractor_statements" ? "contractor" : "supplier"}
              statements={statements}
              payments={statementPayments}
              projects={projects}
              dbError={statementsDbError}
              onSave={saveStatement}
              onDelete={deleteStatement}
              onAddPayment={addStatementPayment}
              onDeletePayment={deleteStatementPayment}
            />
          </div>
        ) : (
          <>
        <header className="px-8 pt-7 pb-5 border-b border-[color:var(--cl-line)] bg-[color:color-mix(in_srgb,var(--cl-bg)_80%,transparent)] sticky top-0 backdrop-blur z-10">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[11px] mono text-[color:var(--cl-muted)] mb-1">
                {project?.status} · {project?.location}
              </div>
              <h1 className="text-2xl font-extrabold text-[color:var(--cl-text)]">{project?.name}</h1>
            </div>
            <div className="text-left">
              <div className="text-[11px] text-[color:var(--cl-muted)] mb-1">إجمالي عقد المشروع</div>
              <div className="text-xl font-bold mono text-[color:var(--cl-text)]">{money(project?.budget)}</div>
            </div>
          </div>

          {tab !== "dashboard" && (<>
          <div className="grid grid-cols-5 gap-3 mt-5">
            <StatCard label="ميزانية بنود الأعمال" value={money(totals.budgetTotal)} icon={Wallet} color="#9AA3B2" />
            <StatCard
              label="إجمالي التكاليف الفعلية"
              value={money(totals.actualTotal)}
              icon={totals.actualTotal > totals.budgetTotal ? TrendingUp : TrendingDown}
              color={totals.actualTotal > totals.budgetTotal ? "#C1453B" : "#3F7D63"}
            />
            <StatCard label="إجمالي المستخلصات" value={money(totals.extractsTotal)} icon={FileStack} color="#E8672C" />
            <StatCard label="المُحصَّل" value={money(totals.collectedTotal)} icon={CircleDollarSign} color="#3F7D63" />
            <StatCard
              label="صافي الربح (المُحصَّل − الفعلي)"
              value={money(totals.netProfit)}
              icon={totals.netProfit >= 0 ? TrendingUp : TrendingDown}
              color={totals.netProfit >= 0 ? "#3F7D63" : "#C1453B"}
            />
          </div>

          {pExpectedCosts.length > 0 && (
            <div className="grid grid-cols-2 gap-3 mt-3">
              <StatCard label="مصاريف متوقعة مستقبلية (لسه هتتصرف)" value={money(totals.expectedCostsTotal)} icon={Clock} color="#D6A23C" />
              <StatCard
                label="صافي الربح المتوقع (بعد المصاريف المستقبلية)"
                value={money(totals.projectedNetProfit)}
                icon={totals.projectedNetProfit >= 0 ? TrendingUp : TrendingDown}
                color={totals.projectedNetProfit >= 0 ? "#3F7D63" : "#C1453B"}
              />
            </div>
          )}
          </>)}
        </header>

        <div className="p-8">
          {tab === "dashboard" && (
            <Dashboard
              contractValue={Number(project?.budget) || 0}
              treasuryBalance={treasuryBalance}
              totals={totals}
              pWorkItems={pWorkItems}
              pCosts={pCosts}
              pExtracts={pExtracts}
              collections={pCollections}
              pExpectedCosts={pExpectedCosts}
              activeProjectId={activeProjectId}
              onAddExpectedCost={addExpectedCost}
              onUpdateExpectedCost={updateExpectedCost}
              onDeleteExpectedCost={deleteExpectedCost}
            />
          )}
          {tab === "items" && (
            <WorkItemsTab
              pWorkItems={pWorkItems}
              pCosts={pCosts}
              activeProjectId={activeProjectId}
              onAddWorkItem={addWorkItem}
              onUpdateWorkItem={updateWorkItem}
              onDeleteWorkItem={deleteWorkItem}
            />
          )}
          {tab === "costs" && (
            <CostsTab
              pCosts={pCosts}
              pWorkItems={pWorkItems}
              activeProjectId={activeProjectId}
              onAddCost={addCost}
              onAddCostsBulk={addCostsBulk}
              onUpdateCost={updateCost}
              onDeleteCost={deleteCost}
            />
          )}
          {tab === "extracts" && (
            <ExtractsTab
              pExtracts={pExtracts}
              collections={pCollections}
              onAddExtract={addExtract}
              onAddCollection={addCollection}
              onUpdateExtract={updateExtract}
              onDeleteExtract={deleteExtract}
              onDeleteCollection={deleteCollection}
              activeProjectId={activeProjectId}
              projectBudget={project?.budget}
              projectName={project?.name}
              projectClient={project?.client}
            />
          )}
          {tab === "custody" && (
            <CustodyTab
              pCustodies={pCustodies}
              pCosts={pCosts}
              pWorkItems={pWorkItems}
              custodyCategories={custodyCategories}
              activeProjectId={activeProjectId}
              onAddCustody={addCustody}
              onUpdateCustody={updateCustody}
              onDeleteCustody={deleteCustody}
              onSettleCustody={settleCustody}
              onAddCost={addCost}
              onUpdateCost={updateCost}
              onDeleteCost={deleteCost}
              onAddCategory={addCustodyCategory}
              onDeleteCategory={deleteCustodyCategory}
            />
          )}
          {tab === "treasury" && (
            <TreasuryTab
              pTreasuryEntries={pTreasuryEntries}
              openingBalance={Number(project?.treasury_opening_balance) || 0}
              activeProjectId={activeProjectId}
              onAddEntry={addTreasuryEntry}
              onUpdateEntry={updateTreasuryEntry}
              onDeleteEntry={deleteTreasuryEntry}
              onUpdateOpeningBalance={(v) => updateOpeningBalance(activeProjectId, v)}
            />
          )}
          {tab === "budget" && (
            <BudgetTab pWorkItems={pWorkItems} pCosts={pCosts} />
          )}
          {tab === "analytics" && (
            <AnalyticsTab
              project={project}
              pWorkItems={pWorkItems}
              pCosts={pCosts}
              pExtracts={pExtracts}
              pCollections={pCollections}
              pExpectedCosts={pExpectedCosts}
            />
          )}
        </div>
        </>
        )}
      </main>
      </div>

      <AppFooter />

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

/* =============================== مركز التقارير =============================== */
// قراءة فقط من البيانات المحمّلة أصلًا من Supabase — لا جداول جديدة ولا كتابة على القاعدة.

const rSum = (arr, fn) => arr.reduce((s, x) => s + fn(x), 0);
const rLine = (c) => c.qty * c.price;
const rDay = (d) => String(d || "").slice(0, 10);
const rPct = (v, d = 1) => (v === null || v === undefined || !isFinite(v) ? "—" : fmt(v, d) + "٪");
const rTypeLabel = (k) => COST_TYPES.find((t) => t.key === k)?.label || k || "—";
const rOverTone = (v) => (v > 0 ? "text-[color:var(--cl-red)]" : "text-[color:var(--cl-green)]");

const REPORT_LIST = [
  { key: "executive", title: "التقرير التنفيذي للمشروع", desc: "قيمة العقد، الأعمال، التكلفة الفعلية والمتوقعة، الربح والهامش، التحصيل وأهم التجاوزات.", icon: LayoutDashboard },
  { key: "costs", title: "تقرير التكاليف التفصيلي", desc: "التكاليف حسب النوع وبند العمل ومستوى التكلفة الأول والثاني (الكمية × السعر).", icon: ReceiptText },
  { key: "bva", title: "تقرير Budget vs Actual", desc: "الميزانية مقابل الفعلي لكل بند مع الفرق ونسبة الانحراف وتحديد البنود المتجاوزة.", icon: Gauge },
  { key: "extracts", title: "تقرير المستخلصات والتحصيلات", desc: "إجمالي المستخلصات والمحصل والمتبقي ونسبة التحصيل لكل مستخلص.", icon: FileCheck2 },
  { key: "treasury", title: "تقرير الخزينة والسيولة", desc: "الرصيد الحالي، المقبوضات والمدفوعات، التمويلات والسداد، وصافي حركة النقد.", icon: Vault },
  { key: "financing", title: "تقرير التمويلات والسلف", desc: "إجمالي التمويلات والسداد والرصيد المستحق وكشف حساب لكل ممول.", icon: HandCoins },
  { key: "items", title: "تقرير البنود", desc: "كل بند رئيسي وتحته تفاصيل التكلفة ومستوى التكلفة الأول والثاني.", icon: Layers },
];

function ReportShell({ title, notice, s, children }) {
  const projLabel = s.multi ? "كل المشروعات" : (s.projects[0]?.name || "—");
  const period = !s.from && !s.to ? "كل الفترات" : `${s.from || "البداية"}  ←  ${s.to || "اليوم"}`;
  return (
    <div id="report-print-area" dir="rtl" className="bg-[color:var(--cl-card)] rounded-xl border border-[color:var(--cl-line)] p-8 space-y-6">
      <div className="flex items-center justify-between border-b-[3px] border-[color:var(--cl-accent-bg)] pb-4">
        <div className="flex items-center gap-3">
          <CostLineMark size={40} />
          <div>
            <div className="font-extrabold text-lg text-[color:var(--cl-text)] leading-tight" dir="ltr">Cost<span className="text-[color:var(--cl-accent)]">Line</span></div>
            <div className="text-[10px] text-[color:var(--cl-muted)] mono tracking-wider">CONTRACTING · MANAGEMENT REPORT</div>
          </div>
        </div>
        <h1 className="text-xl font-extrabold text-[color:var(--cl-text)]">{title}</h1>
      </div>

      <div className="grid grid-cols-3 gap-3 bg-[color:var(--cl-inset)] rounded-lg px-5 py-3 text-[12px]">
        <div><span className="block text-[10px] text-[color:var(--cl-muted)]">المشروع</span><span className="font-bold text-[color:var(--cl-text)]">{projLabel}</span></div>
        <div><span className="block text-[10px] text-[color:var(--cl-muted)]">الفترة</span><span className="font-bold text-[color:var(--cl-text)] mono">{period}</span></div>
        <div><span className="block text-[10px] text-[color:var(--cl-muted)]">تاريخ الإصدار</span><span className="font-bold text-[color:var(--cl-text)] mono">{new Date().toLocaleDateString("en-GB")}</span></div>
      </div>

      {notice && <div className="text-[11px] text-[#e8c56a] bg-[#D6A23C]/10 border border-[#D6A23C]/30 rounded-lg px-4 py-2">{notice}</div>}

      {children}

      <div className="flex justify-between text-[10px] text-[color:var(--cl-muted)] border-t border-[color:var(--cl-line)] pt-3">
        <span>CostLine — نظام إدارة المقاولات</span>
        <span>تقرير سري للإدارة — للاستخدام الداخلي</span>
      </div>
    </div>
  );
}

function RptKpi({ label, value, sub, color = "#9AA3B2" }) {
  return (
    <div className="rounded-xl border border-[color:var(--cl-line)] bg-[color:var(--cl-card)] px-4 py-3 avoid-break">
      <div className="text-[11px] text-[color:var(--cl-muted)] mb-1">{label}</div>
      <div className="text-base font-extrabold mono" style={{ color }}>{value}</div>
      {sub && <div className="text-[10px] text-[color:var(--cl-muted)] mt-0.5">{sub}</div>}
    </div>
  );
}

function RptSection({ title, hint, children }) {
  return (
    <section className="space-y-2">
      <div>
        <h3 className="font-bold text-[color:var(--cl-text)] text-sm border-r-4 border-[color:var(--cl-accent-bg)] pr-2">{title}</h3>
        {hint && <p className="text-[11px] text-[color:var(--cl-muted)] mt-1 pr-3">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function RptTable({ heads, rows, footer, empty }) {
  return (
    <div className="border border-[color:var(--cl-line)] rounded-lg overflow-hidden">
      <table className="w-full text-[12px]">
        <thead className="bg-[color:var(--cl-ink)] text-white">
          <tr>{heads.map((h, i) => <th key={i} className="text-right py-2 px-3 font-semibold whitespace-nowrap">{h.label}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-[color:var(--cl-sep)]">
          {rows.length === 0 ? (
            <tr><td colSpan={heads.length} className="py-6 text-center text-[color:var(--cl-muted)]">{empty || "لا توجد بيانات في هذه الفترة"}</td></tr>
          ) : rows.map((r, ri) => (
            <tr key={ri} className={r.className || ""}>
              {r.cells.map((c, ci) => <td key={ci} className={`py-2 px-3 ${heads[ci]?.num ? "mono" : ""}`}>{c}</td>)}
            </tr>
          ))}
        </tbody>
        {footer && rows.length > 0 && (
          <tfoot className="bg-[color:var(--cl-inset)] font-bold">
            <tr>{footer.map((c, ci) => <td key={ci} className={`py-2 px-3 ${heads[ci]?.num ? "mono" : ""}`}>{c}</td>)}</tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

function RptBar({ label, value, max, color }) {
  const w = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div>
      <div className="flex justify-between text-[12px] mb-1"><span className="font-semibold text-[color:var(--cl-text)]">{label}</span><span className="mono font-bold">{money(value)}</span></div>
      <div className="h-2.5 rounded-full bg-[color:var(--cl-chip)] overflow-hidden"><div className="h-full rounded-full" style={{ width: `${w}%`, backgroundColor: color }} /></div>
    </div>
  );
}

/* -------- 1) التقرير التنفيذي -------- */
function ExecutiveReport({ s }) {
  const contract = rSum(s.projects, (p) => Number(p.budget) || 0);
  const worksValue = rSum(s.extractsUpTo, (e) => e.amount);
  const collected = rSum(s.collectionsUpTo, (c) => c.amount);
  const outstanding = worksValue - collected;
  const actual = rSum(s.costsUpTo, rLine);
  const expectedRest = rSum(s.expected, (e) => e.amount);
  const forecast = actual + expectedRest;
  const profit = contract - forecast;
  const margin = contract > 0 ? (profit / contract) * 100 : null;
  const good = profit >= 0;

  const over = s.works.map((w) => {
    const b = w.qty * w.price;
    const a = rSum(s.costsUpTo.filter((c) => c.workItemId === w.id), rLine);
    const e = rSum(s.expected.filter((x) => x.workItemId === w.id), (x) => x.amount);
    return { id: w.id, name: w.name, projectId: w.projectId, budget: b, actual: a, forecast: a + e, over: a + e - b };
  }).filter((r) => r.budget > 0 && r.over > 0).sort((x, y) => y.over - x.over).slice(0, 8);

  const barMax = Math.max(contract, forecast, worksValue, 1);

  return (
    <ReportShell title="التقرير التنفيذي للمشروع" s={s}
      notice={s.to ? `الأرقام التراكمية حتى ${s.to} (تاريخ البداية لا يؤثر على هذا التقرير لأنه يقارن بقيمة العقد كاملة).` : "الأرقام تراكمية منذ بداية المشروع."}>
      <div className="grid grid-cols-3 gap-3">
        <RptKpi label="قيمة العقد" value={money(contract)} />
        <RptKpi label="قيمة الأعمال / المستخلصات" value={money(worksValue)} color="#E8672C" />
        <RptKpi label="التكلفة الفعلية" value={money(actual)} color="#E8672C" />
        <RptKpi label="التكلفة المتوقعة عند الإنجاز" value={money(forecast)} sub="الفعلي + المصاريف المتوقعة المستقبلية" />
        <RptKpi label="الربح المتوقع" value={money(profit)} color={good ? "#3F7D63" : "#C1453B"} sub="قيمة العقد − التكلفة المتوقعة" />
        <RptKpi label="هامش الربح المتوقع" value={rPct(margin)} color={good ? "#3F7D63" : "#C1453B"} />
        <RptKpi label="إجمالي المحصل" value={money(collected)} color="#3F7D63" />
        <RptKpi label="المبالغ المستحقة التحصيل" value={money(outstanding)} color={outstanding > 0 ? "#D6A23C" : "#3F7D63"} sub="المستخلصات − المحصل" />
        <RptKpi label="نسبة التحصيل" value={worksValue > 0 ? rPct((collected / worksValue) * 100) : "—"} />
      </div>

      <RptSection title="مقارنة سريعة">
        <div className="space-y-3 avoid-break">
          <RptBar label="قيمة العقد" value={contract} max={barMax} color="#9AA3B2" />
          <RptBar label="المستخلصات" value={worksValue} max={barMax} color="#E8672C" />
          <RptBar label="التكلفة المتوقعة" value={forecast} max={barMax} color={forecast > contract && contract > 0 ? "#C1453B" : "#D6A23C"} />
          <RptBar label="المحصل" value={collected} max={barMax} color="#3F7D63" />
        </div>
      </RptSection>

      <RptSection title="أهم البنود التي بها تجاوز في التكلفة" hint="مقارنة التكلفة المتوقعة (الفعلي + المتوقع المستقبلي) بميزانية البند في المقايسة.">
        <RptTable
          heads={[{ label: "البند" }, { label: "الميزانية", num: true }, { label: "الفعلي", num: true }, { label: "المتوقع", num: true }, { label: "التجاوز", num: true }, { label: "نسبة التجاوز", num: true }]}
          rows={over.map((r) => ({
            cells: [
              <span className="font-semibold">{r.name}{s.multi && <span className="text-[10px] text-[color:var(--cl-muted)] block font-normal">{s.projName(r.projectId)}</span>}</span>,
              fmt(r.budget), fmt(r.actual), fmt(r.forecast),
              <span className="text-[color:var(--cl-red)] font-bold">{fmt(r.over)}</span>,
              <span className="text-[color:var(--cl-red)] font-bold">{rPct((r.over / r.budget) * 100)}</span>,
            ],
          }))}
          empty="لا توجد بنود متجاوزة للميزانية 👍"
        />
      </RptSection>
    </ReportShell>
  );
}

/* -------- 2) تقرير التكاليف التفصيلي -------- */
function CostDetailReport({ s }) {
  const list = s.costsRange;
  const total = rSum(list, rLine);
  const itemName = (id) => s.works.find((w) => w.id === id)?.name || "غير مرتبط ببند";

  const groupBy = (keyFn) => {
    const m = new Map();
    list.forEach((c) => { const k = keyFn(c); m.set(k, [...(m.get(k) || []), c]); });
    return [...m.entries()].map(([k, v]) => ({ key: k, lines: v, total: rSum(v, rLine) })).sort((a, b) => b.total - a.total);
  };
  const byType = groupBy((c) => c.type || "—");
  const byItem = groupBy((c) => c.workItemId || "_none");

  const l1Map = new Map();
  list.forEach((c) => {
    const a = c.costLevel1 || "بدون مستوى أول";
    const b = c.costLevel2 || "بدون مستوى ثانٍ";
    if (!l1Map.has(a)) l1Map.set(a, new Map());
    const inner = l1Map.get(a);
    inner.set(b, [...(inner.get(b) || []), c]);
  });
  const levelRows = [];
  [...l1Map.entries()].sort((a, b) => rSum([...b[1].values()].flat(), rLine) - rSum([...a[1].values()].flat(), rLine)).forEach(([l1, inner]) => {
    const all = [...inner.values()].flat();
    levelRows.push({ className: "bg-[color:var(--cl-inset)] font-bold", cells: [l1, "", all.length, fmt(rSum(all, rLine))] });
    [...inner.entries()].sort((a, b) => rSum(b[1], rLine) - rSum(a[1], rLine)).forEach(([l2, ls]) => {
      levelRows.push({ cells: [<span className="pr-4 text-[color:var(--cl-soft)]">↳</span>, l2, ls.length, fmt(rSum(ls, rLine))] });
    });
  });

  const lines = [...list].sort((a, b) => rDay(a.date).localeCompare(rDay(b.date)));

  return (
    <ReportShell title="تقرير التكاليف التفصيلي" s={s}>
      <div className="grid grid-cols-3 gap-3">
        <RptKpi label="إجمالي التكاليف في الفترة" value={money(total)} color="#E8672C" />
        <RptKpi label="عدد بنود التكلفة" value={fmt(list.length)} />
        <RptKpi label="أعلى نوع تكلفة" value={byType[0] ? rTypeLabel(byType[0].key) : "—"} sub={byType[0] ? money(byType[0].total) : ""} />
      </div>

      <RptSection title="حسب نوع التكلفة">
        <RptTable
          heads={[{ label: "النوع" }, { label: "عدد البنود", num: true }, { label: "الإجمالي", num: true }, { label: "النسبة", num: true }]}
          rows={byType.map((g) => ({ cells: [rTypeLabel(g.key), g.lines.length, fmt(g.total), rPct(total > 0 ? (g.total / total) * 100 : null)] }))}
          footer={["الإجمالي", list.length, fmt(total), "100٪"]}
        />
      </RptSection>

      <RptSection title="حسب بند العمل">
        <RptTable
          heads={[{ label: "البند" }, { label: "عدد البنود", num: true }, { label: "الإجمالي", num: true }, { label: "النسبة", num: true }]}
          rows={byItem.map((g) => ({ cells: [g.key === "_none" ? "غير مرتبط ببند" : itemName(g.key), g.lines.length, fmt(g.total), rPct(total > 0 ? (g.total / total) * 100 : null)] }))}
          footer={["الإجمالي", list.length, fmt(total), "100٪"]}
        />
      </RptSection>

      <RptSection title="حسب مستوى التكلفة الأول والثاني">
        <RptTable
          heads={[{ label: "المستوى الأول" }, { label: "المستوى الثاني" }, { label: "عدد البنود", num: true }, { label: "الإجمالي", num: true }]}
          rows={levelRows}
          footer={["الإجمالي", "", list.length, fmt(total)]}
        />
      </RptSection>

      <RptSection title="كشف التكاليف التفصيلي" hint="الإجمالي = الكمية × السعر">
        <RptTable
          heads={[{ label: "التاريخ" }, { label: "البند" }, { label: "النوع" }, { label: "الوصف" }, { label: "م1" }, { label: "م2" }, { label: "الكمية", num: true }, { label: "الوحدة" }, { label: "السعر", num: true }, { label: "الإجمالي", num: true }]}
          rows={lines.map((c) => ({
            cells: [
              rDay(c.date) || "—",
              <span>{itemName(c.workItemId)}{s.multi && <span className="text-[10px] text-[color:var(--cl-muted)] block">{s.projName(c.projectId)}</span>}</span>,
              rTypeLabel(c.type), c.desc, c.costLevel1 || "—", c.costLevel2 || "—",
              fmt(c.qty, 2), c.unit, fmt(c.price, 2), <b>{fmt(rLine(c))}</b>,
            ],
          }))}
          footer={["", "", "", "", "", "", "", "", "الإجمالي", fmt(total)]}
        />
      </RptSection>
    </ReportShell>
  );
}

/* -------- 3) Budget vs Actual -------- */
function BudgetVsActualReport({ s }) {
  const rows = s.works.map((w) => {
    const b = w.qty * w.price;
    const a = rSum(s.costsUpTo.filter((c) => c.workItemId === w.id), rLine);
    return { id: w.id, name: w.name, projectId: w.projectId, budget: b, actual: a };
  });
  const unlinked = rSum(s.costsUpTo.filter((c) => !c.workItemId), rLine);
  if (unlinked > 0) rows.push({ id: "_none", name: "تكاليف غير مرتبطة ببند", projectId: null, budget: 0, actual: unlinked });

  const enrich = (r) => {
    const diff = r.budget - r.actual;
    const dev = r.budget > 0 ? ((r.actual - r.budget) / r.budget) * 100 : null;
    const over = r.budget > 0 ? r.actual > r.budget : r.actual > 0;
    const near = !over && r.budget > 0 && r.actual > r.budget * 0.9;
    return { ...r, diff, dev, over, near };
  };
  const data = rows.map(enrich);
  const tb = rSum(data, (r) => r.budget);
  const ta = rSum(data, (r) => r.actual);
  const totalDev = tb > 0 ? ((ta - tb) / tb) * 100 : null;
  const overList = data.filter((r) => r.over).sort((a, b) => (b.actual - b.budget) - (a.actual - a.budget));

  const statusCell = (r) => r.over
    ? <span className="text-[color:var(--cl-red)] font-bold">{r.budget === 0 ? "بدون ميزانية" : "تجاوز"}</span>
    : r.near ? <span className="text-[#D6A23C] font-bold">قريب من الحد</span>
    : <span className="text-[color:var(--cl-green)] font-bold">ضمن الميزانية</span>;

  return (
    <ReportShell title="تقرير Budget vs Actual" s={s}
      notice={s.to ? `الفعلي تراكمي حتى ${s.to} ومقارن بميزانية البند كاملة.` : "الفعلي تراكمي منذ بداية المشروع ومقارن بميزانية البند كاملة."}>
      <div className="grid grid-cols-4 gap-3">
        <RptKpi label="إجمالي الميزانية" value={money(tb)} />
        <RptKpi label="إجمالي الفعلي" value={money(ta)} color="#E8672C" />
        <RptKpi label="الفرق (الميزانية − الفعلي)" value={money(tb - ta)} color={tb - ta >= 0 ? "#3F7D63" : "#C1453B"} sub={totalDev === null ? "" : `نسبة الانحراف ${rPct(totalDev)}`} />
        <RptKpi label="بنود متجاوزة" value={fmt(overList.length)} color={overList.length ? "#C1453B" : "#3F7D63"} />
      </div>

      <RptSection title="الميزانية مقابل الفعلي لكل بند" hint="نسبة الانحراف = (الفعلي − الميزانية) ÷ الميزانية — الموجب يعني تجاوز.">
        <RptTable
          heads={[{ label: "البند" }, { label: "الميزانية", num: true }, { label: "الفعلي", num: true }, { label: "الفرق", num: true }, { label: "نسبة الانحراف", num: true }, { label: "الحالة" }]}
          rows={data.map((r) => ({
            className: r.over ? "bg-[#C1453B]/[0.07]" : "",
            cells: [
              <span className="font-semibold">{r.name}{s.multi && r.projectId && <span className="text-[10px] text-[color:var(--cl-muted)] block font-normal">{s.projName(r.projectId)}</span>}</span>,
              fmt(r.budget), fmt(r.actual),
              <span className={rOverTone(-r.diff) + " font-bold"}>{(r.diff >= 0 ? "+" : "−") + fmt(Math.abs(r.diff))}</span>,
              r.dev === null ? "—" : <span className={rOverTone(r.dev) + " font-bold"}>{(r.dev > 0 ? "+" : "") + fmt(r.dev, 1)}٪</span>,
              statusCell(r),
            ],
          }))}
          footer={["الإجمالي", fmt(tb), fmt(ta), (tb - ta >= 0 ? "+" : "−") + fmt(Math.abs(tb - ta)), totalDev === null ? "—" : fmt(totalDev, 1) + "٪", ""]}
        />
      </RptSection>

      <RptSection title="البنود المتجاوزة للميزانية">
        <RptTable
          heads={[{ label: "البند" }, { label: "قيمة التجاوز", num: true }, { label: "نسبة التجاوز", num: true }]}
          rows={overList.map((r) => ({ cells: [r.name, <b className="text-[color:var(--cl-red)]">{fmt(r.actual - r.budget)}</b>, r.dev === null ? "—" : <b className="text-[color:var(--cl-red)]">{fmt(r.dev, 1)}٪</b>] }))}
          empty="لا توجد بنود متجاوزة للميزانية 👍"
        />
      </RptSection>
    </ReportShell>
  );
}

/* -------- 4) المستخلصات والتحصيلات -------- */
function ExtractsReport({ s }) {
  const exts = [...s.extractsRange].sort((a, b) => rDay(a.date).localeCompare(rDay(b.date)));
  const rows = exts.map((e) => {
    const col = rSum(s.collectionsUpTo.filter((c) => c.extractId === e.id), (c) => c.amount);
    return { ...e, collected: col, remaining: e.amount - col, rate: e.amount > 0 ? (col / e.amount) * 100 : null };
  });
  const totalExt = rSum(rows, (r) => r.amount);
  const totalCol = rSum(rows, (r) => r.collected);
  const totalRem = totalExt - totalCol;
  const rate = totalExt > 0 ? (totalCol / totalExt) * 100 : null;
  const general = s.collectionsRange.filter((c) => !c.extractId);
  const generalTotal = rSum(general, (c) => c.amount);
  const periodCollected = rSum(s.collectionsRange, (c) => c.amount);

  return (
    <ReportShell title="تقرير المستخلصات والتحصيلات" s={s}
      notice="التحصيل لكل مستخلص يشمل كل ما تم تحصيله عليه حتى تاريخ نهاية الفترة.">
      <div className="grid grid-cols-4 gap-3">
        <RptKpi label="إجمالي المستخلصات" value={money(totalExt)} color="#E8672C" />
        <RptKpi label="المحصل" value={money(totalCol)} color="#3F7D63" />
        <RptKpi label="المتبقي" value={money(totalRem)} color={totalRem > 0 ? "#D6A23C" : "#3F7D63"} />
        <RptKpi label="نسبة التحصيل" value={rPct(rate)} />
      </div>

      <RptSection title="بيان المستخلصات">
        <RptTable
          heads={[{ label: "رقم" }, ...(s.multi ? [{ label: "المشروع" }] : []), { label: "التاريخ" }, { label: "نسبة الإنجاز", num: true }, { label: "قيمة المستخلص", num: true }, { label: "المحصل", num: true }, { label: "المتبقي", num: true }, { label: "نسبة التحصيل", num: true }]}
          rows={rows.map((r) => ({
            cells: [
              <b>{r.number}</b>, ...(s.multi ? [s.projName(r.projectId)] : []),
              rDay(r.date) || "—", rPct(r.percentage), fmt(r.amount),
              <span className="text-[color:var(--cl-green)] font-bold">{fmt(r.collected)}</span>,
              <span className={r.remaining > 0 ? "text-[#D6A23C] font-bold" : "text-[color:var(--cl-green)] font-bold"}>{fmt(r.remaining)}</span>,
              rPct(r.rate),
            ],
          }))}
          footer={["الإجمالي", ...(s.multi ? [""] : []), "", "", fmt(totalExt), fmt(totalCol), fmt(totalRem), rPct(rate)]}
        />
      </RptSection>

      <RptSection title="تحصيلات عامة غير مرتبطة بمستخلص (في الفترة)">
        <RptTable
          heads={[{ label: "التاريخ" }, ...(s.multi ? [{ label: "المشروع" }] : []), { label: "الطريقة" }, { label: "ملاحظة" }, { label: "المبلغ", num: true }]}
          rows={general.map((c) => ({ cells: [rDay(c.date) || "—", ...(s.multi ? [s.projName(c.projectId)] : []), c.method || "—", c.note || "—", fmt(c.amount)] }))}
          footer={["الإجمالي", ...(s.multi ? [""] : []), "", "", fmt(generalTotal)]}
          empty="لا توجد تحصيلات عامة في هذه الفترة"
        />
      </RptSection>

      <div className="text-[12px] text-[color:var(--cl-soft)] avoid-break">إجمالي التحصيلات المسجّلة خلال الفترة (المرتبطة وغير المرتبطة): <b className="mono text-[color:var(--cl-text)]">{money(periodCollected)}</b></div>
    </ReportShell>
  );
}

/* -------- 5) الخزينة والسيولة -------- */
function TreasuryReport({ s }) {
  const opening = rSum(s.projects, (p) => Number(p.treasury_opening_balance) || 0);
  const sign = (t) => (t.type === "ايداع" ? t.amount : -t.amount);
  const currentBalance = opening + rSum(s.treasuryAll, sign);

  const before = s.from ? s.treasuryAll.filter((t) => rDay(t.date) < s.from) : [];
  const periodOpening = opening + rSum(before, sign);
  const inPeriod = s.treasuryAll.filter((t) => s.inRange(t.date)).sort((a, b) => rDay(a.date).localeCompare(rDay(b.date)));
  const receipts = rSum(inPeriod.filter((t) => t.type === "ايداع"), (t) => t.amount);
  const payments = rSum(inPeriod.filter((t) => t.type !== "ايداع"), (t) => t.amount);
  const net = receipts - payments;

  const fin = s.finTx.filter((t) => t.type === "تمويل" || t.type === "سلفة");
  const rep = s.finTx.filter((t) => t.type === "سداد");
  const finTotal = rSum(fin, (t) => t.amount);
  const repTotal = rSum(rep, (t) => t.amount);

  const months = new Map();
  inPeriod.forEach((t) => {
    const k = rDay(t.date).slice(0, 7) || "بدون تاريخ";
    const m = months.get(k) || { in: 0, out: 0 };
    if (t.type === "ايداع") m.in += t.amount; else m.out += t.amount;
    months.set(k, m);
  });
  const monthRows = [...months.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <ReportShell title="تقرير الخزينة والسيولة" s={s}
      notice="التمويلات والسداد حسابات عامة غير مرتبطة بمشروع، لذلك تظهر بنفس الأرقام مهما كان المشروع المختار، وتخضع لفلتر التاريخ فقط. ولم تُدمج مع حركة الخزينة لتفادي أي ازدواج.">
      <div className="grid grid-cols-4 gap-3">
        <RptKpi label="الرصيد الحالي للخزينة" value={money(currentBalance)} color={currentBalance >= 0 ? "#3F7D63" : "#C1453B"} sub="رصيد البداية + الإيداعات − المصروفات (تراكمي)" />
        <RptKpi label="المقبوضات (إيداعات)" value={money(receipts)} color="#3F7D63" />
        <RptKpi label="المدفوعات (صرف)" value={money(payments)} color="#C1453B" />
        <RptKpi label="صافي حركة النقد" value={money(net)} color={net >= 0 ? "#3F7D63" : "#C1453B"} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <RptKpi label="التمويلات والسلف (في الفترة)" value={money(finTotal)} color="#6B5CA5" />
        <RptKpi label="السداد (في الفترة)" value={money(repTotal)} color="#3F7D63" />
        <RptKpi label="صافي التمويل (تمويلات − سداد)" value={money(finTotal - repTotal)} />
      </div>

      <RptSection title="ملخص السيولة خلال الفترة">
        <RptTable
          heads={[{ label: "البيان" }, { label: "المبلغ", num: true }]}
          rows={[
            { cells: ["رصيد أول الفترة", fmt(periodOpening)] },
            { cells: ["+ المقبوضات", <span className="text-[color:var(--cl-green)] font-bold">{fmt(receipts)}</span>] },
            { cells: ["− المدفوعات", <span className="text-[color:var(--cl-red)] font-bold">{fmt(payments)}</span>] },
          ]}
          footer={["رصيد آخر الفترة", fmt(periodOpening + net)]}
        />
      </RptSection>

      <RptSection title="الحركة الشهرية">
        <RptTable
          heads={[{ label: "الشهر" }, { label: "مقبوضات", num: true }, { label: "مدفوعات", num: true }, { label: "الصافي", num: true }]}
          rows={monthRows.map(([k, m]) => ({ cells: [k, fmt(m.in), fmt(m.out), <b className={m.in - m.out >= 0 ? "text-[color:var(--cl-green)]" : "text-[color:var(--cl-red)]"}>{fmt(m.in - m.out)}</b>] }))}
          footer={["الإجمالي", fmt(receipts), fmt(payments), fmt(net)]}
        />
      </RptSection>

      <RptSection title="حركات الخزينة">
        <RptTable
          heads={[{ label: "التاريخ" }, ...(s.multi ? [{ label: "المشروع" }] : []), { label: "النوع" }, { label: "البيان" }, { label: "المبلغ", num: true }]}
          rows={inPeriod.map((t) => ({
            cells: [rDay(t.date) || "—", ...(s.multi ? [s.projName(t.projectId)] : []),
              t.type === "ايداع" ? <span className="text-[color:var(--cl-green)] font-bold">إيداع</span> : <span className="text-[color:var(--cl-red)] font-bold">صرف</span>,
              t.note || "—", fmt(t.amount)],
          }))}
        />
      </RptSection>
    </ReportShell>
  );
}

/* -------- 6) التمويلات والسلف -------- */
function FinancingReport({ s }) {
  const signed = (t) => (t.type === "سداد" ? -t.amount : t.amount);
  const persons = s.persons.map((p) => {
    const all = s.financeAll.filter((t) => t.personId === p.id).sort((a, b) => rDay(a.date).localeCompare(rDay(b.date)));
    const before = s.from ? all.filter((t) => rDay(t.date) < s.from) : [];
    const opening = rSum(before, signed);
    const txs = all.filter((t) => s.inRange(t.date));
    const fin = rSum(txs.filter((t) => t.type !== "سداد"), (t) => t.amount);
    const rep = rSum(txs.filter((t) => t.type === "سداد"), (t) => t.amount);
    return { ...p, opening, txs, fin, rep, closing: opening + fin - rep };
  });
  const tf = rSum(persons, (p) => p.fin);
  const tr = rSum(persons, (p) => p.rep);
  const to_ = rSum(persons, (p) => p.opening);
  const tc = rSum(persons, (p) => p.closing);

  return (
    <ReportShell title="تقرير التمويلات والسلف" s={s}
      notice="التمويلات والسلف حسابات عامة مستقلة غير مرتبطة بمشروع، لذلك لا يؤثر عليها فلتر المشروع.">
      <div className="grid grid-cols-4 gap-3">
        <RptKpi label="إجمالي التمويلات (في الفترة)" value={money(tf)} color="#6B5CA5" />
        <RptKpi label="إجمالي السداد (في الفترة)" value={money(tr)} color="#3F7D63" />
        <RptKpi label="الرصيد المستحق" value={money(tc)} color={tc > 0 ? "#D6A23C" : "#3F7D63"} sub={s.to ? `حتى ${s.to}` : "حتى اليوم"} />
        <RptKpi label="عدد الممولين" value={fmt(persons.length)} />
      </div>

      <RptSection title="ملخص الممولين">
        <RptTable
          heads={[{ label: "الممول" }, { label: "رصيد أول الفترة", num: true }, { label: "تمويلات", num: true }, { label: "سداد", num: true }, { label: "الرصيد المستحق", num: true }]}
          rows={persons.map((p) => ({ cells: [<b>{p.name}</b>, fmt(p.opening), fmt(p.fin), fmt(p.rep), <b className={p.closing > 0 ? "text-[#D6A23C]" : "text-[color:var(--cl-green)]"}>{fmt(p.closing)}</b>] }))}
          footer={["الإجمالي", fmt(to_), fmt(tf), fmt(tr), fmt(tc)]}
          empty="لا يوجد ممولون مسجلون"
        />
      </RptSection>

      {persons.filter((p) => p.txs.length > 0 || p.opening !== 0).map((p) => {
        let running = p.opening;
        const rows = p.txs.map((t) => {
          running += signed(t);
          return { cells: [rDay(t.date) || "—", t.type, t.note || "—", t.type === "سداد" ? "" : fmt(t.amount), t.type === "سداد" ? fmt(t.amount) : "", <b>{fmt(running)}</b>] };
        });
        return (
          <RptSection key={p.id} title={`كشف حساب: ${p.name}`}>
            <RptTable
              heads={[{ label: "التاريخ" }, { label: "النوع" }, { label: "البيان" }, { label: "مدين (تمويل)", num: true }, { label: "دائن (سداد)", num: true }, { label: "الرصيد", num: true }]}
              rows={[{ className: "bg-[color:var(--cl-inset)]", cells: ["", "رصيد سابق", "", "", "", fmt(p.opening)] }, ...rows]}
              footer={["الإجمالي", "", "", fmt(p.fin), fmt(p.rep), fmt(p.closing)]}
            />
          </RptSection>
        );
      })}
    </ReportShell>
  );
}

/* -------- 7) تقرير البنود -------- */
function ItemsReport({ s }) {
  const groups = s.works.map((w) => ({ id: w.id, name: w.name, unit: w.unit, qty: w.qty, price: w.price, projectId: w.projectId, lines: s.costsRange.filter((c) => c.workItemId === w.id) }));
  const orphan = s.costsRange.filter((c) => !c.workItemId);
  if (orphan.length > 0) groups.push({ id: "_none", name: "تكاليف غير مرتبطة ببند", unit: "", qty: 0, price: 0, projectId: null, lines: orphan });

  const grandTotal = rSum(groups, (g) => rSum(g.lines, rLine));

  const buildRows = (lines) => {
    const m = new Map();
    lines.forEach((c) => {
      const k = `${c.costLevel1 || "بدون مستوى أول"}\u0000${c.costLevel2 || "بدون مستوى ثانٍ"}`;
      m.set(k, [...(m.get(k) || []), c]);
    });
    const rows = [];
    [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).forEach(([k, ls]) => {
      const [l1, l2] = k.split("\u0000");
      rows.push({ className: "bg-[color:var(--cl-inset)] font-bold", cells: [`${l1}  ›  ${l2}`, "", "", "", "", "", fmt(rSum(ls, rLine))] });
      ls.sort((a, b) => rDay(a.date).localeCompare(rDay(b.date))).forEach((c) => {
        rows.push({ cells: [<span className="pr-4 text-[color:var(--cl-soft)]">{c.desc}</span>, rDay(c.date) || "—", rTypeLabel(c.type), fmt(c.qty, 2), c.unit, fmt(c.price, 2), fmt(rLine(c))] });
      });
    });
    return rows;
  };

  return (
    <ReportShell title="تقرير البنود" s={s}>
      <div className="grid grid-cols-3 gap-3">
        <RptKpi label="عدد البنود" value={fmt(s.works.length)} />
        <RptKpi label="ميزانية البنود" value={money(rSum(s.works, (w) => w.qty * w.price))} />
        <RptKpi label="التكاليف في الفترة" value={money(grandTotal)} color="#E8672C" />
      </div>

      {groups.map((g) => {
        const actual = rSum(g.lines, rLine);
        const budget = g.qty * g.price;
        const over = budget > 0 && actual > budget;
        return (
          <section key={g.id} className="space-y-2">
            <div className="flex items-center justify-between bg-[color:var(--cl-ink)] text-white rounded-lg px-4 py-2.5 avoid-break">
              <div>
                <div className="font-bold text-sm">{g.name}</div>
                <div className="text-[10px] text-white/60">
                  {g.id !== "_none" && <>{fmt(g.qty, 2)} {g.unit} × {fmt(g.price, 2)}</>}
                  {s.multi && g.projectId && <> · {s.projName(g.projectId)}</>}
                </div>
              </div>
              <div className="text-left text-[11px] mono">
                {g.id !== "_none" && <div className="text-white/60">الميزانية: {fmt(budget)}</div>}
                <div className={`font-bold text-sm ${over ? "text-[#F0918A]" : ""}`}>الفعلي: {fmt(actual)}</div>
              </div>
            </div>
            <RptTable
              heads={[{ label: "المستوى الأول › الثاني / الوصف" }, { label: "التاريخ" }, { label: "النوع" }, { label: "الكمية", num: true }, { label: "الوحدة" }, { label: "السعر", num: true }, { label: "الإجمالي", num: true }]}
              rows={buildRows(g.lines)}
              footer={["إجمالي البند", "", "", "", "", "", fmt(actual)]}
              empty="لا توجد تكاليف على هذا البند في الفترة"
            />
          </section>
        );
      })}
      {groups.length === 0 && <div className="text-center text-[color:var(--cl-muted)] py-8 text-sm">لا توجد بنود مسجلة</div>}
    </ReportShell>
  );
}

/* -------- مركز التقارير (الواجهة الرئيسية) -------- */
function ReportsCenter({ projects, workItems, costs, extracts, collections, treasuryEntries, financePersons, financeTransactions, expectedCosts, defaultProjectId }) {
  const [reportKey, setReportKey] = useState(null);
  const [projectId, setProjectId] = useState(defaultProjectId || "all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const inScope = (x) => projectId === "all" || x.projectId === projectId;
  const inRange = (d) => {
    if (!from && !to) return true;
    const x = rDay(d);
    if (!x) return false;
    return (!from || x >= from) && (!to || x <= to);
  };
  const upTo = (d) => {
    if (!to) return true;
    const x = rDay(d);
    return !x || x <= to;
  };

  const s = {
    multi: projectId === "all",
    from, to, inRange, upTo,
    projects: projects.filter((p) => projectId === "all" || p.id === projectId),
    projName: (id) => projects.find((p) => p.id === id)?.name || "—",
    works: workItems.filter(inScope),
    costsRange: costs.filter((c) => inScope(c) && inRange(c.date)),
    costsUpTo: costs.filter((c) => inScope(c) && upTo(c.date)),
    extractsRange: extracts.filter((e) => inScope(e) && inRange(e.date)),
    extractsUpTo: extracts.filter((e) => inScope(e) && upTo(e.date)),
    collectionsRange: collections.filter((c) => inScope(c) && inRange(c.date)),
    collectionsUpTo: collections.filter((c) => inScope(c) && upTo(c.date)),
    treasuryAll: treasuryEntries.filter(inScope),
    expected: expectedCosts.filter(inScope),
    persons: financePersons,
    financeAll: financeTransactions,
    finTx: financeTransactions.filter((t) => inRange(t.date)),
  };

  const current = REPORT_LIST.find((r) => r.key === reportKey);

  return (
    <div className="space-y-5">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #report-print-area, #report-print-area * { visibility: visible !important; }
          #report-print-area { position: absolute !important; left: 0; top: 0; width: 100% !important; border: none !important; border-radius: 0 !important; padding: 0 !important; }
          #report-print-area * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
          .avoid-break, tr { break-inside: avoid; }
          thead { display: table-header-group; }
          tfoot { display: table-row-group; }
          @page { size: A4; margin: 12mm; }
        }
      `}</style>

      <div className="no-print flex items-start justify-between">
        <div>
          <h2 className="font-bold text-[color:var(--cl-text)] text-xl flex items-center gap-2"><BarChart3 size={20} className="text-[color:var(--cl-accent)]" /> مركز التقارير</h2>
          <p className="text-[12px] text-[color:var(--cl-muted)] mt-1">تقارير إدارية جاهزة للتقديم — مبنية على البيانات المسجلة فعليًا في النظام</p>
        </div>
        {current && (
          <div className="flex gap-2">
            <button onClick={() => setReportKey(null)} className="px-3 py-2 rounded-lg border border-[color:var(--cl-line)] bg-[color:var(--cl-card)] text-sm font-semibold text-[color:var(--cl-text)] hover:bg-[color:var(--cl-inset)] flex items-center gap-1.5 transition">
              <ChevronRight size={15} /> كل التقارير
            </button>
            <button onClick={() => window.print()} className="px-3 py-2 rounded-lg bg-[color:var(--cl-accent-bg)] text-[color:var(--cl-on-accent)] text-sm font-semibold flex items-center gap-1.5 hover:bg-[color:var(--cl-accent-hover)] transition">
              <Printer size={15} /> طباعة / PDF
            </button>
          </div>
        )}
      </div>

      <div className="no-print bg-[color:var(--cl-card)] rounded-xl border border-[color:var(--cl-line)] p-4 flex flex-wrap items-end gap-4">
        <label className="text-[11px] text-[color:var(--cl-muted)] font-semibold">
          المشروع
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="block mt-1 min-w-[200px] px-3 py-2 rounded-lg border border-[color:var(--cl-line)] bg-[color:var(--cl-card)] text-sm text-[color:var(--cl-text)]">
            <option value="all">كل المشروعات</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="text-[11px] text-[color:var(--cl-muted)] font-semibold">
          من تاريخ
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="block mt-1 px-3 py-2 rounded-lg border border-[color:var(--cl-line)] bg-[color:var(--cl-card)] text-sm text-[color:var(--cl-text)]" />
        </label>
        <label className="text-[11px] text-[color:var(--cl-muted)] font-semibold">
          إلى تاريخ
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="block mt-1 px-3 py-2 rounded-lg border border-[color:var(--cl-line)] bg-[color:var(--cl-card)] text-sm text-[color:var(--cl-text)]" />
        </label>
        {(from || to) && (
          <button onClick={() => { setFrom(""); setTo(""); }} className="px-3 py-2 rounded-lg text-xs font-semibold text-[color:var(--cl-soft)] hover:bg-[color:var(--cl-inset)] flex items-center gap-1 transition">
            <X size={13} /> مسح التاريخ
          </button>
        )}
      </div>

      {!current && (
        <div className="no-print grid grid-cols-2 gap-4">
          {REPORT_LIST.map((r) => {
            const Icon = r.icon;
            return (
              <button key={r.key} onClick={() => setReportKey(r.key)} className="text-right bg-[color:var(--cl-card)] rounded-xl border border-[color:var(--cl-line)] p-5 flex items-start gap-4 hover:border-[color:var(--cl-accent-bg)] hover:shadow-md transition">
                <div className="w-11 h-11 rounded-xl bg-[color:rgb(var(--cl-accent-rgb)/0.1)] flex items-center justify-center shrink-0"><Icon size={20} className="text-[color:var(--cl-accent)]" /></div>
                <div className="min-w-0">
                  <div className="font-bold text-[color:var(--cl-text)]">{r.title}</div>
                  <div className="text-[12px] text-[color:var(--cl-muted)] mt-1 leading-relaxed">{r.desc}</div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {reportKey === "executive" && <ExecutiveReport s={s} />}
      {reportKey === "costs" && <CostDetailReport s={s} />}
      {reportKey === "bva" && <BudgetVsActualReport s={s} />}
      {reportKey === "extracts" && <ExtractsReport s={s} />}
      {reportKey === "treasury" && <TreasuryReport s={s} />}
      {reportKey === "financing" && <FinancingReport s={s} />}
      {reportKey === "items" && <ItemsReport s={s} />}
    </div>
  );
}

/* ============================ التحليلات والرسوم البيانية ============================ */
// قراءة فقط من بيانات المشروع المحمّلة أصلًا — لا كتابة على القاعدة ولا تغيير في الـ Schema.

const AN_COLORS = { budget: "#9AA3B2", actual: "#E8672C", forecast: "#D6A23C", good: "#3F7D63", bad: "#C1453B", extract: "#9AA3B2", collect: "#3F7D63" };
const AN_TIP = { fontFamily: "inherit", fontSize: 12, borderRadius: 8, border: "1px solid #26262c", backgroundColor: "#111114", color: "#eee", direction: "rtl", textAlign: "right" };
const AN_TICK = { fontSize: 11, fontFamily: "inherit", fill: "#8b8b95" };
const anCompact = (v) => {
  const a = Math.abs(v);
  if (a >= 1e6) return (v / 1e6).toFixed(a >= 1e7 ? 0 : 1) + "M";
  if (a >= 1e3) return (v / 1e3).toFixed(0) + "k";
  return String(v);
};
const anShort = (s, n = 18) => (String(s).length > n ? String(s).slice(0, n - 1) + "…" : String(s));

function AnCard({ title, subtitle, icon: Icon, right, children }) {
  return (
    <section className="bg-[color:var(--cl-card)] rounded-xl border border-[color:var(--cl-line)] p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="font-bold text-[color:var(--cl-text)] flex items-center gap-2">{Icon && <Icon size={16} className="text-[color:var(--cl-accent)]" />} {title}</h2>
          {subtitle && <p className="text-[12px] text-[color:var(--cl-muted)] mt-1">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

function AnEmpty({ text }) {
  return <div className="text-sm text-[color:var(--cl-muted)] py-10 text-center">{text}</div>;
}

function AnalyticsTab({ project, pWorkItems, pCosts, pExtracts, pCollections, pExpectedCosts }) {
  const [monthMode, setMonthMode] = useState("monthly");

  /* ---------- أرقام أساسية ---------- */
  const contract = Number(project?.budget) || 0;
  const worksValue = rSum(pExtracts, (e) => e.amount);
  const actualTotal = rSum(pCosts, rLine);
  const expectedRest = rSum(pExpectedCosts, (e) => e.amount);
  const forecastTotal = actualTotal + expectedRest;
  const revenueBase = contract > 0 ? contract : worksValue;
  const expectedProfit = revenueBase - forecastTotal;
  const margin = revenueBase > 0 ? (expectedProfit / revenueBase) * 100 : null;
  const profitGood = expectedProfit >= 0;

  /* ---------- 1) الميزانية × الفعلي × المتوقع لكل بند ---------- */
  const itemRows = useMemo(() => {
    const rows = pWorkItems.map((w) => {
      const budget = w.qty * w.price;
      const actual = rSum(pCosts.filter((c) => c.workItemId === w.id), rLine);
      const expected = rSum(pExpectedCosts.filter((x) => x.workItemId === w.id), (x) => x.amount);
      return { id: w.id, name: w.name, budget, actual, expected };
    });
    const ua = rSum(pCosts.filter((c) => !c.workItemId), rLine);
    const ue = rSum(pExpectedCosts.filter((x) => !x.workItemId), (x) => x.amount);
    if (ua > 0 || ue > 0) rows.push({ id: "_none", name: "غير مرتبط ببند", budget: 0, actual: ua, expected: ue });
    return rows.map((r) => {
      const forecast = r.actual + r.expected;
      const overActual = Math.max(0, r.actual - r.budget);
      const overForecast = Math.max(0, forecast - r.budget);
      return {
        ...r, forecast, overActual, overForecast,
        overExtra: Math.max(0, overForecast - overActual),
        pctActual: r.budget > 0 ? (overActual / r.budget) * 100 : null,
        pctForecast: r.budget > 0 ? (overForecast / r.budget) * 100 : null,
      };
    });
  }, [pWorkItems, pCosts, pExpectedCosts]);

  const itemStatus = (r) => {
    if (r.budget <= 0 && r.forecast <= 0) return { label: "—", color: "#8b8b95" };
    if (r.overActual > 0.5) return { label: r.budget <= 0 ? "بدون ميزانية" : "تجاوز فعلي", color: AN_COLORS.bad };
    if (r.overForecast > 0.5) return { label: "تجاوز متوقع", color: "#B5651D" };
    if (r.budget > 0 && r.forecast > r.budget * 0.9) return { label: "قريب من الحد", color: AN_COLORS.forecast };
    return { label: "ضمن الميزانية", color: AN_COLORS.good };
  };

  const CHART_MAX_ITEMS = 12;
  const itemsForChart = [...itemRows]
    .filter((r) => r.budget > 0 || r.forecast > 0)
    .sort((a, b) => Math.max(b.budget, b.forecast) - Math.max(a.budget, a.forecast));
  const itemChartData = itemsForChart.slice(0, CHART_MAX_ITEMS).map((r) => ({
    name: r.name, "الميزانية": r.budget, "الفعلي": r.actual, "المتوقع": r.forecast, over: r.budget > 0 && r.forecast > r.budget,
  }));

  /* ---------- 2) توزيع التكاليف حسب النوع ---------- */
  const typeData = COST_TYPES.map((t) => ({
    key: t.key, name: t.label, color: t.color, icon: t.icon,
    value: rSum(pCosts.filter((c) => c.type === t.key), rLine),
    count: pCosts.filter((c) => c.type === t.key).length,
  }));
  const knownTotal = rSum(typeData, (d) => d.value);
  const otherTotal = actualTotal - knownTotal;
  if (otherTotal > 0.5) typeData.push({ key: "_other", name: "أنواع أخرى", color: "#8b8b95", icon: Receipt, value: otherTotal, count: pCosts.filter((c) => !COST_TYPES.some((t) => t.key === c.type)).length });
  const typePie = typeData.filter((d) => d.value > 0);

  /* ---------- 3) الرسم الشهري ---------- */
  const monthly = useMemo(() => {
    const map = new Map();
    let undated = 0;
    const add = (date, field, val) => {
      const m = rDay(date).slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(m)) { undated += 1; return; }
      const cur = map.get(m) || { costs: 0, extracts: 0, collections: 0 };
      cur[field] += val;
      map.set(m, cur);
    };
    pCosts.forEach((c) => add(c.date, "costs", rLine(c)));
    pExtracts.forEach((e) => add(e.date, "extracts", e.amount));
    pCollections.forEach((c) => add(c.date, "collections", c.amount));
    if (map.size === 0) return { data: [], cumulative: [], undated };

    const keys = [...map.keys()].sort();
    let [y, m] = keys[0].split("-").map(Number);
    const [ey, em] = keys[keys.length - 1].split("-").map(Number);
    const data = [];
    let guard = 0;
    while ((y < ey || (y === ey && m <= em)) && guard < 120) {
      const k = `${y}-${String(m).padStart(2, "0")}`;
      const v = map.get(k) || { costs: 0, extracts: 0, collections: 0 };
      data.push({ label: `${String(m).padStart(2, "0")}/${y}`, "التكاليف الفعلية": v.costs, "المستخلصات": v.extracts, "التحصيلات": v.collections });
      m += 1; if (m > 12) { m = 1; y += 1; }
      guard += 1;
    }
    let c1 = 0, c2 = 0, c3 = 0;
    const cumulative = data.map((d) => {
      c1 += d["التكاليف الفعلية"]; c2 += d["المستخلصات"]; c3 += d["التحصيلات"];
      return { label: d.label, "التكاليف الفعلية": c1, "المستخلصات": c2, "التحصيلات": c3 };
    });
    return { data, cumulative, undated };
  }, [pCosts, pExtracts, pCollections]);

  /* ---------- 4) تحليل الانحرافات ---------- */
  const overList = itemRows
    .filter((r) => r.overForecast > 0.5)
    .sort((a, b) => b.overForecast - a.overForecast);
  const totalOverForecast = rSum(overList, (r) => r.overForecast);
  const totalOverActual = rSum(overList, (r) => r.overActual);
  const overChartData = overList.slice(0, CHART_MAX_ITEMS).map((r) => ({
    name: r.name, "تجاوز فعلي": r.overActual, "تجاوز متوقع إضافي": r.overExtra,
  }));

  /* ---------- 5) الربحية ---------- */
  const profitChart = [
    ...(contract > 0 ? [{ name: "قيمة العقد", value: contract, color: AN_COLORS.budget }] : []),
    { name: "قيمة الأعمال", value: worksValue, color: "#6B5CA5" },
    { name: "التكلفة الفعلية", value: actualTotal, color: AN_COLORS.actual },
    { name: "التكلفة المتوقعة", value: forecastTotal, color: AN_COLORS.forecast },
    { name: "الربح المتوقع", value: expectedProfit, color: profitGood ? AN_COLORS.good : AN_COLORS.bad },
  ];

  const hasAnyData = pWorkItems.length > 0 || pCosts.length > 0 || pExtracts.length > 0;
  if (!hasAnyData) {
    return <AnCard title="التحليلات والرسوم البيانية" icon={Gauge}><AnEmpty text="لا توجد بيانات كافية لهذا المشروع بعد. أضف بنودًا وتكاليف ومستخلصات لتظهر التحليلات." /></AnCard>;
  }

  return (
    <div className="space-y-6" dir="rtl">
      {/* ---- 1) Budget vs Actual vs Forecast ---- */}
      <AnCard
        title="الميزانية × الفعلي × المتوقع لكل بند"
        subtitle="المتوقع = التكلفة الفعلية + المصاريف المتوقعة المستقبلية للبند. الأعمدة الحمراء للمتوقع = بند متوقع تجاوزه للميزانية."
        icon={Gauge}
      >
        {itemChartData.length === 0 ? (
          <AnEmpty text="لا توجد بنود بميزانية أو تكاليف بعد." />
        ) : (
          <>
            <div style={{ width: "100%", height: Math.max(260, itemChartData.length * 62) }}>
              <ResponsiveContainer>
                <BarChart data={itemChartData} layout="vertical" barGap={2} barCategoryGap="24%" margin={{ top: 4, right: 4, left: 12, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#26262c" horizontal={false} />
                  <XAxis type="number" reversed tick={AN_TICK} stroke="#9A9483" tickFormatter={anCompact} />
                  <YAxis type="category" dataKey="name" orientation="right" width={130} tick={AN_TICK} stroke="#9A9483" tickFormatter={(v) => anShort(v)} />
                  <Tooltip formatter={(v) => money(v)} contentStyle={AN_TIP} cursor={{ fill: "rgba(255,255,255,0.05)" }} />
                  <Legend wrapperStyle={{ fontFamily: "inherit", fontSize: 12 }} />
                  <Bar dataKey="الميزانية" fill={AN_COLORS.budget} radius={3} />
                  <Bar dataKey="الفعلي" fill={AN_COLORS.actual} radius={3} />
                  <Bar dataKey="المتوقع" fill={AN_COLORS.forecast} radius={3}>
                    {itemChartData.map((d, i) => <Cell key={i} fill={d.over ? AN_COLORS.bad : AN_COLORS.forecast} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            {itemsForChart.length > CHART_MAX_ITEMS && (
              <p className="text-[11px] text-[color:var(--cl-muted)] mt-2">الرسم يعرض أكبر {CHART_MAX_ITEMS} بندًا من {itemsForChart.length}. الجدول التالي يشمل كل البنود.</p>
            )}
          </>
        )}

        {itemRows.length > 0 && (
          <div className="mt-4 border border-[color:var(--cl-sep)] rounded-lg overflow-hidden">
            <div className="max-h-80 overflow-auto">
              <table className="w-full text-[12px]">
                <thead className="bg-[color:var(--cl-inset)] text-[color:var(--cl-soft)] sticky top-0">
                  <tr>
                    {["البند", "الميزانية", "الفعلي", "المتوقع", "الفرق (الميزانية − المتوقع)", "الحالة"].map((h) => <th key={h} className="text-right py-2 px-3 font-semibold whitespace-nowrap">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--cl-sep)]">
                  {itemRows.map((r) => {
                    const st = itemStatus(r);
                    const diff = r.budget - r.forecast;
                    return (
                      <tr key={r.id}>
                        <td className="py-2 px-3 font-semibold text-[color:var(--cl-text)]">{r.name}</td>
                        <td className="py-2 px-3 mono">{fmt(r.budget)}</td>
                        <td className="py-2 px-3 mono text-[color:var(--cl-accent)]">{fmt(r.actual)}</td>
                        <td className="py-2 px-3 mono">{fmt(r.forecast)}</td>
                        <td className={`py-2 px-3 mono font-bold ${r.budget === 0 ? "text-[color:var(--cl-muted)]" : diff >= 0 ? "text-[color:var(--cl-green)]" : "text-[color:var(--cl-red)]"}`}>{r.budget === 0 ? "—" : (diff >= 0 ? "+" : "−") + fmt(Math.abs(diff))}</td>
                        <td className="py-2 px-3"><span className="text-[11px] font-bold rounded-full px-2.5 py-0.5" style={{ color: st.color, backgroundColor: st.color + "18" }}>{st.label}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </AnCard>

      {/* ---- 2) توزيع التكاليف ---- */}
      <AnCard title="توزيع التكاليف حسب النوع" subtitle="من إجمالي التكاليف الفعلية المسجّلة (الكمية × السعر)" icon={Layers}>
        {actualTotal <= 0 ? (
          <AnEmpty text="لا توجد تكاليف مسجّلة بعد." />
        ) : (
          <div className="grid grid-cols-5 gap-6 items-center">
            <div className="col-span-2 relative" style={{ width: "100%", height: 260 }}>
              <ResponsiveContainer>
                <RePieChart>
                  <Pie data={typePie} dataKey="value" nameKey="name" innerRadius={72} outerRadius={112} paddingAngle={2} stroke="none">
                    {typePie.map((d) => <Cell key={d.key} fill={d.color} />)}
                  </Pie>
                  <Tooltip formatter={(v, n) => [money(v), n]} contentStyle={AN_TIP} />
                </RePieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <div className="text-[11px] text-[color:var(--cl-muted)]">إجمالي الفعلي</div>
                <div className="text-base font-extrabold mono text-[color:var(--cl-text)]">{fmt(actualTotal)}</div>
              </div>
            </div>
            <div className="col-span-3 space-y-3">
              {typeData.map((d) => {
                const Icon = d.icon;
                const p = actualTotal > 0 ? (d.value / actualTotal) * 100 : 0;
                return (
                  <div key={d.key}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="flex items-center gap-2 font-semibold text-[color:var(--cl-text)]">
                        <span className="w-6 h-6 rounded-md flex items-center justify-center" style={{ backgroundColor: d.color + "20" }}><Icon size={13} style={{ color: d.color }} /></span>
                        {d.name}
                        <span className="text-[11px] text-[color:var(--cl-muted)] font-normal">· {fmt(d.count)} بند</span>
                      </span>
                      <span className="mono text-[12px]"><b>{fmt(d.value)}</b> <span className="text-[color:var(--cl-muted)]">({fmt(p, 1)}٪)</span></span>
                    </div>
                    <div className="h-2 rounded-full bg-[color:var(--cl-chip)] overflow-hidden"><div className="h-full rounded-full" style={{ width: `${p}%`, backgroundColor: d.color }} /></div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </AnCard>

      {/* ---- 3) الرسم الشهري ---- */}
      <AnCard
        title="التكاليف والمستخلصات والتحصيلات"
        subtitle="التجميع حسب شهر تاريخ كل عملية. الترتيب الزمني من اليمين إلى اليسار."
        icon={TrendingUp}
        right={
          <div className="flex rounded-lg border border-[color:var(--cl-line)] overflow-hidden text-[12px] font-semibold shrink-0">
            {[{ k: "monthly", l: "شهري" }, { k: "cumulative", l: "تراكمي" }].map((o) => (
              <button key={o.k} onClick={() => setMonthMode(o.k)} className={`px-3 py-1.5 transition ${monthMode === o.k ? "bg-[color:var(--cl-ink)] text-white" : "bg-[color:var(--cl-card)] text-[color:var(--cl-soft)] hover:bg-[color:var(--cl-inset)]"}`}>{o.l}</button>
            ))}
          </div>
        }
      >
        {monthly.data.length === 0 ? (
          <AnEmpty text="لا توجد عمليات مؤرخة لعرضها." />
        ) : (
          <>
            <div style={{ width: "100%", height: 320 }}>
              <ResponsiveContainer>
                {monthMode === "monthly" ? (
                  <BarChart data={monthly.data} barGap={3} margin={{ top: 8, right: 4, left: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#26262c" vertical={false} />
                    <XAxis dataKey="label" reversed tick={AN_TICK} stroke="#9A9483" />
                    <YAxis orientation="right" tick={AN_TICK} stroke="#9A9483" tickFormatter={anCompact} />
                    <Tooltip formatter={(v) => money(v)} contentStyle={AN_TIP} cursor={{ fill: "rgba(255,255,255,0.05)" }} />
                    <Legend wrapperStyle={{ fontFamily: "inherit", fontSize: 12 }} />
                    <Bar dataKey="التكاليف الفعلية" fill={AN_COLORS.actual} radius={[3, 3, 0, 0]} />
                    <Bar dataKey="المستخلصات" fill={AN_COLORS.extract} radius={[3, 3, 0, 0]} />
                    <Bar dataKey="التحصيلات" fill={AN_COLORS.collect} radius={[3, 3, 0, 0]} />
                  </BarChart>
                ) : (
                  <LineChart data={monthly.cumulative} margin={{ top: 8, right: 4, left: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#26262c" vertical={false} />
                    <XAxis dataKey="label" reversed tick={AN_TICK} stroke="#9A9483" />
                    <YAxis orientation="right" tick={AN_TICK} stroke="#9A9483" tickFormatter={anCompact} />
                    <Tooltip formatter={(v) => money(v)} contentStyle={AN_TIP} />
                    <Legend wrapperStyle={{ fontFamily: "inherit", fontSize: 12 }} />
                    <Line type="monotone" dataKey="التكاليف الفعلية" stroke={AN_COLORS.actual} strokeWidth={2.5} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="المستخلصات" stroke={AN_COLORS.extract} strokeWidth={2.5} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="التحصيلات" stroke={AN_COLORS.collect} strokeWidth={2.5} dot={{ r: 3 }} />
                  </LineChart>
                )}
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-3 gap-3 mt-4">
              <RptKpi label="إجمالي التكاليف الفعلية" value={money(actualTotal)} color={AN_COLORS.actual} />
              <RptKpi label="إجمالي المستخلصات" value={money(worksValue)} />
              <RptKpi label="إجمالي التحصيلات" value={money(rSum(pCollections, (c) => c.amount))} color={AN_COLORS.good} />
            </div>
            {monthly.undated > 0 && <p className="text-[11px] text-[color:var(--cl-muted)] mt-2">ملاحظة: {monthly.undated} عملية بدون تاريخ صحيح لم تظهر في الرسم الشهري.</p>}
          </>
        )}
      </AnCard>

      {/* ---- 4) تحليل الانحرافات ---- */}
      <AnCard
        title="تحليل الانحرافات"
        subtitle="البنود التي تجاوزت ميزانيتها فعليًا، أو يُتوقع تجاوزها بعد احتساب المصاريف المستقبلية."
        icon={TrendingUp}
      >
        {overList.length === 0 ? (
          <AnEmpty text="لا توجد بنود متجاوزة للميزانية حاليًا." />
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <RptKpi label="عدد البنود المتجاوزة" value={fmt(overList.length)} color={AN_COLORS.bad} />
              <RptKpi label="إجمالي التجاوز الفعلي" value={money(totalOverActual)} color={AN_COLORS.bad} />
              <RptKpi label="إجمالي التجاوز المتوقع" value={money(totalOverForecast)} color="#B5651D" sub="يشمل الفعلي + المتوقع المستقبلي" />
            </div>
            <div style={{ width: "100%", height: Math.max(220, overChartData.length * 52) }}>
              <ResponsiveContainer>
                <BarChart data={overChartData} layout="vertical" barCategoryGap="28%" margin={{ top: 4, right: 4, left: 12, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#26262c" horizontal={false} />
                  <XAxis type="number" reversed tick={AN_TICK} stroke="#9A9483" tickFormatter={anCompact} />
                  <YAxis type="category" dataKey="name" orientation="right" width={130} tick={AN_TICK} stroke="#9A9483" tickFormatter={(v) => anShort(v)} />
                  <Tooltip formatter={(v) => money(v)} contentStyle={AN_TIP} cursor={{ fill: "rgba(255,255,255,0.05)" }} />
                  <Legend wrapperStyle={{ fontFamily: "inherit", fontSize: 12 }} />
                  <Bar dataKey="تجاوز فعلي" stackId="over" fill={AN_COLORS.bad} />
                  <Bar dataKey="تجاوز متوقع إضافي" stackId="over" fill={AN_COLORS.forecast} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 border border-[color:var(--cl-sep)] rounded-lg overflow-hidden">
              <table className="w-full text-[12px]">
                <thead className="bg-[color:var(--cl-inset)] text-[color:var(--cl-soft)]">
                  <tr>
                    {["البند", "الميزانية", "الفعلي", "المتوقع", "قيمة التجاوز", "نسبة التجاوز"].map((h) => <th key={h} className="text-right py-2 px-3 font-semibold whitespace-nowrap">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--cl-sep)]">
                  {overList.map((r) => (
                    <tr key={r.id}>
                      <td className="py-2 px-3 font-semibold text-[color:var(--cl-text)]">{r.name}</td>
                      <td className="py-2 px-3 mono">{fmt(r.budget)}</td>
                      <td className="py-2 px-3 mono text-[color:var(--cl-accent)]">{fmt(r.actual)}</td>
                      <td className="py-2 px-3 mono">{fmt(r.forecast)}</td>
                      <td className="py-2 px-3 mono font-bold text-[color:var(--cl-red)]">{fmt(r.overForecast)}</td>
                      <td className="py-2 px-3 mono font-bold text-[color:var(--cl-red)]">{r.pctForecast === null ? "بدون ميزانية" : fmt(r.pctForecast, 1) + "٪"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-[color:var(--cl-muted)] mt-2">قيمة التجاوز = المتوقع − الميزانية، ونسبة التجاوز = قيمة التجاوز ÷ الميزانية.</p>
          </>
        )}
      </AnCard>

      {/* ---- 5) تحليل الربحية ---- */}
      <AnCard
        title="تحليل الربحية"
        subtitle={contract > 0 ? "الربح المتوقع = قيمة العقد − التكلفة المتوقعة، والهامش = الربح ÷ قيمة العقد." : "لم تُسجَّل قيمة عقد للمشروع، فاحتُسب الربح المتوقع على أساس قيمة الأعمال (المستخلصات)."}
        icon={CircleDollarSign}
      >
        <div className="grid grid-cols-5 gap-3 mb-4">
          <RptKpi label="قيمة الأعمال" value={money(worksValue)} sub="إجمالي المستخلصات" color="#6B5CA5" />
          <RptKpi label="التكلفة الفعلية" value={money(actualTotal)} color={AN_COLORS.actual} />
          <RptKpi label="التكلفة المتوقعة" value={money(forecastTotal)} sub="الفعلي + المتوقع المستقبلي" />
          <RptKpi label="الربح المتوقع" value={money(expectedProfit)} color={profitGood ? AN_COLORS.good : AN_COLORS.bad} />
          <RptKpi label="هامش الربح المتوقع" value={rPct(margin)} color={profitGood ? AN_COLORS.good : AN_COLORS.bad} />
        </div>
        <div style={{ width: "100%", height: 300 }}>
          <ResponsiveContainer>
            <BarChart data={profitChart} margin={{ top: 8, right: 4, left: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#26262c" vertical={false} />
              <XAxis dataKey="name" reversed tick={AN_TICK} stroke="#9A9483" />
              <YAxis orientation="right" tick={AN_TICK} stroke="#9A9483" tickFormatter={anCompact} />
              <Tooltip formatter={(v) => money(v)} contentStyle={AN_TIP} cursor={{ fill: "rgba(255,255,255,0.05)" }} />
              <Bar dataKey="value" name="القيمة" radius={[5, 5, 0, 0]} maxBarSize={72}>
                {profitChart.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        {revenueBase > 0 && (
          <div className="mt-4">
            <div className="flex justify-between text-[12px] mb-1.5">
              <span className="font-semibold text-[color:var(--cl-text)]">استهلاك {contract > 0 ? "قيمة العقد" : "قيمة الأعمال"} بالتكلفة المتوقعة</span>
              <span className="mono font-bold">{fmt((forecastTotal / revenueBase) * 100, 1)}٪</span>
            </div>
            <div className="h-3 rounded-full bg-[color:var(--cl-chip)] overflow-hidden flex">
              <div className="h-full" style={{ width: `${Math.min(100, (actualTotal / revenueBase) * 100)}%`, backgroundColor: AN_COLORS.actual }} />
              <div className="h-full" style={{ width: `${Math.max(0, Math.min(100 - (actualTotal / revenueBase) * 100, (expectedRest / revenueBase) * 100))}%`, backgroundColor: AN_COLORS.forecast }} />
            </div>
            <div className="flex gap-4 mt-1.5 text-[11px] text-[color:var(--cl-muted)]">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{ backgroundColor: AN_COLORS.actual }} /> فعلي</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{ backgroundColor: AN_COLORS.forecast }} /> متوقع مستقبلي</span>
            </div>
          </div>
        )}
      </AnCard>
    </div>
  );
}

/* ------------------------------- فوتر التطبيق ------------------------------- */
// الساعة والتاريخ ورقم الإصدار فقط. غيّر APP_VERSION مع كل إصدار جديد.
const APP_VERSION = "v1.0.1864";

function AppFooter({ variant = "app" }) {
  const now = useLiveClock();
  const login = variant === "login";
  const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"];
  const h24 = now.getHours();
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const p2 = (n) => String(n).padStart(2, "0");
  const stamp = `${WD[now.getDay()]}, ${now.getDate()} ${MO[now.getMonth()]} ${now.getFullYear()}, ${p2(h12)}:${p2(now.getMinutes())}:${p2(now.getSeconds())} ${h24 < 12 ? "am" : "pm"}`;

  return (
    <footer dir="ltr" className={`no-print w-full shrink-0${login ? "" : " blueprint-bg"} flex items-center justify-end gap-4 px-6 sticky bottom-0 z-40`} style={{ height: 48, backgroundColor: login ? "transparent" : "var(--cl-side)", borderTop: login ? "1px solid #1a1a1f" : "1px solid rgba(255,255,255,0.10)", fontFamily: login ? "'IBM Plex Sans Arabic', system-ui, -apple-system, 'Segoe UI', sans-serif" : "'IBM Plex Sans Arabic', 'Cairo', sans-serif" }}>
      <span className="mono text-[13px] font-semibold rounded-lg px-4 py-1 border" style={login ? { color: "#f0c85a", backgroundColor: "#111114", borderColor: "#26262c" } : { color: "var(--cl-accent-bg)", backgroundColor: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.12)" }}>{stamp}</span>
      <span className="text-[14px]" style={{ color: login ? "#8b8b95" : "rgba(255,255,255,0.45)" }}>{APP_VERSION}</span>
    </footer>
  );
}

/* ------------------------------- شعار CostLine ------------------------------- */
const COSTLINE_MARK_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F7DC84"/><stop offset="1" stop-color="#E0A92E"/></linearGradient></defs><rect width="48" height="48" rx="11" fill="url(#g)"/><path d="M30.5 16.5 A12 12 0 1 0 30.5 33.5" fill="none" stroke="#1a1405" stroke-width="4.6" stroke-linecap="round"/><polyline points="23.5,30.5 29,25 33,28 39.5,18.5" fill="none" stroke="#1a1405" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="39.5" cy="18.5" r="2.7" fill="#1a1405"/></svg>';

function CostLineMark({ size = 40, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} role="img" aria-label="CostLine" style={{ display: "block", flexShrink: 0 }}>
      <defs>
        <linearGradient id="cl-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#F7DC84" />
          <stop offset="1" stopColor="#E0A92E" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="11" fill="url(#cl-grad)" />
      <path d="M30.5 16.5 A12 12 0 1 0 30.5 33.5" fill="none" stroke="#1a1405" strokeWidth="4.6" strokeLinecap="round" />
      <polyline points="23.5,30.5 29,25 33,28 39.5,18.5" fill="none" stroke="#1a1405" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="39.5" cy="18.5" r="2.7" fill="#1a1405" />
    </svg>
  );
}

/* ------------------------------- stat card ------------------------------- */

function StatCard({ label, value, icon: Icon, color }) {
  return (
    <div className="bg-[color:var(--cl-card)] rounded-xl border border-[color:var(--cl-line)] px-4 py-3 flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: color + "18" }}>
        <Icon size={17} style={{ color }} />
      </div>
      <div className="min-w-0">
        <div className="text-[11px] text-[color:var(--cl-muted)] truncate">{label}</div>
        <div className="text-sm font-bold mono text-[color:var(--cl-text)] truncate">{value}</div>
      </div>
    </div>
  );
}

/* ---------------------------- sidebar item ---------------------------- */

function SidebarItem({ icon: Icon, label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`relative w-full text-right px-3 py-2.5 rounded-lg text-sm flex items-center gap-3 transition ${
        active ? "bg-white/10 text-white font-bold" : "text-white/60 hover:bg-white/5 hover:text-white/95"
      }`}
    >
      {active && <span className="absolute right-0 top-2 bottom-2 w-[3px] rounded-l bg-[color:var(--cl-accent-bg)]" />}
      <span className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 transition ${active ? "bg-[color:var(--cl-accent-bg)] text-[color:var(--cl-on-accent)]" : "bg-white/5 text-white/60"}`}>
        <Icon size={15} />
      </span>
      <span className="truncate">{label}</span>
    </button>
  );
}

/* ---------------------------- dashboard: KPIs ---------------------------- */

function KpiCard({ label, value, sub, icon: Icon, color, tone }) {
  return (
    <div className="bg-[color:var(--cl-card)] rounded-xl border border-[color:var(--cl-line)] p-4 relative overflow-hidden">
      <span className="absolute top-0 right-0 bottom-0 w-1" style={{ backgroundColor: color }} />
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="text-[12px] font-semibold text-[color:var(--cl-soft)] truncate">{label}</div>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: color + "18" }}>
          <Icon size={16} style={{ color }} />
        </div>
      </div>
      <div className="text-[19px] font-extrabold mono truncate" style={{ color: tone || "#9AA3B2" }}>{value}</div>
      {sub && <div className="text-[11px] text-[color:var(--cl-muted)] mt-1 truncate">{sub}</div>}
    </div>
  );
}

function DashboardKpis({ contractValue, treasuryBalance, totals }) {
  const forecastCost = totals.actualTotal + totals.expectedCostsTotal;
  const expectedProfit = contractValue - forecastCost;
  const margin = contractValue > 0 ? (expectedProfit / contractValue) * 100 : null;
  const pctOfContract = (v) => (contractValue > 0 ? `${fmt((v / contractValue) * 100, 1)}٪ من قيمة العقد` : "—");
  const collectedPct = totals.extractsTotal > 0 ? `${fmt((totals.collectedTotal / totals.extractsTotal) * 100, 1)}٪ من المستخلصات` : "لا توجد مستخلصات";
  const good = "#3F7D63", bad = "#C1453B";

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <Gauge size={16} className="text-[color:var(--cl-accent)]" />
        <h2 className="font-bold text-[color:var(--cl-text)]">المؤشرات الرئيسية</h2>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="قيمة العقد" value={money(contractValue)} sub="إجمالي عقد المشروع" icon={FileSignature} color="#9AA3B2" />
        <KpiCard label="قيمة الأعمال / المستخلصات" value={money(totals.extractsTotal)} sub={pctOfContract(totals.extractsTotal)} icon={FileCheck2} color="#E8672C" />
        <KpiCard label="إجمالي التكلفة الفعلية" value={money(totals.actualTotal)} sub={pctOfContract(totals.actualTotal)} icon={ReceiptText}
                 color={totals.actualTotal > totals.budgetTotal && totals.budgetTotal > 0 ? bad : "#6B5CA5"} />
        <KpiCard label="التكلفة المتوقعة" value={money(totals.expectedCostsTotal)} sub="مصاريف لسه هتتصرف" icon={Hourglass} color="#D6A23C" />
        <KpiCard label="الربح المتوقع" value={money(expectedProfit)} sub="قيمة العقد − (الفعلي + المتوقع)" icon={expectedProfit >= 0 ? TrendingUp : TrendingDown}
                 color={expectedProfit >= 0 ? good : bad} tone={expectedProfit >= 0 ? good : bad} />
        <KpiCard label="نسبة الربح المتوقعة" value={margin === null ? "—" : `${fmt(margin, 1)}٪`} sub="من قيمة العقد" icon={Percent}
                 color={margin !== null && margin < 0 ? bad : good} tone={margin !== null && margin < 0 ? bad : good} />
        <KpiCard label="إجمالي المحصّل" value={money(totals.collectedTotal)} sub={collectedPct} icon={CircleDollarSign} color={good} />
        <KpiCard label="الرصيد بالخزينة" value={money(treasuryBalance)} sub="رصيد البداية + الإيداعات − المصروفات" icon={Vault}
                 color={treasuryBalance >= 0 ? "#9AA3B2" : bad} tone={treasuryBalance >= 0 ? undefined : bad} />
      </div>
    </section>
  );
}

/* ------------------- dashboard: Budget vs Actual vs Forecast ------------------- */

function BudgetActualForecast({ totals, pWorkItems, pCosts, pExpectedCosts }) {
  const budget = totals.budgetTotal;
  const actual = totals.actualTotal;
  const expected = totals.expectedCostsTotal;
  const forecast = actual + expected;
  const max = Math.max(budget, forecast, 1);
  const w = (v) => `${Math.min(100, (v / max) * 100)}%`;
  const pct = (v) => (budget > 0 ? `${fmt((v / budget) * 100, 1)}٪ من الميزانية` : "—");

  const remaining = budget - actual;
  const forecastVar = budget - forecast;

  let status = { label: "لا توجد ميزانية بنود بعد", color: "#8b8b95" };
  if (budget > 0) {
    if (forecast > budget) status = { label: "تجاوز متوقع للميزانية", color: "#C1453B" };
    else if (forecast > budget * 0.9) status = { label: "قريب من حد الميزانية", color: "#D6A23C" };
    else status = { label: "ضمن الميزانية", color: "#3F7D63" };
  }

  const rows = pWorkItems.map((wi) => {
    const a = pCosts.filter((c) => c.workItemId === wi.id).reduce((s, c) => s + c.qty * c.price, 0);
    const e = pExpectedCosts.filter((x) => x.workItemId === wi.id).reduce((s, x) => s + x.amount, 0);
    const b = wi.qty * wi.price;
    return { id: wi.id, name: wi.name, budget: b, actual: a, forecast: a + e };
  });
  const ua = pCosts.filter((c) => !c.workItemId).reduce((s, c) => s + c.qty * c.price, 0);
  const ue = pExpectedCosts.filter((x) => !x.workItemId).reduce((s, x) => s + x.amount, 0);
  if (ua > 0 || ue > 0) rows.push({ id: "_none", name: "غير مرتبط ببند", budget: 0, actual: ua, forecast: ua + ue });

  return (
    <section className="bg-[color:var(--cl-card)] rounded-xl border border-[color:var(--cl-line)] p-5 h-full">
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <h2 className="font-bold text-[color:var(--cl-text)] flex items-center gap-2"><Gauge size={16} className="text-[color:var(--cl-accent)]" /> الميزانية × الفعلي × المتوقع</h2>
          <p className="text-[12px] text-[color:var(--cl-muted)] mt-1">المتوقع عند الإنجاز = التكلفة الفعلية + المصاريف المتوقعة المستقبلية</p>
        </div>
        <span className="text-[11px] font-bold rounded-full px-3 py-1 shrink-0" style={{ color: status.color, backgroundColor: status.color + "18" }}>{status.label}</span>
      </div>

      <div className="space-y-4">
        <div>
          <div className="flex justify-between text-sm mb-1.5"><span className="font-semibold text-[color:var(--cl-text)]">الميزانية (المقايسة)</span><span className="mono font-bold">{money(budget)}</span></div>
          <div className="h-3 rounded-full bg-[color:var(--cl-chip)] overflow-hidden"><div className="h-full rounded-full bg-[#9AA3B2]" style={{ width: w(budget) }} /></div>
        </div>
        <div>
          <div className="flex justify-between text-sm mb-1.5"><span className="font-semibold text-[color:var(--cl-text)]">الفعلي حتى الآن <span className="text-[11px] text-[color:var(--cl-muted)] font-normal">· {pct(actual)}</span></span><span className="mono font-bold text-[color:var(--cl-accent)]">{money(actual)}</span></div>
          <div className="h-3 rounded-full bg-[color:var(--cl-chip)] overflow-hidden"><div className="h-full rounded-full bg-[color:var(--cl-accent-bg)]" style={{ width: w(actual) }} /></div>
        </div>
        <div>
          <div className="flex justify-between text-sm mb-1.5"><span className="font-semibold text-[color:var(--cl-text)]">المتوقع عند الإنجاز <span className="text-[11px] text-[color:var(--cl-muted)] font-normal">· {pct(forecast)}</span></span><span className="mono font-bold" style={{ color: forecast > budget && budget > 0 ? "#ff6b6b" : "#eeeeee" }}>{money(forecast)}</span></div>
          <div className="h-3 rounded-full bg-[color:var(--cl-chip)] overflow-hidden flex" style={{ width: "100%" }}>
            <div className="h-full bg-[color:var(--cl-accent-bg)]" style={{ width: w(actual) }} />
            <div className="h-full bg-[#D6A23C]" style={{ width: w(expected) }} />
          </div>
          <div className="flex gap-4 mt-1.5 text-[11px] text-[color:var(--cl-muted)]">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-[color:var(--cl-accent-bg)]" /> فعلي</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-[#D6A23C]" /> متوقع مستقبلي ({money(expected)})</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mt-5">
        <div className="rounded-lg bg-[color:var(--cl-sub)] border border-[color:var(--cl-sep)] p-3">
          <div className="text-[11px] text-[color:var(--cl-muted)] mb-1">المتبقي من الميزانية</div>
          <div className={`text-sm font-bold mono ${remaining >= 0 ? "text-[color:var(--cl-green)]" : "text-[color:var(--cl-red)]"}`}>{money(remaining)}</div>
        </div>
        <div className="rounded-lg bg-[color:var(--cl-sub)] border border-[color:var(--cl-sep)] p-3">
          <div className="text-[11px] text-[color:var(--cl-muted)] mb-1">{forecastVar >= 0 ? "وفر متوقع" : "تجاوز متوقع"}</div>
          <div className={`text-sm font-bold mono ${forecastVar >= 0 ? "text-[color:var(--cl-green)]" : "text-[color:var(--cl-red)]"}`}>{money(Math.abs(forecastVar))}</div>
        </div>
        <div className="rounded-lg bg-[color:var(--cl-sub)] border border-[color:var(--cl-sep)] p-3">
          <div className="text-[11px] text-[color:var(--cl-muted)] mb-1">نسبة الصرف</div>
          <div className="text-sm font-bold mono text-[color:var(--cl-text)]">{budget > 0 ? `${fmt((actual / budget) * 100, 1)}٪` : "—"}</div>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="mt-5 border border-[color:var(--cl-sep)] rounded-lg overflow-hidden">
          <div className="max-h-64 overflow-auto">
            <table className="w-full text-[12px]">
              <thead className="bg-[color:var(--cl-inset)] text-[color:var(--cl-soft)] sticky top-0">
                <tr>
                  <th className="text-right py-2 px-3 font-semibold">بند العمل</th>
                  <th className="text-right py-2 px-3 font-semibold">الميزانية</th>
                  <th className="text-right py-2 px-3 font-semibold">الفعلي</th>
                  <th className="text-right py-2 px-3 font-semibold">المتوقع</th>
                  <th className="text-right py-2 px-3 font-semibold">الانحراف</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--cl-sep)]">
                {rows.map((r) => {
                  const v = r.budget - r.forecast;
                  return (
                    <tr key={r.id}>
                      <td className="py-2 px-3 font-semibold text-[color:var(--cl-text)] max-w-[160px] truncate">{r.name}</td>
                      <td className="py-2 px-3 mono">{fmt(r.budget)}</td>
                      <td className="py-2 px-3 mono text-[color:var(--cl-accent)]">{fmt(r.actual)}</td>
                      <td className="py-2 px-3 mono">{fmt(r.forecast)}</td>
                      <td className={`py-2 px-3 mono font-bold ${r.budget === 0 ? "text-[color:var(--cl-muted)]" : v >= 0 ? "text-[color:var(--cl-green)]" : "text-[color:var(--cl-red)]"}`}>{r.budget === 0 ? "—" : (v >= 0 ? "+" : "−") + fmt(Math.abs(v))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

/* ---------------------- dashboard: توزيع التكاليف حسب النوع ---------------------- */

function CostDistribution({ pCosts }) {
  const data = COST_TYPES.map((t) => ({
    key: t.key, name: t.label, color: t.color, icon: t.icon,
    value: pCosts.filter((c) => c.type === t.key).reduce((s, c) => s + c.qty * c.price, 0),
  }));
  const known = data.reduce((s, d) => s + d.value, 0);
  const other = pCosts.reduce((s, c) => s + c.qty * c.price, 0) - known;
  if (other > 0.5) data.push({ key: "_other", name: "أنواع أخرى", color: "#8b8b95", icon: Receipt, value: other });
  const total = data.reduce((s, d) => s + d.value, 0);
  const pie = data.filter((d) => d.value > 0);

  return (
    <section className="bg-[color:var(--cl-card)] rounded-xl border border-[color:var(--cl-line)] p-5 h-full">
      <h2 className="font-bold text-[color:var(--cl-text)] flex items-center gap-2"><Layers size={16} className="text-[color:var(--cl-accent)]" /> توزيع التكاليف حسب النوع</h2>
      <p className="text-[12px] text-[color:var(--cl-muted)] mt-1 mb-3">من إجمالي التكاليف الفعلية المسجّلة</p>

      {total <= 0 ? (
        <div className="text-sm text-[color:var(--cl-muted)] py-10 text-center">لا توجد تكاليف مسجّلة بعد.</div>
      ) : (
        <div className="relative" style={{ width: "100%", height: 200 }}>
          <ResponsiveContainer>
            <RePieChart>
              <Pie data={pie} dataKey="value" nameKey="name" innerRadius={58} outerRadius={88} paddingAngle={2} stroke="none">
                {pie.map((d) => <Cell key={d.key} fill={d.color} />)}
              </Pie>
              <Tooltip formatter={(v) => money(v)} contentStyle={{ fontFamily: "inherit", fontSize: 12, borderRadius: 8, border: "1px solid #26262c", backgroundColor: "#111114", color: "#eee" }} />
            </RePieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <div className="text-[10px] text-[color:var(--cl-muted)]">الإجمالي</div>
            <div className="text-sm font-extrabold mono text-[color:var(--cl-text)]">{fmt(total)}</div>
          </div>
        </div>
      )}

      <div className="mt-3 space-y-2.5">
        {data.map((d) => {
          const Icon = d.icon;
          const p = total > 0 ? (d.value / total) * 100 : 0;
          return (
            <div key={d.key}>
              <div className="flex items-center justify-between text-[13px] mb-1">
                <span className="flex items-center gap-2 font-semibold text-[color:var(--cl-text)]">
                  <span className="w-6 h-6 rounded-md flex items-center justify-center" style={{ backgroundColor: d.color + "18" }}><Icon size={13} style={{ color: d.color }} /></span>
                  {d.name}
                </span>
                <span className="mono text-[12px]"><b>{money(d.value)}</b> <span className="text-[color:var(--cl-muted)]">· {fmt(p, 1)}٪</span></span>
              </div>
              <div className="h-1.5 rounded-full bg-[color:var(--cl-chip)] overflow-hidden"><div className="h-full rounded-full" style={{ width: `${p}%`, backgroundColor: d.color }} /></div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* -------------------------------- dashboard -------------------------------- */

function Dashboard({ contractValue, treasuryBalance, totals, pWorkItems, pCosts, pExtracts, collections, pExpectedCosts, activeProjectId, onAddExpectedCost, onUpdateExpectedCost, onDeleteExpectedCost }) {
  const chartData = pWorkItems.map((w) => {
    const actual = pCosts.filter((c) => c.workItemId === w.id).reduce((s, c) => s + c.qty * c.price, 0);
    return { name: w.name.length > 14 ? w.name.slice(0, 14) + "…" : w.name, الميزانية: w.qty * w.price, الفعلي: actual };
  });

  const recentCosts = [...pCosts].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 6);
  const variance = totals.budgetTotal - totals.actualTotal;

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ desc: "", amount: "", expectedDate: "", workItemId: "", notes: "" });

  const resetForm = () => setForm({ desc: "", amount: "", expectedDate: "", workItemId: "", notes: "" });

  const submit = () => {
    if (!form.desc || !form.amount) return;
    if (editId) {
      onUpdateExpectedCost(editId, { desc: form.desc, amount: Number(form.amount), expectedDate: form.expectedDate, workItemId: form.workItemId || null, notes: form.notes });
      setEditId(null);
    } else {
      onAddExpectedCost({
        id: "ec_" + Math.random().toString(36).slice(2, 8),
        projectId: activeProjectId,
        desc: form.desc,
        amount: Number(form.amount),
        expectedDate: form.expectedDate,
        workItemId: form.workItemId || null,
        notes: form.notes,
      });
    }
    resetForm();
    setOpen(false);
  };

  const startEdit = (e) => {
    setEditId(e.id);
    setForm({ desc: e.desc, amount: String(e.amount), expectedDate: e.expectedDate, workItemId: e.workItemId || "", notes: e.notes });
    setOpen(true);
  };

  const cancelForm = () => {
    setEditId(null);
    resetForm();
    setOpen(false);
  };

  return (
    <div className="space-y-6">
      <DashboardKpis contractValue={contractValue} treasuryBalance={treasuryBalance} totals={totals} />

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        <div className="xl:col-span-3">
          <BudgetActualForecast totals={totals} pWorkItems={pWorkItems} pCosts={pCosts} pExpectedCosts={pExpectedCosts} />
        </div>
        <div className="xl:col-span-2">
          <CostDistribution pCosts={pCosts} />
        </div>
      </div>

      <section className="bg-[color:var(--cl-card)] rounded-xl border border-[color:var(--cl-line)] p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-[color:var(--cl-text)]">الميزانية مقابل الفعلي — حسب بند العمل</h2>
          <div className={`text-sm font-bold mono flex items-center gap-1 ${variance >= 0 ? "text-[color:var(--cl-green)]" : "text-[color:var(--cl-red)]"}`}>
            {variance >= 0 ? <TrendingDown size={14} /> : <TrendingUp size={14} />}
            {variance >= 0 ? "وفر" : "تجاوز"} {money(Math.abs(variance))}
          </div>
        </div>
        <div style={{ width: "100%", height: 280 }}>
          <ResponsiveContainer>
            <BarChart data={chartData} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="#26262c" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fontFamily: "inherit" }} stroke="#9A9483" />
              <YAxis tick={{ fontSize: 10 }} stroke="#9A9483" tickFormatter={(v) => (v / 1000) + "k"} />
              <Tooltip formatter={(v) => money(v)} contentStyle={{ fontFamily: "inherit", fontSize: 12, borderRadius: 8, border: "1px solid #26262c", backgroundColor: "#111114", color: "#eee" }} />
              <Bar dataKey="الميزانية" fill="#9AA3B2" radius={[4, 4, 0, 0]} />
              <Bar dataKey="الفعلي" radius={[4, 4, 0, 0]}>
                {chartData.map((d, i) => (
                  <Cell key={i} fill={d.الفعلي > d.الميزانية ? "#C1453B" : "#E8672C"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="bg-[color:var(--cl-card)] rounded-xl border border-[color:var(--cl-line)] p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-bold text-[color:var(--cl-text)]">مصاريف متوقعة مستقبلية</h2>
            <p className="text-[12px] text-[color:var(--cl-muted)] mt-1">حاجات لسه هتتصرف على المشروع، مش مسجّلة كتكلفة فعلية بعد — بتُستخدم لحساب "صافي الربح المتوقع" في أعلى الصفحة</p>
          </div>
          <button onClick={() => (open ? cancelForm() : setOpen(true))} className="px-3 py-2 rounded-lg bg-[color:var(--cl-ink)] text-white text-sm font-semibold flex items-center gap-1.5 hover:bg-[color:var(--cl-ink-hover)] transition shrink-0">
            <Plus size={15} /> مصروف متوقع جديد
          </button>
        </div>

        {open && (
          <div className="bg-[color:var(--cl-sub)] rounded-lg border border-[color:var(--cl-line)] p-4 grid grid-cols-4 gap-3 mb-4">
            {editId && <div className="col-span-4 text-xs font-semibold text-[color:var(--cl-accent)] bg-[color:rgb(var(--cl-accent-rgb)/0.1)] rounded-md px-3 py-1.5">جاري تعديل مصروف موجود</div>}
            <div className="col-span-2">
              <Field label="الوصف" value={form.desc} onChange={(v) => setForm((f) => ({ ...f, desc: v }))} placeholder="مثال: باقي أعمال الدهانات" />
            </div>
            <Field label="المبلغ المتوقع" value={form.amount} onChange={(v) => setForm((f) => ({ ...f, amount: v }))} type="number" />
            <Field label="التاريخ المتوقع (اختياري)" value={form.expectedDate} onChange={(v) => setForm((f) => ({ ...f, expectedDate: v }))} type="date" />
            <SelectField
              label="بند العمل (اختياري)"
              value={form.workItemId}
              onChange={(v) => setForm((f) => ({ ...f, workItemId: v }))}
              options={[{ value: "", label: "— غير مرتبط ببند —" }, ...pWorkItems.map((w) => ({ value: w.id, label: w.name }))]}
            />
            <div className="col-span-3">
              <Field label="ملاحظات (اختياري)" value={form.notes} onChange={(v) => setForm((f) => ({ ...f, notes: v }))} placeholder="أي تفاصيل إضافية" />
            </div>
            <div className="col-span-4 flex justify-end gap-2">
              {editId && <button onClick={cancelForm} className="px-4 py-2 rounded-lg bg-[color:var(--cl-line)] text-[color:var(--cl-text)] text-sm font-semibold hover:bg-[color:var(--cl-hover)] transition">إلغاء</button>}
              <button onClick={submit} className="px-4 py-2 rounded-lg bg-[color:var(--cl-accent-bg)] text-[color:var(--cl-on-accent)] text-sm font-semibold hover:bg-[color:var(--cl-accent-hover)] transition">{editId ? "حفظ التعديل" : "حفظ"}</button>
            </div>
          </div>
        )}

        <div className="divide-y divide-[color:var(--cl-sep)]">
          {pExpectedCosts.length === 0 && <div className="text-sm text-[color:var(--cl-muted)] py-4">لا توجد مصاريف متوقعة مسجّلة حاليًا.</div>}
          {pExpectedCosts.map((e) => (
            <div key={e.id} className="py-3 flex items-center justify-between gap-3 group">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-[color:var(--cl-text)] truncate">{e.desc}</div>
                <div className="text-[11px] text-[color:var(--cl-muted)]">
                  {pWorkItems.find((w) => w.id === e.workItemId)?.name || "غير مرتبط ببند"}
                  {e.expectedDate ? ` · متوقع بتاريخ ${e.expectedDate}` : ""}
                  {e.notes ? ` · ${e.notes}` : ""}
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="text-sm font-bold mono text-[#D6A23C]">{money(e.amount)}</div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                  <button onClick={() => startEdit(e)} title="تعديل" className="p-1.5 rounded-md text-[color:var(--cl-soft)] hover:bg-[color:var(--cl-line)] hover:text-[color:var(--cl-text)] transition"><Pencil size={14} /></button>
                  <button onClick={() => onDeleteExpectedCost(e.id)} title="حذف" className="p-1.5 rounded-md text-[color:var(--cl-red)] hover:bg-[#C1453B]/10 transition"><Trash2 size={14} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-[color:var(--cl-card)] rounded-xl border border-[color:var(--cl-line)] p-5">
        <h2 className="font-bold text-[color:var(--cl-text)] mb-3">آخر التكاليف المسجّلة</h2>
        <div className="divide-y divide-[color:var(--cl-sep)]">
          {recentCosts.length === 0 && <div className="text-sm text-[color:var(--cl-muted)] py-4">لا توجد تكاليف مسجّلة بعد.</div>}
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
                    <div className="text-sm font-semibold text-[color:var(--cl-text)] truncate">{c.desc}</div>
                    <div className="text-[11px] text-[color:var(--cl-muted)]">{c.costLevel1 || "بدون مستوى أول"}{c.costLevel2 ? ` · ${c.costLevel2}` : ""} · {meta?.label} · {c.date}</div>
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

function WorkItemsTab({ pWorkItems, pCosts, activeProjectId, onAddWorkItem, onUpdateWorkItem, onDeleteWorkItem }) {
  const [form, setForm] = useState({ name: "" });
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState({ name: "" });

  const submit = () => {
    const name = form.name.trim();
    if (!name) return;
    onAddWorkItem({
      id: "w_" + Math.random().toString(36).slice(2, 8),
      projectId: activeProjectId,
      name,
      unit: "-",
      qty: 0,
      price: 0,
    });
    setForm({ name: "" });
    setOpen(false);
  };

  const startEdit = (w) => {
    setEditId(w.id);
    setEditForm({ name: w.name });
  };

  const saveEdit = () => {
    const name = editForm.name.trim();
    if (!name) return;
    onUpdateWorkItem(editId, { name });
    setEditId(null);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold text-[color:var(--cl-text)] text-lg">بنود الأعمال</h2>
          <p className="text-xs text-[color:var(--cl-muted)] mt-1">دليل البنود التي يتم اختيارها عند تسجيل التكاليف</p>
        </div>
        <button onClick={() => setOpen((o) => !o)} className="px-3 py-2 rounded-lg bg-[color:var(--cl-ink)] text-white text-sm font-semibold flex items-center gap-1.5 hover:bg-[color:var(--cl-ink-hover)] transition">
          <Plus size={15} /> إضافة بند عمل
        </button>
      </div>

      {open && (
        <div className="bg-[color:var(--cl-card)] rounded-xl border border-[color:var(--cl-line)] p-4">
          <div className="max-w-md">
            <Field label="اسم / كود بند العمل" value={form.name} onChange={(v) => setForm({ name: v })} placeholder="مثال: أعمال الحفر والردم" />
          </div>
          <div className="flex justify-end mt-3">
            <button onClick={submit} className="px-4 py-2 rounded-lg bg-[color:var(--cl-accent-bg)] text-[color:var(--cl-on-accent)] text-sm font-semibold hover:bg-[color:var(--cl-accent-hover)] transition">حفظ البند</button>
          </div>
        </div>
      )}

      <div className="bg-[color:var(--cl-card)] rounded-xl border border-[color:var(--cl-line)] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[color:var(--cl-inset)] text-[color:var(--cl-soft)] text-[12px]">
              <th className="text-right py-3 px-4 font-semibold">بند العمل</th>
              <th className="text-right py-3 px-4 font-semibold">التكلفة الفعلية</th>
              <th className="text-right py-3 px-4 font-semibold w-20"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:var(--cl-sep)]">
            {pWorkItems.map((w) => {
              const actual = pCosts.filter((c) => c.workItemId === w.id).reduce((s, c) => s + c.qty * c.price, 0);
              const isEditing = editId === w.id;
              if (isEditing) {
                return (
                  <tr key={w.id} className="bg-[color:var(--cl-sub)]">
                    <td className="py-2 px-2">
                      <input value={editForm.name} onChange={(e) => setEditForm({ name: e.target.value })} className="w-full border border-[color:var(--cl-line)] rounded-md px-2 py-1.5 text-sm outline-none focus:border-[color:var(--cl-accent-bg)]" />
                    </td>
                    <td className="py-3 px-4 mono text-[color:var(--cl-muted)]">{money(actual)}</td>
                    <td className="py-2 px-2">
                      <div className="flex gap-1.5 justify-end">
                        <button onClick={saveEdit} className="px-2.5 py-1.5 rounded-md bg-[#3F7D63] text-white text-xs font-semibold hover:bg-[#356A54] transition">حفظ</button>
                        <button onClick={() => setEditId(null)} className="px-2.5 py-1.5 rounded-md bg-[color:var(--cl-line)] text-[color:var(--cl-text)] text-xs font-semibold hover:bg-[color:var(--cl-hover)] transition">إلغاء</button>
                      </div>
                    </td>
                  </tr>
                );
              }
              return (
                <tr key={w.id} className="hover:bg-[color:var(--cl-sub)] transition group">
                  <td className="py-3 px-4 font-semibold text-[color:var(--cl-text)]">{w.name}</td>
                  <td className="py-3 px-4 mono font-bold">{money(actual)}</td>
                  <td className="py-3 px-4">
                    <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition">
                      <button onClick={() => startEdit(w)} title="تعديل" className="p-1.5 rounded-md text-[color:var(--cl-soft)] hover:bg-[color:var(--cl-line)] hover:text-[color:var(--cl-text)] transition"><Pencil size={14} /></button>
                      <button onClick={() => onDeleteWorkItem(w.id)} title="حذف" className="p-1.5 rounded-md text-[color:var(--cl-red)] hover:bg-[#C1453B]/10 transition"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {pWorkItems.length === 0 && (
              <tr><td colSpan={3} className="text-center py-8 text-[color:var(--cl-muted)]">لا توجد بنود أعمال بعد.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* --------------------------------- costs --------------------------------- */

/* --------------------------- استيراد التكاليف من إكسيل --------------------------- */

function CostExcelImportPanel({ pWorkItems, activeProjectId, onImport, onClose }) {
  const [loading, setLoading] = useState(false);
  const [parsed, setParsed] = useState(null);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setError("");
    setParsed(null);
    setLoading(true);
    try {
      const rows = await parseCostExcelFile(file, pWorkItems);
      setParsed(rows);
    } catch (err) {
      setError(err.message || "حصل خطأ أثناء قراءة الملف، تأكد إنه ملف إكسيل صحيح (.xlsx أو .xls).");
    }
    setLoading(false);
  };

  const validRows = parsed ? parsed.filter((r) => r.valid) : [];
  const invalidRows = parsed ? parsed.filter((r) => !r.valid) : [];

  const confirmImport = () => {
    const costs = validRows.map((r) => ({
      id: "c_" + Math.random().toString(36).slice(2, 8),
      projectId: activeProjectId,
      workItemId: r.data.workItemId,
      type: r.data.type,
      desc: r.data.desc,
      costLevel1: r.data.costLevel1,
      costLevel2: r.data.costLevel2,
      qty: r.data.qty,
      unit: r.data.unit,
      price: r.data.price,
      date: r.data.date,
    }));
    onImport(costs);
  };

  return (
    <div className="bg-[color:var(--cl-card)] rounded-xl border border-[color:var(--cl-line)] p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-bold text-[color:var(--cl-text)]">استيراد تكاليف من إكسيل</div>
          <p className="text-[12px] text-[color:var(--cl-muted)] mt-1">
            الأعمدة المتوقعة بالترتيب: التاريخ، بند العمل (اختياري)، النوع، الوصف، المستوى الأول (اختياري)، المستوى الثاني (اختياري)، الكمية، الوحدة، السعر
          </p>
        </div>
        <button onClick={() => downloadCostExcelTemplate(pWorkItems)} className="px-3 py-2 rounded-lg bg-[color:var(--cl-card)] border border-[color:var(--cl-line)] text-[color:var(--cl-text)] text-xs font-semibold hover:border-white/40 transition shrink-0 whitespace-nowrap">
          تحميل قالب إكسيل
        </button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <label className="px-4 py-2 rounded-lg bg-[color:var(--cl-ink)] text-white text-sm font-semibold cursor-pointer hover:bg-[color:var(--cl-ink-hover)] transition">
          اختيار ملف إكسيل
          <input type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" />
        </label>
        {fileName && <span className="text-xs text-[color:var(--cl-soft)]">{fileName}</span>}
        {loading && (
          <span className="text-xs text-[color:var(--cl-muted)] flex items-center gap-1">
            <Loader2 size={13} className="animate-spin" /> جاري القراءة...
          </span>
        )}
        <button onClick={onClose} className="text-xs text-[color:var(--cl-muted)] hover:text-[color:var(--cl-text)] transition mr-auto">إلغاء</button>
      </div>

      {error && <div className="text-xs text-[color:var(--cl-red)] bg-[#C1453B]/10 rounded-md px-3 py-2">{error}</div>}

      {parsed && (
        <div className="space-y-3">
          <div className="flex gap-2 text-xs flex-wrap">
            <span className="px-3 py-1.5 rounded-full bg-[#3F7D63]/10 text-[color:var(--cl-green)] font-semibold">{validRows.length} صف صالح للاستيراد</span>
            {invalidRows.length > 0 && (
              <span className="px-3 py-1.5 rounded-full bg-[#C1453B]/10 text-[color:var(--cl-red)] font-semibold">{invalidRows.length} صف فيه خطأ (هيتجاهل)</span>
            )}
          </div>

          <div className="max-h-72 overflow-auto border border-[color:var(--cl-line)] rounded-lg">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-[color:var(--cl-inset)]">
                <tr className="text-[color:var(--cl-soft)]">
                  <th className="text-right py-2 px-3 font-semibold">صف</th>
                  <th className="text-right py-2 px-3 font-semibold">التاريخ</th>
                  <th className="text-right py-2 px-3 font-semibold">بند العمل</th>
                  <th className="text-right py-2 px-3 font-semibold">النوع</th>
                  <th className="text-right py-2 px-3 font-semibold">الوصف</th>
                  <th className="text-right py-2 px-3 font-semibold">الكمية</th>
                  <th className="text-right py-2 px-3 font-semibold">السعر</th>
                  <th className="text-right py-2 px-3 font-semibold">ملاحظات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--cl-sep)]">
                {parsed.map((r) => (
                  <tr key={r.rowIndex} className={!r.valid ? "bg-[#C1453B]/5" : r.warnings.length ? "bg-[#D6A23C]/5" : ""}>
                    <td className="py-1.5 px-3 mono">{r.rowIndex}</td>
                    <td className="py-1.5 px-3 mono">{r.data.date}</td>
                    <td className="py-1.5 px-3">{pWorkItems.find((w) => w.id === r.data.workItemId)?.name || "—"}</td>
                    <td className="py-1.5 px-3">{r.data.type}</td>
                    <td className="py-1.5 px-3">{r.data.desc || "—"}</td>
                    <td className="py-1.5 px-3 mono">{r.data.qty}</td>
                    <td className="py-1.5 px-3 mono">{r.data.price}</td>
                    <td className="py-1.5 px-3 text-[color:var(--cl-muted)]">
                      {r.errors.map((e, i) => (
                        <div key={"e" + i} className="text-[color:var(--cl-red)]">{e}</div>
                      ))}
                      {r.warnings.map((w, i) => (
                        <div key={"w" + i} className="text-[#D6A23C]">{w}</div>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-lg bg-[color:var(--cl-line)] text-[color:var(--cl-text)] text-sm font-semibold hover:bg-[color:var(--cl-hover)] transition">إلغاء</button>
            <button
              onClick={confirmImport}
              disabled={validRows.length === 0}
              className="px-4 py-2 rounded-lg bg-[#3F7D63] text-white text-sm font-semibold hover:bg-[#356A54] transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              استيراد {validRows.length} تكلفة
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------- بنود التكاليف ------------------------------- */

function CostsTab({ pCosts, pWorkItems, activeProjectId, onAddCost, onAddCostsBulk, onUpdateCost, onDeleteCost }) {
  const [filter, setFilter] = useState("الكل");
  const [open, setOpen] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ type: "مشتريات", workItemId: "", costLevel1: "", costLevel2: "", desc: "", customDesc: "", qty: "1", unit: "", price: "", date: "" });

  const isGeneral = form.type === "مصروفات عمومية";
  const finalDesc = isGeneral ? (form.desc === "أخرى" ? form.customDesc : form.desc) : form.desc;

  const resetForm = () => setForm({ type: "مشتريات", workItemId: "", costLevel1: "", costLevel2: "", desc: "", customDesc: "", qty: "1", unit: "", price: "", date: "" });

  const submit = () => {
    if (!finalDesc || !form.price) return;
    if (editId) {
      onUpdateCost(editId, {
        type: form.type,
        workItemId: form.workItemId || null,
        costLevel1: form.costLevel1.trim(),
        costLevel2: form.costLevel2.trim(),
        desc: finalDesc,
        qty: Number(form.qty) || 1,
        unit: form.unit || "-",
        price: Number(form.price),
        date: form.date || new Date().toISOString().slice(0, 10),
      });
      setEditId(null);
    } else {
      onAddCost({
        id: "c_" + Math.random().toString(36).slice(2, 8),
        projectId: activeProjectId,
        workItemId: form.workItemId || null,
        costLevel1: form.costLevel1.trim(),
        costLevel2: form.costLevel2.trim(),
        type: form.type,
        desc: finalDesc,
        qty: Number(form.qty) || 1,
        unit: form.unit || "-",
        price: Number(form.price),
        date: form.date || new Date().toISOString().slice(0, 10),
      });
    }
    resetForm();
    setOpen(false);
  };

  const startEdit = (c) => {
    setEditId(c.id);
    setForm({ type: c.type, workItemId: c.workItemId || "", costLevel1: c.costLevel1 || "", costLevel2: c.costLevel2 || "", desc: c.desc, customDesc: "", qty: String(c.qty), unit: c.unit, price: String(c.price), date: c.date });
    setOpen(true);
  };

  const cancelForm = () => {
    setEditId(null);
    resetForm();
    setOpen(false);
  };

  const openManualForm = () => {
    setShowImport(false);
    setOpen((o) => !o);
  };

  const openImportPanel = () => {
    setOpen(false);
    setEditId(null);
    setShowImport((o) => !o);
  };

  const filtered = filter === "الكل" ? pCosts : pCosts.filter((c) => c.type === filter);

  // تجميع التكاليف على مستويين: بند العمل ← تفاصيل بند التكلفة (الوصف)
  const pivot = useMemo(() => {
    const wiOrder = pWorkItems.map((w) => w.id);
    const byWorkItem = new Map();

    filtered.forEach((c) => {
      const wiKey = c.workItemId || "__unassigned__";
      if (!byWorkItem.has(wiKey)) byWorkItem.set(wiKey, new Map());
      const descKey = (c.desc || "بدون وصف").trim();
      const subMap = byWorkItem.get(wiKey);
      if (!subMap.has(descKey)) subMap.set(descKey, []);
      subMap.get(descKey).push(c);
    });

    const wiKeys = [...byWorkItem.keys()].sort((a, b) => {
      if (a === "__unassigned__") return 1;
      if (b === "__unassigned__") return -1;
      return wiOrder.indexOf(a) - wiOrder.indexOf(b);
    });

    return wiKeys.map((wiKey) => {
      const wi = pWorkItems.find((w) => w.id === wiKey);
      const subMap = byWorkItem.get(wiKey);

      const subItems = [...subMap.entries()]
        .map(([desc, entries]) => {
          const sortedEntries = [...entries].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
          const totalValue = entries.reduce((s, e) => s + e.qty * e.price, 0);
          const totalQty = entries.reduce((s, e) => s + e.qty, 0);
          const units = new Set(entries.map((e) => e.unit));
          const types = [...new Set(entries.map((e) => e.type))];
          return {
            desc,
            entries: sortedEntries,
            totalValue,
            totalQty,
            unit: units.size === 1 ? entries[0].unit : null,
            types,
          };
        })
        .sort((a, b) => b.totalValue - a.totalValue);

      const groupTotal = subItems.reduce((s, it) => s + it.totalValue, 0);

      return {
        key: wiKey,
        name: wi ? wi.name : "تكاليف غير مرتبطة ببند",
        unassigned: wiKey === "__unassigned__",
        subItems,
        groupTotal,
      };
    });
  }, [filtered, pWorkItems]);

  const grandTotal = pivot.reduce((s, g) => s + g.groupTotal, 0);

  const [collapsedGroups, setCollapsedGroups] = useState({});
  const [expandedItems, setExpandedItems] = useState({});

  const toggleGroup = (key) => setCollapsedGroups((p) => ({ ...p, [key]: !p[key] }));
  const toggleItem = (key) => setExpandedItems((p) => ({ ...p, [key]: !p[key] }));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-[color:var(--cl-text)] text-lg">التكاليف</h2>
        <div className="flex gap-2">
          <button onClick={openImportPanel} className="px-3 py-2 rounded-lg bg-[color:var(--cl-card)] border border-[color:var(--cl-line)] text-[color:var(--cl-text)] text-sm font-semibold flex items-center gap-1.5 hover:border-white/40 transition">
            <Upload size={15} /> استيراد من إكسيل
          </button>
          <button onClick={openManualForm} className="px-3 py-2 rounded-lg bg-[color:var(--cl-ink)] text-white text-sm font-semibold flex items-center gap-1.5 hover:bg-[color:var(--cl-ink-hover)] transition">
            <Plus size={15} /> تسجيل تكلفة
          </button>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {["الكل", ...COST_TYPES.map((t) => t.key)].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
              filter === f ? "bg-[color:var(--cl-ink)] text-white border-[color:var(--cl-text)]" : "bg-[color:var(--cl-card)] text-[color:var(--cl-soft)] border-[color:var(--cl-line)] hover:border-white/40"
            }`}
          >
            {f === "الكل" ? "الكل" : COST_TYPES.find((t) => t.key === f).label}
          </button>
        ))}
      </div>

      {showImport && (
        <CostExcelImportPanel
          pWorkItems={pWorkItems}
          activeProjectId={activeProjectId}
          onImport={(list) => { onAddCostsBulk(list); setShowImport(false); }}
          onClose={() => setShowImport(false)}
        />
      )}

      {open && (
        <div className="bg-[color:var(--cl-card)] rounded-xl border border-[color:var(--cl-line)] p-4 grid grid-cols-3 gap-3">
          {editId && (
            <div className="col-span-3 text-xs font-semibold text-[color:var(--cl-accent)] bg-[color:rgb(var(--cl-accent-rgb)/0.1)] rounded-md px-3 py-1.5">جاري تعديل تكلفة موجودة</div>
          )}
          <SelectField label="نوع التكلفة" value={form.type} onChange={(v) => setForm((f) => ({ ...f, type: v }))} options={COST_TYPES.map((t) => ({ value: t.key, label: t.label }))} />
          <SelectField
            label="بند العمل (اختياري)"
            value={form.workItemId}
            onChange={(v) => setForm((f) => ({ ...f, workItemId: v }))}
            options={[{ value: "", label: "— غير مرتبط ببند —" }, ...pWorkItems.map((w) => ({ value: w.id, label: w.name }))]}
          />
          <Field label="المستوى الأول للتكلفة" value={form.costLevel1} onChange={(v) => setForm((f) => ({ ...f, costLevel1: v }))} placeholder="مثال: كهرباء" />
          <Field label="المستوى الثاني للتكلفة" value={form.costLevel2} onChange={(v) => setForm((f) => ({ ...f, costLevel2: v }))} placeholder="مثال: كابلات" />
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
          <div className="col-span-3 flex justify-end gap-2">
            {editId && <button onClick={cancelForm} className="px-4 py-2 rounded-lg bg-[color:var(--cl-line)] text-[color:var(--cl-text)] text-sm font-semibold hover:bg-[color:var(--cl-hover)] transition">إلغاء</button>}
            <button onClick={submit} className="px-4 py-2 rounded-lg bg-[color:var(--cl-accent-bg)] text-[color:var(--cl-on-accent)] text-sm font-semibold hover:bg-[color:var(--cl-accent-hover)] transition">{editId ? "حفظ التعديل" : "حفظ التكلفة"}</button>
          </div>
        </div>
      )}

      <div className="bg-[color:var(--cl-card)] rounded-xl border border-[color:var(--cl-line)] overflow-hidden">
        {pivot.length === 0 && (
          <div className="text-center py-10 text-[color:var(--cl-muted)] text-sm">لا توجد تكاليف في هذا التصنيف.</div>
        )}

        {pivot.map((g) => {
          const isCollapsed = collapsedGroups[g.key];
          return (
            <div key={g.key} className="border-b border-[color:var(--cl-sep)] last:border-b-0">
              <button
                onClick={() => toggleGroup(g.key)}
                className="w-full flex items-center justify-between px-4 py-3 bg-[color:var(--cl-inset)] hover:bg-[color:var(--cl-line)] transition text-right"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <ChevronDown size={15} className={`text-[color:var(--cl-soft)] shrink-0 transition-transform ${isCollapsed ? "-rotate-90" : ""}`} />
                  <span className={`font-bold truncate ${g.unassigned ? "text-[color:var(--cl-muted)]" : "text-[color:var(--cl-text)]"}`}>{g.name}</span>
                  <span className="text-[11px] text-[color:var(--cl-muted)] mono shrink-0">({g.subItems.length} بند فرعي)</span>
                </div>
                <span className="font-bold mono text-[color:var(--cl-text)] shrink-0">{money(g.groupTotal)}</span>
              </button>

              {!isCollapsed && (
                <div>
                  {g.subItems.map((it) => {
                    const itemKey = g.key + "::" + it.desc;
                    const itemOpen = expandedItems[itemKey];
                    return (
                      <div key={itemKey} className="border-t border-[color:var(--cl-sep)]">
                        <button
                          onClick={() => toggleItem(itemKey)}
                          className="w-full flex items-center justify-between px-4 py-2.5 pr-9 hover:bg-[color:var(--cl-sub)] transition text-right"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <ChevronRight size={13} className={`text-[color:var(--cl-muted)] shrink-0 transition-transform ${itemOpen ? "rotate-90" : ""}`} />
                            <span className="text-sm font-semibold text-[color:var(--cl-text)] truncate">{it.desc}</span>
                            <div className="flex gap-1 shrink-0">
                              {it.types.map((t) => {
                                const meta = COST_TYPES.find((ct) => ct.key === t);
                                return (
                                  <span key={t} className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ backgroundColor: meta?.color + "18", color: meta?.color }}>
                                    {meta?.label}
                                  </span>
                                );
                              })}
                            </div>
                            <span className="text-[11px] text-[color:var(--cl-muted)] mono shrink-0">{it.entries.length} حركة</span>
                          </div>
                          <div className="flex items-center gap-4 shrink-0">
                            {it.unit && <span className="text-[11px] text-[color:var(--cl-muted)] mono">{fmt(it.totalQty)} {it.unit}</span>}
                            <span className="text-sm font-bold mono">{money(it.totalValue)}</span>
                          </div>
                        </button>

                        {itemOpen && (
                          <div className="bg-[color:var(--cl-sub)] px-4 pr-14 py-2.5 space-y-1.5">
                            {it.entries.map((c) => (
                              <div key={c.id} className="flex items-center justify-between bg-[color:var(--cl-card)] rounded-lg px-3 py-2 border border-[color:var(--cl-line)] text-sm group">
                                <div className="flex items-center gap-3 min-w-0 text-[color:var(--cl-soft)]">
                                  <span className="mono text-xs text-[color:var(--cl-muted)] shrink-0">{c.date}</span>
                                  <span className="shrink-0 mono">{fmt(c.qty)} {c.unit} × {fmt(c.price)}</span>
                                  {(c.costLevel1 || c.costLevel2) && (
                                    <span className="text-[11px] text-[color:var(--cl-muted)] truncate">
                                      {c.costLevel1}{c.costLevel2 ? ` · ${c.costLevel2}` : ""}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="font-bold mono">{money(c.qty * c.price)}</span>
                                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                                    <button onClick={() => startEdit(c)} title="تعديل" className="p-1 rounded-md text-[color:var(--cl-soft)] hover:bg-[color:var(--cl-line)] hover:text-[color:var(--cl-text)] transition"><Pencil size={13} /></button>
                                    <button onClick={() => onDeleteCost(c.id)} title="حذف" className="p-1 rounded-md text-[color:var(--cl-red)] hover:bg-[#C1453B]/10 transition"><Trash2 size={13} /></button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {pivot.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 bg-[color:var(--cl-ink)] text-white">
            <span className="font-bold text-sm">الإجمالي</span>
            <span className="font-bold mono">{money(grandTotal)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/* -------------------------------- extracts -------------------------------- */

function ExtractsTab({ pExtracts, collections, onAddExtract, onAddCollection, onUpdateExtract, onDeleteExtract, onDeleteCollection, activeProjectId, projectBudget, projectName, projectClient }) {
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ number: "", date: "", percentage: "", amount: "" });
  const [expanded, setExpanded] = useState(null);
  const [collForm, setCollForm] = useState({ amount: "", date: "", method: "تحويل بنكي" });
  const [showGeneralForm, setShowGeneralForm] = useState(false);
  const [generalForm, setGeneralForm] = useState({ amount: "", date: "", method: "تحويل بنكي", note: "" });

  const resetForm = () => setForm({ number: "", date: "", percentage: "", amount: "" });

  const submit = () => {
    if (!form.number || !form.amount) return;
    if (editId) {
      onUpdateExtract(editId, { number: Number(form.number), date: form.date || new Date().toISOString().slice(0, 10), percentage: Number(form.percentage) || 0, amount: Number(form.amount) });
      setEditId(null);
    } else {
      onAddExtract({ id: "e_" + Math.random().toString(36).slice(2, 8), projectId: activeProjectId, number: Number(form.number), date: form.date || new Date().toISOString().slice(0, 10), percentage: Number(form.percentage) || 0, amount: Number(form.amount) });
    }
    resetForm();
    setOpen(false);
  };

  const startEdit = (e) => {
    setEditId(e.id);
    setForm({ number: String(e.number), date: e.date, percentage: String(e.percentage), amount: String(e.amount) });
    setOpen(true);
  };

  const cancelForm = () => {
    setEditId(null);
    resetForm();
    setOpen(false);
  };

  const addCollectionForExtract = (extractId) => {
    if (!collForm.amount) return;
    onAddCollection({ id: "cl_" + Math.random().toString(36).slice(2, 8), projectId: activeProjectId, extractId, amount: Number(collForm.amount), date: collForm.date || new Date().toISOString().slice(0, 10), method: collForm.method });
    setCollForm({ amount: "", date: "", method: "تحويل بنكي" });
  };

  const generalCollections = collections.filter((c) => !c.extractId);
  const generalTotal = generalCollections.reduce((s, c) => s + c.amount, 0);

  const submitGeneralCollection = () => {
    if (!generalForm.amount) return;
    onAddCollection({
      id: "cl_" + Math.random().toString(36).slice(2, 8),
      projectId: activeProjectId,
      extractId: null,
      amount: Number(generalForm.amount),
      date: generalForm.date || new Date().toISOString().slice(0, 10),
      method: generalForm.method,
      note: generalForm.note,
    });
    setGeneralForm({ amount: "", date: "", method: "تحويل بنكي", note: "" });
    setShowGeneralForm(false);
  };

  const printExtract = (extract) => {
    const eColls = collections.filter((c) => c.extractId === extract.id);
    const collected = eColls.reduce((s, c) => s + c.amount, 0);
    const outstanding = extract.amount - collected;

    const rowsHtml = eColls.length
      ? eColls.map((c) => `
          <tr>
            <td>${c.date || "-"}</td>
            <td>${c.method || "-"}</td>
            <td class="num">${money(c.amount)}</td>
          </tr>`).join("")
      : `<tr><td colspan="3" class="empty">لم يتم تحصيل أي مبلغ بعد</td></tr>`;

    const html = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8" />
<title>مستخلص رقم ${extract.number}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap');
  * { box-sizing: border-box; }
  body { font-family: 'IBM Plex Sans Arabic', 'Cairo', sans-serif; color: #1E2530; margin: 0; padding: 32px; direction: rtl; }
  .mono { font-family: 'IBM Plex Mono', monospace; }
  .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #E8672C; padding-bottom: 16px; margin-bottom: 24px; }
  .brand { display: flex; align-items: center; gap: 10px; }
  .brand-badge { width: 40px; height: 40px; border-radius: 10px; background: #E8672C; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 18px; }
  .brand-name { font-weight: 800; font-size: 20px; }
  .doc-title { text-align: left; }
  .doc-title h1 { margin: 0; font-size: 20px; }
  .doc-title .num { color: #E8672C; font-weight: 800; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 24px; background: #F6F3EA; border-radius: 10px; padding: 16px 20px; margin-bottom: 22px; font-size: 13px; }
  .meta div span.label { color: #6B7280; display: block; font-size: 11px; margin-bottom: 2px; }
  .meta div span.value { font-weight: 700; }
  .stats { display: flex; gap: 12px; margin-bottom: 24px; }
  .stat { flex: 1; border: 1px solid #E1DACB; border-radius: 10px; padding: 12px 14px; }
  .stat .label { font-size: 11px; color: #6B7280; margin-bottom: 4px; }
  .stat .value { font-weight: 800; font-size: 16px; }
  .green { color: #3F7D63; } .amber { color: #D6A23C; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 24px; }
  th { background: #1E2530; color: #fff; text-align: right; padding: 10px 12px; font-size: 12px; }
  td { padding: 10px 12px; border-bottom: 1px solid #EFEBDF; }
  td.num { font-weight: 700; }
  td.empty { text-align: center; color: #9A9483; padding: 20px; }
  .footer { display: flex; justify-content: space-between; font-size: 11px; color: #9A9483; border-top: 1px solid #E1DACB; padding-top: 12px; margin-top: 40px; }
  @media print { body { padding: 14mm; } @page { size: A4; margin: 0; } }
</style>
</head>
<body>
  <div class="header">
    <div class="brand">
      <div class="brand-badge" style="background:none;padding:0;width:42px;height:42px;display:block">${COSTLINE_MARK_SVG}</div>
      <div class="brand-name">Cost<span style="color:#E8672C">Line</span></div>
    </div>
    <div class="doc-title">
      <h1>مستخلص رقم <span class="num">${extract.number}</span></h1>
    </div>
  </div>

  <div class="meta">
    <div><span class="label">المشروع</span><span class="value">${projectName || "-"}</span></div>
    <div><span class="label">العميل</span><span class="value">${projectClient || "-"}</span></div>
    <div><span class="label">تاريخ المستخلص</span><span class="value">${extract.date || "-"}</span></div>
    <div><span class="label">نسبة الإنجاز</span><span class="value">${extract.percentage}%</span></div>
  </div>

  <div class="stats">
    <div class="stat"><div class="label">قيمة المستخلص</div><div class="value mono">${money(extract.amount)}</div></div>
    <div class="stat"><div class="label">المُحصَّل</div><div class="value mono green">${money(collected)}</div></div>
    <div class="stat"><div class="label">المتبقي</div><div class="value mono ${outstanding > 0 ? "amber" : "green"}">${money(outstanding)}</div></div>
  </div>

  <table>
    <thead><tr><th>التاريخ</th><th>طريقة التحصيل</th><th>المبلغ</th></tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>

  <div class="footer">
    <span>CostLine — نظام إدارة المقاولات</span>
    <span>تم إصدار هذا المستند بتاريخ ${new Date().toLocaleDateString("en-GB")}</span>
  </div>
</body>
</html>`;

    const printWin = window.open("", "_blank", "width=900,height=1000");
    if (!printWin) { alert("المتصفح منع فتح نافذة الطباعة. اسمح بالنوافذ المنبثقة لهذا الموقع وحاول تاني."); return; }
    printWin.document.open();
    printWin.document.write(html);
    printWin.document.close();
    printWin.onload = () => {
      printWin.focus();
      printWin.print();
    };
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-[color:var(--cl-text)] text-lg">التحصيلات والمستخلصات</h2>
        <button onClick={() => (open ? cancelForm() : setOpen(true))} className="px-3 py-2 rounded-lg bg-[color:var(--cl-ink)] text-white text-sm font-semibold flex items-center gap-1.5 hover:bg-[color:var(--cl-ink-hover)] transition">
          <Plus size={15} /> مستخلص جديد
        </button>
      </div>

      <div className="bg-[color:var(--cl-card)] rounded-xl border border-[color:var(--cl-line)] overflow-hidden">
        <div className="w-full flex items-center justify-between px-5 py-4">
          <div>
            <div className="font-bold text-[color:var(--cl-text)]">تحصيلات عامة (بدون مستخلص)</div>
            <div className="text-[11px] text-[color:var(--cl-muted)] mt-0.5">مبالغ استُلمت من العميل قبل عمل مستخلص (دفعة مقدمة، دفعة تحت الحساب... إلخ)</div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-[11px] text-[color:var(--cl-muted)]">الإجمالي</div>
              <div className="font-bold mono text-[color:var(--cl-green)]">{money(generalTotal)}</div>
            </div>
            <button onClick={() => setShowGeneralForm((o) => !o)} className="px-3 py-2 rounded-lg bg-[#3F7D63] text-white text-xs font-semibold hover:bg-[#356A54] transition flex items-center gap-1.5">
              <Plus size={14} /> تحصيل جديد
            </button>
          </div>
        </div>

        {showGeneralForm && (
          <div className="border-t border-[color:var(--cl-sep)] px-5 py-4 bg-[color:var(--cl-sub)] grid grid-cols-4 gap-2 items-end">
            <Field label="المبلغ" value={generalForm.amount} onChange={(v) => setGeneralForm((f) => ({ ...f, amount: v }))} type="number" small />
            <Field label="التاريخ" value={generalForm.date} onChange={(v) => setGeneralForm((f) => ({ ...f, date: v }))} type="date" small />
            <SelectField label="طريقة التحصيل" value={generalForm.method} onChange={(v) => setGeneralForm((f) => ({ ...f, method: v }))} options={[{ value: "تحويل بنكي", label: "تحويل بنكي" }, { value: "شيك", label: "شيك" }, { value: "نقدي", label: "نقدي" }]} small />
            <Field label="ملاحظة (اختياري)" value={generalForm.note} onChange={(v) => setGeneralForm((f) => ({ ...f, note: v }))} placeholder="مثال: دفعة مقدمة" small />
            <div className="col-span-4 flex justify-end">
              <button onClick={submitGeneralCollection} className="px-4 py-2 rounded-lg bg-[#3F7D63] text-white text-sm font-semibold hover:bg-[#356A54] transition">حفظ التحصيل</button>
            </div>
          </div>
        )}

        <div className="border-t border-[color:var(--cl-sep)] px-5 py-4 space-y-1.5">
          {generalCollections.length === 0 && <div className="text-xs text-[color:var(--cl-muted)] py-1">لا توجد تحصيلات عامة مسجّلة بعد.</div>}
          {generalCollections.map((c) => (
            <div key={c.id} className="flex items-center justify-between bg-[color:var(--cl-sub)] rounded-lg px-3 py-2 border border-[color:var(--cl-line)] text-sm group/coll">
              <span className="text-[color:var(--cl-soft)]">{c.method} · {c.date}{c.note ? ` · ${c.note}` : ""}</span>
              <div className="flex items-center gap-2">
                <span className="font-bold mono text-[color:var(--cl-green)]">{money(c.amount)}</span>
                <button onClick={() => onDeleteCollection(c.id)} title="حذف التحصيل" className="p-1 rounded-md text-[color:var(--cl-red)] opacity-0 group-hover/coll:opacity-100 hover:bg-[#C1453B]/10 transition"><Trash2 size={13} /></button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {open && (
        <div className="bg-[color:var(--cl-card)] rounded-xl border border-[color:var(--cl-line)] p-4 grid grid-cols-4 gap-3">
          {editId && (
            <div className="col-span-4 text-xs font-semibold text-[color:var(--cl-accent)] bg-[color:rgb(var(--cl-accent-rgb)/0.1)] rounded-md px-3 py-1.5">جاري تعديل مستخلص موجود</div>
          )}
          <Field label="رقم المستخلص" value={form.number} onChange={(v) => setForm((f) => ({ ...f, number: v }))} type="number" />
          <Field label="التاريخ" value={form.date} onChange={(v) => setForm((f) => ({ ...f, date: v }))} type="date" />
          <Field label="نسبة الإنجاز %" value={form.percentage} onChange={(v) => setForm((f) => ({ ...f, percentage: v }))} type="number" />
          <Field label="قيمة المستخلص" value={form.amount} onChange={(v) => setForm((f) => ({ ...f, amount: v }))} type="number" />
          <div className="col-span-4 flex justify-end gap-2">
            {editId && <button onClick={cancelForm} className="px-4 py-2 rounded-lg bg-[color:var(--cl-line)] text-[color:var(--cl-text)] text-sm font-semibold hover:bg-[color:var(--cl-hover)] transition">إلغاء</button>}
            <button onClick={submit} className="px-4 py-2 rounded-lg bg-[color:var(--cl-accent-bg)] text-[color:var(--cl-on-accent)] text-sm font-semibold hover:bg-[color:var(--cl-accent-hover)] transition">{editId ? "حفظ التعديل" : "حفظ المستخلص"}</button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {pExtracts.length === 0 && (
          <div className="bg-[color:var(--cl-card)] rounded-xl border border-[color:var(--cl-line)] p-8 text-center text-[color:var(--cl-muted)] text-sm">لا توجد مستخلصات مسجّلة بعد.</div>
        )}
        {[...pExtracts].sort((a, b) => a.number - b.number).map((e) => {
          const eColls = collections.filter((c) => c.extractId === e.id);
          const collected = eColls.reduce((s, c) => s + c.amount, 0);
          const outstanding = e.amount - collected;
          const isOpen = expanded === e.id;
          return (
            <div key={e.id} className="bg-[color:var(--cl-card)] rounded-xl border border-[color:var(--cl-line)] overflow-hidden group">
              <div className="w-full flex items-center justify-between px-5 py-4 hover:bg-[color:var(--cl-sub)] transition">
                <button onClick={() => setExpanded(isOpen ? null : e.id)} className="flex items-center gap-4 flex-1 text-right">
                  <div className="w-10 h-10 rounded-lg bg-[color:rgb(var(--cl-accent-rgb)/0.1)] flex items-center justify-center text-[color:var(--cl-accent)] font-extrabold mono text-sm">#{e.number}</div>
                  <div className="text-right">
                    <div className="font-bold text-[color:var(--cl-text)]">مستخلص رقم {e.number}</div>
                    <div className="text-[11px] text-[color:var(--cl-muted)] mono">{e.date} · نسبة إنجاز {e.percentage}%</div>
                  </div>
                </button>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <div className="text-[11px] text-[color:var(--cl-muted)]">قيمة المستخلص</div>
                    <div className="font-bold mono">{money(e.amount)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] text-[color:var(--cl-muted)]">المحصَّل</div>
                    <div className="font-bold mono text-[color:var(--cl-green)]">{money(collected)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] text-[color:var(--cl-muted)]">المتبقي</div>
                    <div className={`font-bold mono ${outstanding > 0 ? "text-[#D6A23C]" : "text-[color:var(--cl-green)]"}`}>{money(outstanding)}</div>
                  </div>
                  {outstanding <= 0 ? (
                    <CheckCircle2 size={18} className="text-[color:var(--cl-green)]" />
                  ) : (
                    <Clock size={18} className="text-[#D6A23C]" />
                  )}
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                    <button onClick={() => printExtract(e)} title="طباعة" className="p-1.5 rounded-md text-[color:var(--cl-soft)] hover:bg-[color:var(--cl-line)] hover:text-[color:var(--cl-text)] transition"><Printer size={14} /></button>
                    <button onClick={() => startEdit(e)} title="تعديل" className="p-1.5 rounded-md text-[color:var(--cl-soft)] hover:bg-[color:var(--cl-line)] hover:text-[color:var(--cl-text)] transition"><Pencil size={14} /></button>
                    <button onClick={() => onDeleteExtract(e.id)} title="حذف" className="p-1.5 rounded-md text-[color:var(--cl-red)] hover:bg-[#C1453B]/10 transition"><Trash2 size={14} /></button>
                  </div>
                  <button onClick={() => setExpanded(isOpen ? null : e.id)}>
                    <ChevronDown size={16} className={`text-[color:var(--cl-muted)] transition-transform ${isOpen ? "rotate-180" : ""}`} />
                  </button>
                </div>
              </div>

              {isOpen && (
                <div className="border-t border-[color:var(--cl-sep)] px-5 py-4 bg-[color:var(--cl-sub)]">
                  <div className="text-xs font-semibold text-[color:var(--cl-soft)] mb-2">التحصيلات</div>
                  <div className="space-y-1.5 mb-4">
                    {eColls.map((c) => (
                      <div key={c.id} className="flex items-center justify-between bg-[color:var(--cl-card)] rounded-lg px-3 py-2 border border-[color:var(--cl-line)] text-sm group/coll">
                        <span className="text-[color:var(--cl-soft)]">{c.method} · {c.date}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-bold mono text-[color:var(--cl-green)]">{money(c.amount)}</span>
                          <button onClick={() => onDeleteCollection(c.id)} title="حذف التحصيل" className="p-1 rounded-md text-[color:var(--cl-red)] opacity-0 group-hover/coll:opacity-100 hover:bg-[#C1453B]/10 transition"><Trash2 size={13} /></button>
                        </div>
                      </div>
                    ))}
                    {eColls.length === 0 && <div className="text-xs text-[color:var(--cl-muted)] py-1">لم يتم تحصيل أي مبلغ بعد.</div>}
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
      <h2 className="font-bold text-[color:var(--cl-text)] text-lg">تحليل المقايسة — مقارنة الفعلي بالميزانية</h2>

      <div className="bg-[color:var(--cl-card)] rounded-xl border border-[color:var(--cl-line)] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[color:var(--cl-inset)] text-[color:var(--cl-soft)] text-[12px]">
              <th className="text-right py-3 px-4 font-semibold">بند العمل</th>
              <th className="text-right py-3 px-4 font-semibold">الميزانية</th>
              <th className="text-right py-3 px-4 font-semibold">الفعلي</th>
              <th className="text-right py-3 px-4 font-semibold">الانحراف</th>
              <th className="text-right py-3 px-4 font-semibold w-56">نسبة الصرف</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:var(--cl-sep)]">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-[color:var(--cl-sub)] transition">
                <td className="py-3 px-4 font-semibold text-[color:var(--cl-text)]">{r.name}</td>
                <td className="py-3 px-4 mono">{money(r.budget)}</td>
                <td className="py-3 px-4 mono">{money(r.actual)}</td>
                <td className={`py-3 px-4 mono font-bold ${r.variance >= 0 ? "text-[color:var(--cl-green)]" : "text-[color:var(--cl-red)]"}`}>
                  {r.variance >= 0 ? "+" : ""}{money(r.variance)}
                </td>
                <td className="py-3 px-4">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 rounded-full bg-[color:var(--cl-sep)] overflow-hidden">
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
              <tr className="bg-[color:var(--cl-sub)]">
                <td className="py-3 px-4 font-semibold text-[color:var(--cl-muted)]">تكاليف غير مرتبطة ببند (مصروفات عامة)</td>
                <td className="py-3 px-4 mono text-[color:var(--cl-muted)]">—</td>
                <td className="py-3 px-4 mono">{money(unassigned)}</td>
                <td className="py-3 px-4 mono">—</td>
                <td className="py-3 px-4 text-[color:var(--cl-muted)] text-xs">غير محسوب ضمن بند</td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="bg-[color:var(--cl-ink)] text-white">
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

/* -------------------------------- treasury tab ------------------------------- */

function TreasuryTab({ pTreasuryEntries, openingBalance, activeProjectId, onAddEntry, onUpdateEntry, onDeleteEntry, onUpdateOpeningBalance }) {
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ date: "", type: "ايداع", amount: "", note: "" });
  const [editingOpening, setEditingOpening] = useState(false);
  const [openingInput, setOpeningInput] = useState(String(openingBalance || 0));
  const [expandedDate, setExpandedDate] = useState(null);

  const resetForm = () => setForm({ date: "", type: "ايداع", amount: "", note: "" });

  const submit = () => {
    if (!form.date || !form.amount) return;
    if (editId) {
      onUpdateEntry(editId, { date: form.date, type: form.type, amount: Number(form.amount), note: form.note });
      setEditId(null);
    } else {
      onAddEntry({ id: "t_" + Math.random().toString(36).slice(2, 8), projectId: activeProjectId, date: form.date, type: form.type, amount: Number(form.amount), note: form.note });
    }
    resetForm();
    setOpen(false);
  };

  const startEdit = (t) => {
    setEditId(t.id);
    setForm({ date: t.date, type: t.type, amount: String(t.amount), note: t.note || "" });
    setOpen(true);
  };

  const cancelForm = () => {
    setEditId(null);
    resetForm();
    setOpen(false);
  };

  const saveOpening = () => {
    onUpdateOpeningBalance(Number(openingInput) || 0);
    setEditingOpening(false);
  };

  // تجميع الحركات حسب التاريخ وحساب رصيد أول وآخر اليوم تراكميًا
  const sorted = [...pTreasuryEntries].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const dateGroups = [];
  const byDate = {};
  sorted.forEach((t) => {
    if (!byDate[t.date]) {
      byDate[t.date] = { date: t.date, entries: [], deposits: 0, withdrawals: 0 };
      dateGroups.push(byDate[t.date]);
    }
    byDate[t.date].entries.push(t);
    if (t.type === "ايداع") byDate[t.date].deposits += t.amount;
    else byDate[t.date].withdrawals += t.amount;
  });

  let running = openingBalance || 0;
  const rows = dateGroups.map((g) => {
    const dayOpening = running;
    const dayClose = dayOpening + g.deposits - g.withdrawals;
    running = dayClose;
    return { ...g, dayOpening, dayClose };
  });

  const currentBalance = running;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-[color:var(--cl-text)] text-lg">خزينة المشروع</h2>
        <button onClick={() => (open ? cancelForm() : setOpen(true))} className="px-3 py-2 rounded-lg bg-[color:var(--cl-ink)] text-white text-sm font-semibold flex items-center gap-1.5 hover:bg-[color:var(--cl-ink-hover)] transition">
          <Plus size={15} /> حركة جديدة
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[color:var(--cl-card)] rounded-xl border border-[color:var(--cl-line)] p-4">
          <div className="text-[11px] text-[color:var(--cl-muted)] mb-1">رصيد بداية الخزينة (يدوي)</div>
          {editingOpening ? (
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={openingInput}
                onChange={(e) => setOpeningInput(e.target.value)}
                className="border border-[color:var(--cl-line)] rounded-md px-2 py-1.5 text-sm outline-none focus:border-[color:var(--cl-accent-bg)] w-40 mono"
              />
              <button onClick={saveOpening} className="px-3 py-1.5 rounded-md bg-[#3F7D63] text-white text-xs font-semibold hover:bg-[#356A54] transition">حفظ</button>
              <button onClick={() => { setEditingOpening(false); setOpeningInput(String(openingBalance || 0)); }} className="px-3 py-1.5 rounded-md bg-[color:var(--cl-line)] text-[color:var(--cl-text)] text-xs font-semibold hover:bg-[color:var(--cl-hover)] transition">إلغاء</button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div className="font-bold mono text-lg text-[color:var(--cl-text)]">{money(openingBalance)}</div>
              <button onClick={() => setEditingOpening(true)} className="p-1 rounded-md text-[color:var(--cl-soft)] hover:bg-[color:var(--cl-line)] hover:text-[color:var(--cl-text)] transition"><Pencil size={13} /></button>
            </div>
          )}
        </div>
        <div className="bg-[color:var(--cl-ink)] rounded-xl p-4 text-white">
          <div className="text-[11px] text-white/50 mb-1">رصيد الخزينة الحالي</div>
          <div className={`font-bold mono text-lg ${currentBalance < 0 ? "text-[#F0918A]" : "text-white"}`}>{money(currentBalance)}</div>
        </div>
      </div>

      {open && (
        <div className="bg-[color:var(--cl-card)] rounded-xl border border-[color:var(--cl-line)] p-4 grid grid-cols-4 gap-3">
          {editId && (
            <div className="col-span-4 text-xs font-semibold text-[color:var(--cl-accent)] bg-[color:rgb(var(--cl-accent-rgb)/0.1)] rounded-md px-3 py-1.5">جاري تعديل حركة موجودة</div>
          )}
          <Field label="التاريخ" value={form.date} onChange={(v) => setForm((f) => ({ ...f, date: v }))} type="date" />
          <SelectField label="نوع الحركة" value={form.type} onChange={(v) => setForm((f) => ({ ...f, type: v }))} options={[{ value: "ايداع", label: "إيداع" }, { value: "صرف", label: "صرف" }]} />
          <Field label="المبلغ" value={form.amount} onChange={(v) => setForm((f) => ({ ...f, amount: v }))} type="number" />
          <Field label="ملاحظة (اختياري)" value={form.note} onChange={(v) => setForm((f) => ({ ...f, note: v }))} placeholder="مثال: تحويل من الحساب الرئيسي" />
          <div className="col-span-4 flex justify-end gap-2">
            {editId && <button onClick={cancelForm} className="px-4 py-2 rounded-lg bg-[color:var(--cl-line)] text-[color:var(--cl-text)] text-sm font-semibold hover:bg-[color:var(--cl-hover)] transition">إلغاء</button>}
            <button onClick={submit} className="px-4 py-2 rounded-lg bg-[color:var(--cl-accent-bg)] text-[color:var(--cl-on-accent)] text-sm font-semibold hover:bg-[color:var(--cl-accent-hover)] transition">{editId ? "حفظ التعديل" : "حفظ الحركة"}</button>
          </div>
        </div>
      )}

      <div className="bg-[color:var(--cl-card)] rounded-xl border border-[color:var(--cl-line)] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[color:var(--cl-inset)] text-[color:var(--cl-soft)] text-[12px]">
              <th className="text-right py-3 px-4 font-semibold">التاريخ</th>
              <th className="text-right py-3 px-4 font-semibold">رصيد أول اليوم</th>
              <th className="text-right py-3 px-4 font-semibold">إجمالي الإيداع</th>
              <th className="text-right py-3 px-4 font-semibold">إجمالي الصرف</th>
              <th className="text-right py-3 px-4 font-semibold">رصيد آخر اليوم</th>
              <th className="text-right py-3 px-4 font-semibold w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:var(--cl-sep)]">
            {[...rows].reverse().map((r) => {
              const isOpen = expandedDate === r.date;
              return (
                <React.Fragment key={r.date}>
                  <tr className="hover:bg-[color:var(--cl-sub)] transition cursor-pointer" onClick={() => setExpandedDate(isOpen ? null : r.date)}>
                    <td className="py-3 px-4 font-semibold text-[color:var(--cl-text)] mono">{r.date}</td>
                    <td className="py-3 px-4 mono">{money(r.dayOpening)}</td>
                    <td className="py-3 px-4 mono text-[color:var(--cl-green)] font-bold">{r.deposits > 0 ? "+" + money(r.deposits) : "—"}</td>
                    <td className="py-3 px-4 mono text-[color:var(--cl-red)] font-bold">{r.withdrawals > 0 ? "-" + money(r.withdrawals) : "—"}</td>
                    <td className="py-3 px-4 mono font-bold">{money(r.dayClose)}</td>
                    <td className="py-3 px-4">
                      <ChevronDown size={15} className={`text-[color:var(--cl-muted)] transition-transform ${isOpen ? "rotate-180" : ""}`} />
                    </td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={6} className="bg-[color:var(--cl-sub)] px-4 py-3">
                        <div className="space-y-1.5">
                          {r.entries.map((t) => (
                            <div key={t.id} className="flex items-center justify-between bg-[color:var(--cl-card)] rounded-lg px-3 py-2 border border-[color:var(--cl-line)] text-sm group">
                              <div className="flex items-center gap-2">
                                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${t.type === "ايداع" ? "bg-[#3F7D63]/10 text-[color:var(--cl-green)]" : "bg-[#C1453B]/10 text-[color:var(--cl-red)]"}`}>{t.type === "ايداع" ? "إيداع" : "صرف"}</span>
                                <span className="text-[color:var(--cl-soft)]">{t.note || "—"}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className={`font-bold mono ${t.type === "ايداع" ? "text-[color:var(--cl-green)]" : "text-[color:var(--cl-red)]"}`}>{money(t.amount)}</span>
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                                  <button onClick={(e) => { e.stopPropagation(); startEdit(t); }} title="تعديل" className="p-1 rounded-md text-[color:var(--cl-soft)] hover:bg-[color:var(--cl-line)] hover:text-[color:var(--cl-text)] transition"><Pencil size={13} /></button>
                                  <button onClick={(e) => { e.stopPropagation(); onDeleteEntry(t.id); }} title="حذف" className="p-1 rounded-md text-[color:var(--cl-red)] hover:bg-[#C1453B]/10 transition"><Trash2 size={13} /></button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="text-center py-8 text-[color:var(--cl-muted)]">لا توجد حركات خزينة مسجّلة بعد.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------------------- finance accounts module (مستقل) ---------------------------- */

const FINANCE_TX_TYPES = [
  { key: "تمويل", color: "#6B5CA5" },
  { key: "سلفة", color: "#D6A23C" },
  { key: "سداد", color: "#3F7D63" },
];

function financeBalance(personId, financeTransactions) {
  return financeTransactions
    .filter((t) => t.personId === personId)
    .reduce((s, t) => s + (t.type === "سداد" ? -t.amount : t.amount), 0);
}

function FinanceAccountsModule({ financePersons, financeTransactions, onAddPerson, onDeletePerson, onAddTransaction, onUpdateTransaction, onDeleteTransaction }) {
  const [selectedId, setSelectedId] = useState(null);
  const [showAddPerson, setShowAddPerson] = useState(false);
  const [newPersonName, setNewPersonName] = useState("");
  const [newPersonNote, setNewPersonNote] = useState("");

  const selectedPerson = financePersons.find((p) => p.id === selectedId);

  const addPerson = async () => {
    if (!newPersonName.trim()) return;
    await onAddPerson({ id: "fp_" + Math.random().toString(36).slice(2, 8), name: newPersonName.trim(), note: newPersonNote.trim() });
    setNewPersonName("");
    setNewPersonNote("");
    setShowAddPerson(false);
  };

  if (selectedPerson) {
    return (
      <PersonLedger
        person={selectedPerson}
        transactions={financeTransactions.filter((t) => t.personId === selectedPerson.id)}
        onBack={() => setSelectedId(null)}
        onAddTransaction={onAddTransaction}
        onUpdateTransaction={onUpdateTransaction}
        onDeleteTransaction={onDeleteTransaction}
      />
    );
  }

  const summaries = financePersons.map((p) => {
    const txs = financeTransactions.filter((t) => t.personId === p.id);
    const financingTotal = txs.filter((t) => t.type === "تمويل" || t.type === "سلفة").reduce((s, t) => s + t.amount, 0);
    const repaidTotal = txs.filter((t) => t.type === "سداد").reduce((s, t) => s + t.amount, 0);
    return { ...p, financingTotal, repaidTotal, balance: financingTotal - repaidTotal };
  });

  const grandFinancing = summaries.reduce((s, p) => s + p.financingTotal, 0);
  const grandRepaid = summaries.reduce((s, p) => s + p.repaidTotal, 0);
  const grandBalance = grandFinancing - grandRepaid;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold text-[color:var(--cl-text)] text-xl">التمويلات والسلف</h2>
          <p className="text-[12px] text-[color:var(--cl-muted)] mt-1">حساب مستقل لكل شخص/جهة — غير مرتبط بمشروع معين</p>
        </div>
        <button onClick={() => setShowAddPerson((o) => !o)} className="px-3 py-2 rounded-lg bg-[color:var(--cl-ink)] text-white text-sm font-semibold flex items-center gap-1.5 hover:bg-[color:var(--cl-ink-hover)] transition">
          <Plus size={15} /> إضافة شخص/جهة
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-[color:var(--cl-card)] rounded-xl border border-[color:var(--cl-line)] p-4">
          <div className="text-[11px] text-[color:var(--cl-muted)] mb-1">إجمالي التمويلات والسلف</div>
          <div className="font-bold mono text-lg text-[color:var(--cl-text)]">{money(grandFinancing)}</div>
        </div>
        <div className="bg-[color:var(--cl-card)] rounded-xl border border-[color:var(--cl-line)] p-4">
          <div className="text-[11px] text-[color:var(--cl-muted)] mb-1">إجمالي السداد</div>
          <div className="font-bold mono text-lg text-[color:var(--cl-green)]">{money(grandRepaid)}</div>
        </div>
        <div className="bg-[color:var(--cl-ink)] rounded-xl p-4 text-white">
          <div className="text-[11px] text-white/50 mb-1">إجمالي المستحق</div>
          <div className={`font-bold mono text-lg ${grandBalance > 0 ? "text-[#E8AA6C]" : "text-white"}`}>{money(grandBalance)}</div>
        </div>
      </div>

      {showAddPerson && (
        <div className="bg-[color:var(--cl-card)] rounded-xl border border-[color:var(--cl-line)] p-4 grid grid-cols-3 gap-3">
          <Field label="الاسم" value={newPersonName} onChange={setNewPersonName} placeholder="اسم الشخص أو الجهة" />
          <Field label="ملاحظة (اختياري)" value={newPersonNote} onChange={setNewPersonNote} placeholder="مثال: صديق، مصدر تمويل خارجي" />
          <div className="flex items-end">
            <button onClick={addPerson} className="px-4 py-2 rounded-lg bg-[color:var(--cl-accent-bg)] text-[color:var(--cl-on-accent)] text-sm font-semibold hover:bg-[color:var(--cl-accent-hover)] transition">حفظ</button>
          </div>
        </div>
      )}

      <div className="bg-[color:var(--cl-card)] rounded-xl border border-[color:var(--cl-line)] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[color:var(--cl-inset)] text-[color:var(--cl-soft)] text-[12px]">
              <th className="text-right py-3 px-4 font-semibold">الاسم</th>
              <th className="text-right py-3 px-4 font-semibold">إجمالي التمويلات والسلف</th>
              <th className="text-right py-3 px-4 font-semibold">إجمالي السداد</th>
              <th className="text-right py-3 px-4 font-semibold">الرصيد المستحق</th>
              <th className="text-right py-3 px-4 font-semibold w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:var(--cl-sep)]">
            {summaries.map((p) => (
              <tr key={p.id} className="hover:bg-[color:var(--cl-sub)] transition cursor-pointer group" onClick={() => setSelectedId(p.id)}>
                <td className="py-3 px-4 font-semibold text-[color:var(--cl-text)]">{p.name}{p.note ? <span className="text-[color:var(--cl-muted)] font-normal text-xs"> — {p.note}</span> : null}</td>
                <td className="py-3 px-4 mono">{money(p.financingTotal)}</td>
                <td className="py-3 px-4 mono text-[color:var(--cl-green)]">{money(p.repaidTotal)}</td>
                <td className={`py-3 px-4 mono font-bold ${p.balance > 0 ? "text-[#D6A23C]" : "text-[color:var(--cl-green)]"}`}>{money(p.balance)}</td>
                <td className="py-3 px-4">
                  <button
                    onClick={(e) => { e.stopPropagation(); onDeletePerson(p.id); }}
                    title="حذف الحساب"
                    className="p-1.5 rounded-md text-[color:var(--cl-red)] opacity-0 group-hover:opacity-100 hover:bg-[#C1453B]/10 transition"
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
            {summaries.length === 0 && (
              <tr><td colSpan={5} className="text-center py-8 text-[color:var(--cl-muted)]">لا يوجد أشخاص/جهات مسجّلة بعد.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PersonLedger({ person, transactions, onBack, onAddTransaction, onUpdateTransaction, onDeleteTransaction }) {
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ date: "", type: "تمويل", amount: "", note: "" });

  const resetForm = () => setForm({ date: "", type: "تمويل", amount: "", note: "" });

  const submit = () => {
    if (!form.date || !form.amount) return;
    if (editId) {
      onUpdateTransaction(editId, { date: form.date, type: form.type, amount: Number(form.amount), note: form.note });
      setEditId(null);
    } else {
      onAddTransaction({ id: "ft_" + Math.random().toString(36).slice(2, 8), personId: person.id, date: form.date, type: form.type, amount: Number(form.amount), note: form.note });
    }
    resetForm();
    setOpen(false);
  };

  const startEdit = (t) => {
    setEditId(t.id);
    setForm({ date: t.date, type: t.type, amount: String(t.amount), note: t.note || "" });
    setOpen(true);
  };

  const cancelForm = () => {
    setEditId(null);
    resetForm();
    setOpen(false);
  };

  // كشف حساب تراكمي: ترتيب زمني تصاعدي لحساب الرصيد بعد كل حركة، ثم عرض الأحدث أولاً
  const chronological = [...transactions].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  let running = 0;
  const withBalance = chronological.map((t) => {
    running += t.type === "سداد" ? -t.amount : t.amount;
    return { ...t, balanceAfter: running };
  });
  const currentBalance = running;
  const displayRows = [...withBalance].reverse();

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="text-sm font-semibold text-[color:var(--cl-soft)] hover:text-[color:var(--cl-text)] flex items-center gap-1 transition">
        <ChevronRight size={16} /> رجوع لكل الحسابات
      </button>

      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold text-[color:var(--cl-text)] text-xl">{person.name}</h2>
          {person.note && <p className="text-[12px] text-[color:var(--cl-muted)] mt-1">{person.note}</p>}
        </div>
        <button onClick={() => (open ? cancelForm() : setOpen(true))} className="px-3 py-2 rounded-lg bg-[color:var(--cl-ink)] text-white text-sm font-semibold flex items-center gap-1.5 hover:bg-[color:var(--cl-ink-hover)] transition">
          <Plus size={15} /> حركة جديدة
        </button>
      </div>

      <div className="bg-[color:var(--cl-ink)] rounded-xl p-4 text-white inline-block">
        <div className="text-[11px] text-white/50 mb-1">الرصيد المستحق حاليًا</div>
        <div className={`font-bold mono text-lg ${currentBalance > 0 ? "text-[#E8AA6C]" : "text-white"}`}>{money(currentBalance)}</div>
      </div>

      {open && (
        <div className="bg-[color:var(--cl-card)] rounded-xl border border-[color:var(--cl-line)] p-4 grid grid-cols-4 gap-3">
          {editId && (
            <div className="col-span-4 text-xs font-semibold text-[color:var(--cl-accent)] bg-[color:rgb(var(--cl-accent-rgb)/0.1)] rounded-md px-3 py-1.5">جاري تعديل حركة موجودة</div>
          )}
          <Field label="التاريخ" value={form.date} onChange={(v) => setForm((f) => ({ ...f, date: v }))} type="date" />
          <SelectField label="نوع الحركة" value={form.type} onChange={(v) => setForm((f) => ({ ...f, type: v }))} options={FINANCE_TX_TYPES.map((t) => ({ value: t.key, label: t.key }))} />
          <Field label="المبلغ" value={form.amount} onChange={(v) => setForm((f) => ({ ...f, amount: v }))} type="number" />
          <Field label="البيان (اختياري)" value={form.note} onChange={(v) => setForm((f) => ({ ...f, note: v }))} placeholder="وصف الحركة" />
          <div className="col-span-4 flex justify-end gap-2">
            {editId && <button onClick={cancelForm} className="px-4 py-2 rounded-lg bg-[color:var(--cl-line)] text-[color:var(--cl-text)] text-sm font-semibold hover:bg-[color:var(--cl-hover)] transition">إلغاء</button>}
            <button onClick={submit} className="px-4 py-2 rounded-lg bg-[color:var(--cl-accent-bg)] text-[color:var(--cl-on-accent)] text-sm font-semibold hover:bg-[color:var(--cl-accent-hover)] transition">{editId ? "حفظ التعديل" : "حفظ الحركة"}</button>
          </div>
        </div>
      )}

      <div className="bg-[color:var(--cl-card)] rounded-xl border border-[color:var(--cl-line)] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[color:var(--cl-inset)] text-[color:var(--cl-soft)] text-[12px]">
              <th className="text-right py-3 px-4 font-semibold">التاريخ</th>
              <th className="text-right py-3 px-4 font-semibold">البيان</th>
              <th className="text-right py-3 px-4 font-semibold">نوع الحركة</th>
              <th className="text-right py-3 px-4 font-semibold">المبلغ</th>
              <th className="text-right py-3 px-4 font-semibold">الرصيد بعد الحركة</th>
              <th className="text-right py-3 px-4 font-semibold w-20"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:var(--cl-sep)]">
            {displayRows.map((t) => {
              const meta = FINANCE_TX_TYPES.find((m) => m.key === t.type);
              return (
                <tr key={t.id} className="hover:bg-[color:var(--cl-sub)] transition group">
                  <td className="py-3 px-4 mono text-[color:var(--cl-text)]">{t.date}</td>
                  <td className="py-3 px-4 text-[color:var(--cl-soft)]">{t.note || "—"}</td>
                  <td className="py-3 px-4">
                    <span className="text-[11px] font-semibold px-2 py-1 rounded-md" style={{ backgroundColor: meta?.color + "18", color: meta?.color }}>{t.type}</span>
                  </td>
                  <td className={`py-3 px-4 mono font-bold ${t.type === "سداد" ? "text-[color:var(--cl-green)]" : "text-[color:var(--cl-text)]"}`}>{t.type === "سداد" ? "-" : "+"}{money(t.amount)}</td>
                  <td className="py-3 px-4 mono font-bold">{money(t.balanceAfter)}</td>
                  <td className="py-3 px-4">
                    <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition">
                      <button onClick={() => startEdit(t)} title="تعديل" className="p-1.5 rounded-md text-[color:var(--cl-soft)] hover:bg-[color:var(--cl-line)] hover:text-[color:var(--cl-text)] transition"><Pencil size={14} /></button>
                      <button onClick={() => onDeleteTransaction(t.id)} title="حذف" className="p-1.5 rounded-md text-[color:var(--cl-red)] hover:bg-[#C1453B]/10 transition"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {displayRows.length === 0 && (
              <tr><td colSpan={6} className="text-center py-8 text-[color:var(--cl-muted)]">لا توجد حركات مسجّلة بعد.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* -------------------------------- تصفية العهد -------------------------------- */

function CustodyTab({
  pCustodies, pCosts, pWorkItems, custodyCategories, activeProjectId,
  onAddCustody, onUpdateCustody, onDeleteCustody, onSettleCustody,
  onAddCost, onUpdateCost, onDeleteCost, onAddCategory, onDeleteCategory,
}) {
  const [selectedId, setSelectedId] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ personName: "", amount: "", date: "", notes: "" });
  const [showCategories, setShowCategories] = useState(false);
  const [newCategory, setNewCategory] = useState("");

  const resetForm = () => setForm({ personName: "", amount: "", date: "", notes: "" });

  const submitCustody = () => {
    if (!form.personName || !form.amount) return;
    onAddCustody({
      id: "cst_" + Math.random().toString(36).slice(2, 8),
      projectId: activeProjectId,
      personName: form.personName,
      amountGiven: Number(form.amount),
      dateGiven: form.date || new Date().toISOString().slice(0, 10),
      status: "مفتوحة",
      notes: form.notes,
    });
    resetForm();
    setOpen(false);
  };

  const addCategory = () => {
    if (!newCategory.trim()) return;
    onAddCategory({ id: "cc_" + Math.random().toString(36).slice(2, 8), name: newCategory.trim() });
    setNewCategory("");
  };

  const selected = pCustodies.find((c) => c.id === selectedId);
  if (selected) {
    return (
      <CustodySettlement
        custody={selected}
        lines={pCosts.filter((c) => c.custodyId === selected.id)}
        pWorkItems={pWorkItems}
        custodyCategories={custodyCategories}
        activeProjectId={activeProjectId}
        onBack={() => setSelectedId(null)}
        onAddCost={onAddCost}
        onUpdateCost={onUpdateCost}
        onDeleteCost={onDeleteCost}
        onSettleCustody={onSettleCustody}
      />
    );
  }

  const openCustodies = pCustodies.filter((c) => c.status !== "مصفاة");
  const closedCustodies = pCustodies.filter((c) => c.status === "مصفاة");
  const totalOpen = openCustodies.reduce((s, c) => s + c.amountGiven, 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold text-[color:var(--cl-text)] text-xl">تصفية العهد</h2>
          <p className="text-[12px] text-[color:var(--cl-muted)] mt-1">عُهد مربوطة بهذا المشروع فقط</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowCategories((o) => !o)} className="px-3 py-2 rounded-lg bg-[color:var(--cl-card)] border border-[color:var(--cl-line)] text-[color:var(--cl-text)] text-sm font-semibold hover:border-white/40 transition">
            إدارة التصنيفات
          </button>
          <button onClick={() => setOpen((o) => !o)} className="px-3 py-2 rounded-lg bg-[color:var(--cl-ink)] text-white text-sm font-semibold flex items-center gap-1.5 hover:bg-[color:var(--cl-ink-hover)] transition">
            <Plus size={15} /> عهدة جديدة
          </button>
        </div>
      </div>

      {showCategories && (
        <div className="bg-[color:var(--cl-card)] rounded-xl border border-[color:var(--cl-line)] p-4 space-y-3">
          <div className="text-sm font-bold text-[color:var(--cl-text)]">تصنيفات التصفية العامة (تستخدم للبنود اللي مش مرتبطة ببند عمل)</div>
          <div className="flex flex-wrap gap-2">
            {custodyCategories.map((cat) => (
              <span key={cat.id} className="flex items-center gap-1.5 text-xs font-semibold bg-[color:var(--cl-inset)] border border-[color:var(--cl-line)] rounded-full px-3 py-1.5 text-[color:var(--cl-text)]">
                {cat.name}
                <button onClick={() => onDeleteCategory(cat.id)} className="text-[color:var(--cl-red)] hover:opacity-70"><X size={12} /></button>
              </span>
            ))}
            {custodyCategories.length === 0 && <span className="text-xs text-[color:var(--cl-muted)]">لا توجد تصنيفات بعد.</span>}
          </div>
          <div className="flex gap-2">
            <input
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder="اسم تصنيف جديد، مثال: مصروفات موقع"
              className="flex-1 border border-[color:var(--cl-line)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[color:var(--cl-accent-bg)] transition"
            />
            <button onClick={addCategory} className="px-4 py-2 rounded-lg bg-[color:var(--cl-accent-bg)] text-[color:var(--cl-on-accent)] text-sm font-semibold hover:bg-[color:var(--cl-accent-hover)] transition">إضافة</button>
          </div>
        </div>
      )}

      {open && (
        <div className="bg-[color:var(--cl-card)] rounded-xl border border-[color:var(--cl-line)] p-4 grid grid-cols-4 gap-3">
          <Field label="اسم الشخص" value={form.personName} onChange={(v) => setForm((f) => ({ ...f, personName: v }))} placeholder="اسم مستلم العهدة" />
          <Field label="المبلغ المستلم" value={form.amount} onChange={(v) => setForm((f) => ({ ...f, amount: v }))} type="number" />
          <Field label="تاريخ الاستلام" value={form.date} onChange={(v) => setForm((f) => ({ ...f, date: v }))} type="date" />
          <Field label="ملاحظات (اختياري)" value={form.notes} onChange={(v) => setForm((f) => ({ ...f, notes: v }))} placeholder="سبب العهدة" />
          <div className="col-span-4 flex justify-end gap-2">
            <button onClick={() => { resetForm(); setOpen(false); }} className="px-4 py-2 rounded-lg bg-[color:var(--cl-line)] text-[color:var(--cl-text)] text-sm font-semibold hover:bg-[color:var(--cl-hover)] transition">إلغاء</button>
            <button onClick={submitCustody} className="px-4 py-2 rounded-lg bg-[color:var(--cl-accent-bg)] text-[color:var(--cl-on-accent)] text-sm font-semibold hover:bg-[color:var(--cl-accent-hover)] transition">حفظ العهدة</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[color:var(--cl-card)] rounded-xl border border-[color:var(--cl-line)] p-4">
          <div className="text-[11px] text-[color:var(--cl-muted)] mb-1">إجمالي العُهد المفتوحة</div>
          <div className="font-bold mono text-lg text-[#D6A23C]">{money(totalOpen)}</div>
        </div>
        <div className="bg-[color:var(--cl-card)] rounded-xl border border-[color:var(--cl-line)] p-4">
          <div className="text-[11px] text-[color:var(--cl-muted)] mb-1">عدد العُهد المصفاة</div>
          <div className="font-bold mono text-lg text-[color:var(--cl-green)]">{closedCustodies.length}</div>
        </div>
      </div>

      <div className="bg-[color:var(--cl-card)] rounded-xl border border-[color:var(--cl-line)] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[color:var(--cl-inset)] text-[color:var(--cl-soft)] text-[12px]">
              <th className="text-right py-3 px-4 font-semibold">الشخص</th>
              <th className="text-right py-3 px-4 font-semibold">تاريخ الاستلام</th>
              <th className="text-right py-3 px-4 font-semibold">المبلغ المستلم</th>
              <th className="text-right py-3 px-4 font-semibold">الحالة</th>
              <th className="text-right py-3 px-4 font-semibold w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:var(--cl-sep)]">
            {[...openCustodies, ...closedCustodies].map((c) => (
              <tr key={c.id} className="hover:bg-[color:var(--cl-sub)] transition cursor-pointer group" onClick={() => setSelectedId(c.id)}>
                <td className="py-3 px-4 font-semibold text-[color:var(--cl-text)]">
                  {c.personName}
                  {c.notes ? <span className="text-[color:var(--cl-muted)] font-normal text-xs"> — {c.notes}</span> : null}
                </td>
                <td className="py-3 px-4 mono text-[color:var(--cl-soft)]">{c.dateGiven}</td>
                <td className="py-3 px-4 mono font-bold">{money(c.amountGiven)}</td>
                <td className="py-3 px-4">
                  <span className={`text-[11px] font-semibold px-2 py-1 rounded-md flex items-center gap-1 w-fit ${c.status === "مصفاة" ? "bg-[#3F7D63]/10 text-[color:var(--cl-green)]" : "bg-[#D6A23C]/10 text-[#D6A23C]"}`}>
                    {c.status === "مصفاة" ? <CheckCircle2 size={12} /> : <Clock size={12} />}
                    {c.status}
                  </span>
                </td>
                <td className="py-3 px-4">
                  <button
                    onClick={(e) => { e.stopPropagation(); onDeleteCustody(c.id); }}
                    title="حذف العهدة"
                    className="p-1.5 rounded-md text-[color:var(--cl-red)] opacity-0 group-hover:opacity-100 hover:bg-[#C1453B]/10 transition"
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
            {pCustodies.length === 0 && (
              <tr><td colSpan={5} className="text-center py-8 text-[color:var(--cl-muted)]">لا توجد عُهد مسجّلة بعد لهذا المشروع.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CustodySettlement({ custody, lines, pWorkItems, custodyCategories, activeProjectId, onBack, onAddCost, onUpdateCost, onDeleteCost, onSettleCustody }) {
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ workItemId: "", category: "", customCategory: "", amount: "", date: "", detail: "" });

  const isLocked = custody.status === "مصفاة";

  const resetForm = () => setForm({ workItemId: "", category: "", customCategory: "", amount: "", date: "", detail: "" });

  const categoryName = form.category === "__custom__" ? form.customCategory : form.category;
  const finalDesc = categoryName ? (form.detail ? `${categoryName} - ${form.detail}` : categoryName) : form.detail;

  const submitLine = () => {
    if (!finalDesc || !form.amount) return;
    if (editId) {
      onUpdateCost(editId, {
        type: form.workItemId ? "مصروفات" : "مصروفات عمومية",
        workItemId: form.workItemId || null,
        desc: finalDesc,
        qty: 1,
        unit: "-",
        price: Number(form.amount),
        date: form.date || new Date().toISOString().slice(0, 10),
      });
      setEditId(null);
    } else {
      onAddCost({
        id: "c_" + Math.random().toString(36).slice(2, 8),
        projectId: activeProjectId,
        workItemId: form.workItemId || null,
        custodyId: custody.id,
        type: form.workItemId ? "مصروفات" : "مصروفات عمومية",
        desc: finalDesc,
        qty: 1,
        unit: "-",
        price: Number(form.amount),
        date: form.date || new Date().toISOString().slice(0, 10),
      });
    }
    resetForm();
    setOpen(false);
  };

  const startEdit = (c) => {
    setEditId(c.id);
    setForm({ workItemId: c.workItemId || "", category: "", customCategory: "", amount: String(c.price), date: c.date, detail: c.desc });
    setOpen(true);
  };

  const cancelForm = () => {
    setEditId(null);
    resetForm();
    setOpen(false);
  };

  const totalSettled = lines.reduce((s, c) => s + c.qty * c.price, 0);
  const remaining = custody.amountGiven - totalSettled;

  const finalize = () => {
    if (!window.confirm("متأكد إنك عايز تقفل تصفية العهدة دي نهائيًا؟ مش هتقدر تضيف بنود جديدة بعد كده.")) return;
    onSettleCustody(custody.id);
  };

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="text-sm font-semibold text-[color:var(--cl-soft)] hover:text-[color:var(--cl-text)] flex items-center gap-1 transition">
        <ChevronRight size={16} /> رجوع لكل العُهد
      </button>

      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold text-[color:var(--cl-text)] text-xl">{custody.personName}</h2>
          <p className="text-[12px] text-[color:var(--cl-muted)] mt-1">
            استُلمت بتاريخ {custody.dateGiven}{custody.notes ? ` — ${custody.notes}` : ""}
          </p>
        </div>
        {!isLocked && (
          <button onClick={() => (open ? cancelForm() : setOpen(true))} className="px-3 py-2 rounded-lg bg-[color:var(--cl-ink)] text-white text-sm font-semibold flex items-center gap-1.5 hover:bg-[color:var(--cl-ink-hover)] transition">
            <Plus size={15} /> بند تصفية جديد
          </button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-[color:var(--cl-card)] rounded-xl border border-[color:var(--cl-line)] p-4">
          <div className="text-[11px] text-[color:var(--cl-muted)] mb-1">المبلغ المستلم</div>
          <div className="font-bold mono text-lg text-[color:var(--cl-text)]">{money(custody.amountGiven)}</div>
        </div>
        <div className="bg-[color:var(--cl-card)] rounded-xl border border-[color:var(--cl-line)] p-4">
          <div className="text-[11px] text-[color:var(--cl-muted)] mb-1">إجمالي المُصفّى</div>
          <div className="font-bold mono text-lg text-[color:var(--cl-soft)]">{money(totalSettled)}</div>
        </div>
        <div className="bg-[color:var(--cl-ink)] rounded-xl p-4 text-white">
          <div className="text-[11px] text-white/50 mb-1">{remaining >= 0 ? "المتبقي عند الشخص" : "مستحق للشخص (صرف أكتر من العهدة)"}</div>
          <div className={`font-bold mono text-lg ${remaining !== 0 ? "text-[#E8AA6C]" : "text-white"}`}>{money(Math.abs(remaining))}</div>
        </div>
      </div>

      {open && !isLocked && (
        <div className="bg-[color:var(--cl-card)] rounded-xl border border-[color:var(--cl-line)] p-4 grid grid-cols-3 gap-3">
          {editId && (
            <div className="col-span-3 text-xs font-semibold text-[color:var(--cl-accent)] bg-[color:rgb(var(--cl-accent-rgb)/0.1)] rounded-md px-3 py-1.5">جاري تعديل بند موجود</div>
          )}
          <SelectField
            label="بند العمل (اختياري)"
            value={form.workItemId}
            onChange={(v) => setForm((f) => ({ ...f, workItemId: v }))}
            options={[{ value: "", label: "— غير مرتبط ببند —" }, ...pWorkItems.map((w) => ({ value: w.id, label: w.name }))]}
          />
          <SelectField
            label="تصنيف عام (لو مفيش بند عمل)"
            value={form.category}
            onChange={(v) => setForm((f) => ({ ...f, category: v }))}
            options={[{ value: "", label: "— اختر تصنيف —" }, ...custodyCategories.map((c) => ({ value: c.name, label: c.name })), { value: "__custom__", label: "تصنيف آخر..." }]}
          />
          {form.category === "__custom__" ? (
            <Field label="اسم التصنيف الجديد" value={form.customCategory} onChange={(v) => setForm((f) => ({ ...f, customCategory: v }))} placeholder="مثال: مصروفات إدارية" />
          ) : (
            <Field label="التاريخ" value={form.date} onChange={(v) => setForm((f) => ({ ...f, date: v }))} type="date" />
          )}
          {form.category === "__custom__" && (
            <Field label="التاريخ" value={form.date} onChange={(v) => setForm((f) => ({ ...f, date: v }))} type="date" />
          )}
          <div className="col-span-3">
            <Field label="تفاصيل إضافية (اختياري)" value={form.detail} onChange={(v) => setForm((f) => ({ ...f, detail: v }))} placeholder="وصف إضافي للبند" />
          </div>
          <Field label="المبلغ" value={form.amount} onChange={(v) => setForm((f) => ({ ...f, amount: v }))} type="number" />
          <div className="col-span-3 flex justify-end gap-2">
            {editId && <button onClick={cancelForm} className="px-4 py-2 rounded-lg bg-[color:var(--cl-line)] text-[color:var(--cl-text)] text-sm font-semibold hover:bg-[color:var(--cl-hover)] transition">إلغاء</button>}
            <button onClick={submitLine} className="px-4 py-2 rounded-lg bg-[color:var(--cl-accent-bg)] text-[color:var(--cl-on-accent)] text-sm font-semibold hover:bg-[color:var(--cl-accent-hover)] transition">{editId ? "حفظ التعديل" : "إضافة البند"}</button>
          </div>
        </div>
      )}

      <div className="bg-[color:var(--cl-card)] rounded-xl border border-[color:var(--cl-line)] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[color:var(--cl-inset)] text-[color:var(--cl-soft)] text-[12px]">
              <th className="text-right py-3 px-4 font-semibold">التاريخ</th>
              <th className="text-right py-3 px-4 font-semibold">البند</th>
              <th className="text-right py-3 px-4 font-semibold">بند العمل</th>
              <th className="text-right py-3 px-4 font-semibold">المبلغ</th>
              {!isLocked && <th className="text-right py-3 px-4 font-semibold w-20"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:var(--cl-sep)]">
            {lines.map((c) => (
              <tr key={c.id} className="hover:bg-[color:var(--cl-sub)] transition group">
                <td className="py-3 px-4 mono text-[color:var(--cl-text)]">{c.date}</td>
                <td className="py-3 px-4 text-[color:var(--cl-soft)]">{c.desc}</td>
                <td className="py-3 px-4 text-[color:var(--cl-soft)]">{pWorkItems.find((w) => w.id === c.workItemId)?.name || "—"}</td>
                <td className="py-3 px-4 mono font-bold">{money(c.qty * c.price)}</td>
                {!isLocked && (
                  <td className="py-3 px-4">
                    <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition">
                      <button onClick={() => startEdit(c)} title="تعديل" className="p-1.5 rounded-md text-[color:var(--cl-soft)] hover:bg-[color:var(--cl-line)] hover:text-[color:var(--cl-text)] transition"><Pencil size={14} /></button>
                      <button onClick={() => onDeleteCost(c.id)} title="حذف" className="p-1.5 rounded-md text-[color:var(--cl-red)] hover:bg-[#C1453B]/10 transition"><Trash2 size={14} /></button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {lines.length === 0 && (
              <tr><td colSpan={isLocked ? 4 : 5} className="text-center py-8 text-[color:var(--cl-muted)]">لا توجد بنود تصفية مسجّلة بعد.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {!isLocked && (
        <div className="flex justify-end">
          <button onClick={finalize} className="px-5 py-2.5 rounded-lg bg-[#3F7D63] text-white font-semibold hover:bg-[#356B54] transition flex items-center gap-2">
            <CheckCircle2 size={16} /> إنهاء وتصفية العهدة نهائيًا
          </button>
        </div>
      )}
    </div>
  );
}

/* -------------------------------- new project ------------------------------- */

/* ======================= مستخلصات المقاولين والموردين =======================
   موديول مستقل: مفيش عقد إلزامي، ولا قيود تلقائية، ولا كميات ثابتة.
   كل مستخلص = بنود حرة + صفوف خصومات/إضافات ديناميكية → صافي.
   الجداول: party_statements و party_payments (راجع ملف SQL).
*/

const ST_KINDS = {
  contractor: { title: "مستخلصات المقاولين", partyLabel: "المقاول", partyPlural: "المقاولين", icon: HardHat },
  supplier: { title: "مستخلصات الموردين", partyLabel: "المورد", partyPlural: "الموردين", icon: Package },
};

// قائمة جاهزة للاختيار السريع — القيم قابلة للتعديل في كل مستخلص (راجع النسب مع المحاسب القانوني)
const ST_ADJ_PRESETS = [
  { name: "ضمان أعمال", kind: "percent", value: 5, effect: "deduct", base: "subtotal" },
  { name: "ضريبة قيمة مضافة", kind: "percent", value: 14, effect: "add", base: "subtotal" },
  { name: "ضريبة خصم وإضافة", kind: "percent", value: 1, effect: "deduct", base: "subtotal" },
  { name: "دفعة مقدمة (استهلاك)", kind: "amount", value: 0, effect: "deduct", base: "subtotal" },
  { name: "غرامة تأخير", kind: "amount", value: 0, effect: "deduct", base: "subtotal" },
  { name: "خصم مواد صرفتها الشركة", kind: "amount", value: 0, effect: "deduct", base: "subtotal" },
  { name: "دمغة / رسوم", kind: "percent", value: 0, effect: "deduct", base: "subtotal" },
];

const stRound = (n) => Math.round((Number(n) || 0) * 100) / 100;
const stUid = (p) => p + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
const stToday = () => new Date().toISOString().slice(0, 10);
const stEsc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const stMoney = (n) => stRound(n).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

// نسبة الإنجاز: سابقة (ثابتة من المستخلص اللي قبله) + حالية (بتتكتب) = إجمالي التنفيذ (تلقائي)
// الحالية لو سابتها فاضية = المتبقي لحد 100٪ (يعني البند الجديد بيتحسب 100٪)
// مستخلصات قديمة اتحفظت قبل الميزة دي: بتتقري بنفس قيمتها القديمة (pct أو 100٪) بدون سابق
const stNorm = (s) => String(s || "").trim().replace(/\s+/g, " ");
const stQ3 = (n) => Math.round((Number(n) || 0) * 1000) / 1000;
// كل بند: الكمية (سابقة + حالية = إجمالي) والنسبة (سابقة + حالية = إجمالي)، والسعر
//   إجمالي القيمة (تراكمي) = إجمالي الكمية × السعر × إجمالي نسبة التنفيذ
//   قيمة السابق = الكمية السابقة × السعر × النسبة السابقة   |   قيمة المستخلص الحالي = إجمالي القيمة − قيمة السابق
// مستخلصات اتحفظت بنسخ أقدم بتتحول لنفس القيمة اللي كانت عليها
function stN(i) {
  if (i.ver === 3) {
    const qp = Number(i.qtyPrev) || 0, qt = Number(i.qtyTotal) || 0, pp = Number(i.pctPrev) || 0, pt = Number(i.pctTotal) || 0;
    return { qtyPrev: qp, qtyTotal: qt, qtyCur: stQ3(qt - qp), pctPrev: pp, pctTotal: pt, pctCur: stRound(pt - pp) };
  }
  const q = Number(i.qty) || 0;
  if (i.curPct !== undefined) {
    const pp = Number(i.prevPct) || 0;
    const pt = stRound(pp + (Number(i.curPct) || 0));
    return { qtyPrev: q, qtyTotal: q, qtyCur: 0, pctPrev: pp, pctTotal: pt, pctCur: stRound(pt - pp) };
  }
  const pt = i.pct === "" || i.pct == null ? 100 : Number(i.pct) || 0;
  return { qtyPrev: q, qtyTotal: q, qtyCur: 0, pctPrev: 0, pctTotal: pt, pctCur: pt };
}
const stPrevQty = (i) => stN(i).qtyPrev;
const stCurQty = (i) => stN(i).qtyCur;
const stTotalQty = (i) => stN(i).qtyTotal;
const stPrev = (i) => stN(i).pctPrev;
const stCur = (i) => stN(i).pctCur;
const stTotalPct = (i) => stN(i).pctTotal;
const stPrice = (i) => Number(i.price) || 0;
const stFull = (i) => stN(i).qtyTotal * stPrice(i);
const stTotalValue = (i) => { const n = stN(i); return stRound((n.qtyTotal * stPrice(i) * n.pctTotal) / 100); };
const stPrevValue = (i) => { const n = stN(i); return stRound((n.qtyPrev * stPrice(i) * n.pctPrev) / 100); };
const stLine = (i) => stRound(stTotalValue(i) - stPrevValue(i));
const stQty = (n) => stQ3(n).toLocaleString("en-US", { maximumFractionDigits: 3 });

// الحساب: كل صف يتحسب على إجمالي البنود (subtotal) أو على الإجمالي بعد الصفوف اللي قبله (running)
function calcStatement(items, adjustments) {
  const full = stRound(items.reduce((s, i) => s + stFull(i), 0));
  const totalValue = stRound(items.reduce((s, i) => s + stTotalValue(i), 0));
  const prevValue = stRound(items.reduce((s, i) => s + stPrevValue(i), 0));
  const subtotal = stRound(totalValue - prevValue); // أعمال هذا المستخلص (اللي بتتحسب عليها الخصومات)
  const totalProgress = full ? (totalValue / full) * 100 : 0;
  const prevProgress = full ? (prevValue / full) * 100 : 0;
  const progress = totalProgress - prevProgress;
  let running = subtotal;
  const adjAmounts = adjustments.map((a) => {
    const base = a.base === "running" ? running : subtotal;
    const amount = stRound(a.kind === "percent" ? (base * (Number(a.value) || 0)) / 100 : Number(a.value) || 0);
    running = stRound(running + (a.effect === "add" ? amount : -amount));
    return amount;
  });
  return { subtotal, adjAmounts, net: running, full, progress, prevProgress, totalProgress, prevValue, totalValue };
}

// الحساب مع الطرف لحد مستخلص معين:
// prevNet  = صافي المستخلصات السابقة (المعتمدة فقط)
// prevPaid = اللي اتصرف للطرف قبل المستخلص ده (دفعات على مستخلصات سابقة + دفعات عامة بتاريخ لحد تاريخه)
// paidHere = دفعات اتسجلت على المستخلص ده نفسه
const stAccount = ({ id, partyName, date, number }, statements, payments) => {
  const name = String(partyName || "").trim();
  const none = { prevNet: 0, prevPaid: 0, paidHere: 0 };
  if (!name) return none;
  const numOf = (n) => parseInt(n, 10) || 0;
  const curNum = parseInt(number, 10);
  const before = (s) => s.date < date || (s.date === date && (isNaN(curNum) || numOf(s.number) < curNum));
  const same = statements.filter((s) => s.partyName === name && s.id !== id);
  const laterIds = new Set(same.filter((s) => !before(s)).map((s) => s.id));
  const prevNet = stRound(same.filter((s) => before(s) && s.status === "معتمد").reduce((a, s) => a + s.netTotal, 0));
  const mine = payments.filter((p) => p.partyName === name);
  const prevPaid = stRound(mine.filter((p) => p.statementId !== id || !id).filter((p) => !laterIds.has(p.statementId) && (p.statementId ? true : p.date <= date)).reduce((a, p) => a + p.amount, 0));
  const paidHere = id ? stRound(mine.filter((p) => p.statementId === id).reduce((a, p) => a + p.amount, 0)) : 0;
  return { prevNet, prevPaid, paidHere };
};
const stDueNow = (net, a) => stRound(net + a.prevNet - a.prevPaid - a.paidHere);
const stHasAcct = (a) => !!(a.prevNet || a.prevPaid || a.paidHere);

function printStatement(s, cfg, projectName, acct = { prevNet: 0, prevPaid: 0, paidHere: 0 }) {
  const calc = calcStatement(s.items, s.adjustments);
  const hasAcct = stHasAcct(acct);
  const acctRows = hasAcct
    ? `<tr><td colspan="10">(+) صافي المستخلصات السابقة المعتمدة</td><td>${stMoney(acct.prevNet)}</td></tr>
<tr><td colspan="10">(−) السابق صرفه</td><td>${stMoney(acct.prevPaid)}</td></tr>
${acct.paidHere ? `<tr><td colspan="10">(−) مدفوع على هذا المستخلص</td><td>${stMoney(acct.paidHere)}</td></tr>` : ""}
<tr class="net"><td colspan="10">المستحق صرفه الآن</td><td>${stMoney(stDueNow(calc.net, acct))} ج.م</td></tr>`
    : "";
  const itemRows = s.items.map((it, i) => `<tr><td>${i + 1}</td><td>${stEsc(it.desc)}</td><td>${stEsc(it.unit)}</td><td>${stQty(stPrevQty(it))}</td><td>${stQty(stCurQty(it))}</td><td>${stQty(stTotalQty(it))}</td><td>${stMoney(it.price)}</td><td>${stMoney(stPrev(it))}٪</td><td>${stMoney(stCur(it))}٪</td><td>${stMoney(stTotalPct(it))}٪</td><td>${stMoney(stTotalValue(it))}</td></tr>`).join("");
  const adjRows = s.adjustments.map((a, i) => `<tr><td colspan="10">${stEsc(a.name)} ${a.kind === "percent" ? `(${stEsc(a.value)}٪ ${a.base === "running" ? "من الإجمالي بعد السابق" : "من إجمالي الأعمال"})` : ""}</td><td>${a.effect === "add" ? "+" : "−"} ${stMoney(calc.adjAmounts[i])}</td></tr>`).join("");
  const html = `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>مستخلص ${stEsc(s.number || "")}</title>
<style>
body{font-family:'IBM Plex Sans Arabic','Cairo',Tahoma,sans-serif;color:#1E2530;padding:14mm;font-size:13px}
h1{font-size:20px;margin:0 0 4px} .meta{display:grid;grid-template-columns:repeat(2,1fr);gap:6px 24px;margin:14px 0 18px}
.meta div span{color:#6B7280} table{width:100%;border-collapse:collapse;margin-top:8px}
th,td{border:1px solid #cfc8b8;padding:5px 6px;text-align:right;font-size:11px} th{background:#f1ede1}
.net td{font-weight:700;background:#f6f3ea;font-size:15px} .sign{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-top:48px;text-align:center}
.sign div{border-top:1px solid #999;padding-top:6px;color:#555}
@media print{@page{size:A4 landscape;margin:0}}
</style></head><body>
<h1>مستخلص ${stEsc(cfg.partyLabel)} ${s.number ? "رقم " + stEsc(s.number) : ""}</h1>
<div class="meta">
<div><span>${stEsc(cfg.partyLabel)}: </span><b>${stEsc(s.partyName)}</b></div>
<div><span>التاريخ: </span>${stEsc(s.date)}</div>
${projectName ? `<div><span>المشروع: </span>${stEsc(projectName)}</div>` : ""}
${s.status ? `<div><span>الحالة: </span>${stEsc(s.status)}</div>` : ""}
</div>
<table><thead><tr><th>#</th><th>البند</th><th>الوحدة</th><th>الكمية السابقة</th><th>الكمية الحالية</th><th>إجمالي الكمية</th><th>السعر</th><th>نسبة التنفيذ السابقة</th><th>نسبة التنفيذ الحالية</th><th>إجمالي نسبة التنفيذ</th><th>الإجمالي</th></tr></thead><tbody>
${itemRows}
<tr><td colspan="10"><b>إجمالي الأعمال حتى تاريخه</b></td><td><b>${stMoney(calc.totalValue)}</b></td></tr>
<tr><td colspan="10">(−) أعمال المستخلصات السابقة</td><td>${stMoney(calc.prevValue)}</td></tr>
<tr><td colspan="10"><b>أعمال هذا المستخلص</b></td><td><b>${stMoney(calc.subtotal)}</b></td></tr>
${adjRows}
<tr class="net"><td colspan="10">${hasAcct ? "صافي هذا المستخلص" : "صافي المستحق"}</td><td>${stMoney(calc.net)} ج.م</td></tr>
${acctRows}
</tbody></table>
<p><b>نسبة التنفيذ الإجمالية:</b> ${stMoney(calc.totalProgress)}٪ (السابق ${stMoney(calc.prevProgress)}٪ + الحالي ${stMoney(calc.progress)}٪)</p>
${s.notes ? `<p><b>ملاحظات:</b> ${stEsc(s.notes)}</p>` : ""}
<div class="sign"><div>المهندس المختص</div><div>المراجعة / الحسابات</div><div>الاعتماد</div></div>
</body></html>`;
  const w = window.open("", "_blank", "width=900,height=1000");
  if (!w) { alert("المتصفح منع فتح نافذة الطباعة. اسمح بالنوافذ المنبثقة لهذا الموقع وحاول تاني."); return; }
  w.document.open(); w.document.write(html); w.document.close();
  w.onload = () => { w.focus(); w.print(); };
}

const stCellInput = "w-full border border-[color:var(--cl-line)] rounded-md px-2 py-1.5 text-sm outline-none focus:border-[color:var(--cl-accent-bg)] bg-[color:var(--cl-card)] text-[color:var(--cl-text)]";

function StatementForm({ cfg, initial, parties, projects, existing, payments, onCancel, onSave }) {
  const [partyName, setPartyName] = useState(initial?.partyName || "");
  const [date, setDate] = useState(initial?.date || stToday());
  const [number, setNumber] = useState(initial?.number || "");
  const [projectId, setProjectId] = useState(initial?.projectId || "");
  const [status, setStatus] = useState(initial?.status || "مسودة");
  const [notes, setNotes] = useState(initial?.notes || "");
  const [items, setItems] = useState(
    initial?.items?.length
      ? initial.items.map((i) => {
          const n = stN(i);
          return { id: i.id, desc: i.desc, unit: i.unit, price: i.price, totalIn: String(n.qtyTotal), curPctIn: String(n.pctCur), prevQtyManual: String(n.qtyPrev), prevPctManual: String(n.pctPrev), prevSource: i.prevSource === "auto" ? "auto" : "manual" };
        })
      : [{ id: stUid("si_"), desc: "", unit: "", price: "", totalIn: "", curPctIn: "", prevQtyManual: "0", prevPctManual: "0" }]
  );
  const [adjustments, setAdjustments] = useState(initial?.adjustments || []);
  const [err, setErr] = useState("");

  // السابق: آخر إجمالي كمية وإجمالي نسبة تنفيذ لنفس البند (بنفس الوصف) في مستخلصات سابقة لنفس الطرف
  const prevMap = useMemo(() => {
    const name = partyName.trim();
    if (!name) return {};
    const numOf = (n) => parseInt(n, 10) || 0;
    const curNum = parseInt(number, 10);
    const earlier = existing
      .filter((s) => s.partyName === name && s.id !== initial?.id && (s.date < date || (s.date === date && (isNaN(curNum) || numOf(s.number) < curNum))))
      .sort((a, b) => (a.date || "").localeCompare(b.date || "") || numOf(a.number) - numOf(b.number));
    const map = {};
    earlier.forEach((s) => s.items.forEach((it) => { const k = stNorm(it.desc); if (k) { const n = stN(it); map[k] = { qty: n.qtyTotal, pct: n.pctTotal }; } }));
    return map;
  }, [existing, partyName, date, number, initial?.id]);

  const rows = useMemo(
    () => items.map((it) => {
      const k = stNorm(it.desc);
      const m = it.prevSource !== "manual" && !!k && prevMap[k] !== undefined ? prevMap[k] : null;
      const qtyPrev = m ? m.qty : Number(it.prevQtyManual) || 0;
      const pctPrev = m ? m.pct : Number(it.prevPctManual) || 0;
      // إجمالي الكمية لو فاضي = نفس السابق | نسبة التنفيذ الحالية لو فاضية = المتبقي لحد 100٪
      const qtyTotal = it.totalIn === "" || it.totalIn == null ? qtyPrev : Number(it.totalIn) || 0;
      const pctCur = it.curPctIn === "" || it.curPctIn == null ? Math.max(0, stRound(100 - pctPrev)) : Number(it.curPctIn) || 0;
      return { ...it, ver: 3, qtyPrev, qtyTotal, pctPrev, pctTotal: stRound(pctPrev + pctCur), _matched: !!m };
    }),
    [items, prevMap]
  );

  const calc = useMemo(() => calcStatement(rows, adjustments), [rows, adjustments]);

  // الحساب مع الطرف (تلقائي)
  const acct = useMemo(() => stAccount({ id: initial?.id, partyName, date, number }, existing, payments), [initial?.id, partyName, date, number, existing, payments]);
  const hasAcct = stHasAcct(acct);
  const dueNow = stDueNow(calc.net, acct);

  const setItem = (id, patch) => setItems((p) => p.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  const setAdj = (id, patch) => setAdjustments((p) => p.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  const addPreset = (idx) => {
    if (idx === "") return;
    const pr = idx === "custom" ? { name: "", kind: "amount", value: 0, effect: "deduct", base: "subtotal" } : ST_ADJ_PRESETS[Number(idx)];
    setAdjustments((p) => [...p, { id: stUid("sa_"), ...pr }]);
  };

  const submit = () => {
    const name = partyName.trim();
    const cleanItems = rows.filter((i) => i.desc.trim() || stTotalQty(i) || Number(i.price));
    if (!name) return setErr(`اكتب اسم ${cfg.partyLabel}.`);
    if (!date) return setErr("اختار التاريخ.");
    if (cleanItems.length === 0) return setErr("لازم بند واحد على الأقل.");
    if (cleanItems.some((i) => !i.desc.trim())) return setErr("كل بند محتاج وصف.");
    const noQty = cleanItems.find((i) => !(stTotalQty(i) > 0));
    if (noQty) return setErr(`البند "${noQty.desc}": اكتب إجمالي الكمية.`);
    const less = cleanItems.find((i) => stCurQty(i) < 0);
    if (less) return setErr(`البند "${less.desc}": إجمالي الكمية (${stQty(stTotalQty(less))}) أقل من الكمية السابقة (${stQty(stPrevQty(less))}).`);
    const badPct = cleanItems.find((i) => stPrev(i) < 0 || stPrev(i) > 100 || stCur(i) < 0 || stTotalPct(i) > 100.0001);
    if (badPct) return setErr(`البند "${badPct.desc}": نسبة التنفيذ (سابق ${stMoney(stPrev(badPct))}٪ + حالي ${stMoney(stCur(badPct))}٪) لازم يكون إجماليها بين 0 و 100٪.`);
    let num = number.trim();
    if (!num) {
      const nums = existing.filter((s) => s.partyName === name && s.id !== initial?.id).map((s) => parseInt(s.number, 10)).filter((n) => !isNaN(n));
      num = String((nums.length ? Math.max(...nums) : 0) + 1);
    }
    const c = calcStatement(cleanItems, adjustments);
    onSave({
      id: initial?.id || stUid("st_"), kind: initial?.kind || cfg.kind, partyName: name, date, number: num,
      projectId: projectId || null, status, notes: notes.trim(),
      items: cleanItems.map((i) => ({
        id: i.id, ver: 3, desc: i.desc.trim(), unit: i.unit, price: Number(i.price) || 0,
        qtyPrev: stPrevQty(i), qtyCur: stCurQty(i), qtyTotal: stTotalQty(i),
        pctPrev: stPrev(i), pctCur: stCur(i), pctTotal: stTotalPct(i), prevSource: i._matched ? "auto" : "manual",
      })),
      adjustments: adjustments.filter((a) => a.name.trim()).map((a) => ({ ...a, value: Number(a.value) || 0 })),
      subtotal: c.subtotal, netTotal: c.net,
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-xl text-[color:var(--cl-text)]">{initial ? "تعديل مستخلص" : "مستخلص جديد"} — {cfg.partyLabel}</h2>
        <button onClick={onCancel} className="px-3 py-2 rounded-lg border border-[color:var(--cl-line)] text-sm text-[color:var(--cl-soft)] hover:bg-[color:var(--cl-sub)]">رجوع</button>
      </div>

      <div className="bg-[color:var(--cl-card)] rounded-xl border border-[color:var(--cl-line)] p-4 grid grid-cols-4 gap-3">
        <div>
          <label className="block text-[11px] font-semibold text-[color:var(--cl-soft)] mb-1">اسم {cfg.partyLabel} *</label>
          <input list="st-parties" value={partyName} onChange={(e) => setPartyName(e.target.value)} placeholder="اكتب أو اختار من السابقين" className="w-full border border-[color:var(--cl-line)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[color:var(--cl-accent-bg)] bg-[color:var(--cl-card)]" />
          <datalist id="st-parties">{parties.map((p) => <option key={p} value={p} />)}</datalist>
        </div>
        <Field label="التاريخ *" type="date" value={date} onChange={setDate} />
        <Field label="رقم المستخلص (اختياري — تلقائي)" value={number} onChange={setNumber} placeholder="تلقائي" />
        <SelectField label="الحالة" value={status} onChange={setStatus} options={[{ value: "مسودة", label: "مسودة" }, { value: "معتمد", label: "معتمد" }]} />
        <SelectField label="المشروع (اختياري)" value={projectId} onChange={setProjectId} options={[{ value: "", label: "— بدون مشروع —" }, ...projects.map((p) => ({ value: p.id, label: p.name }))]} />
        <div className="col-span-3"><Field label="ملاحظات (اختياري)" value={notes} onChange={setNotes} /></div>
      </div>

      {/* البنود */}
      <div className="bg-[color:var(--cl-card)] rounded-xl border border-[color:var(--cl-line)] overflow-hidden">
        <div className="px-4 py-3 flex items-center justify-between border-b border-[color:var(--cl-sep)]">
          <div className="font-bold text-sm text-[color:var(--cl-text)]">البنود</div>
          <button onClick={() => setItems((p) => [...p, { id: stUid("si_"), desc: "", unit: "", price: "", totalIn: "", curPctIn: "", prevQtyManual: "0", prevPctManual: "0" }])} className="px-3 py-1.5 rounded-lg bg-[color:var(--cl-ink)] text-white text-xs font-semibold flex items-center gap-1 hover:bg-[color:var(--cl-ink-hover)]"><Plus size={13} /> بند</button>
        </div>
        <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ minWidth: 1280 }}>
          <thead>
            <tr className="bg-[color:var(--cl-inset)] text-[color:var(--cl-soft)] text-[12px]">
              <th className="text-right py-2 px-3 w-10">#</th>
              <th className="text-right py-2 px-3">البند</th>
              <th className="text-right py-2 px-3 w-24">الوحدة</th>
              <th className="text-right py-2 px-3 w-28">الكمية السابقة</th>
              <th className="text-right py-2 px-3 w-28">الكمية الحالية</th>
              <th className="text-right py-2 px-3 w-28">إجمالي الكمية</th>
              <th className="text-right py-2 px-3 w-28">السعر</th>
              <th className="text-right py-2 px-3 w-28">نسبة التنفيذ السابقة</th>
              <th className="text-right py-2 px-3 w-28">نسبة التنفيذ الحالية</th>
              <th className="text-right py-2 px-3 w-28">إجمالي نسبة التنفيذ</th>
              <th className="text-right py-2 px-3 w-36">الإجمالي</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:var(--cl-sep)]">
            {rows.map((it, i) => {
              const negQty = stCurQty(it) < 0;
              const overPct = stTotalPct(it) > 100.0001;
              return (
                <tr key={it.id}>
                  <td className="py-2 px-3 mono text-[color:var(--cl-muted)]">{i + 1}</td>
                  <td className="py-2 px-3"><input className={stCellInput} value={it.desc} onChange={(e) => setItem(it.id, { desc: e.target.value })} placeholder="وصف البند" /></td>
                  <td className="py-2 px-3"><input className={stCellInput} value={it.unit} onChange={(e) => setItem(it.id, { unit: e.target.value })} placeholder="م² / طن" /></td>
                  <td className="py-2 px-3">
                    {it._matched ? (
                      <div title="من المستخلص السابق — ثابتة" className="mono text-sm px-2 py-1.5 rounded-md bg-[color:var(--cl-chip)] text-[color:var(--cl-soft)] border border-[color:var(--cl-sep)]">{stQty(it.qtyPrev)}</div>
                    ) : (
                      <input type="number" min="0" title="مفيش مستخلص سابق للبند ده — اكتب لو فيه كمية اتنفذت قبل كده" className={stCellInput + " mono"} value={it.prevQtyManual ?? ""} onChange={(e) => setItem(it.id, { prevQtyManual: e.target.value })} />
                    )}
                  </td>
                  <td className={`py-2 px-3 mono font-semibold ${negQty ? "text-[color:var(--cl-red)]" : "text-[color:var(--cl-text)]"}`}>{stQty(stCurQty(it))}</td>
                  <td className="py-2 px-3"><input type="number" min={it.qtyPrev} className={stCellInput + " mono font-bold" + (negQty ? " !border-[color:var(--cl-red)]" : "")} value={it.totalIn ?? ""} placeholder={String(it.qtyPrev || "")} onChange={(e) => setItem(it.id, { totalIn: e.target.value })} /></td>
                  <td className="py-2 px-3"><input type="number" className={stCellInput + " mono"} value={it.price} onChange={(e) => setItem(it.id, { price: e.target.value })} /></td>
                  <td className="py-2 px-3">
                    {it._matched ? (
                      <div title="من المستخلص السابق — ثابتة" className="mono text-sm px-2 py-1.5 rounded-md bg-[color:var(--cl-chip)] text-[color:var(--cl-soft)] border border-[color:var(--cl-sep)]">{stMoney(it.pctPrev)}٪</div>
                    ) : (
                      <input type="number" min="0" max="100" title="مفيش مستخلص سابق للبند ده — اكتب لو فيه تنفيذ قبل كده" className={stCellInput + " mono"} value={it.prevPctManual ?? ""} onChange={(e) => setItem(it.id, { prevPctManual: e.target.value })} />
                    )}
                  </td>
                  <td className="py-2 px-3"><input type="number" min="0" max={Math.max(0, 100 - it.pctPrev)} className={stCellInput + " mono font-bold" + (overPct ? " !border-[color:var(--cl-red)]" : "")} value={it.curPctIn ?? ""} placeholder={String(Math.max(0, stRound(100 - it.pctPrev)))} onChange={(e) => setItem(it.id, { curPctIn: e.target.value })} /></td>
                  <td className={`py-2 px-3 mono font-bold ${overPct ? "text-[color:var(--cl-red)]" : "text-[color:var(--cl-text)]"}`}>{stMoney(stTotalPct(it))}٪</td>
                  <td className="py-2 px-3 mono font-semibold text-[color:var(--cl-text)]">{stMoney(stTotalValue(it))}</td>
                  <td className="py-2 px-2"><button onClick={() => setItems((p) => (p.length > 1 ? p.filter((x) => x.id !== it.id) : p))} className="p-1.5 rounded-md text-[color:var(--cl-red)] hover:bg-[#C1453B]/10"><Trash2 size={14} /></button></td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-[color:var(--cl-inset)]">
              <td colSpan={10} className="py-2.5 px-3 font-bold text-[color:var(--cl-soft)]">
                إجمالي الأعمال حتى تاريخه
                {calc.full > 0 && <span className="font-normal text-[11px] text-[color:var(--cl-muted)] mr-2">— نسبة التنفيذ الإجمالية <b className="mono text-[color:var(--cl-text)]">{stMoney(calc.totalProgress)}٪</b></span>}
              </td>
              <td className="py-2.5 px-3 mono font-bold text-[color:var(--cl-text)]">{stMoney(calc.totalValue)}</td>
              <td />
            </tr>
            <tr>
              <td colSpan={10} className="py-2.5 px-3 text-[color:var(--cl-soft)]">(−) أعمال المستخلصات السابقة</td>
              <td className="py-2.5 px-3 mono text-[color:var(--cl-red)]">{stMoney(calc.prevValue)}</td>
              <td />
            </tr>
            <tr className="bg-[color:var(--cl-inset)]">
              <td colSpan={10} className="py-2.5 px-3 font-bold text-[color:var(--cl-text)]">أعمال هذا المستخلص</td>
              <td className="py-2.5 px-3 mono font-bold text-[color:var(--cl-text)]">{stMoney(calc.subtotal)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
        </div>
      </div>

      {/* الخصومات والإضافات */}
      <div className="bg-[color:var(--cl-card)] rounded-xl border border-[color:var(--cl-line)] overflow-hidden">
        <div className="px-4 py-3 flex items-center justify-between border-b border-[color:var(--cl-sep)]">
          <div>
            <div className="font-bold text-sm text-[color:var(--cl-text)]">الخصومات والإضافات (اختياري)</div>
            <div className="text-[11px] text-[color:var(--cl-muted)]">أضف اللي محتاجه بس — كل صف نسبة أو مبلغ، وبيتحسب بالترتيب</div>
          </div>
          <select value="" onChange={(e) => addPreset(e.target.value)} className="border border-[color:var(--cl-line)] rounded-lg px-3 py-1.5 text-xs bg-[color:var(--cl-card)] text-[color:var(--cl-text)]">
            <option value="">+ إضافة خصم / إضافة…</option>
            {ST_ADJ_PRESETS.map((p, i) => <option key={p.name} value={i}>{p.name}</option>)}
            <option value="custom">بند جديد بدون قالب</option>
          </select>
        </div>
        {adjustments.length === 0 ? (
          <div className="py-6 text-center text-sm text-[color:var(--cl-muted)]">مفيش خصومات أو إضافات — الصافي = إجمالي الأعمال.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[color:var(--cl-inset)] text-[color:var(--cl-soft)] text-[12px]">
                <th className="text-right py-2 px-3">الاسم</th>
                <th className="text-right py-2 px-3 w-28">النوع</th>
                <th className="text-right py-2 px-3 w-28">القيمة</th>
                <th className="text-right py-2 px-3 w-28">الأثر</th>
                <th className="text-right py-2 px-3 w-44">تُحسب على</th>
                <th className="text-right py-2 px-3 w-32">المبلغ</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--cl-sep)]">
              {adjustments.map((a, i) => (
                <tr key={a.id}>
                  <td className="py-2 px-3"><input className={stCellInput} value={a.name} onChange={(e) => setAdj(a.id, { name: e.target.value })} placeholder="اسم الخصم/الإضافة" /></td>
                  <td className="py-2 px-3">
                    <select className={stCellInput} value={a.kind} onChange={(e) => setAdj(a.id, { kind: e.target.value })}>
                      <option value="percent">نسبة ٪</option><option value="amount">مبلغ</option>
                    </select>
                  </td>
                  <td className="py-2 px-3"><input type="number" className={stCellInput + " mono"} value={a.value} onChange={(e) => setAdj(a.id, { value: e.target.value })} /></td>
                  <td className="py-2 px-3">
                    <select className={stCellInput} value={a.effect} onChange={(e) => setAdj(a.id, { effect: e.target.value })}>
                      <option value="deduct">خصم (−)</option><option value="add">إضافة (+)</option>
                    </select>
                  </td>
                  <td className="py-2 px-3">
                    {a.kind === "percent" ? (
                      <select className={stCellInput} value={a.base} onChange={(e) => setAdj(a.id, { base: e.target.value })}>
                        <option value="subtotal">إجمالي الأعمال</option><option value="running">الإجمالي بعد الصفوف السابقة</option>
                      </select>
                    ) : <span className="text-[color:var(--cl-muted)] text-xs">—</span>}
                  </td>
                  <td className={`py-2 px-3 mono font-semibold ${a.effect === "add" ? "text-[color:var(--cl-green)]" : "text-[color:var(--cl-red)]"}`}>{a.effect === "add" ? "+" : "−"} {stMoney(calc.adjAmounts[i])}</td>
                  <td className="py-2 px-2"><button onClick={() => setAdjustments((p) => p.filter((x) => x.id !== a.id))} className="p-1.5 rounded-md text-[color:var(--cl-red)] hover:bg-[#C1453B]/10"><Trash2 size={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {hasAcct && (
        <div className="bg-[color:var(--cl-card)] rounded-xl border border-[color:var(--cl-line)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[color:var(--cl-sep)]">
            <div className="font-bold text-sm text-[color:var(--cl-text)]">الحساب مع {cfg.partyLabel} (تلقائي)</div>
            <div className="text-[11px] text-[color:var(--cl-muted)]">بيتحسب من المستخلصات المعتمدة والدفعات المسجّلة لنفس الاسم — الدفعات بتتسجل من "كشف حساب {cfg.partyPlural}"</div>
          </div>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-[color:var(--cl-sep)]">
              <tr><td className="py-2.5 px-4 text-[color:var(--cl-soft)]">صافي هذا المستخلص</td><td className="py-2.5 px-4 mono w-48">{stMoney(calc.net)}</td></tr>
              <tr><td className="py-2.5 px-4 text-[color:var(--cl-soft)]">(+) صافي المستخلصات السابقة المعتمدة</td><td className="py-2.5 px-4 mono">{stMoney(acct.prevNet)}</td></tr>
              <tr><td className="py-2.5 px-4 text-[color:var(--cl-soft)]">(−) السابق صرفه</td><td className="py-2.5 px-4 mono text-[color:var(--cl-red)]">{stMoney(acct.prevPaid)}</td></tr>
              {acct.paidHere > 0 && (
                <tr><td className="py-2.5 px-4 text-[color:var(--cl-soft)]">(−) مدفوع على هذا المستخلص</td><td className="py-2.5 px-4 mono text-[color:var(--cl-red)]">{stMoney(acct.paidHere)}</td></tr>
              )}
              <tr className="bg-[color:var(--cl-inset)]"><td className="py-2.5 px-4 font-bold text-[color:var(--cl-text)]">المستحق صرفه الآن</td><td className="py-2.5 px-4 mono font-bold text-[color:var(--cl-text)]">{stMoney(dueNow)} ج.م</td></tr>
            </tbody>
          </table>
        </div>
      )}

      <div className="bg-[color:var(--cl-ink)] rounded-xl p-5 text-white flex items-center justify-between">
        <div className="flex items-center gap-8">
          <div>
            <div className="text-[11px] text-white/50 mb-1">{hasAcct ? "صافي هذا المستخلص" : "صافي المستحق"}</div>
            <div className="font-bold mono text-2xl">{stMoney(calc.net)} ج.م</div>
          </div>
          {hasAcct && (
            <div className="border-r border-white/15 pr-8">
              <div className="text-[11px] text-white/50 mb-1">المستحق صرفه الآن</div>
              <div className={`font-bold mono text-2xl ${dueNow > 0 ? "text-[#E8AA6C]" : "text-white"}`}>{stMoney(dueNow)} ج.م</div>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          {err && <span className="text-sm text-[#F0918A]">{err}</span>}
          <button onClick={onCancel} className="px-4 py-2 rounded-lg border border-white/20 text-sm hover:bg-white/10">إلغاء</button>
          <button onClick={submit} className="px-5 py-2 rounded-lg bg-[color:var(--cl-accent-bg)] text-[color:var(--cl-on-accent)] text-sm font-bold hover:bg-[color:var(--cl-accent-hover)]">حفظ المستخلص</button>
        </div>
      </div>
    </div>
  );
}

function StatementsModule({ kind, statements, payments, projects, dbError, onSave, onDelete, onAddPayment, onDeletePayment }) {
  const cfg = { ...ST_KINDS[kind], kind };
  const Icon = cfg.icon;
  const [mode, setMode] = useState("list"); // list | form | parties
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState("");
  const [openParty, setOpenParty] = useState(null);
  const [payForm, setPayForm] = useState({ date: stToday(), amount: "", method: "تحويل بنكي", note: "", statementId: "" });

  useEffect(() => { setMode("list"); setEditing(null); setOpenParty(null); setSearch(""); }, [kind]);

  const list = useMemo(() => statements.filter((s) => s.kind === kind), [statements, kind]);
  const pays = useMemo(() => payments.filter((p) => p.kind === kind), [payments, kind]);
  const projName = (id) => projects.find((p) => p.id === id)?.name || "";
  const parties = useMemo(() => Array.from(new Set([...list.map((s) => s.partyName), ...pays.map((p) => p.partyName)])).sort((a, b) => a.localeCompare(b, "ar")), [list, pays]);

  const partyRows = parties.map((name) => {
    const sts = list.filter((s) => s.partyName === name);
    const ps = pays.filter((p) => p.partyName === name);
    const total = stRound(sts.reduce((s, x) => s + x.netTotal, 0));
    const paid = stRound(ps.reduce((s, x) => s + x.amount, 0));
    return { name, sts, ps, total, paid, remaining: stRound(total - paid) };
  });

  const grandTotal = stRound(partyRows.reduce((s, p) => s + p.total, 0));
  const grandPaid = stRound(partyRows.reduce((s, p) => s + p.paid, 0));
  const grandRemaining = stRound(grandTotal - grandPaid);

  if (dbError) {
    return (
      <div className="bg-[color:var(--cl-card)] rounded-xl border border-[color:var(--cl-red)] p-6 space-y-2">
        <div className="font-bold text-[color:var(--cl-red)]">جداول المستخلصات مش موجودة على Supabase</div>
        <div className="text-sm text-[color:var(--cl-soft)]">شغّل ملف <span className="mono">statements_schema.sql</span> في SQL Editor ثم حدّث الصفحة.</div>
        <div className="text-[11px] mono text-[color:var(--cl-muted)]" dir="ltr">{dbError}</div>
      </div>
    );
  }

  if (mode === "form") {
    return (
      <StatementForm
        cfg={cfg} initial={editing} parties={parties} projects={projects} existing={list} payments={pays}
        onCancel={() => { setMode("list"); setEditing(null); }}
        onSave={async (st) => { const ok = await onSave(st); if (ok !== false) { setMode("list"); setEditing(null); } }}
      />
    );
  }

  const q = search.trim();
  const filtered = list
    .filter((s) => !q || s.partyName.includes(q) || String(s.number).includes(q) || projName(s.projectId).includes(q))
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  const paidFor = (s) => stRound(pays.filter((p) => p.statementId === s.id).reduce((x, p) => x + p.amount, 0));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold text-xl text-[color:var(--cl-text)] flex items-center gap-2"><Icon size={20} /> {cfg.title}</h2>
          <p className="text-[12px] text-[color:var(--cl-muted)] mt-1">مستقلة عن المشاريع والعقود — اربط بمشروع لو حابب فقط</p>
        </div>
        <button onClick={() => { setEditing(null); setMode("form"); }} className="px-3 py-2 rounded-lg bg-[color:var(--cl-accent-bg)] text-[color:var(--cl-on-accent)] text-sm font-semibold flex items-center gap-1.5 hover:bg-[color:var(--cl-accent-hover)] transition">
          <Plus size={15} /> مستخلص جديد
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-[color:var(--cl-card)] rounded-xl border border-[color:var(--cl-line)] p-4">
          <div className="text-[11px] text-[color:var(--cl-muted)] mb-1">إجمالي صافي المستخلصات</div>
          <div className="font-bold mono text-lg text-[color:var(--cl-text)]">{stMoney(grandTotal)} ج.م</div>
        </div>
        <div className="bg-[color:var(--cl-card)] rounded-xl border border-[color:var(--cl-line)] p-4">
          <div className="text-[11px] text-[color:var(--cl-muted)] mb-1">المدفوع</div>
          <div className="font-bold mono text-lg text-[color:var(--cl-green)]">{stMoney(grandPaid)} ج.م</div>
        </div>
        <div className="bg-[color:var(--cl-ink)] rounded-xl p-4 text-white">
          <div className="text-[11px] text-white/50 mb-1">المتبقي</div>
          <div className={`font-bold mono text-lg ${grandRemaining > 0 ? "text-[#E8AA6C]" : "text-white"}`}>{stMoney(grandRemaining)} ج.م</div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {[{ k: "list", l: "كل المستخلصات" }, { k: "parties", l: `كشف حساب ${cfg.partyPlural}` }].map((t) => (
          <button key={t.k} onClick={() => setMode(t.k)} className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${mode === t.k ? "bg-[color:var(--cl-ink)] text-white" : "border border-[color:var(--cl-line)] text-[color:var(--cl-soft)] hover:bg-[color:var(--cl-sub)]"}`}>{t.l}</button>
        ))}
        {mode === "list" && (
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`بحث بالاسم / الرقم / المشروع`} className="mr-auto w-72 border border-[color:var(--cl-line)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[color:var(--cl-accent-bg)] bg-[color:var(--cl-card)]" />
        )}
      </div>

      {mode === "list" && (
        <div className="bg-[color:var(--cl-card)] rounded-xl border border-[color:var(--cl-line)] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[color:var(--cl-inset)] text-[color:var(--cl-soft)] text-[12px]">
                <th className="text-right py-3 px-4">رقم</th>
                <th className="text-right py-3 px-4">{cfg.partyLabel}</th>
                <th className="text-right py-3 px-4">التاريخ</th>
                <th className="text-right py-3 px-4">المشروع</th>
                <th className="text-right py-3 px-4">الصافي</th>
                <th className="text-right py-3 px-4">مدفوع عليه</th>
                <th className="text-right py-3 px-4">الحالة</th>
                <th className="w-28" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--cl-sep)]">
              {filtered.map((s) => (
                <tr key={s.id} className="hover:bg-[color:var(--cl-sub)] group">
                  <td className="py-3 px-4 mono">{s.number}</td>
                  <td className="py-3 px-4 font-semibold text-[color:var(--cl-text)]">{s.partyName}</td>
                  <td className="py-3 px-4 mono text-[color:var(--cl-soft)]">{s.date}</td>
                  <td className="py-3 px-4 text-[color:var(--cl-soft)]">{projName(s.projectId) || "—"}</td>
                  <td className="py-3 px-4 mono font-bold">{stMoney(s.netTotal)}</td>
                  <td className="py-3 px-4 mono text-[color:var(--cl-green)]">{paidFor(s) ? stMoney(paidFor(s)) : "—"}</td>
                  <td className="py-3 px-4"><span className={`text-[11px] px-2 py-0.5 rounded-full ${s.status === "معتمد" ? "bg-[color:var(--cl-green)]/15 text-[color:var(--cl-green)]" : "bg-[color:var(--cl-chip)] text-[color:var(--cl-soft)]"}`}>{s.status || "—"}</span></td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                      <button title="طباعة" onClick={() => printStatement(s, cfg, projName(s.projectId), stAccount(s, list, pays))} className="p-1.5 rounded-md text-[color:var(--cl-soft)] hover:bg-[color:var(--cl-line)]"><Printer size={14} /></button>
                      <button title="تعديل" onClick={() => { setEditing(s); setMode("form"); }} className="p-1.5 rounded-md text-[color:var(--cl-soft)] hover:bg-[color:var(--cl-line)]"><Pencil size={14} /></button>
                      <button title="حذف" onClick={() => onDelete(s.id)} className="p-1.5 rounded-md text-[color:var(--cl-red)] hover:bg-[#C1453B]/10"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={8} className="text-center py-8 text-[color:var(--cl-muted)]">لا توجد مستخلصات.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {mode === "parties" && (
        <div className="bg-[color:var(--cl-card)] rounded-xl border border-[color:var(--cl-line)] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[color:var(--cl-inset)] text-[color:var(--cl-soft)] text-[12px]">
                <th className="w-8" />
                <th className="text-right py-3 px-4">{cfg.partyLabel}</th>
                <th className="text-right py-3 px-4">عدد المستخلصات</th>
                <th className="text-right py-3 px-4">إجمالي الصافي</th>
                <th className="text-right py-3 px-4">المدفوع</th>
                <th className="text-right py-3 px-4">المتبقي</th>
              </tr>
            </thead>
            <tbody>
              {partyRows.map((p) => {
                const open = openParty === p.name;
                return (
                  <React.Fragment key={p.name}>
                    <tr onClick={() => setOpenParty(open ? null : p.name)} className="cursor-pointer hover:bg-[color:var(--cl-sub)] border-t border-[color:var(--cl-sep)]">
                      <td className="px-3 text-[color:var(--cl-muted)]">{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
                      <td className="py-3 px-4 font-semibold text-[color:var(--cl-text)]">{p.name}</td>
                      <td className="py-3 px-4 mono">{p.sts.length}</td>
                      <td className="py-3 px-4 mono">{stMoney(p.total)}</td>
                      <td className="py-3 px-4 mono text-[color:var(--cl-green)]">{stMoney(p.paid)}</td>
                      <td className={`py-3 px-4 mono font-bold ${p.remaining > 0 ? "text-[#D6A23C]" : "text-[color:var(--cl-green)]"}`}>{stMoney(p.remaining)}</td>
                    </tr>
                    {open && (
                      <tr className="bg-[color:var(--cl-inset)]">
                        <td colSpan={6} className="p-4 space-y-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <div className="text-[12px] font-bold text-[color:var(--cl-soft)] mb-2">المستخلصات</div>
                              <div className="space-y-1">
                                {p.sts.sort((a, b) => (a.date || "").localeCompare(b.date || "")).map((s) => (
                                  <div key={s.id} className="flex items-center justify-between text-sm bg-[color:var(--cl-card)] rounded-lg px-3 py-2 border border-[color:var(--cl-sep)]">
                                    <span>#{s.number} <span className="text-[color:var(--cl-muted)] mono text-xs">· {s.date}</span></span>
                                    <span className="mono font-semibold">{stMoney(s.netTotal)}</span>
                                  </div>
                                ))}
                                {p.sts.length === 0 && <div className="text-xs text-[color:var(--cl-muted)]">لا مستخلصات.</div>}
                              </div>
                            </div>
                            <div>
                              <div className="text-[12px] font-bold text-[color:var(--cl-soft)] mb-2">الدفعات</div>
                              <div className="space-y-1">
                                {p.ps.sort((a, b) => (a.date || "").localeCompare(b.date || "")).map((x) => (
                                  <div key={x.id} className="flex items-center justify-between text-sm bg-[color:var(--cl-card)] rounded-lg px-3 py-2 border border-[color:var(--cl-sep)]">
                                    <span className="mono text-xs text-[color:var(--cl-muted)]">{x.date} · <span className="font-sans">{x.method}{x.note ? " · " + x.note : ""}</span></span>
                                    <span className="flex items-center gap-2"><span className="mono font-semibold text-[color:var(--cl-green)]">{stMoney(x.amount)}</span>
                                      <button onClick={() => onDeletePayment(x.id)} className="p-1 rounded text-[color:var(--cl-red)] hover:bg-[#C1453B]/10"><Trash2 size={12} /></button></span>
                                  </div>
                                ))}
                                {p.ps.length === 0 && <div className="text-xs text-[color:var(--cl-muted)]">لا دفعات.</div>}
                              </div>
                            </div>
                          </div>
                          <div className="grid grid-cols-5 gap-2 items-end">
                            <Field small label="تاريخ الدفعة" type="date" value={payForm.date} onChange={(v) => setPayForm((f) => ({ ...f, date: v }))} />
                            <Field small label="المبلغ" type="number" value={payForm.amount} onChange={(v) => setPayForm((f) => ({ ...f, amount: v }))} />
                            <SelectField small label="الطريقة" value={payForm.method} onChange={(v) => setPayForm((f) => ({ ...f, method: v }))} options={["تحويل بنكي", "نقدي", "شيك"].map((m) => ({ value: m, label: m }))} />
                            <SelectField small label="على مستخلص (اختياري)" value={payForm.statementId} onChange={(v) => setPayForm((f) => ({ ...f, statementId: v }))} options={[{ value: "", label: "— عام —" }, ...p.sts.map((s) => ({ value: s.id, label: "#" + s.number }))]} />
                            <button
                              onClick={async () => {
                                if (!payForm.amount || Number(payForm.amount) <= 0) return;
                                await onAddPayment({ id: stUid("sp_"), kind, partyName: p.name, date: payForm.date || stToday(), amount: Number(payForm.amount), method: payForm.method, note: payForm.note, statementId: payForm.statementId || null });
                                setPayForm((f) => ({ ...f, amount: "", statementId: "" }));
                              }}
                              className="px-3 py-1.5 rounded-lg bg-[color:var(--cl-accent-bg)] text-[color:var(--cl-on-accent)] text-xs font-bold hover:bg-[color:var(--cl-accent-hover)]">+ تسجيل دفعة</button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              {partyRows.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-[color:var(--cl-muted)]">لا يوجد بيانات بعد.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function NewProjectModal({ onClose, onCreate }) {
  const [form, setForm] = useState({ name: "", client: "", location: "", budget: "" });

  const submit = () => {
    if (!form.name) return;
    onCreate({ id: "p_" + Math.random().toString(36).slice(2, 8), name: form.name, client: form.client, location: form.location, budget: Number(form.budget) || 0, status: "جارٍ" });
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" dir="rtl">
      <div className="bg-[color:var(--cl-card)] rounded-xl w-full max-w-md p-6 relative" style={{ fontFamily: "var(--cl-font)" }}>
        <button onClick={onClose} className="absolute left-4 top-4 text-[color:var(--cl-muted)] hover:text-[color:var(--cl-text)]"><X size={18} /></button>
        <h3 className="font-bold text-lg text-[color:var(--cl-text)] mb-4">مشروع جديد</h3>
        <div className="space-y-3">
          <Field label="اسم المشروع" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} />
          <Field label="العميل" value={form.client} onChange={(v) => setForm((f) => ({ ...f, client: v }))} />
          <Field label="الموقع" value={form.location} onChange={(v) => setForm((f) => ({ ...f, location: v }))} />
          <Field label="قيمة العقد" value={form.budget} onChange={(v) => setForm((f) => ({ ...f, budget: v }))} type="number" />
        </div>
        <button onClick={submit} className="w-full mt-5 py-2.5 rounded-lg bg-[color:var(--cl-accent-bg)] text-[color:var(--cl-on-accent)] font-semibold hover:bg-[color:var(--cl-accent-hover)] transition">إنشاء المشروع</button>
      </div>
    </div>
  );
}

/* -------------------------------- form fields ------------------------------- */

function Field({ label, value, onChange, type = "text", placeholder = "", small }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-[color:var(--cl-soft)] mb-1">{label}</label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full border border-[color:var(--cl-line)] rounded-lg px-3 ${small ? "py-1.5 text-xs" : "py-2 text-sm"} outline-none focus:border-[color:var(--cl-accent-bg)] transition bg-[color:var(--cl-card)]`}
      />
    </div>
  );
}

function SelectField({ label, value, onChange, options, small }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-[color:var(--cl-soft)] mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full border border-[color:var(--cl-line)] rounded-lg px-3 ${small ? "py-1.5 text-xs" : "py-2 text-sm"} outline-none focus:border-[color:var(--cl-accent-bg)] transition bg-[color:var(--cl-card)]`}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

/* -------------------------------- login screen ------------------------------- */

function useLiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/* ---------------------------- إدارة المستخدمين ---------------------------- */

function UsersManagementModule({ currentUsername }) {
  const [users, setUsers] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [adminUsername, setAdminUsername] = useState(currentUsername || "");
  const [adminPassword, setAdminPassword] = useState("");

  const [showAdd, setShowAdd] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const [editUsername, setEditUsername] = useState(null); // username اللي بيتعدّل دلوقتي
  const [editNewUsername, setEditNewUsername] = useState("");
  const [editNewPassword, setEditNewPassword] = useState("");

  const loadUsers = async () => {
    if (!adminUsername || !adminPassword) {
      setError("اكتب اسم المستخدم وكلمة المرور بتاعتك عشان تقدر تشوف قائمة المستخدمين.");
      return;
    }
    setLoading(true);
    setError("");
    const { data, error: rpcError } = await supabase.rpc("list_app_users", { p_admin_username: adminUsername, p_admin_password: adminPassword });
    setLoading(false);
    if (rpcError) { setError(rpcError.message.includes("بيانات الدخول") ? rpcError.message : "بيانات الدخول غير صحيحة أو حصل خطأ في الاتصال."); setUsers(null); return; }
    setUsers(data || []);
  };

  const addUser = async () => {
    if (!newUsername.trim() || !newPassword.trim()) return;
    setError("");
    const { error: rpcError } = await supabase.rpc("admin_add_user", {
      p_admin_username: adminUsername,
      p_admin_password: adminPassword,
      p_new_username: newUsername.trim(),
      p_new_password: newPassword,
    });
    if (rpcError) { setError(rpcError.message); return; }
    setNewUsername("");
    setNewPassword("");
    setShowAdd(false);
    loadUsers();
  };

  const startEdit = (u) => {
    setEditUsername(u.username);
    setEditNewUsername(u.username);
    setEditNewPassword("");
  };

  const saveEdit = async () => {
    setError("");
    const { error: rpcError } = await supabase.rpc("admin_update_user", {
      p_admin_username: adminUsername,
      p_admin_password: adminPassword,
      p_target_username: editUsername,
      p_new_username: editNewUsername.trim() === editUsername ? null : editNewUsername.trim(),
      p_new_password: editNewPassword.trim() || null,
    });
    if (rpcError) { setError(rpcError.message); return; }
    setEditUsername(null);
    setEditNewPassword("");
    loadUsers();
  };

  const deleteUser = async (username) => {
    if (!window.confirm(`متأكد إنك عايز تمسح المستخدم "${username}"؟`)) return;
    setError("");
    const { error: rpcError } = await supabase.rpc("admin_delete_user", {
      p_admin_username: adminUsername,
      p_admin_password: adminPassword,
      p_target_username: username,
    });
    if (rpcError) { setError(rpcError.message); return; }
    loadUsers();
  };

  if (!users) {
    return (
      <div className="max-w-md">
        <h2 className="font-bold text-[color:var(--cl-text)] text-xl mb-1">إدارة المستخدمين</h2>
        <p className="text-[12px] text-[color:var(--cl-muted)] mb-5">أدخل بيانات دخولك عشان تفتح شاشة إدارة المستخدمين</p>
        <div className="bg-[color:var(--cl-card)] rounded-xl border border-[color:var(--cl-line)] p-4 space-y-3">
          <Field label="اسم المستخدم" value={adminUsername} onChange={setAdminUsername} placeholder="اسم المستخدم بتاعك" />
          <Field label="كلمة المرور" value={adminPassword} onChange={setAdminPassword} type="password" placeholder="كلمة المرور بتاعتك" />
          {error && <div className="text-xs text-[color:var(--cl-red)] bg-[#C1453B]/10 rounded-md px-3 py-2">{error}</div>}
          <button
            onClick={loadUsers}
            disabled={loading}
            className="w-full px-4 py-2.5 rounded-lg bg-[color:var(--cl-ink)] text-white text-sm font-semibold hover:bg-[color:var(--cl-ink-hover)] transition disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 size={15} className="animate-spin" />} دخول
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold text-[color:var(--cl-text)] text-xl">إدارة المستخدمين</h2>
          <p className="text-[12px] text-[color:var(--cl-muted)] mt-1">إضافة/تعديل/حذف مستخدمين — كل عملية بتتطلب بيانات دخولك للتأكيد</p>
        </div>
        <button onClick={() => setShowAdd((o) => !o)} className="px-3 py-2 rounded-lg bg-[color:var(--cl-ink)] text-white text-sm font-semibold flex items-center gap-1.5 hover:bg-[color:var(--cl-ink-hover)] transition">
          <Plus size={15} /> مستخدم جديد
        </button>
      </div>

      {error && <div className="text-xs text-[color:var(--cl-red)] bg-[#C1453B]/10 rounded-md px-3 py-2">{error}</div>}

      {showAdd && (
        <div className="bg-[color:var(--cl-card)] rounded-xl border border-[color:var(--cl-line)] p-4 grid grid-cols-2 gap-3">
          <Field label="اسم المستخدم الجديد" value={newUsername} onChange={setNewUsername} />
          <Field label="كلمة المرور" value={newPassword} onChange={setNewPassword} type="password" />
          <div className="col-span-2 flex justify-end gap-2">
            <button onClick={() => setShowAdd(false)} className="px-4 py-2 rounded-lg bg-[color:var(--cl-line)] text-[color:var(--cl-text)] text-sm font-semibold hover:bg-[color:var(--cl-hover)] transition">إلغاء</button>
            <button onClick={addUser} className="px-4 py-2 rounded-lg bg-[color:var(--cl-accent-bg)] text-[color:var(--cl-on-accent)] text-sm font-semibold hover:bg-[color:var(--cl-accent-hover)] transition">حفظ</button>
          </div>
        </div>
      )}

      <div className="bg-[color:var(--cl-card)] rounded-xl border border-[color:var(--cl-line)] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[color:var(--cl-inset)] text-[color:var(--cl-soft)] text-[12px]">
              <th className="text-right py-3 px-4 font-semibold">اسم المستخدم</th>
              <th className="text-right py-3 px-4 font-semibold w-32"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:var(--cl-sep)]">
            {users.map((u) => (
              <React.Fragment key={u.id}>
                <tr className="hover:bg-[color:var(--cl-sub)] transition group">
                  <td className="py-3 px-4 font-semibold text-[color:var(--cl-text)]">{u.username}</td>
                  <td className="py-3 px-4">
                    <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition">
                      <button onClick={() => startEdit(u)} title="تعديل" className="p-1.5 rounded-md text-[color:var(--cl-soft)] hover:bg-[color:var(--cl-line)] hover:text-[color:var(--cl-text)] transition"><Pencil size={14} /></button>
                      <button onClick={() => deleteUser(u.username)} title="حذف" className="p-1.5 rounded-md text-[color:var(--cl-red)] hover:bg-[#C1453B]/10 transition"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
                {editUsername === u.username && (
                  <tr>
                    <td colSpan={2} className="p-4 bg-[color:var(--cl-sub)]">
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="اسم المستخدم" value={editNewUsername} onChange={setEditNewUsername} />
                        <Field label="كلمة مرور جديدة (اختياري)" value={editNewPassword} onChange={setEditNewPassword} type="password" placeholder="سيبها فاضية لو مش عايز تغيّرها" />
                        <div className="col-span-2 flex justify-end gap-2">
                          <button onClick={() => setEditUsername(null)} className="px-4 py-2 rounded-lg bg-[color:var(--cl-line)] text-[color:var(--cl-text)] text-sm font-semibold hover:bg-[color:var(--cl-hover)] transition">إلغاء</button>
                          <button onClick={saveEdit} className="px-4 py-2 rounded-lg bg-[color:var(--cl-accent-bg)] text-[color:var(--cl-on-accent)] text-sm font-semibold hover:bg-[color:var(--cl-accent-hover)] transition">حفظ التعديل</button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
            {users.length === 0 && (
              <tr><td colSpan={2} className="text-center py-8 text-[color:var(--cl-muted)]">لا يوجد مستخدمون.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------- تسجيل الدخول ------------------------------- */

function LoginScreen({ onSuccess }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(false);
  const [notice, setNotice] = useState("");


  const submit = async (e) => {
    e.preventDefault();
    if (!username || !password) return;
    setLoading(true);
    setError("");
    const { data, error: rpcError } = await supabase.rpc("verify_login", { p_username: username, p_password: password });
    setLoading(false);
    if (rpcError) { setError("حصل خطأ في الاتصال بالسيرفر"); return; }
    if (data === true) { onSuccess(username); } else { setError("اسم المستخدم أو كلمة المرور غير صحيحة"); }
  };

  return (
    <div dir="ltr" className="lh-page">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
        .lh-page .mono { font-family:'IBM Plex Mono',monospace; }
        .lh-page { --gold:#f0c85a; --muted:#8b8b95; position:relative; width:100%; min-height:100vh; background:#050505;
          color:#eee; overflow:hidden; display:flex; align-items:center; justify-content:center; padding:24px;
          font-family:'IBM Plex Sans Arabic',system-ui,-apple-system,"Segoe UI",sans-serif; }
        .lh-page *, .lh-page *::before, .lh-page *::after { box-sizing:border-box; }
        .lh-lighthouse { position:absolute; left:6vw; bottom:0; width:110px; height:70vh; }
        .lh-lighthouse svg { width:100%; height:100%; display:block; }
        .lh-lamp { position:absolute; left:50%; top:calc(30% - 4px); width:0; height:0; }
        .lh-beam { position:absolute; left:0; top:-90px; width:90vw; height:180px; transform-origin:0 50%;
          background:linear-gradient(90deg, rgba(255,214,120,.85), rgba(255,190,80,.25) 45%, transparent 90%);
          clip-path:polygon(0 47%, 100% 0, 100% 100%, 0 53%); filter:blur(3px); mix-blend-mode:screen;
          animation:lh-sweep 6s ease-in-out infinite; pointer-events:none; }
        @keyframes lh-sweep { 0%,100%{transform:rotate(-7deg)} 50%{transform:rotate(5deg)} }
        .lh-glow { position:absolute; left:-30px; top:-30px; width:60px; height:60px; border-radius:50%;
          background:radial-gradient(circle,#fff3c4,rgba(255,200,90,.5) 40%,transparent 70%);
          animation:lh-pulse 3s ease-in-out infinite; }
        @keyframes lh-pulse { 50%{opacity:.6; transform:scale(1.2)} }
        .lh-card { position:relative; z-index:2; width:100%; max-width:360px; margin-left:12vw; text-align:left;
          background:#111114; border:1px solid #26262c; border-radius:16px; padding:32px 28px;
          animation:lh-lit 6s ease-in-out infinite; }
        @keyframes lh-lit { 50%{ box-shadow:0 0 60px rgba(240,200,90,.18); border-color:#4a4022 } }
        .lh-eyebrow { font-size:11px; letter-spacing:.2em; color:var(--gold); margin-bottom:12px; }
        .lh-card h1 { font-size:32px; line-height:1.1; margin:0 0 6px; font-weight:700; }
        .lh-sub { color:var(--muted); font-size:14px; margin:0 0 24px; }
        .lh-card label { display:block; font-size:12px; color:var(--muted); margin:14px 0 6px; }
        .lh-field { position:relative; }
        .lh-card input[type=text], .lh-card input[type=password] { width:100%; padding:12px 14px; background:#0a0a0c;
          color:#eee; border:1px solid #2a2a31; border-radius:10px; font-size:14px; outline:none; transition:border-color .2s; }
        .lh-card input[type=text]:focus, .lh-card input[type=password]:focus { border-color:var(--gold); }
        .lh-toggle { position:absolute; right:10px; top:50%; transform:translateY(-50%); background:none; border:0;
          color:var(--muted); font-size:12px; cursor:pointer; }
        .lh-row { display:flex; justify-content:space-between; align-items:center; margin:16px 0 20px;
          font-size:13px; color:var(--muted); }
        .lh-row label { margin:0; display:flex; gap:6px; align-items:center; font-size:13px; }
        .lh-row a, .lh-foot a { color:var(--gold); text-decoration:none; cursor:pointer; }
        .lh-submit { width:100%; padding:13px; border:0; border-radius:10px; cursor:pointer; background:var(--gold);
          color:#1a1405; font-weight:700; font-size:15px; display:flex; align-items:center; justify-content:center; gap:8px; }
        .lh-submit:hover { filter:brightness(1.08); }
        .lh-submit:disabled { opacity:.6; cursor:wait; }
        .lh-foot { text-align:center; margin:18px 0 0; font-size:13px; color:var(--muted); }
        .lh-error { color:#ff6b6b; font-size:13px; text-align:center; margin:12px 0 0; }
        .lh-notice { color:var(--gold); font-size:13px; text-align:center; margin:12px 0 0; }
        @media (max-width:760px) {
          .lh-card { margin-left:0; margin-top:26vh; }
          .lh-lighthouse { left:50%; transform:translateX(-50%); width:70px; height:34vh; top:0; bottom:auto; }
          .lh-beam { width:70vh; opacity:.6; }
        }
        @media (prefers-reduced-motion:reduce) { .lh-beam,.lh-glow,.lh-card { animation:none } }
      `}</style>

      <div className="lh-lighthouse" aria-hidden="true">
        <svg viewBox="0 0 110 400" preserveAspectRatio="xMidYMax meet">
          <rect x="44" y="90" width="22" height="10" fill="#222" />
          <rect x="40" y="70" width="30" height="20" fill="#ddd" opacity=".9" />
          <polygon points="55,50 38,70 72,70" fill="#c33" />
          <polygon points="42,100 68,100 82,400 28,400" fill="#e8e8e8" />
          <polygon points="38,190 72,190 76,250 34,250" fill="#111" />
          <polygon points="30,320 80,320 82,400 28,400" fill="#111" />
        </svg>
        <div className="lh-lamp"><div className="lh-glow" /><div className="lh-beam" /></div>
      </div>

      <form onSubmit={submit} className="lh-card">
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22 }}>
          <CostLineMark size={44} />
          <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: 0.4, color: "#fff" }}>Cost<span style={{ color: "#f0c85a" }}>Line</span></span>
        </div>
        <div className="lh-eyebrow">MEMBER ACCESS</div>
        <h1>Welcome back.</h1>
        <p className="lh-sub">Sign in to continue your journey</p>

        <label htmlFor="lh-user">Username</label>
        <input id="lh-user" type="text" autoFocus value={username} onChange={(e) => setUsername(e.target.value)}
               placeholder="Enter your username" autoComplete="username" />

        <label htmlFor="lh-pass">Password</label>
        <div className="lh-field">
          <input id="lh-pass" type={showPw ? "text" : "password"} value={password}
                 onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password"
                 autoComplete="current-password" />
          <button type="button" className="lh-toggle" onClick={() => setShowPw((s) => !s)}>
            {showPw ? "Hide" : "View"}
          </button>
        </div>

        <div className="lh-row">
          <label>
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Remember me
          </label>
          <a onClick={() => setNotice("Contact your administrator to reset your password.")}>Forgot password?</a>
        </div>

        <button type="submit" disabled={loading} className="lh-submit">
          {loading ? <Loader2 size={16} className="animate-spin" /> : null}
          Sign in
        </button>

        {error && <p className="lh-error">{error}</p>}
        {notice && !error && <p className="lh-notice">{notice}</p>}

        <p className="lh-foot">
          New here? <a onClick={() => setNotice("Accounts are created by your administrator.")}>Create an account</a>
        </p>
      </form>

      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 5 }}>
        <AppFooter variant="login" />
      </div>
    </div>
  );
}

export default function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [currentUsername, setCurrentUsername] = useState("");
  // اسم تبويب المتصفح — يُضبط من هنا حتى لو index.html لسه بالاسم القديم
  useEffect(() => {
    document.title = "CostLine";
    try {
      let link = document.querySelector("link[rel~='icon']");
      if (!link) { link = document.createElement("link"); link.rel = "icon"; document.head.appendChild(link); }
      link.type = "image/svg+xml";
      link.href = "data:image/svg+xml," + encodeURIComponent(COSTLINE_MARK_SVG);
    } catch (e) { /* ignore */ }
  }, []);
  if (!authenticated) {
    return <LoginScreen onSuccess={(username) => { setCurrentUsername(username); setAuthenticated(true); }} />;
  }
  return <ContractingApp currentUsername={currentUsername} onLogout={() => { setAuthenticated(false); setCurrentUsername(""); }} />;
}
