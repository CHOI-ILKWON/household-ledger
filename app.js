'use strict';

/* =========================================================
   부트스트랩 / 라우팅 / 이벤트
   ========================================================= */

function render(){
  const main = document.getElementById('main');
  let html;
  if(ui.tab === 'home') html = renderHome();
  else if(ui.tab === 'assets') html = renderAssets();
  else if(ui.tab === 'assetDetail') html = renderAssetDetail();
  else if(ui.tab === 'stats') html = renderStats();
  else html = renderSettings();
  main.innerHTML = html;

  const tabKey = ui.tab === 'assetDetail' ? 'assets' : ui.tab;
  document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('on', b.dataset.tab === tabKey));
  document.getElementById('fab').style.display = ui.tab === 'settings' ? 'none' : 'flex';
  window.scrollTo(0, 0);
}

function go(tab){
  ui.tab = tab; ui.sub = null; ui.openCat = null;
  render();
}

/* ---------------- 액션 ---------------- */
const ACTS = {
  /* 이동 */
  goHome: ()=>go('home'),
  goAssets: ()=>go('assets'),
  goStats: ()=>go('stats'),
  goSettings: ()=>{ ui.sub = null; go('settings'); },
  goAssetSettings: ()=>{ ui.tab='settings'; ui.sub='settings-assets'; render(); },
  goCatSettings: ()=>{ ui.tab='settings'; ui.sub='settings-cats'; render(); },
  openAsset: id=>{ ui.tab='assetDetail'; ui.assetId=id; ui.openCat=null; ui.fm=fiscalOf(todayStr()); render(); },
  toggleGroup: id=>{ ui.collapsed[id] = !ui.collapsed[id]; render(); },
  toggleCat: id=>{ ui.openCat = ui.openCat === id ? null : id; render(); },

  /* 자산 상세 */
  detailTab: (_,v)=>{ ui.detailTab=v; ui.openCat=null; render(); },
  prevMonth: ()=>{ ui.fm = shiftMonth(ui.fm,-1); ui.openCat=null; render(); },
  nextMonth: ()=>{ ui.fm = shiftMonth(ui.fm, 1); ui.openCat=null; render(); },
  prevYear: ()=>{ ui.fy--; render(); },
  nextYear: ()=>{ ui.fy++; render(); },
  pickMonth: (_,v)=>{ ui.fm = { y: ui.fy, m: Number(v) }; ui.detailTab='day'; render(); },
  pickYear: (_,v)=>{ ui.fy = Number(v); ui.detailTab='month'; render(); },

  /* 통계 */
  statBucket: (_,v)=>{ ui.statBucket=v; ui.openCat=null; render(); },
  prevStatMonth: ()=>{ ui.statFm = shiftMonth(ui.statFm,-1); ui.openCat=null; render(); },
  nextStatMonth: ()=>{ ui.statFm = shiftMonth(ui.statFm, 1); ui.openCat=null; render(); },

  /* 내역 */
  newTxn: (_,v)=>openTxn(null, v || 'expense'),
  editTxn: id=>openTxn(id),
  txnType: (_,v)=>{ syncDraft(); draft.type=v; autoCat(); if(v!=='expense'){ draft.excludeFromTotal=false; } renderTxnSheet(); },
  txnBucket: (_,v)=>{ syncDraft(); draft.bucket=v; draft.excludeFromTotal=false; renderTxnSheet(); },
  toggleExclude: ()=>{ syncDraft(); draft.excludeFromTotal = !draft.excludeFromTotal; renderTxnSheet(); },
  pickCat: id=>{ syncDraft(); draft.categoryId=id; applyCatBucket(); renderTxnSheet(); },
  catChange: ()=>{
    const sel = document.getElementById('f-cat');
    syncDraft();
    if(sel && sel.value === '__new__'){ openCatEditor(null, draft.type, true); return; }
    applyCatBucket(); renderTxnSheet();
  },
  backToTxn: ()=>{ returnToTxn = false; editing = null; renderTxnSheet(); },
  reRender: ()=>{ syncDraft(); applyGroupBucket(); renderTxnSheet(); },
  saveTxn: ()=>saveTxn(false),
  saveContinue: ()=>saveTxn(true),
  deleteTxn: ()=>{
    if(!confirm('이 내역을 삭제할까요?')) return;
    S.txns = S.txns.filter(t=>t.id !== draft.id);
    save(); closeSheet(); render();
  },
  amtInput: (_,__,el)=>{
    const raw = el.value.replace(/[^0-9]/g,'');
    el.value = raw ? Number(raw).toLocaleString('ko-KR') : '';
  },

  /* 자산/그룹/분류 편집 */
  newAsset: id=>openAssetEditor(null, id),
  editAsset: id=>openAssetEditor(id),
  assetKind: (_,v)=>{ syncAssetDom(); editing.kind=v;
                      if(v !== 'asset') editing.initialBalance = -Math.abs(editing.initialBalance);
                      editing._neg = editing.initialBalance < 0;
                      renderAssetSheet(); },
  signToggle: ()=>{ syncAssetDom(); editing._neg = !editing._neg;
                    editing.initialBalance = (editing._neg?-1:1) * Math.abs(editing.initialBalance);
                    renderAssetSheet(); },
  saveAsset,
  toggleMain: ()=>{ syncAssetDom(); S.settings.mainAssetId = S.settings.mainAssetId === editing.id ? null : editing.id; save(); renderAssetSheet(); },
  deleteAsset: ()=>{
    const used = S.txns.filter(t=>t.assetId===editing.id || t.toAssetId===editing.id).length;
    if(!confirm(used ? `이 자산의 내역 ${used}건도 함께 삭제됩니다. 계속할까요?` : '이 자산을 삭제할까요?')) return;
    S.txns = S.txns.filter(t=>t.assetId!==editing.id && t.toAssetId!==editing.id);
    S.assets = S.assets.filter(a=>a.id!==editing.id);
    if(S.settings.mainAssetId === editing.id) S.settings.mainAssetId = (S.assets[0]||{}).id;
    save(); closeSheet(); ui.tab = ui.tab==='assetDetail' ? 'assets' : ui.tab; render();
  },
  moveAsset: (id,v)=>{
    const a = assetById(id), list = assetsOfGroup(a.groupId);
    const i = list.indexOf(a), j = i + Number(v);
    if(j < 0 || j >= list.length) return;
    const gi = S.assets.indexOf(list[i]), gj = S.assets.indexOf(list[j]);
    S.assets[gi] = list[j]; S.assets[gj] = list[i];
    save(); render();
  },
  newGroup: ()=>openGroupEditor(null),
  editGroup: id=>openGroupEditor(id),
  groupBucket: (_,v)=>{ syncGroupDom(); editing.defaultBucket=v; renderGroupSheet(); },
  saveGroup,
  deleteGroup: ()=>{
    if(assetsOfGroup(editing.id).length){ alert('그룹 안의 자산을 먼저 옮기거나 삭제해 주세요.'); return; }
    if(!confirm('이 그룹을 삭제할까요?')) return;
    S.groups = S.groups.filter(g=>g.id!==editing.id);
    save(); closeSheet(); render();
  },
  moveGroup: (id,v)=>{
    const i = S.groups.findIndex(g=>g.id===id), j = i + Number(v);
    if(j < 0 || j >= S.groups.length) return;
    const t = S.groups[i]; S.groups[i] = S.groups[j]; S.groups[j] = t;
    save(); render();
  },
  newCat: (_,v)=>openCatEditor(null, v),
  editCat: id=>openCatEditor(id),
  catBucket: (_,v)=>{ syncCatDom(); editing.bucket=v; renderCatSheet(); },
  catColor:  (_,v)=>{ syncCatDom(); editing.color=v;  renderCatSheet(); },
  saveCat,
  deleteCat: ()=>{
    const used = S.txns.filter(t=>t.categoryId===editing.id).length;
    if(used){ alert(`이 분류를 쓰는 내역이 ${used}건 있습니다. 먼저 정리해 주세요.`); return; }
    if(!confirm('이 분류를 삭제할까요?')) return;
    S.categories = S.categories.filter(c=>c.id!==editing.id);
    save(); closeSheet(); render();
  },

  /* 설정 */
  pickMain: ()=>openMainPicker(),
  setMain: id=>{ S.settings.mainAssetId = id; save(); closeSheet(); render(); },
  setTheme: (_,v)=>{ S.settings.theme=v; save(); applyTheme(); render(); },
  setFixedColor: (_,v)=>{ S.settings.fixedColor=v; save(); render(); },
  exportJson: ()=>{
    download(`가계부_백업_${todayStr()}.json`, JSON.stringify(S,null,2), 'application/json');
  },
  exportCsv: ()=>{
    const head = '날짜,종류,구분,자산,입금자산,분류,내용,금액,지출미표기\n';
    const rows = S.txns.slice().sort(cmpAsc).map(t=>[
      t.date,
      t.type==='expense'?'지출':t.type==='income'?'수입':'이체',
      t.type==='expense'?BUCKET_NAME[t.bucket]:'',
      assetName(t.assetId),
      t.toAssetId?assetName(t.toAssetId):'',
      t.categoryId?catName(t.categoryId):'',
      (t.memo||'').replace(/,/g,' '),
      t.amount,
      t.excludeFromTotal?'Y':''
    ].join(',')).join('\n');
    download(`가계부_${todayStr()}.csv`, '﻿'+head+rows, 'text/csv');
  },
  importJson: ()=>{
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.json,application/json';
    inp.onchange = () => {
      const f = inp.files[0]; if(!f) return;
      const rd = new FileReader();
      rd.onload = () => {
        try{
          const d = JSON.parse(rd.result);
          if(!d.assets || !d.txns) throw 0;
          if(!confirm('현재 데이터를 덮어씁니다. 계속할까요?')) return;
          S = d; save(); applyTheme(); ui.sub=null; go('home');
          alert('복원했습니다.');
        }catch(e){ alert('올바른 백업 파일이 아닙니다.'); }
      };
      rd.readAsText(f);
    };
    inp.click();
  },
  clearTxns: ()=>{
    if(!confirm(`내역 ${S.txns.length}건을 모두 삭제할까요? 자산과 분류는 유지됩니다.`)) return;
    S.txns = []; S.settings.sampleLoaded = false; save(); render();
  },
  resetAll: ()=>{
    if(!confirm('모든 데이터를 지우고 처음 상태로 되돌립니다. 계속할까요?')) return;
    localStorage.removeItem(KEY); load(); ui.sub=null; go('home');
  },

  /* AI 분석 */
  copyAnalysis: ()=>{
    const txt = analysisText(ui.statFm);
    copyText(txt).then(ok=>{
      if(ok) toast(`${fmLabel(ui.statFm)} 복사 완료 — AI에 붙여넣으세요`);
      else openAnalysisSheet(txt, true);
    });
  },
  previewAnalysis: ()=>openAnalysisSheet(analysisText(ui.statFm), false),

  /* 시트 */
  closeSheet
};

/* ---------------- 클립보드 ---------------- */
function fallbackCopy(t){
  const ta = document.createElement('textarea');
  ta.value = t;
  ta.setAttribute('readonly','');
  ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0';
  document.body.appendChild(ta);
  ta.select(); ta.setSelectionRange(0, t.length);
  let ok = false;
  try{ ok = document.execCommand('copy'); }catch(e){}
  document.body.removeChild(ta);
  return ok;
}
function copyText(t){
  if(navigator.clipboard && window.isSecureContext){
    return navigator.clipboard.writeText(t).then(()=>true).catch(()=>fallbackCopy(t));
  }
  return Promise.resolve(fallbackCopy(t));
}
function toast(msg){
  let el = document.getElementById('toast');
  if(!el){ el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(()=>el.classList.remove('show'), 2200);
}
function openAnalysisSheet(txt, failed){
  const body = `
    ${failed ? `<div class="hint" style="padding:14px 16px 0;color:var(--living)">
      자동 복사가 막혔습니다. 아래 내용을 길게 눌러 전체 선택 후 복사해 주세요.</div>` : ''}
    <div class="section" style="margin-top:12px"><div class="card">
      <textarea id="ana-text" readonly style="width:100%;height:52vh;padding:14px;border:0;
        background:none;color:var(--label);font-size:12px;line-height:1.6;resize:none;
        font-family:ui-monospace,SFMono-Regular,Menlo,monospace">${esc(txt)}</textarea>
    </div></div>
    <button class="btn-wide primary" data-act="copyFromSheet">복사하기</button>
    <div style="height:12px"></div>`;
  sheet(`${fmLabel(ui.statFm)} 분석 요청문`, body, `<button data-act="closeSheet">닫기</button>`);
}
ACTS.copyFromSheet = ()=>{
  const ta = document.getElementById('ana-text');
  copyText(ta.value).then(ok=>{
    if(ok){ closeSheet(); toast(`${fmLabel(ui.statFm)} 복사 완료 — AI에 붙여넣으세요`); }
    else { ta.focus(); ta.select(); toast('길게 눌러 복사해 주세요'); }
  });
};

function applyCatBucket(){
  const c = catById(draft.categoryId);
  if(!c || draft.type !== 'expense') return;
  draft.bucket = c.bucket;
  draft.excludeFromTotal = c.bucket === 'passthrough';
}
function applyGroupBucket(){
  const a = assetById(draft.assetId);
  const g = a ? groupById(a.groupId) : null;
  if(!g || draft.type !== 'expense') return;
  draft.bucket = g.defaultBucket;
  draft.excludeFromTotal = g.defaultBucket === 'passthrough';
}

function download(name, text, mime){
  const blob = new Blob([text], { type: mime + ';charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
}

/* ---------------- 이벤트 위임 ---------------- */
function bind(root){
  root.addEventListener('click', e=>{
    const el = e.target.closest('[data-act]');
    if(!el || !root.contains(el)) return;
    if(el.tagName === 'SELECT' || el.tagName === 'INPUT') return;
    const fn = ACTS[el.dataset.act];
    if(fn){ e.stopPropagation(); fn(el.dataset.id, el.dataset.v, el); }
  });
  root.addEventListener('change', e=>{
    const el = e.target.closest('[data-act]');
    if(!el) return;
    const fn = ACTS[el.dataset.act];
    if(fn && (el.tagName === 'SELECT')) fn(el.dataset.id, el.value, el);
  });
  root.addEventListener('input', e=>{
    const el = e.target.closest('[data-act]');
    if(!el || el.dataset.act !== 'amtInput') return;
    ACTS.amtInput(null, null, el);
  });
}

/* ---------------- 시작 ---------------- */
load();
bind(document.getElementById('main'));
bind(document.getElementById('modal-root'));

document.getElementById('modal-root').addEventListener('click', e=>{
  if(e.target.classList.contains('backdrop')) closeSheet();
});
document.querySelectorAll('.tab').forEach(b=>{
  b.addEventListener('click', ()=>go(b.dataset.tab));
});
document.getElementById('fab').addEventListener('click', ()=>openTxn(null,'expense'));

document.getElementById('main').addEventListener('change', e=>{
  if(e.target.id === 'startDay'){
    S.settings.monthStartDay = Number(e.target.value);
    ui.fm = fiscalOf(todayStr()); ui.statFm = fiscalOf(todayStr());
    save(); render();
  }
});

render();
