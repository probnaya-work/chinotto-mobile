/* eslint-disable */
// TEST SUPPORT ONLY — never imported by product code, never bundled.
//
// This is `chinotto-data.js` from the Claude Design project
// `5e00e5ee-ab7f-4897-aaf8-56a067e2ade9`, verbatim, converted from ESM to CommonJS at the
// bottom and otherwise untouched. Its own header reads:
//
//     "Chinotto prototype data + model helpers (shared by desktop and mobile)"
//
// It is vendored so that `record/model/*` can be diffed against the actual drawn behaviour
// rather than against someone's reading of it. When the prototype changes, replace this file
// and the parity tests will say exactly what moved.
//
// Do not fix anything in here. Divergence from it is a finding, not a bug in this file.

const NOW = new Date(2026, 8, 19, 17, 10).getTime();
const MS_H = 3600e3, MS_D = 864e5;
const MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
const MONTH_FULL = ['january','february','march','april','may','june','july','august','september','october','november','december'];
const DAYS = ['sun','mon','tue','wed','thu','fri','sat'];
const D = (y, m, d, h = 12, mi = 0) => new Date(y, m - 1, d, h, mi).getTime();

let seq = 0;
const mk = (at, text, extra = {}) => ({ id: 'f' + (++seq), at, text, kind: 'text', ...extra });

const fmtTime = t => { const d = new Date(t); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
const fmtDur = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
const fullDate = t => { const d = new Date(t); return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };
const dayMonth = t => { const d = new Date(t); return `${d.getDate()} ${MONTHS[d.getMonth()]}`; };
const monthLabel = (t, now, forceYear) => { const d = new Date(t), n = new Date(now); return (!forceYear && d.getFullYear() === n.getFullYear()) ? MONTHS[d.getMonth()] : `${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };
const sameDay = (a, b) => { const x = new Date(a), y = new Date(b); return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate(); };
const dayLabel = (t, now) => { if (sameDay(t, now)) return 'today'; if (sameDay(t, now - MS_D)) return 'yesterday'; const d = new Date(t); if (now - t < 7 * MS_D) return `${DAYS[d.getDay()]} ${d.getDate()}`; if (new Date(now).getFullYear() === d.getFullYear()) return `${d.getDate()} ${MONTHS[d.getMonth()]}`; return fullDate(t); };
const ago = (t, now) => { const m = Math.round((now - t) / (30.4 * MS_D)); if (m < 1) return 'this month'; if (m < 12) return m + ' months'; const y = Math.floor(m / 12), r = m % 12; return y + ' year' + (y > 1 ? 's' : '') + (r ? ` ${r} months` : ''); };
const sourceOf = f => f.kind === 'voice' ? 'voice' : f.kind === 'url' ? (f.source === 'shared' ? 'shared' : 'typed') : 'typed';
const displayText = f => f.text || (f.kind === 'url' ? (f.title || f.url) : '');
const firstLine = f => { const t = f.kind === 'quote' && !f.text ? f.quote : displayText(f); return t.split('\n')[0].slice(0, 90); };
const hay = f => [f.text, f.title, f.domain, f.quote].filter(Boolean).join(' ').toLowerCase();

// ---------- corpus ----------
const POOL = [
  'tomatoes, bread, the cheap olive oil, batteries AA','call about the deposit, ref 4471',"tanya's birthday is the 27th not the 26th",'why does every app want me to name the thing first','the sea was the colour of a bruise. not a nice one','ferry back is 16:40 not 16:00',"M's theory: everyone has one recipe they're insufferable about",'started the long thing about attention again. 4th attempt',"D's wedding. cried at the wrong part",'new folder for the flat stuff. deposit, inventory, the letter',"“folder” is such a physical word for something that isn't",'the shared folder has three versions of the same PDF and nobody will delete one','M keeps a folder of screenshots of arguments. terrifying. also smart.','one folder per client is how you end up with forty folders','radiator in the small room is cold at the bottom again. bleed it or call someone',"gas safety cert expires march. landlord's problem, my cold.",'rain all day. good.','dentist thursday 9:15','the word for the smell of rain on dry ground is petrichor and I refuse to use it','ran 5k, slowly, in the wrong shoes',"L's kid calls escalators “stairs that go”",'return the library books','milk',"the best sentence in the book is on page 212 and it's about a dog","if I don't write it down it didn't happen, apparently",'coffee with S postponed again','the printer needs the other cartridge, the one that costs more than the printer','buy a lamp. an actual lamp.','sleep was bad. no reason.',"it's not that I forget things, it's that I remember them at 2am",'train strike tuesday',"can't remember whether I already told K this story",'the bakery on the corner closed. there was no sign, just paper on the glass','a good day, for no particular reason','the meeting could have been a sentence','long walk, no phone, three ideas, forgot two','flight LH 1234 gate closes 10:05',"why is every “simple” tool a login wall first",'fix the wobbly chair','nobody tells you how much of adult life is waiting for a delivery','cancel the trial before the 14th','the light at 5pm in september is doing something','M was right about the soup',"renew passport. it expires in june. it's always june.",'pears. the hard kind',"a sentence I liked: “the opposite of talking isn't listening, it's waiting”","the plumber's name is Dario",'thinking about the thing again. the attention thing.','quiet','wrote 400 words, deleted 300, kept the wrong 100','good bread, bad knife',"someone on the train reading the same book. we didn't speak. correct.","the apartment smells like someone else's dinner",'ask about the invoice','the second coffee was a mistake','birthday present for P — the ceramics place',"a thought I don't have time for: notes are a form of hoping",'read less news','not today','the boiler makes a noise like it is deciding something','sorting photos is not remembering','two people at the next table having the same argument I had in 2019','walked past the old flat. the plant on the balcony is still alive, or replaced',
];
const VOICE_POOL = ['remind me the thing with the car is tuesday not wednesday','ok so the problem with the essay is the middle, the middle is just me clearing my throat','pick up the parcel from the shop with the blue door','I think the argument is actually about who does the remembering','the thing M said about soup, write that down properly later','no, sixteen forty, the ferry, tell her'];
const URL_POOL = [{ domain: 'nytimes.com', title: 'The Case Against Doing Things' }, { domain: 'aeon.co', title: 'Why boredom is good for you' }, { domain: 'youtube.com', title: 'How to sharpen a knife properly' }, { domain: 'en.wikipedia.org', title: 'Chinotto' }, { domain: 'newyorker.com', title: 'The Art of Forgetting' }];

function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

function buildCorpus() {
  seq = 0;
  const L1 = 'L1';
  const T = (h, mi) => D(2026, 9, 19, h, mi), Y = (h, mi) => D(2026, 9, 18, h, mi);
  const named = [
    mk(T(17, 2), 'tired'),
    mk(T(16, 48), '', { kind: 'url', url: 'https://www.theatlantic.com/ideas/archive/2026/09/second-brain-apps/', domain: 'theatlantic.com', title: 'Why Everyone Suddenly Wants a Second Brain', source: 'shared' }),
    mk(T(16, 20), "Notes on the onboarding call. They don't hate the guide, they hate being made to read it before they're allowed to type. Which means the fix isn't better copy.\n\nThree of the five said the same thing in different words: let me put something down first, explain later if I ask. One said she never asks. Nobody mentioned the illustrations, which cost a week.\n\nThe counter-argument from R is that people who skip the guide never find voice. Maybe. But the people who read the guide didn't find it either, they just knew it existed.\n\nProposal: remove the guide, put one sentence where the first fragment lands, watch what breaks for two weeks."),
    mk(T(15, 55), 'this, but the second half is the whole product problem', { kind: 'quote', quote: 'the tools promise to remember for you, and then quietly demand that you remember how to use them', domain: 'theatlantic.com' }),
    mk(T(15, 10), 'dinner friday — ask Lena if 8 works, otherwise sat'),
    mk(T(14, 31), 'ref four four seven one', { kind: 'voice', dur: 6 }),
    mk(T(11, 5), "Maybe the reason I keep abandoning tools is that they ask me to decide what a thing is before I've finished having it. Filing is a kind of premature judgment. I want somewhere to put the sentence and be allowed to find out later what it was.", { lineId: L1 }),
    mk(T(9, 31), "okay so the problem with the onboarding isn't that people don't understand it, it's that they don't want to be taught anything at nine in the morning, um, remove the guide entirely and see what breaks", { kind: 'voice', dur: 42 }),
    mk(T(9, 14), "the “digital garden” thing again. still don't buy it but the tending metaphor is fine", { kind: 'url', url: 'https://maggieappleton.com/garden-history', domain: 'maggieappleton.com', title: 'A Brief History & Ethos of the Digital Garden' }),
    mk(T(9, 12), 'ok'),
    mk(T(8, 40), 'K said “you always start over” — not wrong'),
    mk(Y(21, 5), "tags are a folder that's embarrassed about it — still true, still no better idea"),
    mk(Y(17, 30), 'pharmacy before 6'),
    mk(Y(13, 48), 'pasta water too salty again. less.'),
    mk(Y(14, 20), 'boiler guy — Tues between 12 and 3'),
    mk(Y(10, 2), "reread the 2023 note about premature judgment — apparently I've had this thought at least twice"),
    mk(D(2026, 9, 16, 21, 11), '“the map is not the territory” is doing a lot of work in that essay for a sentence nobody argues with'),
    mk(D(2026, 9, 12, 11, 3), 'tomatoes, bread, the cheap olive oil, batteries AA'),
    mk(D(2026, 9, 12, 18, 40), 'why does every app want me to name the thing first'),
    mk(D(2026, 9, 12, 22, 2), "tanya's birthday is the 27th not the 26th"),
    mk(D(2026, 9, 12, 9, 15), 'call about the deposit, ref 4471'),
    mk(D(2026, 9, 3, 12, 0), 'new folder for the flat stuff. deposit, inventory, the letter'),
    mk(D(2026, 9, 6, 23, 10), "“folder” is such a physical word for something that isn't"),
    mk(D(2026, 8, 14, 19, 30), 'the sea was the colour of a bruise. not a nice one'),
    mk(D(2026, 8, 15, 15, 5), 'ferry back is 16:40 not 16:00'),
    mk(D(2026, 8, 15, 15, 6), 'no, sixteen forty, the ferry, tell her', { kind: 'voice', dur: 9 }),
    mk(D(2026, 8, 16, 20, 40), "M's theory: everyone has one recipe they're insufferable about"),
    mk(D(2026, 7, 8, 10, 0), 'the shared folder has three versions of the same PDF and nobody will delete one'),
    mk(D(2026, 6, 21, 22, 15), 'M keeps a folder of screenshots of arguments. terrifying. also smart.'),
    mk(D(2026, 1, 9, 8, 30), 'radiator in the small room is cold at the bottom again. bleed it or call someone'),
    mk(D(2025, 11, 20, 12, 0), "gas safety cert expires march. landlord's problem, my cold."),
    mk(D(2025, 9, 3, 9, 40), '', { kind: 'quote', quote: '…the tools promise to remember for you, and then quietly demand that you remember how to use them', domain: 'theatlantic.com', url: 'https://www.theatlantic.com/ideas/archive/2025/09/second-brain/' }),
    mk(D(2025, 5, 2, 7, 50), 'started the long thing about attention again. 4th attempt'),
    mk(D(2025, 2, 11, 23, 0), 'one folder per client is how you end up with forty folders'),
    mk(D(2024, 11, 2, 8, 19), "same problem with tags. a tag is a folder that's embarrassed about it", { kind: 'voice', dur: 11, lineId: L1, transcriptCorrected: true }),
    mk(D(2024, 6, 14, 18, 0), 'finder folder called “sort later” now has 2,300 things in it', ),
    mk(D(2024, 6, 14, 18, 4), "filing feels like work and isn't", { lineId: L1 }),
    mk(D(2024, 3, 9, 21, 30), 'the second-brain crowd have rebuilt the filing cabinet and called it a garden', { kind: 'url', url: 'https://www.theatlantic.com/technology/archive/2024/03/second-brain/', domain: 'theatlantic.com', title: 'The Rise of the Second Brain' }),
    mk(D(2024, 3, 22, 12, 10), 'the article again. still annoyed, which probably means it is right about something', { kind: 'url', url: 'https://www.theatlantic.com/technology/archive/2024/03/second-brain/', domain: 'theatlantic.com', title: 'The Rise of the Second Brain' }),
    mk(D(2024, 1, 5, 10, 30), 'sorting is procrastination with a clear conscience', { lineId: L1 }),
    mk(D(2024, 5, 18, 16, 0), "D's wedding. cried at the wrong part"),
    mk(D(2023, 8, 20, 22, 45), 'the moment I name a thing I stop looking at it', { lineId: L1 }),
    mk(D(2023, 3, 14, 23, 41), "putting something in a folder means deciding what it is before I'm done thinking it", { lineId: L1, prevText: "putting something in a folder is deciding what it is before you're done thinking it", correctedAt: D(2023, 3, 14, 23, 43) }),
    mk(D(2023, 1, 9, 9, 0), 'new folder structure for the project. third one this year'),
    mk(D(2021, 4, 2, 10, 15), "first coffee outside since october. the cup was too hot and I didn't care"),
    mk(D(2021, 4, 6, 18, 0), 'vaccine slot 14 apr 11:20, bring the letter'),
    mk(D(2021, 3, 29, 23, 20), "idea: a notebook that doesn't ask what the note is", { lineId: L1 }),
    mk(D(2021, 3, 27, 16, 40), 'moved the desk to the window. worse light, better mood'),
    mk(D(2021, 3, 26, 21, 5), "…and I think what I actually miss isn't people, it's being interrupted by them, which is a weird thing to miss. the flat is quiet in a way that has a texture now, like it has been quiet long enough to become a material. I keep the radio on for the interruptions. that is what the radio is for, it turns out", { kind: 'voice', dur: 118 }),
    mk(D(2021, 3, 24, 19, 30), 'lockdown pasta count: 41'),
    mk(D(2021, 3, 22, 8, 0), 'no'),
    mk(D(2021, 2, 11, 18, 2), "the neighbour plays the same four bars every evening at six. I've started to wait for it"),
    mk(D(2021, 2, 18, 12, 30), 'ordered the wrong size again'),
    mk(D(2020, 12, 6, 15, 0), 'everyone is baking. I am not baking.'),
    mk(D(2020, 11, 10, 22, 0), 'a place to put sentences'),
  ];
  // filler
  const r = rng(7);
  const out = [...named];
  const P = { 2020: 0.4, 2021: 0.55, 2022: 0.3, 2023: 0.4, 2024: 0.6, 2025: 0.5, 2026: 0.6 };
  const used = {}; const pick = y => { const u = used[y] || (used[y] = new Set()); let i = Math.floor(r() * POOL.length); for (let k = 0; k < POOL.length && u.has(i); k++) i = (i + 1) % POOL.length; u.add(i); return POOL[i]; };
  for (let t = D(2020, 11, 11); t < D(2026, 9, 18); t += MS_D) {
    const y = new Date(t).getFullYear();
    if (r() > P[y]) continue;
    const n = 1 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const at = t + (7 + Math.floor(r() * 15)) * MS_H + Math.floor(r() * 60) * 60e3;
      const k = r();
      if (k < 0.07) out.push(mk(at, VOICE_POOL[Math.floor(r() * VOICE_POOL.length)], { kind: 'voice', dur: 4 + Math.floor(r() * 80) }));
      else if (k < 0.11) { const u = URL_POOL[Math.floor(r() * URL_POOL.length)]; out.push(mk(at, r() < 0.5 ? '' : pick(y), { kind: 'url', url: 'https://' + u.domain + '/', domain: u.domain, title: u.title })); }
      else out.push(mk(at, pick(y)));
    }
  }
  for (let i = 0; i < 17; i++) out.push(mk(D(2026, 9, 19, 7, 0) + Math.floor(r() * 440) * 60e3, pick('today')));
  out.sort((a, b) => b.at - a.at);
  return out;
}

const TRANSCRIPT = "right so the return thing — it should only come back if it can show me why, like the actual words, otherwise it's just the app being clever at me. and the same for the guesses, if it's guessing say so, put it in italics or whatever, don't dress it up as a fact. um. the other thing is the phone, I never want to read on the phone, I want to say something and put it down, so the phone should basically be this, the mic and the last few things and nothing else";
const transcriptAt = t => { const w = TRANSCRIPT.split(' '); return w.slice(0, Math.min(w.length, Math.floor(t * 2.6))).join(' '); };

let liveSeq = 0;
function makeFragment(text, at, extra = {}) {
  const f = { id: 'n' + (++liveSeq) + '_' + at, at, text, kind: 'text', ...extra };
  if (extra.kind) return f;
  const url = text.match(/^(https?:\/\/)?(([\w-]+\.)+[a-z]{2,})(\/\S*)?$/i);
  if (url) { f.kind = 'url'; f.url = text.startsWith('http') ? text : 'https://' + text; f.domain = url[2].replace(/^www\./, ''); f.title = null; f.text = ''; return f; }
  const q = text.match(/^[“"](.+)[”"]$/s);
  if (q) { f.kind = 'quote'; f.quote = q[1]; f.text = ''; }
  return f;
}

function parseAnchor(text, now) {
  const s = text.trim().toLowerCase();
  if (s === 'today' || s === 'now') return null;
  let m = s.match(/^([a-z]+)\s+(20\d\d)$/);
  if (m) { const mi = MONTHS.indexOf(m[1].slice(0, 3)); if (mi >= 0 && (MONTH_FULL[mi].startsWith(m[1]) || m[1].length === 3)) return { y: +m[2], m: mi }; }
  m = s.match(/^(20\d\d)$/);
  if (m) return { y: +m[1], m: -1 };
  return undefined;
}

// ---------- words ----------
const STOP = new Set("the a an and or but of to in on at for with is are was were be been it its this that these those i me my we you your he she they them his her our their as by from not no so if then than too very just about into over under again there here what which who whom when where why how do does did done have has had having um uh ok okay i'm i've it's that's don't".split(' '));
const stem = w => { let s = w.replace(/’/g, "'").replace(/'s$/, ''); if (s.length > 5) s = s.replace(/ing$/, ''); s = s.replace(/(edly|ed|es|ly)$/, ''); if (s.length > 3) s = s.replace(/s$/, ''); if (s.length > 4) s = s.replace(/e$/, ''); return s; };
const tokens = text => (String(text || '').toLowerCase().match(/[a-z0-9’']+/g) || []).slice(0, 160).map(w => ({ w, s: stem(w) }));
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function sharedRun(ta, tb) {
  let best = null; const m = tb.length; let prev = new Array(m + 1).fill(0);
  for (let i = 1; i <= ta.length; i++) {
    const cur = new Array(m + 1).fill(0);
    for (let j = 1; j <= m; j++) {
      if (ta[i - 1].s === tb[j - 1].s && ta[i - 1].s.length > 1) {
        cur[j] = prev[j - 1] + 1;
        if (cur[j] >= 2 && (!best || cur[j] > best.len)) {
          const A = ta.slice(i - cur[j], i), B = tb.slice(j - cur[j], j);
          if (A.filter(t => !STOP.has(t.w) && t.w.length > 2).length >= 2 || cur[j] >= 4) best = { len: cur[j], a: A.map(t => t.w).join(' '), b: B.map(t => t.w).join(' ') };
        }
      }
    }
    prev = cur;
  }
  return best;
}
const sharedCount = (ta, tb) => { const A = new Set(ta.filter(t => !STOP.has(t.w) && t.w.length > 2).map(t => t.s)); let n = 0; const seen = new Set(); for (const t of tb) if (!STOP.has(t.w) && A.has(t.s) && !seen.has(t.s)) { seen.add(t.s); n++; } return n; };

function parts(text, phrases) {
  if (!text) return [{ t: '', m: false, n: true }];
  const ps = (phrases || []).filter(Boolean);
  if (!ps.length) return [{ t: text, m: false, n: true }];
  const re = new RegExp(ps.map(p => p.trim().split(/\s+/).map(esc).join('[\\s\\W]+')).join('|'), 'gi');
  const out = []; let last = 0, m;
  while ((m = re.exec(text))) { if (!m[0].length) { re.lastIndex++; continue; } if (m.index > last) out.push({ t: text.slice(last, m.index), m: false, n: true }); out.push({ t: m[0], m: true, n: false }); last = m.index + m[0].length; }
  if (last < text.length) out.push({ t: text.slice(last), m: false, n: true });
  return out;
}

function suggestContinuation(frag, frags, now) {
  const tf = tokens(displayText(frag)); if (tf.length < 2) return null;
  let best = null;
  for (const g of frags) {
    if (g.id === frag.id || now - g.at > 3 * MS_D || g.kind === 'url' && !g.text) continue;
    const tg = tokens(displayText(g)); const run = sharedRun(tf, tg); const n = sharedCount(tf, tg);
    const score = (run ? run.len * 2 : 0) + n;
    if (score >= 2 && (!best || score > best.score)) best = { id: g.id, score, text: firstLine(g), when: dayLabel(g.at, now) };
  }
  return best;
}

function traces(line, frags, rejected) {
  const ids = new Set(line.map(m => m.id));
  const lt = line.map(m => tokens(displayText(m)));
  const out = []; const seenText = new Set();
  for (const g of frags) {
    if (ids.has(g.id) || rejected[g.id]) continue;
    const key = displayText(g).toLowerCase(); if (seenText.has(key)) continue; seenText.add(key);
    const tg = tokens(displayText(g)); if (tg.length < 3) continue;
    let run = null, cnt = 0;
    for (const t of lt) { const r = sharedRun(tg, t); if (r && (!run || r.len > run.len)) run = r; cnt = Math.max(cnt, sharedCount(tg, t)); }
    if (run) out.push({ frag: g, kind: 'seen', phrase: run.a });
    else if (cnt >= 3) out.push({ frag: g, kind: 'guess', phrase: null, why: cnt + ' shared words, no shared phrase' });
  }
  out.sort((a, b) => (a.kind === b.kind ? b.frag.at - a.frag.at : a.kind === 'seen' ? -1 : 1));
  return out.slice(0, 6);
}

function returnFor(frags, now) {
  const old = frags.find(f => /^putting something in a folder/.test(f.text));
  const recent = frags.find(f => /^Maybe the reason I keep abandoning/.test(f.text));
  if (old && recent) return { frag: old, because: recent, phraseOld: 'deciding what it is before', phraseNew: 'decide what a thing is before' };
  for (const a of frags) { if (now - a.at < 180 * MS_D || a.kind === 'url' && !a.text) continue; const ta = tokens(displayText(a)); for (const b of frags) { if (now - b.at > 2 * MS_D) continue; const r = sharedRun(ta, tokens(displayText(b))); if (r && r.len >= 3) return { frag: a, because: b, phraseOld: r.a, phraseNew: r.b }; } }
  return null;
}

function guessFor(query, frags, now) {
  const tq = tokens(query);
  const scored = frags.filter(f => displayText(f)).map(f => ({ f, n: sharedCount(tq, tokens(displayText(f))) })).filter(x => x.n > 0).sort((a, b) => b.n - a.n || b.f.at - a.f.at);
  return (scored.length ? scored.slice(0, 3).map(x => x.f) : frags.filter(f => f.kind === 'text' && f.text.length > 20).slice(0, 3));
}

// ---------- bands ----------
function bandsFor({ frags, now, anchor, query, exclude }) {
  let items = frags.filter(f => !exclude || !exclude[f.id]);
  if (query) items = items.filter(f => hay(f).includes(query));
  items = items.slice().sort((a, b) => b.at - a.at);
  const nD = new Date(now); const todayStart = new Date(nD.getFullYear(), nD.getMonth(), nD.getDate()).getTime();
  const level = f => {
    if (anchor) {
      const d = new Date(f.at); const dm = Math.abs((anchor.y * 12 + anchor.m) - (d.getFullYear() * 12 + d.getMonth()));
      return dm === 0 ? 0 : dm === 1 ? 1 : dm <= 3 ? 2 : dm <= 8 ? 3 : dm <= 14 ? 4 : 5;
    }
    const dt = now - f.at;
    if (dt < 8 * MS_H) return 0;
    if (f.at >= todayStart - MS_D) return 1;
    if (dt < 7 * MS_D) return 2;
    if (dt < 60 * MS_D) return 3;
    if (dt < 180 * MS_D) return 4;
    return 5;
  };
  const labelFor = (f, L) => {
    if (anchor) return L === 0 ? null : monthLabel(f.at, now, true);
    if (L === 0) return null;
    if (L === 1) return sameDay(f.at, now) ? 'earlier today' : 'yesterday';
    if (L === 2) return dayLabel(f.at, now);
    return monthLabel(f.at, now);
  };
  const bands = []; let cur = null;
  for (const f of items) {
    const L = level(f);
    if (L >= 5) {
      const d = new Date(f.at), y = d.getFullYear();
      if (!cur || cur.type !== 'years') { cur = { type: 'years', years: [], key: 'Y' + f.at }; bands.push(cur); }
      let yr = cur.years.find(x => x.y === y);
      if (!yr) { yr = { y, months: new Array(12).fill(0), first: [], count: 0 }; cur.years.push(yr); }
      yr.months[d.getMonth()]++; yr.count++; if (yr.first.length < 5) yr.first.push(firstLine(f));
    } else {
      const lab = labelFor(f, L);
      if (!cur || cur.type !== 'band' || cur.D !== L) { cur = { type: 'band', D: L, labels: [], items: [], key: 'B' + L + f.at }; bands.push(cur); }
      if (lab && !cur.labels.includes(lab)) cur.labels.push(lab);
      cur.items.push(f);
    }
  }
  return bands;
}

function yearsSummary(frags) {
  const map = {};
  for (const f of frags) { const d = new Date(f.at), y = d.getFullYear(); if (!map[y]) map[y] = { y, months: new Array(12).fill(0), count: 0 }; map[y].months[d.getMonth()]++; map[y].count++; }
  return Object.values(map).sort((a, b) => b.y - a.y);
}
const lastMonthWithData = (frags, y) => { let best = -1; for (const f of frags) { const d = new Date(f.at); if (d.getFullYear() === y && d.getMonth() > best) best = d.getMonth(); } return best < 0 ? 0 : best; };

module.exports = {
  NOW, MONTHS, fmtTime, fmtDur, fullDate, dayMonth, monthLabel, dayLabel, ago, sourceOf,
  displayText, firstLine, hay, buildCorpus, TRANSCRIPT, transcriptAt, makeFragment,
  parseAnchor, stem, tokens, sharedRun, sharedCount, parts, suggestContinuation, traces,
  returnFor, guessFor, bandsFor, yearsSummary, lastMonthWithData,
};
