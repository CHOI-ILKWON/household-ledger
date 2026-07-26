'use strict';

/* =========================================================
   시트 / 모달
   ========================================================= */

const MR = () => document.getElementById('modal-root');
let draft = null;        // 내역 편집 중 데이터
let editing = null;      // 자산/그룹/분류 편집 중 데이터
let returnToTxn = false; // 분류 추가 후 내역 시트로 돌아갈지

function closeSheet(){ MR().innerHTML = ''; draft = null; editing = null; returnToTxn = false; }

function sheet(title, body, left, right){
  // 백드롭에는 data-act 를 두지 않는다. 위임 핸들러의 closest('[data-act]') 가
  // 시트 안의 input 에서 위로 타고 올라와 시트를 닫아버린다.
  MR().innerHTML = `<div class="backdrop"><div class="sheet">
    <div class="sheet-head">
      <div class="nav-btn">${left || `<button data-act="closeSheet">취소</button>`}</div>
      <div class="sheet-title">${esc(title)}</div>
      <div class="nav-btn right">${right || ''}</div>
    </div>
    <div class="sheet-body">${body}</div>
  </div></div>`;
}

/* ===================== 내역 추가/수정 ===================== */
function openTxn(id, presetType){
  if(id){
    const t = S.txns.find(x=>x.id===id);
    if(!t) return;
    draft = JSON.parse(JSON.stringify(t));
  }else{
    const a = ui.tab === 'assetDetail' && ui.assetId ? assetById(ui.assetId) : mainAsset();
    const g = a ? groupById(a.groupId) : null;
    draft = {
      id:null, type: presetType || 'expense', date: todayStr(), amount: 0,
      assetId: a ? a.id : (S.assets[0]||{}).id, toAssetId: null,
      categoryId: null, memo: '',
      bucket: (g && g.defaultBucket) || 'living',
      excludeFromTotal: false
    };
    autoCat();
  }
  renderTxnSheet();
}

function autoCat(){
  const list = S.categories.filter(c=>c.type===draft.type);
  if(draft.type === 'transfer'){ draft.categoryId = null; return; }
  if(!draft.categoryId || !list.some(c=>c.id===draft.categoryId)) draft.categoryId = list.length ? list[0].id : null;
}

function syncDraft(){
  const q = s => document.getElementById(s);
  if(q('f-date')) draft.date = q('f-date').value || todayStr();
  if(q('f-amt'))  draft.amount = Number(String(q('f-amt').value).replace(/[^0-9]/g,'')) || 0;
  if(q('f-asset')) draft.assetId = q('f-asset').value;
  if(q('f-to'))   draft.toAssetId = q('f-to').value;
  if(q('f-cat') && q('f-cat').value !== '__new__') draft.categoryId = q('f-cat').value;
  if(q('f-memo')) draft.memo = q('f-memo').value;
}

function renderTxnSheet(){
  const isTr = draft.type === 'transfer';
  const cats = S.categories.filter(c=>c.type === draft.type);
  const opts = (list, sel) => list.map(x=>`<option value="${x.id}" ${x.id===sel?'selected':''}>${esc(x.emoji?x.emoji+' ':'')}${esc(x.name)}</option>`).join('');

  const recent = [];
  for(const t of S.txns.slice().sort(cmpDesc)){
    if(t.type !== draft.type || !t.categoryId) continue;
    if(!recent.includes(t.categoryId)) recent.push(t.categoryId);
    if(recent.length >= 4) break;
  }

  const body = `
    <div style="padding:12px 16px 4px"><div class="seg flush">
      <button class="${draft.type==='expense'?'on':''}" data-act="txnType" data-v="expense">지출</button>
      <button class="${draft.type==='income'?'on':''}" data-act="txnType" data-v="income">수입</button>
      <button class="${draft.type==='transfer'?'on':''}" data-act="txnType" data-v="transfer">이체</button>
    </div></div>

    <div class="section" style="margin-top:10px"><div class="card">
      <div class="field"><div class="field-k">날짜</div>
        <input type="date" id="f-date" value="${draft.date}"></div>
      <div class="field"><div class="field-k">금액</div>
        <input type="text" inputmode="numeric" id="f-amt" class="amt" placeholder="0"
               value="${draft.amount?fmt(draft.amount):''}" data-act="amtInput"></div>
      <div class="field"><div class="field-k">${isTr?'출금':'자산'}</div>
        <select id="f-asset" data-act="reRender">${opts(liveAssets(), draft.assetId)}</select></div>
      ${isTr ? `<div class="field"><div class="field-k">입금</div>
        <select id="f-to" data-act="reRender">${opts(liveAssets().filter(a=>a.id!==draft.assetId), draft.toAssetId)}</select></div>` : `
      <div class="field"><div class="field-k">항목</div>
        <select id="f-cat" data-act="catChange">${opts(cats, draft.categoryId)}
          <option value="__new__">＋ 새 항목 만들기…</option></select></div>`}
      <div class="field"><div class="field-k">내용</div>
        <input type="text" id="f-memo" placeholder="${isTr?'(선택)':'예) 점심 김치찌개'}" value="${esc(draft.memo)}"></div>
    </div></div>

    ${!isTr && recent.length ? `<div class="chips">${recent.map(cid=>{
        const c = catById(cid); if(!c) return '';
        return `<button class="chip" data-act="pickCat" data-id="${cid}">${c.emoji||''} ${esc(c.name)}</button>`;
      }).join('')}</div>` : ''}

    ${draft.type === 'expense' ? `
    <div class="section">
      <div class="section-title">구분</div>
      <div class="card">
        <div style="padding:12px 16px"><div class="seg flush">
          <button class="${draft.bucket==='living'?'on':''}" data-act="txnBucket" data-v="living">생활지출</button>
          <button class="${draft.bucket==='fixed'?'on':''}" data-act="txnBucket" data-v="fixed">고정지출</button>
        </div></div>
        <div class="switchline" data-act="toggleExclude">
          <div><div class="switchline-k">지출에 미표기</div>
            <div class="switchline-d">돌려받을 돈 (출장비 등). 검은색으로 표시되고 합계에서 빠집니다.</div></div>
          <div class="sw ${draft.excludeFromTotal?'on':''}"></div>
        </div>
      </div>
    </div>` : ''}

    ${draft.id ? `<button class="btn-wide danger" data-act="deleteTxn">삭제</button>` : ''}
    <div style="height:12px"></div>`;

  sheet(draft.id ? '내역 수정' : '내역 추가', body, null,
        `<button data-act="saveTxn" style="font-weight:600">저장</button>`);
}

function saveTxn(){
  syncDraft();
  if(!draft.amount){ alert('금액을 입력해 주세요.'); return; }
  if(draft.type === 'transfer'){
    if(!draft.toAssetId || draft.toAssetId === draft.assetId){ alert('입금 자산을 선택해 주세요.'); return; }
    draft.categoryId = null; draft.bucket = 'living'; draft.excludeFromTotal = false;
  }else{
    draft.toAssetId = null;
    if(draft.type === 'income'){ draft.bucket = 'living'; }
  }
  if(draft.excludeFromTotal) draft.bucket = 'passthrough';
  else if(draft.bucket === 'passthrough') draft.bucket = 'living';

  if(draft.id){
    const i = S.txns.findIndex(x=>x.id===draft.id);
    S.txns[i] = Object.assign(S.txns[i], draft);
  }else{
    draft.id = uid(); draft.createdAt = Date.now();
    S.txns.push(draft);
  }
  save(); closeSheet(); render();
}

/* ===================== 자산 편집 ===================== */
function openAssetEditor(id, groupId){
  editing = id ? JSON.parse(JSON.stringify(assetById(id)))
               : { id:null, groupId, name:'', kind:'asset', initialBalance:0, archived:false };
  renderAssetSheet();
}
/** 다시 그리기 전에 화면의 입력값을 editing 에 담아 둔다.
 *  이걸 빼먹으면 종류 버튼을 누르는 순간 이름·잔액이 날아간다. */
function syncAssetDom(){
  const n = document.getElementById('e-name');
  const g = document.getElementById('e-group');
  const b = document.getElementById('e-bal');
  if(n) editing.name = n.value;
  if(g) editing.groupId = g.value;
  if(b) editing.initialBalance = Number(String(b.value).replace(/[^0-9-]/g,'')) || 0;
}
function renderAssetSheet(){
  const isMain = S.settings.mainAssetId === editing.id;
  const body = `
    <div class="section" style="margin-top:12px"><div class="card">
      <div class="field"><div class="field-k">이름</div>
        <input type="text" id="e-name" value="${esc(editing.name)}" placeholder="예) 생활비 통장"></div>
      <div class="field"><div class="field-k">그룹</div>
        <select id="e-group">${S.groups.map(g=>`<option value="${g.id}" ${g.id===editing.groupId?'selected':''}>${esc(g.name)}</option>`).join('')}</select></div>
      <div class="field"><div class="field-k">시작잔액</div>
        <input type="text" inputmode="numeric" id="e-bal" value="${editing.initialBalance?fmt(editing.initialBalance):''}" placeholder="0"></div>
    </div></div>
    <div class="section">
      <div class="section-title">종류</div>
      <div class="card"><div style="padding:12px 16px"><div class="seg flush">
        <button class="${editing.kind==='asset'?'on':''}" data-act="assetKind" data-v="asset">자산</button>
        <button class="${editing.kind==='liability'?'on':''}" data-act="assetKind" data-v="liability">부채</button>
        <button class="${editing.kind==='receivable'?'on':''}" data-act="assetKind" data-v="receivable">미수금</button>
      </div></div>
      <div class="hint" style="padding:0 16px 14px">
        ${editing.kind==='liability'?'마이너스 통장처럼 갚아야 할 돈. 집계표의 <b>부채</b>로 잡힙니다.'
         :editing.kind==='receivable'?'출장비처럼 돌려받을 돈. 자산·부채 합계에서 <b>빠집니다</b>.'
         :'일반 현금·계좌.'}
      </div></div>
    </div>
    ${editing.id ? `
    <div class="section"><div class="card">
      <div class="switchline" data-act="toggleMain">
        <div><div class="switchline-k">⭐ 메인자산으로 지정</div>
          <div class="switchline-d">홈의 일일 용돈 계산 기준</div></div>
        <div class="sw ${isMain?'on':''}"></div>
      </div>
    </div></div>
    <button class="btn-wide danger" data-act="deleteAsset">자산 삭제</button>` : ''}
    <div style="height:12px"></div>`;
  sheet(editing.id ? '자산 편집' : '자산 추가', body, null, `<button data-act="saveAsset" style="font-weight:600">저장</button>`);
}

function saveAsset(){
  syncAssetDom();
  editing.name = editing.name.trim();
  if(!editing.name){ alert('이름을 입력해 주세요.'); return; }
  if(editing.id){
    const i = S.assets.findIndex(a=>a.id===editing.id);
    S.assets[i] = Object.assign(S.assets[i], editing);
  }else{
    editing.id = uid();
    S.assets.push(editing);
  }
  save(); closeSheet(); render();
}

/* ===================== 그룹 편집 ===================== */
function openGroupEditor(id){
  editing = id ? JSON.parse(JSON.stringify(groupById(id)))
               : { id:null, name:'', defaultBucket:'living' };
  renderGroupSheet();
}
function syncGroupDom(){
  const n = document.getElementById('g-name');
  if(n) editing.name = n.value;
}
function renderGroupSheet(){
  const b = editing.defaultBucket;
  const body = `
    <div class="section" style="margin-top:12px"><div class="card">
      <div class="field"><div class="field-k">이름</div>
        <input type="text" id="g-name" value="${esc(editing.name)}" placeholder="예) 대출 보험"></div>
    </div></div>
    <div class="section">
      <div class="section-title">기본 구분</div>
      <div class="card"><div style="padding:12px 16px"><div class="seg flush">
        <button class="${b==='living'?'on':''}" data-act="groupBucket" data-v="living">생활지출</button>
        <button class="${b==='fixed'?'on':''}" data-act="groupBucket" data-v="fixed">고정지출</button>
        <button class="${b==='passthrough'?'on':''}" data-act="groupBucket" data-v="passthrough">대납</button>
      </div></div>
      <div class="hint" style="padding:0 16px 14px">이 그룹의 자산에서 지출하면 자동으로 이 구분이 선택됩니다.</div>
      </div>
    </div>
    ${editing.id ? `<button class="btn-wide danger" data-act="deleteGroup">그룹 삭제</button>` : ''}
    <div style="height:12px"></div>`;
  sheet(editing.id ? '그룹 편집' : '그룹 추가', body, null, `<button data-act="saveGroup" style="font-weight:600">저장</button>`);
}

function saveGroup(){
  syncGroupDom();
  editing.name = editing.name.trim();
  if(!editing.name){ alert('이름을 입력해 주세요.'); return; }
  if(editing.id){
    const i = S.groups.findIndex(g=>g.id===editing.id);
    S.groups[i] = Object.assign(S.groups[i], editing);
  }else{
    editing.id = uid(); S.groups.push(editing);
  }
  save(); closeSheet(); render();
}

/* ===================== 분류 편집 ===================== */
function openCatEditor(id, type, fromTxn){
  if(fromTxn !== undefined) returnToTxn = !!fromTxn;
  editing = id ? JSON.parse(JSON.stringify(catById(id)))
               : { id:null, name:'', type: type||'expense', bucket:'living', color:PALETTE[0], emoji:'🏷️' };
  renderCatSheet();
}
function syncCatDom(){
  const n = document.getElementById('c-name');
  const e = document.getElementById('c-emoji');
  if(n) editing.name = n.value;
  if(e) editing.emoji = e.value;
}
function renderCatSheet(){
  const b = editing.bucket;
  const body = `
    <div class="section" style="margin-top:12px"><div class="card">
      <div class="field"><div class="field-k">이름</div>
        <input type="text" id="c-name" value="${esc(editing.name)}" placeholder="예) 식비"></div>
      <div class="field"><div class="field-k">아이콘</div>
        <input type="text" id="c-emoji" value="${esc(editing.emoji)}" maxlength="2" placeholder="🍚"></div>
    </div></div>
    <div class="section">
      <div class="section-title">색상</div>
      <div class="card"><div style="display:flex;flex-wrap:wrap;gap:10px;padding:14px 16px">
        ${PALETTE.map(c=>`<button data-act="catColor" data-v="${c}" class="swatch"
          style="background:${c};width:32px;height:32px;border-radius:16px;${c===editing.color?'outline:3px solid var(--label-3);outline-offset:2px':''}"></button>`).join('')}
      </div></div>
    </div>
    ${editing.type==='expense' ? `
    <div class="section">
      <div class="section-title">기본 구분</div>
      <div class="card"><div style="padding:12px 16px"><div class="seg flush">
        <button class="${b==='living'?'on':''}" data-act="catBucket" data-v="living">생활지출</button>
        <button class="${b==='fixed'?'on':''}" data-act="catBucket" data-v="fixed">고정지출</button>
        <button class="${b==='passthrough'?'on':''}" data-act="catBucket" data-v="passthrough">대납</button>
      </div></div></div>
    </div>` : ''}
    ${editing.id ? `<button class="btn-wide danger" data-act="deleteCat">분류 삭제</button>` : ''}
    <div style="height:12px"></div>`;
  sheet(editing.id ? '분류 편집' : '분류 추가', body,
        returnToTxn ? `<button data-act="backToTxn">‹ 뒤로</button>` : null,
        `<button data-act="saveCat" style="font-weight:600">저장</button>`);
}

function saveCat(){
  syncCatDom();
  editing.name = editing.name.trim();
  editing.emoji = (editing.emoji||'').trim();
  if(!editing.name){ alert('이름을 입력해 주세요.'); return; }
  if(editing.id){
    const i = S.categories.findIndex(c=>c.id===editing.id);
    S.categories[i] = Object.assign(S.categories[i], editing);
  }else{
    editing.id = uid(); S.categories.push(editing);
  }
  save();
  if(returnToTxn && draft){          // 내역 시트에서 넘어온 경우: 새 항목을 고른 채 복귀
    returnToTxn = false;
    draft.categoryId = editing.id;
    editing = null;
    applyCatBucket();
    renderTxnSheet();
    return;
  }
  closeSheet(); render();
}

/* ===================== 메인자산 선택 ===================== */
function openMainPicker(){
  const body = `<div class="section" style="margin-top:12px"><div class="card">
    ${liveAssets().map(a=>`<div class="row tap" data-act="setMain" data-id="${a.id}">
      <div class="row-main"><div class="row-title">${esc(a.name)}</div>
        <div class="row-sub">${fmt(balanceOf(a.id))}원</div></div>
      ${S.settings.mainAssetId===a.id?'<div class="row-val c-income">✓</div>':''}
    </div>`).join('')}
  </div></div>
  <div class="hint">홈 화면의 “하루에 쓸 수 있는 돈”은 이 자산의 잔액을 회계월 잔여일수로 나눠 계산합니다.</div>
  <div style="height:20px"></div>`;
  sheet('메인자산 선택', body, `<button data-act="closeSheet">닫기</button>`);
}
