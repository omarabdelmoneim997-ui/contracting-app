import React, { useState, useMemo, useEffect } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import {
  Building2, LayoutGrid, Hammer, Receipt, FileStack, Wallet, Plus, X,
  TrendingUp, TrendingDown, ChevronDown, ChevronRight, Package, HardHat,
  Landmark, CircleDollarSign, CheckCircle2, Clock, Ruler, Users, Loader2,
  Trash2, Pencil, Printer, Banknote,
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

/* ---------------------------------- app ---------------------------------- */

function ContractingApp() {
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
  const [view, setView] = useState("project"); // 'project' | 'finance'
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState(null);

  const [activeProjectId, setActiveProjectId] = useState("p1");
  const [tab, setTab] = useState("dashboard");
  const [showNewProject, setShowNewProject] = useState(false);

  useEffect(() => {
    async function loadAll() {
      const [projRes, wiRes, costRes, extRes, colRes, treRes, fpRes, ftRes, custRes, ccRes] = await Promise.all([
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
      ]);

      const firstError = [projRes, wiRes, costRes, extRes, colRes, treRes, fpRes, ftRes, custRes, ccRes].find((r) => r.error);
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
    const { error } = await supabase.from("costs").insert([{ id: c.id, project_id: c.projectId, work_item_id: c.workItemId, custody_id: c.custodyId || null, type: c.type, description: c.desc, cost_level_1: c.costLevel1 || null, cost_level_2: c.costLevel2 || null, qty: c.qty, unit: c.unit, price: c.price, date: c.date }]);
    if (error) { alert("حصل خطأ أثناء حفظ التكلفة: " + error.message); return; }
    setCosts((prev) => [...prev, c]);
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
    const { error } = await supabase.from("work_items").delete().eq("id", id);
    if (error) { alert("حصل خطأ أثناء حذف بند العمل: " + error.message); return; }
    setWorkItems((prev) => prev.filter((w) => w.id !== id));
    setCosts((prev) => prev.filter((c) => c.workItemId !== id));
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

  const project = projects.find((p) => p.id === activeProjectId);
  const pWorkItems = workItems.filter((w) => w.projectId === activeProjectId);
  const pCosts = costs.filter((c) => c.projectId === activeProjectId);
  const pExtracts = extracts.filter((e) => e.projectId === activeProjectId);
  const pTreasuryEntries = treasuryEntries.filter((t) => t.projectId === activeProjectId);
  const pCustodies = custodies.filter((c) => c.projectId === activeProjectId);
  const pCollections = collections.filter((c) => c.projectId === activeProjectId);

  const totals = useMemo(() => {
    const budgetTotal = pWorkItems.reduce((s, w) => s + w.qty * w.price, 0);
    const actualTotal = pCosts.reduce((s, c) => s + c.qty * c.price, 0);
    const extractsTotal = pExtracts.reduce((s, e) => s + e.amount, 0);
    const collectedTotal = pCollections.reduce((s, c) => s + c.amount, 0);
    const netProfit = collectedTotal - actualTotal;
    return { budgetTotal, actualTotal, extractsTotal, collectedTotal, netProfit };
  }, [pWorkItems, pCosts, pExtracts, pCollections]);

  const tabs = [
    { key: "dashboard", label: "لوحة التحكم", icon: LayoutGrid },
    { key: "items", label: "بنود الأعمال", icon: Ruler },
    { key: "costs", label: "التكاليف", icon: Hammer },
    { key: "extracts", label: "المستخلصات", icon: FileStack },
    { key: "custody", label: "تصفية العهد", icon: Landmark },
    { key: "treasury", label: "الخزينة", icon: Banknote },
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
                onClick={() => { setActiveProjectId(p.id); setView("project"); }}
                className={`w-full text-right px-3 py-2 rounded-lg text-sm transition flex items-center justify-between ${
                  p.id === activeProjectId && view === "project"
                    ? "bg-[#E8672C] text-white font-bold"
                    : "text-white/70 hover:bg-white/5"
                }`}
              >
                <span className="truncate">{p.name}</span>
                {p.id === activeProjectId && view === "project" && <ChevronRight size={14} />}
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
          <div className="text-[11px] text-white/40 font-semibold mb-2 px-1">عام</div>
          <button
            onClick={() => setView("finance")}
            className={`w-full text-right px-3 py-2.5 rounded-lg text-sm flex items-center gap-2.5 transition ${
              view === "finance" ? "bg-white/10 text-white font-bold" : "text-white/60 hover:bg-white/5 hover:text-white/90"
            }`}
          >
            <Users size={16} className={view === "finance" ? "text-[#E8672C]" : ""} />
            حسابات السلف والتمويلات
          </button>
        </div>

        <div className="mt-6 px-4">
          <div className="text-[11px] text-white/40 font-semibold mb-2 px-1">الأقسام</div>
          <nav className="space-y-1">
            {tabs.map((t) => {
              const Icon = t.icon;
              const active = tab === t.key && view === "project";
              return (
                <button
                  key={t.key}
                  onClick={() => { setTab(t.key); setView("project"); }}
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
          {project && view === "project" && (
            <button
              onClick={() => deleteProject(project.id)}
              className="w-full mt-2 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-[#F0918A] hover:bg-[#C1453B]/10 flex items-center justify-center gap-1.5 transition"
            >
              <Trash2 size={12} /> حذف هذا المشروع
            </button>
          )}
        </div>
      </aside>

      {/* MAIN */}
      <main className="flex-1 paper-bg min-h-screen">
        {view === "finance" ? (
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
        ) : (
          <>
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

          <div className="grid grid-cols-5 gap-3 mt-5">
            <StatCard label="ميزانية بنود الأعمال" value={money(totals.budgetTotal)} icon={Wallet} color="#1E2530" />
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
        </header>

        <div className="p-8">
          {tab === "dashboard" && (
            <Dashboard totals={totals} pWorkItems={pWorkItems} pCosts={pCosts} pExtracts={pExtracts} collections={pCollections} />
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
        </div>
        </>
        )}
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
                    <div className="text-[11px] text-[#9A9483]">{c.costLevel1 || "بدون مستوى أول"}{c.costLevel2 ? ` · ${c.costLevel2}` : ""} · {meta?.label} · {c.date}</div>
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
          <h2 className="font-bold text-[#1E2530] text-lg">بنود الأعمال</h2>
          <p className="text-xs text-[#9A9483] mt-1">دليل البنود التي يتم اختيارها عند تسجيل التكاليف</p>
        </div>
        <button onClick={() => setOpen((o) => !o)} className="px-3 py-2 rounded-lg bg-[#1E2530] text-white text-sm font-semibold flex items-center gap-1.5 hover:bg-[#2b3543] transition">
          <Plus size={15} /> إضافة بند عمل
        </button>
      </div>

      {open && (
        <div className="bg-white rounded-xl border border-[#E1DACB] p-4">
          <div className="max-w-md">
            <Field label="اسم / كود بند العمل" value={form.name} onChange={(v) => setForm({ name: v })} placeholder="مثال: أعمال الحفر والردم" />
          </div>
          <div className="flex justify-end mt-3">
            <button onClick={submit} className="px-4 py-2 rounded-lg bg-[#E8672C] text-white text-sm font-semibold hover:bg-[#C8511E] transition">حفظ البند</button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-[#E1DACB] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#F6F3EA] text-[#6B7280] text-[12px]">
              <th className="text-right py-3 px-4 font-semibold">بند العمل</th>
              <th className="text-right py-3 px-4 font-semibold">التكلفة الفعلية</th>
              <th className="text-right py-3 px-4 font-semibold w-20"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EFEBDF]">
            {pWorkItems.map((w) => {
              const actual = pCosts.filter((c) => c.workItemId === w.id).reduce((s, c) => s + c.qty * c.price, 0);
              const isEditing = editId === w.id;
              if (isEditing) {
                return (
                  <tr key={w.id} className="bg-[#FAF8F2]">
                    <td className="py-2 px-2">
                      <input value={editForm.name} onChange={(e) => setEditForm({ name: e.target.value })} className="w-full border border-[#E1DACB] rounded-md px-2 py-1.5 text-sm outline-none focus:border-[#E8672C]" />
                    </td>
                    <td className="py-3 px-4 mono text-[#9A9483]">{money(actual)}</td>
                    <td className="py-2 px-2">
                      <div className="flex gap-1.5 justify-end">
                        <button onClick={saveEdit} className="px-2.5 py-1.5 rounded-md bg-[#3F7D63] text-white text-xs font-semibold hover:bg-[#356A54] transition">حفظ</button>
                        <button onClick={() => setEditId(null)} className="px-2.5 py-1.5 rounded-md bg-[#E1DACB] text-[#1E2530] text-xs font-semibold hover:bg-[#D8D3C7] transition">إلغاء</button>
                      </div>
                    </td>
                  </tr>
                );
              }
              return (
                <tr key={w.id} className="hover:bg-[#FAF8F2] transition group">
                  <td className="py-3 px-4 font-semibold text-[#1E2530]">{w.name}</td>
                  <td className="py-3 px-4 mono font-bold">{money(actual)}</td>
                  <td className="py-3 px-4">
                    <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition">
                      <button onClick={() => startEdit(w)} title="تعديل" className="p-1.5 rounded-md text-[#6B7280] hover:bg-[#E1DACB] hover:text-[#1E2530] transition"><Pencil size={14} /></button>
                      <button onClick={() => onDeleteWorkItem(w.id)} title="حذف" className="p-1.5 rounded-md text-[#C1453B] hover:bg-[#C1453B]/10 transition"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {pWorkItems.length === 0 && (
              <tr><td colSpan={3} className="text-center py-8 text-[#9A9483]">لا توجد بنود أعمال بعد.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* --------------------------------- costs --------------------------------- */

function CostsTab({ pCosts, pWorkItems, activeProjectId, onAddCost, onUpdateCost, onDeleteCost }) {
  const [filter, setFilter] = useState("الكل");
  const [open, setOpen] = useState(false);
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
        <h2 className="font-bold text-[#1E2530] text-lg">التكاليف</h2>
        <button onClick={() => (open ? cancelForm() : setOpen(true))} className="px-3 py-2 rounded-lg bg-[#1E2530] text-white text-sm font-semibold flex items-center gap-1.5 hover:bg-[#2b3543] transition">
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
          {editId && (
            <div className="col-span-3 text-xs font-semibold text-[#E8672C] bg-[#E8672C]/10 rounded-md px-3 py-1.5">جاري تعديل تكلفة موجودة</div>
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
            {editId && <button onClick={cancelForm} className="px-4 py-2 rounded-lg bg-[#E1DACB] text-[#1E2530] text-sm font-semibold hover:bg-[#D8D3C7] transition">إلغاء</button>}
            <button onClick={submit} className="px-4 py-2 rounded-lg bg-[#E8672C] text-white text-sm font-semibold hover:bg-[#C8511E] transition">{editId ? "حفظ التعديل" : "حفظ التكلفة"}</button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-[#E1DACB] overflow-hidden">
        {pivot.length === 0 && (
          <div className="text-center py-10 text-[#9A9483] text-sm">لا توجد تكاليف في هذا التصنيف.</div>
        )}

        {pivot.map((g) => {
          const isCollapsed = collapsedGroups[g.key];
          return (
            <div key={g.key} className="border-b border-[#EFEBDF] last:border-b-0">
              <button
                onClick={() => toggleGroup(g.key)}
                className="w-full flex items-center justify-between px-4 py-3 bg-[#F6F3EA] hover:bg-[#EFEAD9] transition text-right"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <ChevronDown size={15} className={`text-[#6B7280] shrink-0 transition-transform ${isCollapsed ? "-rotate-90" : ""}`} />
                  <span className={`font-bold truncate ${g.unassigned ? "text-[#9A9483]" : "text-[#1E2530]"}`}>{g.name}</span>
                  <span className="text-[11px] text-[#9A9483] mono shrink-0">({g.subItems.length} بند فرعي)</span>
                </div>
                <span className="font-bold mono text-[#1E2530] shrink-0">{money(g.groupTotal)}</span>
              </button>

              {!isCollapsed && (
                <div>
                  {g.subItems.map((it) => {
                    const itemKey = g.key + "::" + it.desc;
                    const itemOpen = expandedItems[itemKey];
                    return (
                      <div key={itemKey} className="border-t border-[#EFEBDF]">
                        <button
                          onClick={() => toggleItem(itemKey)}
                          className="w-full flex items-center justify-between px-4 py-2.5 pr-9 hover:bg-[#FAF8F2] transition text-right"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <ChevronRight size={13} className={`text-[#9A9483] shrink-0 transition-transform ${itemOpen ? "rotate-90" : ""}`} />
                            <span className="text-sm font-semibold text-[#1E2530] truncate">{it.desc}</span>
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
                            <span className="text-[11px] text-[#9A9483] mono shrink-0">{it.entries.length} حركة</span>
                          </div>
                          <div className="flex items-center gap-4 shrink-0">
                            {it.unit && <span className="text-[11px] text-[#9A9483] mono">{fmt(it.totalQty)} {it.unit}</span>}
                            <span className="text-sm font-bold mono">{money(it.totalValue)}</span>
                          </div>
                        </button>

                        {itemOpen && (
                          <div className="bg-[#FAF8F2] px-4 pr-14 py-2.5 space-y-1.5">
                            {it.entries.map((c) => (
                              <div key={c.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-[#E1DACB] text-sm group">
                                <div className="flex items-center gap-3 min-w-0 text-[#6B7280]">
                                  <span className="mono text-xs text-[#9A9483] shrink-0">{c.date}</span>
                                  <span className="shrink-0 mono">{fmt(c.qty)} {c.unit} × {fmt(c.price)}</span>
                                  {(c.costLevel1 || c.costLevel2) && (
                                    <span className="text-[11px] text-[#9A9483] truncate">
                                      {c.costLevel1}{c.costLevel2 ? ` · ${c.costLevel2}` : ""}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="font-bold mono">{money(c.qty * c.price)}</span>
                                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                                    <button onClick={() => startEdit(c)} title="تعديل" className="p-1 rounded-md text-[#6B7280] hover:bg-[#E1DACB] hover:text-[#1E2530] transition"><Pencil size={13} /></button>
                                    <button onClick={() => onDeleteCost(c.id)} title="حذف" className="p-1 rounded-md text-[#C1453B] hover:bg-[#C1453B]/10 transition"><Trash2 size={13} /></button>
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
          <div className="flex items-center justify-between px-4 py-3 bg-[#1E2530] text-white">
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
  @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&family=IBM+Plex+Mono:wght@500;600&display=swap');
  * { box-sizing: border-box; }
  body { font-family: 'Cairo', sans-serif; color: #1E2530; margin: 0; padding: 32px; direction: rtl; }
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
      <div class="brand-badge">O</div>
      <div class="brand-name">Omar ERP</div>
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
    <span>Omar ERP — نظام إدارة المقاولات</span>
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
        <h2 className="font-bold text-[#1E2530] text-lg">التحصيلات والمستخلصات</h2>
        <button onClick={() => (open ? cancelForm() : setOpen(true))} className="px-3 py-2 rounded-lg bg-[#1E2530] text-white text-sm font-semibold flex items-center gap-1.5 hover:bg-[#2b3543] transition">
          <Plus size={15} /> مستخلص جديد
        </button>
      </div>

      <div className="bg-white rounded-xl border border-[#E1DACB] overflow-hidden">
        <div className="w-full flex items-center justify-between px-5 py-4">
          <div>
            <div className="font-bold text-[#1E2530]">تحصيلات عامة (بدون مستخلص)</div>
            <div className="text-[11px] text-[#9A9483] mt-0.5">مبالغ استُلمت من العميل قبل عمل مستخلص (دفعة مقدمة، دفعة تحت الحساب... إلخ)</div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-[11px] text-[#9A9483]">الإجمالي</div>
              <div className="font-bold mono text-[#3F7D63]">{money(generalTotal)}</div>
            </div>
            <button onClick={() => setShowGeneralForm((o) => !o)} className="px-3 py-2 rounded-lg bg-[#3F7D63] text-white text-xs font-semibold hover:bg-[#356A54] transition flex items-center gap-1.5">
              <Plus size={14} /> تحصيل جديد
            </button>
          </div>
        </div>

        {showGeneralForm && (
          <div className="border-t border-[#EFEBDF] px-5 py-4 bg-[#FAF8F2] grid grid-cols-4 gap-2 items-end">
            <Field label="المبلغ" value={generalForm.amount} onChange={(v) => setGeneralForm((f) => ({ ...f, amount: v }))} type="number" small />
            <Field label="التاريخ" value={generalForm.date} onChange={(v) => setGeneralForm((f) => ({ ...f, date: v }))} type="date" small />
            <SelectField label="طريقة التحصيل" value={generalForm.method} onChange={(v) => setGeneralForm((f) => ({ ...f, method: v }))} options={[{ value: "تحويل بنكي", label: "تحويل بنكي" }, { value: "شيك", label: "شيك" }, { value: "نقدي", label: "نقدي" }]} small />
            <Field label="ملاحظة (اختياري)" value={generalForm.note} onChange={(v) => setGeneralForm((f) => ({ ...f, note: v }))} placeholder="مثال: دفعة مقدمة" small />
            <div className="col-span-4 flex justify-end">
              <button onClick={submitGeneralCollection} className="px-4 py-2 rounded-lg bg-[#3F7D63] text-white text-sm font-semibold hover:bg-[#356A54] transition">حفظ التحصيل</button>
            </div>
          </div>
        )}

        <div className="border-t border-[#EFEBDF] px-5 py-4 space-y-1.5">
          {generalCollections.length === 0 && <div className="text-xs text-[#9A9483] py-1">لا توجد تحصيلات عامة مسجّلة بعد.</div>}
          {generalCollections.map((c) => (
            <div key={c.id} className="flex items-center justify-between bg-[#FAF8F2] rounded-lg px-3 py-2 border border-[#E1DACB] text-sm group/coll">
              <span className="text-[#6B7280]">{c.method} · {c.date}{c.note ? ` · ${c.note}` : ""}</span>
              <div className="flex items-center gap-2">
                <span className="font-bold mono text-[#3F7D63]">{money(c.amount)}</span>
                <button onClick={() => onDeleteCollection(c.id)} title="حذف التحصيل" className="p-1 rounded-md text-[#C1453B] opacity-0 group-hover/coll:opacity-100 hover:bg-[#C1453B]/10 transition"><Trash2 size={13} /></button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {open && (
        <div className="bg-white rounded-xl border border-[#E1DACB] p-4 grid grid-cols-4 gap-3">
          {editId && (
            <div className="col-span-4 text-xs font-semibold text-[#E8672C] bg-[#E8672C]/10 rounded-md px-3 py-1.5">جاري تعديل مستخلص موجود</div>
          )}
          <Field label="رقم المستخلص" value={form.number} onChange={(v) => setForm((f) => ({ ...f, number: v }))} type="number" />
          <Field label="التاريخ" value={form.date} onChange={(v) => setForm((f) => ({ ...f, date: v }))} type="date" />
          <Field label="نسبة الإنجاز %" value={form.percentage} onChange={(v) => setForm((f) => ({ ...f, percentage: v }))} type="number" />
          <Field label="قيمة المستخلص" value={form.amount} onChange={(v) => setForm((f) => ({ ...f, amount: v }))} type="number" />
          <div className="col-span-4 flex justify-end gap-2">
            {editId && <button onClick={cancelForm} className="px-4 py-2 rounded-lg bg-[#E1DACB] text-[#1E2530] text-sm font-semibold hover:bg-[#D8D3C7] transition">إلغاء</button>}
            <button onClick={submit} className="px-4 py-2 rounded-lg bg-[#E8672C] text-white text-sm font-semibold hover:bg-[#C8511E] transition">{editId ? "حفظ التعديل" : "حفظ المستخلص"}</button>
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
            <div key={e.id} className="bg-white rounded-xl border border-[#E1DACB] overflow-hidden group">
              <div className="w-full flex items-center justify-between px-5 py-4 hover:bg-[#FAF8F2] transition">
                <button onClick={() => setExpanded(isOpen ? null : e.id)} className="flex items-center gap-4 flex-1 text-right">
                  <div className="w-10 h-10 rounded-lg bg-[#E8672C]/10 flex items-center justify-center text-[#E8672C] font-extrabold mono text-sm">#{e.number}</div>
                  <div className="text-right">
                    <div className="font-bold text-[#1E2530]">مستخلص رقم {e.number}</div>
                    <div className="text-[11px] text-[#9A9483] mono">{e.date} · نسبة إنجاز {e.percentage}%</div>
                  </div>
                </button>
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
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                    <button onClick={() => printExtract(e)} title="طباعة" className="p-1.5 rounded-md text-[#6B7280] hover:bg-[#E1DACB] hover:text-[#1E2530] transition"><Printer size={14} /></button>
                    <button onClick={() => startEdit(e)} title="تعديل" className="p-1.5 rounded-md text-[#6B7280] hover:bg-[#E1DACB] hover:text-[#1E2530] transition"><Pencil size={14} /></button>
                    <button onClick={() => onDeleteExtract(e.id)} title="حذف" className="p-1.5 rounded-md text-[#C1453B] hover:bg-[#C1453B]/10 transition"><Trash2 size={14} /></button>
                  </div>
                  <button onClick={() => setExpanded(isOpen ? null : e.id)}>
                    <ChevronDown size={16} className={`text-[#9A9483] transition-transform ${isOpen ? "rotate-180" : ""}`} />
                  </button>
                </div>
              </div>

              {isOpen && (
                <div className="border-t border-[#EFEBDF] px-5 py-4 bg-[#FAF8F2]">
                  <div className="text-xs font-semibold text-[#6B7280] mb-2">التحصيلات</div>
                  <div className="space-y-1.5 mb-4">
                    {eColls.map((c) => (
                      <div key={c.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-[#E1DACB] text-sm group/coll">
                        <span className="text-[#6B7280]">{c.method} · {c.date}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-bold mono text-[#3F7D63]">{money(c.amount)}</span>
                          <button onClick={() => onDeleteCollection(c.id)} title="حذف التحصيل" className="p-1 rounded-md text-[#C1453B] opacity-0 group-hover/coll:opacity-100 hover:bg-[#C1453B]/10 transition"><Trash2 size={13} /></button>
                        </div>
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
        <h2 className="font-bold text-[#1E2530] text-lg">خزينة المشروع</h2>
        <button onClick={() => (open ? cancelForm() : setOpen(true))} className="px-3 py-2 rounded-lg bg-[#1E2530] text-white text-sm font-semibold flex items-center gap-1.5 hover:bg-[#2b3543] transition">
          <Plus size={15} /> حركة جديدة
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-xl border border-[#E1DACB] p-4">
          <div className="text-[11px] text-[#9A9483] mb-1">رصيد بداية الخزينة (يدوي)</div>
          {editingOpening ? (
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={openingInput}
                onChange={(e) => setOpeningInput(e.target.value)}
                className="border border-[#E1DACB] rounded-md px-2 py-1.5 text-sm outline-none focus:border-[#E8672C] w-40 mono"
              />
              <button onClick={saveOpening} className="px-3 py-1.5 rounded-md bg-[#3F7D63] text-white text-xs font-semibold hover:bg-[#356A54] transition">حفظ</button>
              <button onClick={() => { setEditingOpening(false); setOpeningInput(String(openingBalance || 0)); }} className="px-3 py-1.5 rounded-md bg-[#E1DACB] text-[#1E2530] text-xs font-semibold hover:bg-[#D8D3C7] transition">إلغاء</button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div className="font-bold mono text-lg text-[#1E2530]">{money(openingBalance)}</div>
              <button onClick={() => setEditingOpening(true)} className="p-1 rounded-md text-[#6B7280] hover:bg-[#E1DACB] hover:text-[#1E2530] transition"><Pencil size={13} /></button>
            </div>
          )}
        </div>
        <div className="bg-[#1E2530] rounded-xl p-4 text-white">
          <div className="text-[11px] text-white/50 mb-1">رصيد الخزينة الحالي</div>
          <div className={`font-bold mono text-lg ${currentBalance < 0 ? "text-[#F0918A]" : "text-white"}`}>{money(currentBalance)}</div>
        </div>
      </div>

      {open && (
        <div className="bg-white rounded-xl border border-[#E1DACB] p-4 grid grid-cols-4 gap-3">
          {editId && (
            <div className="col-span-4 text-xs font-semibold text-[#E8672C] bg-[#E8672C]/10 rounded-md px-3 py-1.5">جاري تعديل حركة موجودة</div>
          )}
          <Field label="التاريخ" value={form.date} onChange={(v) => setForm((f) => ({ ...f, date: v }))} type="date" />
          <SelectField label="نوع الحركة" value={form.type} onChange={(v) => setForm((f) => ({ ...f, type: v }))} options={[{ value: "ايداع", label: "إيداع" }, { value: "صرف", label: "صرف" }]} />
          <Field label="المبلغ" value={form.amount} onChange={(v) => setForm((f) => ({ ...f, amount: v }))} type="number" />
          <Field label="ملاحظة (اختياري)" value={form.note} onChange={(v) => setForm((f) => ({ ...f, note: v }))} placeholder="مثال: تحويل من الحساب الرئيسي" />
          <div className="col-span-4 flex justify-end gap-2">
            {editId && <button onClick={cancelForm} className="px-4 py-2 rounded-lg bg-[#E1DACB] text-[#1E2530] text-sm font-semibold hover:bg-[#D8D3C7] transition">إلغاء</button>}
            <button onClick={submit} className="px-4 py-2 rounded-lg bg-[#E8672C] text-white text-sm font-semibold hover:bg-[#C8511E] transition">{editId ? "حفظ التعديل" : "حفظ الحركة"}</button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-[#E1DACB] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#F6F3EA] text-[#6B7280] text-[12px]">
              <th className="text-right py-3 px-4 font-semibold">التاريخ</th>
              <th className="text-right py-3 px-4 font-semibold">رصيد أول اليوم</th>
              <th className="text-right py-3 px-4 font-semibold">إجمالي الإيداع</th>
              <th className="text-right py-3 px-4 font-semibold">إجمالي الصرف</th>
              <th className="text-right py-3 px-4 font-semibold">رصيد آخر اليوم</th>
              <th className="text-right py-3 px-4 font-semibold w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EFEBDF]">
            {[...rows].reverse().map((r) => {
              const isOpen = expandedDate === r.date;
              return (
                <React.Fragment key={r.date}>
                  <tr className="hover:bg-[#FAF8F2] transition cursor-pointer" onClick={() => setExpandedDate(isOpen ? null : r.date)}>
                    <td className="py-3 px-4 font-semibold text-[#1E2530] mono">{r.date}</td>
                    <td className="py-3 px-4 mono">{money(r.dayOpening)}</td>
                    <td className="py-3 px-4 mono text-[#3F7D63] font-bold">{r.deposits > 0 ? "+" + money(r.deposits) : "—"}</td>
                    <td className="py-3 px-4 mono text-[#C1453B] font-bold">{r.withdrawals > 0 ? "-" + money(r.withdrawals) : "—"}</td>
                    <td className="py-3 px-4 mono font-bold">{money(r.dayClose)}</td>
                    <td className="py-3 px-4">
                      <ChevronDown size={15} className={`text-[#9A9483] transition-transform ${isOpen ? "rotate-180" : ""}`} />
                    </td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={6} className="bg-[#FAF8F2] px-4 py-3">
                        <div className="space-y-1.5">
                          {r.entries.map((t) => (
                            <div key={t.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-[#E1DACB] text-sm group">
                              <div className="flex items-center gap-2">
                                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${t.type === "ايداع" ? "bg-[#3F7D63]/10 text-[#3F7D63]" : "bg-[#C1453B]/10 text-[#C1453B]"}`}>{t.type === "ايداع" ? "إيداع" : "صرف"}</span>
                                <span className="text-[#6B7280]">{t.note || "—"}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className={`font-bold mono ${t.type === "ايداع" ? "text-[#3F7D63]" : "text-[#C1453B]"}`}>{money(t.amount)}</span>
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                                  <button onClick={(e) => { e.stopPropagation(); startEdit(t); }} title="تعديل" className="p-1 rounded-md text-[#6B7280] hover:bg-[#E1DACB] hover:text-[#1E2530] transition"><Pencil size={13} /></button>
                                  <button onClick={(e) => { e.stopPropagation(); onDeleteEntry(t.id); }} title="حذف" className="p-1 rounded-md text-[#C1453B] hover:bg-[#C1453B]/10 transition"><Trash2 size={13} /></button>
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
              <tr><td colSpan={6} className="text-center py-8 text-[#9A9483]">لا توجد حركات خزينة مسجّلة بعد.</td></tr>
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
          <h2 className="font-bold text-[#1E2530] text-xl">حسابات السلف والتمويلات</h2>
          <p className="text-[12px] text-[#9A9483] mt-1">حساب مستقل لكل شخص/جهة — غير مرتبط بمشروع معين</p>
        </div>
        <button onClick={() => setShowAddPerson((o) => !o)} className="px-3 py-2 rounded-lg bg-[#1E2530] text-white text-sm font-semibold flex items-center gap-1.5 hover:bg-[#2b3543] transition">
          <Plus size={15} /> إضافة شخص/جهة
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-[#E1DACB] p-4">
          <div className="text-[11px] text-[#9A9483] mb-1">إجمالي التمويلات والسلف</div>
          <div className="font-bold mono text-lg text-[#1E2530]">{money(grandFinancing)}</div>
        </div>
        <div className="bg-white rounded-xl border border-[#E1DACB] p-4">
          <div className="text-[11px] text-[#9A9483] mb-1">إجمالي السداد</div>
          <div className="font-bold mono text-lg text-[#3F7D63]">{money(grandRepaid)}</div>
        </div>
        <div className="bg-[#1E2530] rounded-xl p-4 text-white">
          <div className="text-[11px] text-white/50 mb-1">إجمالي المستحق</div>
          <div className={`font-bold mono text-lg ${grandBalance > 0 ? "text-[#E8AA6C]" : "text-white"}`}>{money(grandBalance)}</div>
        </div>
      </div>

      {showAddPerson && (
        <div className="bg-white rounded-xl border border-[#E1DACB] p-4 grid grid-cols-3 gap-3">
          <Field label="الاسم" value={newPersonName} onChange={setNewPersonName} placeholder="اسم الشخص أو الجهة" />
          <Field label="ملاحظة (اختياري)" value={newPersonNote} onChange={setNewPersonNote} placeholder="مثال: صديق، مصدر تمويل خارجي" />
          <div className="flex items-end">
            <button onClick={addPerson} className="px-4 py-2 rounded-lg bg-[#E8672C] text-white text-sm font-semibold hover:bg-[#C8511E] transition">حفظ</button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-[#E1DACB] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#F6F3EA] text-[#6B7280] text-[12px]">
              <th className="text-right py-3 px-4 font-semibold">الاسم</th>
              <th className="text-right py-3 px-4 font-semibold">إجمالي التمويلات والسلف</th>
              <th className="text-right py-3 px-4 font-semibold">إجمالي السداد</th>
              <th className="text-right py-3 px-4 font-semibold">الرصيد المستحق</th>
              <th className="text-right py-3 px-4 font-semibold w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EFEBDF]">
            {summaries.map((p) => (
              <tr key={p.id} className="hover:bg-[#FAF8F2] transition cursor-pointer group" onClick={() => setSelectedId(p.id)}>
                <td className="py-3 px-4 font-semibold text-[#1E2530]">{p.name}{p.note ? <span className="text-[#9A9483] font-normal text-xs"> — {p.note}</span> : null}</td>
                <td className="py-3 px-4 mono">{money(p.financingTotal)}</td>
                <td className="py-3 px-4 mono text-[#3F7D63]">{money(p.repaidTotal)}</td>
                <td className={`py-3 px-4 mono font-bold ${p.balance > 0 ? "text-[#D6A23C]" : "text-[#3F7D63]"}`}>{money(p.balance)}</td>
                <td className="py-3 px-4">
                  <button
                    onClick={(e) => { e.stopPropagation(); onDeletePerson(p.id); }}
                    title="حذف الحساب"
                    className="p-1.5 rounded-md text-[#C1453B] opacity-0 group-hover:opacity-100 hover:bg-[#C1453B]/10 transition"
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
            {summaries.length === 0 && (
              <tr><td colSpan={5} className="text-center py-8 text-[#9A9483]">لا يوجد أشخاص/جهات مسجّلة بعد.</td></tr>
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
      <button onClick={onBack} className="text-sm font-semibold text-[#6B7280] hover:text-[#1E2530] flex items-center gap-1 transition">
        <ChevronRight size={16} /> رجوع لكل الحسابات
      </button>

      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold text-[#1E2530] text-xl">{person.name}</h2>
          {person.note && <p className="text-[12px] text-[#9A9483] mt-1">{person.note}</p>}
        </div>
        <button onClick={() => (open ? cancelForm() : setOpen(true))} className="px-3 py-2 rounded-lg bg-[#1E2530] text-white text-sm font-semibold flex items-center gap-1.5 hover:bg-[#2b3543] transition">
          <Plus size={15} /> حركة جديدة
        </button>
      </div>

      <div className="bg-[#1E2530] rounded-xl p-4 text-white inline-block">
        <div className="text-[11px] text-white/50 mb-1">الرصيد المستحق حاليًا</div>
        <div className={`font-bold mono text-lg ${currentBalance > 0 ? "text-[#E8AA6C]" : "text-white"}`}>{money(currentBalance)}</div>
      </div>

      {open && (
        <div className="bg-white rounded-xl border border-[#E1DACB] p-4 grid grid-cols-4 gap-3">
          {editId && (
            <div className="col-span-4 text-xs font-semibold text-[#E8672C] bg-[#E8672C]/10 rounded-md px-3 py-1.5">جاري تعديل حركة موجودة</div>
          )}
          <Field label="التاريخ" value={form.date} onChange={(v) => setForm((f) => ({ ...f, date: v }))} type="date" />
          <SelectField label="نوع الحركة" value={form.type} onChange={(v) => setForm((f) => ({ ...f, type: v }))} options={FINANCE_TX_TYPES.map((t) => ({ value: t.key, label: t.key }))} />
          <Field label="المبلغ" value={form.amount} onChange={(v) => setForm((f) => ({ ...f, amount: v }))} type="number" />
          <Field label="البيان (اختياري)" value={form.note} onChange={(v) => setForm((f) => ({ ...f, note: v }))} placeholder="وصف الحركة" />
          <div className="col-span-4 flex justify-end gap-2">
            {editId && <button onClick={cancelForm} className="px-4 py-2 rounded-lg bg-[#E1DACB] text-[#1E2530] text-sm font-semibold hover:bg-[#D8D3C7] transition">إلغاء</button>}
            <button onClick={submit} className="px-4 py-2 rounded-lg bg-[#E8672C] text-white text-sm font-semibold hover:bg-[#C8511E] transition">{editId ? "حفظ التعديل" : "حفظ الحركة"}</button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-[#E1DACB] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#F6F3EA] text-[#6B7280] text-[12px]">
              <th className="text-right py-3 px-4 font-semibold">التاريخ</th>
              <th className="text-right py-3 px-4 font-semibold">البيان</th>
              <th className="text-right py-3 px-4 font-semibold">نوع الحركة</th>
              <th className="text-right py-3 px-4 font-semibold">المبلغ</th>
              <th className="text-right py-3 px-4 font-semibold">الرصيد بعد الحركة</th>
              <th className="text-right py-3 px-4 font-semibold w-20"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EFEBDF]">
            {displayRows.map((t) => {
              const meta = FINANCE_TX_TYPES.find((m) => m.key === t.type);
              return (
                <tr key={t.id} className="hover:bg-[#FAF8F2] transition group">
                  <td className="py-3 px-4 mono text-[#1E2530]">{t.date}</td>
                  <td className="py-3 px-4 text-[#6B7280]">{t.note || "—"}</td>
                  <td className="py-3 px-4">
                    <span className="text-[11px] font-semibold px-2 py-1 rounded-md" style={{ backgroundColor: meta?.color + "18", color: meta?.color }}>{t.type}</span>
                  </td>
                  <td className={`py-3 px-4 mono font-bold ${t.type === "سداد" ? "text-[#3F7D63]" : "text-[#1E2530]"}`}>{t.type === "سداد" ? "-" : "+"}{money(t.amount)}</td>
                  <td className="py-3 px-4 mono font-bold">{money(t.balanceAfter)}</td>
                  <td className="py-3 px-4">
                    <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition">
                      <button onClick={() => startEdit(t)} title="تعديل" className="p-1.5 rounded-md text-[#6B7280] hover:bg-[#E1DACB] hover:text-[#1E2530] transition"><Pencil size={14} /></button>
                      <button onClick={() => onDeleteTransaction(t.id)} title="حذف" className="p-1.5 rounded-md text-[#C1453B] hover:bg-[#C1453B]/10 transition"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {displayRows.length === 0 && (
              <tr><td colSpan={6} className="text-center py-8 text-[#9A9483]">لا توجد حركات مسجّلة بعد.</td></tr>
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
          <h2 className="font-bold text-[#1E2530] text-xl">تصفية العهد</h2>
          <p className="text-[12px] text-[#9A9483] mt-1">عُهد مربوطة بهذا المشروع فقط</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowCategories((o) => !o)} className="px-3 py-2 rounded-lg bg-white border border-[#E1DACB] text-[#1E2530] text-sm font-semibold hover:border-[#1E2530]/40 transition">
            إدارة التصنيفات
          </button>
          <button onClick={() => setOpen((o) => !o)} className="px-3 py-2 rounded-lg bg-[#1E2530] text-white text-sm font-semibold flex items-center gap-1.5 hover:bg-[#2b3543] transition">
            <Plus size={15} /> عهدة جديدة
          </button>
        </div>
      </div>

      {showCategories && (
        <div className="bg-white rounded-xl border border-[#E1DACB] p-4 space-y-3">
          <div className="text-sm font-bold text-[#1E2530]">تصنيفات التصفية العامة (تستخدم للبنود اللي مش مرتبطة ببند عمل)</div>
          <div className="flex flex-wrap gap-2">
            {custodyCategories.map((cat) => (
              <span key={cat.id} className="flex items-center gap-1.5 text-xs font-semibold bg-[#F6F3EA] border border-[#E1DACB] rounded-full px-3 py-1.5 text-[#1E2530]">
                {cat.name}
                <button onClick={() => onDeleteCategory(cat.id)} className="text-[#C1453B] hover:opacity-70"><X size={12} /></button>
              </span>
            ))}
            {custodyCategories.length === 0 && <span className="text-xs text-[#9A9483]">لا توجد تصنيفات بعد.</span>}
          </div>
          <div className="flex gap-2">
            <input
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder="اسم تصنيف جديد، مثال: مصروفات موقع"
              className="flex-1 border border-[#E1DACB] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#E8672C] transition"
            />
            <button onClick={addCategory} className="px-4 py-2 rounded-lg bg-[#E8672C] text-white text-sm font-semibold hover:bg-[#C8511E] transition">إضافة</button>
          </div>
        </div>
      )}

      {open && (
        <div className="bg-white rounded-xl border border-[#E1DACB] p-4 grid grid-cols-4 gap-3">
          <Field label="اسم الشخص" value={form.personName} onChange={(v) => setForm((f) => ({ ...f, personName: v }))} placeholder="اسم مستلم العهدة" />
          <Field label="المبلغ المستلم" value={form.amount} onChange={(v) => setForm((f) => ({ ...f, amount: v }))} type="number" />
          <Field label="تاريخ الاستلام" value={form.date} onChange={(v) => setForm((f) => ({ ...f, date: v }))} type="date" />
          <Field label="ملاحظات (اختياري)" value={form.notes} onChange={(v) => setForm((f) => ({ ...f, notes: v }))} placeholder="سبب العهدة" />
          <div className="col-span-4 flex justify-end gap-2">
            <button onClick={() => { resetForm(); setOpen(false); }} className="px-4 py-2 rounded-lg bg-[#E1DACB] text-[#1E2530] text-sm font-semibold hover:bg-[#D8D3C7] transition">إلغاء</button>
            <button onClick={submitCustody} className="px-4 py-2 rounded-lg bg-[#E8672C] text-white text-sm font-semibold hover:bg-[#C8511E] transition">حفظ العهدة</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-xl border border-[#E1DACB] p-4">
          <div className="text-[11px] text-[#9A9483] mb-1">إجمالي العُهد المفتوحة</div>
          <div className="font-bold mono text-lg text-[#D6A23C]">{money(totalOpen)}</div>
        </div>
        <div className="bg-white rounded-xl border border-[#E1DACB] p-4">
          <div className="text-[11px] text-[#9A9483] mb-1">عدد العُهد المصفاة</div>
          <div className="font-bold mono text-lg text-[#3F7D63]">{closedCustodies.length}</div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-[#E1DACB] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#F6F3EA] text-[#6B7280] text-[12px]">
              <th className="text-right py-3 px-4 font-semibold">الشخص</th>
              <th className="text-right py-3 px-4 font-semibold">تاريخ الاستلام</th>
              <th className="text-right py-3 px-4 font-semibold">المبلغ المستلم</th>
              <th className="text-right py-3 px-4 font-semibold">الحالة</th>
              <th className="text-right py-3 px-4 font-semibold w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EFEBDF]">
            {[...openCustodies, ...closedCustodies].map((c) => (
              <tr key={c.id} className="hover:bg-[#FAF8F2] transition cursor-pointer group" onClick={() => setSelectedId(c.id)}>
                <td className="py-3 px-4 font-semibold text-[#1E2530]">
                  {c.personName}
                  {c.notes ? <span className="text-[#9A9483] font-normal text-xs"> — {c.notes}</span> : null}
                </td>
                <td className="py-3 px-4 mono text-[#6B7280]">{c.dateGiven}</td>
                <td className="py-3 px-4 mono font-bold">{money(c.amountGiven)}</td>
                <td className="py-3 px-4">
                  <span className={`text-[11px] font-semibold px-2 py-1 rounded-md flex items-center gap-1 w-fit ${c.status === "مصفاة" ? "bg-[#3F7D63]/10 text-[#3F7D63]" : "bg-[#D6A23C]/10 text-[#D6A23C]"}`}>
                    {c.status === "مصفاة" ? <CheckCircle2 size={12} /> : <Clock size={12} />}
                    {c.status}
                  </span>
                </td>
                <td className="py-3 px-4">
                  <button
                    onClick={(e) => { e.stopPropagation(); onDeleteCustody(c.id); }}
                    title="حذف العهدة"
                    className="p-1.5 rounded-md text-[#C1453B] opacity-0 group-hover:opacity-100 hover:bg-[#C1453B]/10 transition"
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
            {pCustodies.length === 0 && (
              <tr><td colSpan={5} className="text-center py-8 text-[#9A9483]">لا توجد عُهد مسجّلة بعد لهذا المشروع.</td></tr>
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
      <button onClick={onBack} className="text-sm font-semibold text-[#6B7280] hover:text-[#1E2530] flex items-center gap-1 transition">
        <ChevronRight size={16} /> رجوع لكل العُهد
      </button>

      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold text-[#1E2530] text-xl">{custody.personName}</h2>
          <p className="text-[12px] text-[#9A9483] mt-1">
            استُلمت بتاريخ {custody.dateGiven}{custody.notes ? ` — ${custody.notes}` : ""}
          </p>
        </div>
        {!isLocked && (
          <button onClick={() => (open ? cancelForm() : setOpen(true))} className="px-3 py-2 rounded-lg bg-[#1E2530] text-white text-sm font-semibold flex items-center gap-1.5 hover:bg-[#2b3543] transition">
            <Plus size={15} /> بند تصفية جديد
          </button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-[#E1DACB] p-4">
          <div className="text-[11px] text-[#9A9483] mb-1">المبلغ المستلم</div>
          <div className="font-bold mono text-lg text-[#1E2530]">{money(custody.amountGiven)}</div>
        </div>
        <div className="bg-white rounded-xl border border-[#E1DACB] p-4">
          <div className="text-[11px] text-[#9A9483] mb-1">إجمالي المُصفّى</div>
          <div className="font-bold mono text-lg text-[#6B7280]">{money(totalSettled)}</div>
        </div>
        <div className="bg-[#1E2530] rounded-xl p-4 text-white">
          <div className="text-[11px] text-white/50 mb-1">{remaining >= 0 ? "المتبقي عند الشخص" : "مستحق للشخص (صرف أكتر من العهدة)"}</div>
          <div className={`font-bold mono text-lg ${remaining !== 0 ? "text-[#E8AA6C]" : "text-white"}`}>{money(Math.abs(remaining))}</div>
        </div>
      </div>

      {open && !isLocked && (
        <div className="bg-white rounded-xl border border-[#E1DACB] p-4 grid grid-cols-3 gap-3">
          {editId && (
            <div className="col-span-3 text-xs font-semibold text-[#E8672C] bg-[#E8672C]/10 rounded-md px-3 py-1.5">جاري تعديل بند موجود</div>
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
            {editId && <button onClick={cancelForm} className="px-4 py-2 rounded-lg bg-[#E1DACB] text-[#1E2530] text-sm font-semibold hover:bg-[#D8D3C7] transition">إلغاء</button>}
            <button onClick={submitLine} className="px-4 py-2 rounded-lg bg-[#E8672C] text-white text-sm font-semibold hover:bg-[#C8511E] transition">{editId ? "حفظ التعديل" : "إضافة البند"}</button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-[#E1DACB] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#F6F3EA] text-[#6B7280] text-[12px]">
              <th className="text-right py-3 px-4 font-semibold">التاريخ</th>
              <th className="text-right py-3 px-4 font-semibold">البند</th>
              <th className="text-right py-3 px-4 font-semibold">بند العمل</th>
              <th className="text-right py-3 px-4 font-semibold">المبلغ</th>
              {!isLocked && <th className="text-right py-3 px-4 font-semibold w-20"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EFEBDF]">
            {lines.map((c) => (
              <tr key={c.id} className="hover:bg-[#FAF8F2] transition group">
                <td className="py-3 px-4 mono text-[#1E2530]">{c.date}</td>
                <td className="py-3 px-4 text-[#6B7280]">{c.desc}</td>
                <td className="py-3 px-4 text-[#6B7280]">{pWorkItems.find((w) => w.id === c.workItemId)?.name || "—"}</td>
                <td className="py-3 px-4 mono font-bold">{money(c.qty * c.price)}</td>
                {!isLocked && (
                  <td className="py-3 px-4">
                    <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition">
                      <button onClick={() => startEdit(c)} title="تعديل" className="p-1.5 rounded-md text-[#6B7280] hover:bg-[#E1DACB] hover:text-[#1E2530] transition"><Pencil size={14} /></button>
                      <button onClick={() => onDeleteCost(c.id)} title="حذف" className="p-1.5 rounded-md text-[#C1453B] hover:bg-[#C1453B]/10 transition"><Trash2 size={14} /></button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {lines.length === 0 && (
              <tr><td colSpan={isLocked ? 4 : 5} className="text-center py-8 text-[#9A9483]">لا توجد بنود تصفية مسجّلة بعد.</td></tr>
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

/* -------------------------------- login screen ------------------------------- */

function useLiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function LoginScreen({ onSuccess }) {
  const now = useLiveClock();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const dateStr = now.toLocaleDateString("en-US", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
  const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });

  const submit = async (e) => {
    e.preventDefault();
    if (!username || !password) return;
    setLoading(true);
    setError("");
    const { data, error: rpcError } = await supabase.rpc("verify_login", { p_username: username, p_password: password });
    setLoading(false);
    if (rpcError) { setError("حصل خطأ في الاتصال بالسيرفر"); return; }
    if (data === true) { onSuccess(); } else { setError("اسم المستخدم أو كلمة المرور غير صحيحة"); }
  };

  return (
    <div dir="rtl" style={{ fontFamily: "'Cairo', sans-serif" }} className="w-full min-h-screen flex items-center justify-center relative overflow-hidden" >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
        .mono { font-family: 'IBM Plex Mono', monospace; }
        .login-bg {
          background-color: #14212C;
          background-image:
            radial-gradient(circle at 20% 20%, rgba(232,103,44,0.08), transparent 40%),
            linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px);
          background-size: 100% 100%, 28px 28px, 28px 28px;
        }
      `}</style>
      <div className="login-bg absolute inset-0" />

      <div className="relative z-10 flex flex-col items-center px-6 w-full">
        <div className="flex flex-col items-center mb-2">
          <div className="w-16 h-16 rounded-2xl bg-[#E8672C] flex items-center justify-center mb-4 shadow-lg shadow-[#E8672C]/20">
            <Building2 size={30} className="text-white" strokeWidth={2.2} />
          </div>
          <h1 className="text-white text-3xl font-extrabold tracking-wide">Omar ERP</h1>
          <div className="w-10 h-[2px] bg-[#E8672C] my-3" />
          <p className="text-white/50 text-xs font-semibold tracking-[0.2em]">CONTRACTING MANAGEMENT</p>
        </div>

        <form onSubmit={submit} dir="ltr" className="bg-[#F6F3EA] rounded-2xl p-7 w-full max-w-sm mt-8 shadow-2xl text-left">
          <label className="block text-[12px] font-bold text-[#1E2530] mb-1.5">Username</label>
          <input
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter your username"
            dir="ltr"
            className="w-full border-0 rounded-lg px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#E8672C]/40 transition bg-white mb-4 text-[#1E2530] placeholder:text-[#B5AF9E] text-left"
          />
          <label className="block text-[12px] font-bold text-[#1E2530] mb-1.5">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            dir="ltr"
            className="w-full border-0 rounded-lg px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#E8672C]/40 transition bg-white mb-2 text-[#1E2530] placeholder:text-[#B5AF9E] text-left"
          />
          {error && <div className="text-[#C1453B] text-xs font-semibold mb-3 mt-1">{error}</div>}
          <button
            type="submit"
            disabled={loading}
            className="w-full mt-3 py-2.5 rounded-lg bg-[#1E2530] text-white font-bold text-sm hover:bg-[#2b3543] transition disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : null}
            Sign In
          </button>
        </form>
      </div>

      <div dir="ltr" className="absolute bottom-0 inset-x-0 flex items-center justify-between px-6 py-4 z-10">
        <span className="text-white/50 text-[11px]">© {now.getFullYear()} Omar ERP. All rights reserved.</span>
        <span className="mono bg-[#1E2530] border border-white/10 rounded-md px-3 py-1.5 text-[#E8AA6C] text-[12px] font-semibold tracking-wide">
          {dateStr}, {timeStr}
        </span>
      </div>
    </div>
  );
}

export default function App() {
  const [authenticated, setAuthenticated] = useState(false);
  if (!authenticated) {
    return <LoginScreen onSuccess={() => setAuthenticated(true)} />;
  }
  return <ContractingApp />;
}
