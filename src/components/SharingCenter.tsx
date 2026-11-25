import { useCallback, useEffect, useState } from "react";
import { mySharedItems, shareItem, unshareItem, SHAREABLE_TABLES, type ShareableTable } from "../lib/membershipClient";
import { useSharedItems } from "../lib/sharedItems";
import { grantMusicTrack, revokeMusicGrant, listMyMusicGrants, listMusicSharedWithMe } from "../lib/firebaseService";
import { resolveParticipantPid } from "../lib/participants";

type Mine = Record<ShareableTable, any[]>;
const LABEL: Record<ShareableTable, string> = { milestones: "لحظات", date_plans: "خطط مواعيد", memories: "ذكريات", letters: "رسائل", couple_questions: "أسئلة", celebration_cards: "كروت" };
const friendly = (e: string) => /not in the owner personal space/.test(e) ? "العنصر لسه ما اتحفظش صح. جرّب تحفظه تاني وبعدين شاركه."
  : /not linked|partner not in/.test(e) ? "لازم تكونوا مربوطين عشان تشاركوا."
  : /in progress/.test(e) ? "فيه تغيير جاري، جرّب بعد شوية." : "المشاركة ما تمّتش، جرّب تاني.";
const MEDIA = ["photos", "photo", "url", "videoUrl", "video_url", "audioCapsuleUrl", "videoCapsuleUrl", "musicUrl"];
const isImg = (u: string) => /^data:image|\.(png|jpe?g|gif|webp|avif)(\?|$)/i.test(u);
const isVid = (u: string) => /^data:video|\.(mp4|webm|mov)(\?|$)/i.test(u);
const isAud = (u: string) => /^data:audio|\.(mp3|wav|ogg|m4a)(\?|$)/i.test(u);
function Media({ r }: { r: any }) {
  const urls: string[] = MEDIA.flatMap((f) => (Array.isArray(r[f]) ? r[f] : r[f] ? [r[f]] : [])).filter((u) => typeof u === "string" && u);
  return (<div className="mt-2 space-y-2">{urls.map((u, i) => isVid(u) ? <video key={i} src={u} controls className="max-h-40 w-full rounded" /> : isAud(u) ? <audio key={i} src={u} controls className="w-full" /> : isImg(u) ? <img key={i} src={u} alt="" className="max-h-40 rounded" /> : null)}</div>);
}
const FIELD_AR: Record<string, string> = { description: "الوصف", content: "المحتوى", sweetMessage: "رسالة حلوة", letter: "الخطاب", notes: "ملاحظات", location: "المكان", date: "التاريخ", dateTime: "التاريخ والوقت", subject: "الموضوع", category: "النوع", text: "النص", answers: "الإجابات" };
const FIELDS = ["description", "content", "sweetMessage", "letter", "notes", "location", "date", "dateTime", "subject", "category", "text", "answers"];
const show = (v: any) => (Array.isArray(v) ? v.map((x) => (typeof x === "object" ? JSON.stringify(x) : String(x))).join("، ") : String(v));
const titleOf = (r: any) => String(r.title || r.subject || r.text || r.partnerName || r.id || "").slice(0, 60);

/** Owner picks which personal items the partner can see. A share counts as done only after the server confirms the authoritative row (share_create checks it). Partner items show read-only below. */
export default function SharingCenter({ mine, personalCoupleId, enabled, getCards, getMusic, partnerUsername }: { mine: Mine; personalCoupleId: string; enabled: boolean; getCards?: () => any[]; getMusic?: () => any[]; partnerUsername?: string }) {
  const [open, setOpen] = useState(false);
  const [granted, setGranted] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const { shared, refresh } = useSharedItems(enabled && open);
  const [musicGranted, setMusicGranted] = useState<Set<string>>(new Set());
  const [musicFromPartner, setMusicFromPartner] = useState<any[]>([]);
  const loadMusic = useCallback(async () => {
    try { setMusicGranted(new Set(await listMyMusicGrants())); setMusicFromPartner(await listMusicSharedWithMe()); } catch (e) { console.warn("music share load failed:", e); }
  }, []);
  useEffect(() => { if (open && enabled && getMusic) void loadMusic(); }, [open, enabled, getMusic, loadMusic]);
  const toggleMusic = async (id: string) => {
    setBusy("music|" + id); setMsg("");
    try {
      if (musicGranted.has(id)) await revokeMusicGrant(id);
      else { const pid = partnerUsername ? await resolveParticipantPid(partnerUsername) : null; if (!pid) throw new Error("no partner pid"); await grantMusicTrack(id, pid); }
      await loadMusic();
    } catch (e) { console.warn("music share failed:", e); setMsg("مشاركة الأغنية ما تمّتش. تأكد إن الأغنية اتحفظت وإنكم مربوطين، وجرّب تاني."); }
    setBusy("");
  };
  const key = (t: string, id: string) => `${t}|${id}`;
  const load = useCallback(async () => {
    const r = await mySharedItems();
    if (r.ok && Array.isArray(r.data?.data)) setGranted(new Set(r.data.data.map((x: any) => key(x.table, x.itemId))));
  }, []);
  useEffect(() => { if (open && enabled) void load(); }, [open, enabled, load]);
  if (!enabled || !personalCoupleId) return null;

  const toggle = async (t: ShareableTable, id: string) => {
    const k = key(t, id); setBusy(k); setMsg("");
    const on = granted.has(k);
    const r: any = on ? await unshareItem(t, id) : await shareItem(t, id);
    if (!r.ok) { console.warn("share failed:", r.error); setMsg(friendly(String(r.error))); if (r.status === 409) { await load(); refresh(); } } else await load(); // state comes from the server list, never from the click
    setBusy("");
  };
  const cards = open && getCards ? getCards() : [];
  const all: Mine = { ...mine, celebration_cards: cards };
  const own = SHAREABLE_TABLES.flatMap((t) => (all[t] || []).filter((r) => r.coupleId === personalCoupleId).map((r) => ({ t, r })));
  const theirs = SHAREABLE_TABLES.flatMap((t) => (shared[t] || []).map((r: any) => ({ t, r })));

  return (
    <>
      <button data-testid="sharing-open" onClick={() => setOpen(true)} className="fixed bottom-4 left-4 z-[60] rounded-full bg-rose-500 px-4 py-2 text-sm text-white shadow-lg">المشاركة</button>
      {open && (
        <div dir="rtl" data-testid="sharing-panel" className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" onClick={() => setOpen(false)}>
          <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-4 text-slate-800" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between"><h2 className="font-bold">اختار اللي شريكك يشوفه</h2><button onClick={() => setOpen(false)} aria-label="close">✕</button></div>
            <p className="mb-3 text-xs text-slate-500">كل حاجة خاصة بيك لحد ما تشاركها. الشات مش جزء من الاختيار.</p>
            {msg && <p role="alert" className="mb-2 rounded bg-red-50 p-2 text-sm text-red-700">{msg}</p>}
            {own.length === 0 && <p className="text-sm text-slate-500">مفيش عناصر خاصة بيك لسه.</p>}
            <ul className="space-y-1">
              {own.map(({ t, r }) => { const k = key(t, r.id); const on = granted.has(k); return (
                <li key={k} className="flex items-center justify-between rounded border p-2 text-sm">
                  <span>{LABEL[t]} · {titleOf(r)}</span>
                  <button data-testid={`share-${k}`} disabled={busy === k} onClick={() => toggle(t, r.id)} className={`rounded px-3 py-1 text-xs ${on ? "bg-rose-500 text-white" : "bg-slate-100"}`}>{busy === k ? "..." : on ? "مشارك" : "خاص"}</button>
                </li>); })}
            </ul>
            {getMusic && (<>
              <h3 className="mt-4 mb-1 font-bold">أغانيك</h3>
              <ul className="space-y-1">{getMusic().filter((m: any) => (m.coupleId || m.couple_id) === personalCoupleId).map((m: any) => (
                <li key={m.id} className="flex items-center justify-between rounded border p-2 text-sm"><span>{String(m.title || m.id).slice(0, 60)}</span>
                  <button data-testid={`share-music-${m.id}`} disabled={busy === "music|" + m.id} onClick={() => toggleMusic(m.id)} className={`rounded px-3 py-1 text-xs ${musicGranted.has(m.id) ? "bg-rose-500 text-white" : "bg-slate-100"}`}>{musicGranted.has(m.id) ? "مشارك" : "خاص"}</button></li>))}</ul>
              {musicFromPartner.length > 0 && (<><h3 className="mt-3 mb-1 font-bold">أغاني شريكك (سماع فقط)</h3><ul className="space-y-1">{musicFromPartner.map((m: any) => (<li key={m.id} data-testid="music-from-partner" className="rounded border bg-rose-50 p-2 text-sm"><div>{String(m.title || m.id).slice(0, 60)}</div>{typeof m.url === "string" && m.url && <audio src={m.url} controls className="mt-1 w-full" />}</li>))}</ul></>)}
            </>)}
            <h3 className="mt-4 mb-1 font-bold">اللي شريكك شاركه معاك (قراءة فقط)</h3>
            {theirs.length === 0 && <p className="text-sm text-slate-500">مفيش حاجة مشاركة معاك.</p>}
            <ul className="space-y-1">{theirs.map(({ t, r }) => (<li key={key(t, r.id)} data-testid="shared-from-partner" className="rounded border bg-rose-50 p-2 text-sm"><details><summary>{LABEL[t]} · {titleOf(r)} <span className="text-xs text-rose-600">من شريكك · قراءة فقط</span></summary><dl className="mt-2 space-y-1">{FIELDS.filter((f) => r[f] != null && r[f] !== "").map((f) => (<div key={f}><dt className="text-xs text-slate-500">{FIELD_AR[f] || f}</dt><dd className="whitespace-pre-wrap break-words">{show(r[f])}</dd></div>))}</dl><Media r={r} /></details></li>))}</ul>
            <button className="mt-3 text-xs text-slate-400 underline" onClick={refresh}>تحديث</button>
          </div>
        </div>
      )}
    </>
  );
}
