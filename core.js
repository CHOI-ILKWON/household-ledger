'use strict';

/* =========================================================
   가계부 — 코어 (상태 / 날짜 / 집계 / 포맷)
   ========================================================= */

const KEY = 'ledger.v1';
const WD = ['일','월','화','수','목','금','토'];
const BUCKET_NAME = { living:'생활지출', fixed:'고정지출', passthrough:'대납' };
const BUCKET_CLASS = { living:'c-living', fixed:'c-fixed', passthrough:'c-muted' };
const PALETTE = ['#FF3B30','#FF9F0A','#FFD60A','#30D158','#64D2FF','#0A84FF',
                 '#5E5CE6','#BF5AF2','#FF375F','#AC8E68','#8E8E93','#A2845E'];

let S = null;

function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }

/* ---------------- 시드 데이터 ---------------- */
function seed(){
  const mk = (name, defaultBucket) => ({ id:uid(), name, defaultBucket });
  const g1 = mk('생활비','living');
  const g2 = mk('별도 자산','fixed');
  const g3 = mk('대출 보험','fixed');
  const g4 = mk('대납 정산','passthrough');

  const A = (groupId,name,kind,bal) => ({ id:uid(), groupId, name, kind, initialBalance:bal, archived:false });
  const assets = [
    A(g1.id,'생활비 통장','asset',0),
    A(g1.id,'마이너스 통장','liability',-5000000),
    A(g1.id,'월급 통장','asset',0),
    A(g2.id,'공과금','asset',800000),
    A(g2.id,'경조사','asset',500000),
    A(g3.id,'대출 A','asset',600000),
    A(g3.id,'대출 B','asset',200000),
    A(g3.id,'보험','asset',150000),
    A(g4.id,'출장비 대납','receivable',0),
  ];

  const C = (name,type,bucket,color,emoji) => ({ id:uid(), name, type, bucket, color, emoji });
  const categories = [
    C('식비','expense','living','#FF3B30','🍚'),
    C('카페','expense','living','#64D2FF','☕'),
    C('출근커피','expense','living','#5E5CE6','☕'),
    C('교통','expense','living','#FFD60A','🚇'),
    C('미용','expense','living','#30D158','✂️'),
    C('이벤트','expense','living','#FF9F0A','🎁'),
    C('쇼핑','expense','living','#FF375F','🛍️'),
    C('구독','expense','living','#0A84FF','🤖'),
    C('의료','expense','living','#BF5AF2','💊'),
    C('경조사','expense','living','#AC8E68','💐'),
    C('주거/통신','expense','fixed','#FF9F0A','🏠'),
    C('관리비','expense','fixed','#FFD60A','🏢'),
    C('대출상환','expense','fixed','#A2845E','🏦'),
    C('보험료','expense','fixed','#C77D00','🛡️'),
    C('출장비','expense','passthrough','#8E8E93','🚗'),
    C('월급','income','living','#0A84FF','💰'),
    C('상여','income','living','#30D158','🎉'),
    C('정산입금','income','passthrough','#8E8E93','↩️'),
    C('기타수입','income','living','#64D2FF','✨'),
  ];

  const st = {
    groups:[g1,g2,g3,g4],
    assets,
    categories,
    txns:[],
    settings:{
      monthStartDay:25,
      mainAssetId:assets[0].id,
      theme:'auto',
      fixedColor:'orange',
      sampleLoaded:true
    }
  };
  S = st;                 // 샘플 생성 시 회계월 계산에 필요
  st.txns = sampleTxns();
  return st;
}

/* 데모용 샘플 내역 — 설정에서 한 번에 삭제 가능 */
function sampleTxns(){
  const A = n => S.assets.find(x=>x.name===n).id;
  const C = n => S.categories.find(x=>x.name===n).id;
  const today = todayStr();
  const cur  = fiscalOf(today),          curR  = fiscalRange(cur.y, cur.m);
  const prev = shiftMonth(cur,-1),       prevR = fiscalRange(prev.y, prev.m);
  const elapsed = Math.max(0, daysBetween(curR.start, today));
  const span    = Math.max(1, daysBetween(prevR.start, prevR.end));
  const cd = f => toStr(addDays(parseD(curR.start),  Math.min(Math.round(f*elapsed), elapsed)));
  const pd = f => toStr(addDays(parseD(prevR.start), Math.round(f*span)));

  const yong=A('생활비 통장'), wol=A('월급 통장'), gong=A('공과금'),
        d128=A('대출 A'), d25=A('대출 B'), bo=A('보험'), chul=A('출장비 대납');
  let seq = 0;
  const T = (type,date,amount,assetId,categoryId,memo,extra) =>
    Object.assign({ id:uid(), type, date, amount, assetId, toAssetId:null,
      categoryId, memo, bucket:'living', excludeFromTotal:false,
      createdAt: Date.now() + (seq++) }, extra||{});
  const F = { bucket:'fixed' };
  const P = { bucket:'passthrough', excludeFromTotal:true };

  /* 매달 반복되는 급여 · 이체 · 고정지출 */
  const cycle = D => [
    T('income',   D(0), 3000000, wol, C('월급'), '급여'),
    T('transfer', D(0),  600000, wol, null, '', { toAssetId:yong }),
    T('transfer', D(0),  300000, wol, null, '', { toAssetId:gong }),
    T('transfer', D(0),  600000, wol, null, '', { toAssetId:d128 }),
    T('transfer', D(0),  200000, wol, null, '', { toAssetId:d25 }),
    T('transfer', D(0),  150000, wol, null, '', { toAssetId:bo }),
    T('expense', D(.03), 600000, d128, C('대출상환'), '대출 원리금', F),
    T('expense', D(.03), 200000, d25,  C('대출상환'), '대출 원리금', F),
    T('expense', D(.03), 150000, bo,   C('보험료'),   '보험료 자동이체', F),
    T('expense', D(.07), 120000, gong, C('관리비'),   '관리비', F),
    T('expense', D(.12),  20000, gong, C('주거/통신'), '가스비', F),
    T('expense', D(.12),  35000, gong, C('주거/통신'), '통신비', F),
  ];

  return [
    /* ===== 지난 회계월 ===== */
    ...cycle(pd),
    T('expense', pd(.20),   9000, yong, C('식비'),   '점심'),
    T('expense', pd(.24),  14000, yong, C('식비'),   '저녁'),
    T('expense', pd(.28),   2000, yong, C('식비'),   '아침'),
    T('expense', pd(.28),  11000, yong, C('식비'),   '점심'),
    T('expense', pd(.35),   7000, yong, C('식비'),   '점심'),
    T('expense', pd(.40),   3500, yong, C('식비'),   '아침'),
    T('expense', pd(.46),   5500, yong, C('식비'),   '아침'),
    T('expense', pd(.50), 150000, yong, C('이벤트'), '기념일 선물'),
    T('expense', pd(.55),  28000, yong, C('출근커피'), '출근 커피'),
    T('expense', pd(.60),  38000, yong, C('카페'),   '카페'),
    T('expense', pd(.66),  85000, yong, C('교통'),   '교통비'),
    T('expense', pd(.72),  40000, yong, C('미용'),   '미용실'),
    T('expense', pd(.80),  35000, yong, C('구독'), '구독 서비스'),
    T('income',  pd(.86),  11000, yong, C('기타수입'), '중고 판매'),
    T('expense', pd(.90),  47000, yong, C('쇼핑'),   '생필품'),
    T('expense', pd(.55), 250000, chul, C('출장비'), '출장 숙박·식대', P),

    /* ===== 이번 회계월 ===== */
    ...cycle(cd),
    T('expense', cd(.20),  12800, yong, C('식비'),   '점심'),
    T('expense', cd(.30),   4500, yong, C('카페'),   '아메리카노'),
    T('expense', cd(.40),   4100, yong, C('출근커피'), '출근 커피'),
    T('expense', cd(.50),   9000, yong, C('식비'),   '저녁'),
    T('expense', cd(.60),  15000, yong, C('교통'),   '택시'),
    T('expense', cd(.70),  35000, yong, C('구독'), '구독 서비스'),
    T('expense', cd(.85),  58000, yong, C('쇼핑'),   '의류'),
    T('expense', cd(.95),  11000, yong, C('식비'),   '점심'),
    T('expense', cd(.50), 180000, chul, C('출장비'), '출장 유류·통행료', P),
  ];
}

/* ---------------- 저장 ---------------- */
function load(){
  let fresh = false;
  try{
    const raw = localStorage.getItem(KEY);
    if(raw){ S = JSON.parse(raw); } else { S = seed(); fresh = true; }
  }catch(e){ S = seed(); fresh = true; }
  if(!S.settings) S.settings = {};
  if(!S.settings.monthStartDay) S.settings.monthStartDay = 25;
  if(!S.settings.mainAssetId && S.assets[0]) S.settings.mainAssetId = S.assets[0].id;
  if(fresh) save();
  applyTheme();
}
function save(){ try{ localStorage.setItem(KEY, JSON.stringify(S)); }catch(e){ alert('저장 공간이 부족합니다. 설정에서 백업 후 정리해 주세요.'); } }
function applyTheme(){
  const t = S.settings.theme || 'auto';
  if(t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
}

/* ---------------- 날짜 ---------------- */
function pad2(n){ return n<10 ? '0'+n : ''+n; }
function toStr(d){ return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate()); }
function parseD(s){ const p = s.split('-').map(Number); return new Date(p[0], p[1]-1, p[2]); }
function addDays(d,n){ const x = new Date(d.getTime()); x.setDate(x.getDate()+n); return x; }
function todayStr(){ return toStr(new Date()); }
function lastDayOf(y,m){ return new Date(y, m+1, 0).getDate(); }
function daysBetween(a,b){ return Math.round((parseD(b)-parseD(a)) / 86400000); }

/** 날짜가 속한 회계월 라벨 {y, m(0-based)} */
function fiscalOf(dateStr){
  const sd = S.settings.monthStartDay;
  const d = parseD(dateStr);
  let y = d.getFullYear(), m = d.getMonth();
  if(sd > 1 && d.getDate() >= sd){ m++; if(m>11){ m=0; y++; } }
  return { y, m };
}
/** 회계월 {y,m} 의 실제 날짜 범위 */
function fiscalRange(y,m){
  const sd = S.settings.monthStartDay;
  if(sd <= 1) return { start:`${y}-${pad2(m+1)}-01`, end:`${y}-${pad2(m+1)}-${pad2(lastDayOf(y,m))}` };
  let py = y, pm = m-1; if(pm<0){ pm=11; py--; }
  const startDay = Math.min(sd, lastDayOf(py,pm));
  const start = `${py}-${pad2(pm+1)}-${pad2(startDay)}`;
  const endD = addDays(parseD(`${y}-${pad2(m+1)}-${pad2(Math.min(sd, lastDayOf(y,m)))}`), -1);
  return { start, end: toStr(endD) };
}
function fiscalYearRange(y){ return { start: fiscalRange(y,0).start, end: fiscalRange(y,11).end }; }
function shiftMonth(fm, n){
  let y = fm.y, m = fm.m + n;
  while(m>11){ m-=12; y++; } while(m<0){ m+=12; y--; }
  return { y, m };
}
function fmLabel(fm){ return `${fm.y}년 ${fm.m+1}월`; }
function rangeLabel(r){
  const a = parseD(r.start), b = parseD(r.end);
  return `${a.getMonth()+1}. ${a.getDate()}. ~ ${b.getMonth()+1}. ${b.getDate()}.`;
}
function rangeLabelY(r){
  const a = parseD(r.start), b = parseD(r.end);
  return `${a.getFullYear()}. ${a.getMonth()+1}. ${a.getDate()}. ~ ${b.getFullYear()}. ${b.getMonth()+1}. ${b.getDate()}.`;
}

/* ---------------- 조회 ---------------- */
function assetById(id){ return S.assets.find(a=>a.id===id); }
function groupById(id){ return S.groups.find(g=>g.id===id); }
function catById(id){ return S.categories.find(c=>c.id===id); }
function assetName(id){ const a = assetById(id); return a ? a.name : '(삭제됨)'; }
function catName(id){ const c = catById(id); return c ? c.name : '미분류'; }
function mainAsset(){ return assetById(S.settings.mainAssetId) || S.assets[0]; }
function assetsOfGroup(gid){ return S.assets.filter(a=>a.groupId===gid && !a.archived); }
function liveAssets(){ return S.assets.filter(a=>!a.archived); }

function cmpAsc(a,b){
  if(a.date !== b.date) return a.date < b.date ? -1 : 1;
  return (a.createdAt||0) - (b.createdAt||0);
}
function cmpDesc(a,b){ return -cmpAsc(a,b); }

/** 특정 자산 기준 증감액 */
function delta(t, assetId){
  if(t.type === 'transfer'){
    if(t.assetId === assetId) return -t.amount;
    if(t.toAssetId === assetId) return t.amount;
    return 0;
  }
  if(t.assetId !== assetId) return 0;
  return t.type === 'income' ? t.amount : -t.amount;
}
function txnsOfAsset(id){
  return S.txns.filter(t => t.assetId === id || t.toAssetId === id);
}
function balanceOf(id){
  const a = assetById(id); if(!a) return 0;
  let b = a.initialBalance || 0;
  for(const t of S.txns) b += delta(t, id);
  return b;
}
/** 자산 상세용 누적잔액 맵 */
function runningMap(id){
  const a = assetById(id);
  const list = txnsOfAsset(id).sort(cmpAsc);
  let b = a ? (a.initialBalance||0) : 0;
  const m = {};
  for(const t of list){ b += delta(t, id); m[t.id] = b; }
  return m;
}
/** 기간 집계 */
function periodStats(assetId, start, end){
  const list = txnsOfAsset(assetId).sort(cmpAsc);
  const a = assetById(assetId);
  let endBal = a ? (a.initialBalance||0) : 0, inn = 0, out = 0;
  for(const t of list){
    if(t.date > end) break;
    const d = delta(t, assetId);
    endBal += d;
    if(t.date >= start){ if(d > 0) inn += d; else out += -d; }
  }
  return { inn, out, net: inn-out, endBal };
}
function inRange(dateStr, r){ return dateStr >= r.start && dateStr <= r.end; }

/** 전체 기간 요약 (홈/통계) */
function summary(r, assetId){
  let income = 0, living = 0, fixed = 0, pending = 0, transfer = 0;
  for(const t of S.txns){
    if(!inRange(t.date, r)) continue;
    if(assetId && t.assetId !== assetId && t.toAssetId !== assetId) continue;
    if(t.type === 'transfer'){ if(!assetId || t.toAssetId === assetId) transfer += t.amount; continue; }
    if(t.excludeFromTotal){ if(t.type==='expense') pending += t.amount; continue; }
    if(t.type === 'income'){ income += t.amount; continue; }
    if(t.bucket === 'fixed') fixed += t.amount;
    else if(t.bucket === 'passthrough') pending += t.amount;
    else living += t.amount;
  }
  return { income, living, fixed, pending, transfer, expense: living + fixed };
}

/* ---------------- 포맷 ---------------- */
function fmt(n){
  const neg = n < 0;
  const s = Math.abs(Math.round(n)).toLocaleString('ko-KR');
  return (neg ? '-' : '') + s;
}
function won(n){ return fmt(n) + '원'; }
function compact(n){
  const v = Math.abs(n);
  if(v >= 100000000) return (n<0?'-':'') + (v/100000000).toFixed(v%100000000?1:0).replace(/\.0$/,'') + '억';
  if(v >= 10000) return (n<0?'-':'') + Math.round(v/10000).toLocaleString('ko-KR') + '만';
  return fmt(n);
}
function esc(s){
  return String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function pct(a,b){ return b > 0 ? Math.round(a/b*100) : 0; }
function fixedColorVar(){ return S.settings.fixedColor === 'red' ? 'var(--living)' : 'var(--fixed)'; }
function fixedClass(){ return S.settings.fixedColor === 'red' ? 'c-living' : 'c-fixed'; }
