'use strict';

/* =========================================================
   설정 화면
   ========================================================= */

function renderSettings(){
  if(ui.sub === 'settings-assets') return renderAssetSettings();
  if(ui.sub === 'settings-cats')   return renderCatSettings();

  const ma = mainAsset();
  const th = S.settings.theme || 'auto';
  const fc = S.settings.fixedColor || 'orange';

  return navbar('설정') + `
  <div class="section" style="margin-top:12px">
    <div class="card">
      <a class="row tap" href="guide.html" style="color:inherit;text-decoration:none">
        <div class="row-main"><div class="row-title">📖 사용설명서</div>
          <div class="row-sub">처음이라면 먼저 읽어보세요</div></div>
        <div class="chev">›</div>
      </a>
    </div>
  </div>

  <div class="section">
    <div class="section-title">관리</div>
    <div class="card">
      <div class="row tap" data-act="goAssetSettings"><div class="row-main"><div class="row-title">자산 관리</div>
        <div class="row-sub">그룹 · 자산 추가 / 이름변경 / 삭제</div></div><div class="chev">›</div></div>
      <div class="row tap" data-act="goCatSettings"><div class="row-main"><div class="row-title">분류 관리</div>
        <div class="row-sub">지출 · 수입 분류와 기본 구분</div></div><div class="chev">›</div></div>
      <div class="row tap" data-act="pickMain"><div class="row-main"><div class="row-title">⭐ 메인자산</div>
        <div class="row-sub">${ma && groupById(ma.groupId)
            ? `일일 용돈은 <b>${esc(groupById(ma.groupId).name)}</b> 그룹 전체로 계산`
            : '일일 용돈 계산 기준'}</div></div>
        <div class="row-val c-lbl2">${ma?esc(ma.name):'없음'}</div><div class="chev">›</div></div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">기간</div>
    <div class="card">
      <div class="row"><div class="row-main"><div class="row-title">월 시작일</div>
        <div class="row-sub">${S.settings.monthStartDay}일 시작 → ${rangeLabel(fiscalRange(fiscalOf(todayStr()).y, fiscalOf(todayStr()).m))} = ${fmLabel(fiscalOf(todayStr()))}</div></div>
        <div class="row-val"><select id="startDay" data-act="setStartDay">
          ${Array.from({length:28},(_,i)=>i+1).map(d=>`<option value="${d}" ${d===S.settings.monthStartDay?'selected':''}>${d}일</option>`).join('')}
        </select></div></div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">화면</div>
    <div class="card">
      <div class="row"><div class="row-main"><div class="row-title">테마</div></div></div>
      <div style="padding:0 16px 14px"><div class="seg flush">
        <button class="${th==='auto'?'on':''}" data-act="setTheme" data-v="auto">자동</button>
        <button class="${th==='light'?'on':''}" data-act="setTheme" data-v="light">라이트</button>
        <button class="${th==='dark'?'on':''}" data-act="setTheme" data-v="dark">다크</button>
      </div></div>
      <div class="row"><div class="row-main"><div class="row-title">고정지출 색상</div>
        <div class="row-sub">주황으로 두면 생활지출과 한눈에 구분됩니다</div></div></div>
      <div style="padding:0 16px 14px"><div class="seg flush">
        <button class="${fc==='orange'?'on':''}" data-act="setFixedColor" data-v="orange">주황 (추천)</button>
        <button class="${fc==='red'?'on':''}" data-act="setFixedColor" data-v="red">빨강 통일</button>
      </div></div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">데이터 · 내역 ${S.txns.length}건</div>
    <div class="card">
      <div class="row tap" data-act="exportJson"><div class="row-main"><div class="row-title">백업 내보내기 (JSON)</div></div><div class="chev">›</div></div>
      <div class="row tap" data-act="importJson"><div class="row-main"><div class="row-title">백업 복원</div></div><div class="chev">›</div></div>
      <div class="row tap" data-act="exportCsv"><div class="row-main"><div class="row-title">엑셀용 CSV 내보내기</div></div><div class="chev">›</div></div>
    </div>
    <div class="card">
      <div class="row tap" data-act="clearTxns"><div class="row-main"><div class="row-title c-living">샘플 내역 전체 삭제</div>
        <div class="row-sub">자산·분류는 그대로 두고 내역만 지웁니다</div></div></div>
      <div class="row tap" data-act="resetAll"><div class="row-main"><div class="row-title c-living">전체 초기화</div></div></div>
    </div>
  </div>
  <div class="hint" style="padding:12px 16px 0">데이터는 이 브라우저에만 저장됩니다. 기기 변경 전에 반드시 백업하세요.</div>
  <div style="height:32px"></div>`;
}

/* ---------------- 자산 관리 ---------------- */
function renderAssetSettings(){
  let body = '';
  S.groups.forEach((g, gi)=>{
    const list = assetsOfGroup(g.id);
    body += `<div class="ghead">
        <div class="ghead-n">${esc(g.name)} · 기본 ${BUCKET_NAME[g.defaultBucket]}</div>
        <div class="reorder">
          <button data-act="moveGroup" data-id="${g.id}" data-v="-1" ${gi===0?'disabled':''}>▲</button>
          <button data-act="moveGroup" data-id="${g.id}" data-v="1" ${gi===S.groups.length-1?'disabled':''}>▼</button>
          <button data-act="editGroup" data-id="${g.id}">✏️</button>
        </div>
      </div><div class="card">`;
    if(!list.length) body += `<div class="row"><div class="row-main c-lbl3">자산 없음</div></div>`;
    list.forEach((a, ai)=>{
      body += `<div class="row">
        <div class="row-main" data-act="editAsset" data-id="${a.id}">
          <div class="row-title">${S.settings.mainAssetId===a.id?'⭐ ':''}${esc(a.name)}</div>
          <div class="row-sub">${a.kind==='asset'?'자산':a.kind==='liability'?'부채':'미수금'} · 시작 ${fmt(a.initialBalance||0)}원</div>
        </div>
        <div class="reorder">
          <button data-act="moveAsset" data-id="${a.id}" data-v="-1" ${ai===0?'disabled':''}>▲</button>
          <button data-act="moveAsset" data-id="${a.id}" data-v="1" ${ai===list.length-1?'disabled':''}>▼</button>
          <button data-act="editAsset" data-id="${a.id}">✏️</button>
        </div>
      </div>`;
    });
    body += `<div class="row tap" data-act="newAsset" data-id="${g.id}"><div class="row-main"><div class="row-title c-income">＋ 자산 추가</div></div></div>`;
    body += '</div>';
  });

  return navbar('자산 관리', `<button data-act="goSettings">‹ 설정</button>`) + `
    <div class="section">${body}</div>
    <button class="btn-wide" data-act="newGroup">＋ 그룹 추가</button>
    <div class="hint">그룹의 <b>기본 구분</b>을 정해두면 내역 추가할 때 고정/생활이 자동으로 선택됩니다.</div>
    <div style="height:32px"></div>`;
}

/* ---------------- 분류 관리 ---------------- */
function renderCatSettings(){
  const sec = (type, title)=>{
    const list = S.categories.filter(c=>c.type===type);
    return `<div class="section">
      <div class="section-title">${title}</div>
      <div class="card">
        ${list.map(c=>`<div class="row tap" data-act="editCat" data-id="${c.id}">
          <div class="swatch" style="background:${c.color}"></div>
          <div class="row-main"><div class="row-title">${c.emoji||''} ${esc(c.name)}</div>
            ${type==='expense' ? `<div class="row-sub">기본 ${BUCKET_NAME[c.bucket]}</div>` : ''}</div>
          <div class="chev">›</div>
        </div>`).join('') || `<div class="row"><div class="row-main c-lbl3">없음</div></div>`}
        <div class="row tap" data-act="newCat" data-v="${type}"><div class="row-main"><div class="row-title c-income">＋ 분류 추가</div></div></div>
      </div>
    </div>`;
  };
  return navbar('분류 관리', `<button data-act="goSettings">‹ 설정</button>`)
    + sec('expense','지출 분류') + sec('income','수입 분류')
    + `<div class="hint">분류의 기본 구분이 내역 추가 시 자동으로 선택됩니다. 건별로 바꿀 수 있습니다.</div>
       <div style="height:32px"></div>`;
}
