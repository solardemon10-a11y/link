// 대시보드 화면. 서버는 정적 HTML 만 내보내고, 데이터는 /api/summary 로 불러와
// DOM API(textContent)로만 그린다 → 계정명/영상 제목에 HTML 이 들어 있어도 실행되지 않는다.
// (주의: 아래 클라이언트 코드에는 백틱/${} 를 쓰지 말 것 — TS 템플릿 리터럴과 충돌)

const CSS = String.raw`
:root{--bg:#faf7f2;--fg:#2b2118;--mut:#7a6b5d;--line:#e4dccf;--card:#fff;--acc:#6b4a32;--up:#1b7f4b;--err:#b3261e}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#17120e;--fg:#f0e8dd;--mut:#a39485;--line:#3a3028;--card:#211a14;--acc:#d2a77f;--up:#5fd391;--err:#ff8a80}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 -apple-system,"Noto Sans KR","Malgun Gothic",sans-serif}
.wrap{max-width:1100px;margin:0 auto;padding:20px 16px 60px}
header{display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;margin-bottom:18px}
h1{font-size:20px;margin:0}
h2{font-size:15px;margin:28px 0 10px}
button{font:inherit;cursor:pointer;border:1px solid var(--line);background:var(--card);color:var(--fg);border-radius:999px;padding:6px 14px}
button.pri{background:var(--acc);border-color:var(--acc);color:var(--bg)}
button:disabled{opacity:.5;cursor:default}
button.sm{padding:2px 10px;font-size:13px}
button.danger{color:var(--err)}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
.kpi{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 14px}
.kpi .l{color:var(--mut);font-size:12px}
.kpi .v{font-size:24px;font-weight:700;font-variant-numeric:tabular-nums}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin:18px 0 0}
.chip.on{background:var(--acc);border-color:var(--acc);color:var(--bg)}
.tw{overflow-x:auto;background:var(--card);border:1px solid var(--line);border-radius:12px}
table{width:100%;border-collapse:collapse;min-width:640px}
th,td{padding:9px 12px;text-align:left;border-bottom:1px solid var(--line);vertical-align:top}
tr:last-child td{border-bottom:0}
th{font-size:12px;color:var(--mut);font-weight:500;white-space:nowrap}
th.s{cursor:pointer}
td.n,th.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.grip{cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none;color:var(--mut);font-size:20px;line-height:1;padding:4px 8px;display:inline-block}
.grip:active{cursor:grabbing}
tr.drag td{opacity:.45}
tr.over-top td{box-shadow:inset 0 3px 0 var(--acc)}
tr.over-bottom td{box-shadow:inset 0 -3px 0 var(--acc)}
tr.click{cursor:pointer}
tr.click:hover td{background:var(--bg)}
tr.sel td{background:var(--bg);box-shadow:inset 0 1px 0 var(--acc),inset 0 -1px 0 var(--acc)}
.up{color:var(--up)}
.mut{color:var(--mut);font-size:12px}
.err{color:var(--err);font-size:12px}
.act{white-space:nowrap;display:flex;gap:4px;flex-wrap:wrap}
a{color:var(--acc)}
dialog{border:1px solid var(--line);border-radius:14px;background:var(--card);color:var(--fg);padding:20px;width:min(420px,92vw)}
dialog::backdrop{background:rgba(0,0,0,.4)}
label{display:block;font-size:12px;color:var(--mut);margin:10px 0 3px}
input,select{width:100%;font:inherit;padding:7px 10px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--fg)}
.row{display:flex;gap:8px;justify-content:flex-end;margin-top:16px}
.empty{padding:28px;text-align:center;color:var(--mut)}
`;

const JS = String.raw`
var PLAT = {youtube:"YouTube",instagram:"Instagram",tiktok:"TikTok",facebook:"Facebook",threads:"Threads",x:"X",other:"기타"};
var state = {data:null, filter:"all", account:null, sort:"views"};
var nf = new Intl.NumberFormat("ko-KR");
function fmt(n){ return n==null ? "-" : nf.format(n); }
function delta(n){ if(n==null) return "-"; return (n>0?"+":"") + nf.format(n); }
function h(tag, attrs, kids){
  var e = document.createElement(tag);
  for (var k in (attrs||{})) {
    var v = attrs[k];
    if (k==="class") e.className = v;
    else if (k.slice(0,2)==="on") e.addEventListener(k.slice(2), v);
    else if (v!==false && v!=null) e.setAttribute(k, v);
  }
  [].concat(kids==null?[]:kids).forEach(function(c){ e.appendChild(typeof c==="string"||typeof c==="number" ? document.createTextNode(String(c)) : c); });
  return e;
}
function api(method, path, body){
  return fetch(path, {method:method, headers:{"X-Requested-With":"views-dashboard","Content-Type":"application/json"}, body: body?JSON.stringify(body):undefined})
    .then(function(r){ return r.json().catch(function(){return {};}).then(function(j){ if(!r.ok) throw new Error(j.error||("HTTP "+r.status)); return j; }); });
}
function safeUrl(u){ return /^https?:\/\//i.test(u||"") ? u : null; }

function load(){
  return api("GET","/api/summary").then(function(d){ state.data=d; render(); }).catch(function(e){ alert("불러오기 실패: "+e.message); });
}

function render(){
  var d = state.data, root = document.getElementById("root");
  var accsAll = d.accounts.filter(function(a){ return state.filter==="all"||a.platform===state.filter; });
  var sel = null; accsAll.forEach(function(a){ if (a.id===state.account) sel = a; });
  if (!sel) state.account = null;
  var accs = sel ? [sel] : accsAll;   // KPI·영상 목록은 선택한 계정만(없으면 전체)
  var ids = {}; accs.forEach(function(a){ ids[a.id]=a; });
  var vids = d.videos.filter(function(v){ return ids[v.account_id]; });
  if (state.sort==="date") vids.sort(function(a,b){ return String(b.published_at||"").localeCompare(String(a.published_at||"")); });
  else vids.sort(function(a,b){ return b.views-a.views; });

  function sum(key){ var t=0,any=false; accs.forEach(function(a){ if(a[key]!=null){t+=a[key];any=true;} }); return any?t:null; }
  var kpis = h("div",{class:"kpis"},[
    kpi("총 조회수", fmt(sum("views"))), kpi("오늘 증가", delta(sum("delta_1d"))), kpi("7일 증가", delta(sum("delta_7d"))), kpi("계정 수", accs.length)
  ]);

  var plats = ["all"]; d.accounts.forEach(function(a){ if(plats.indexOf(a.platform)<0) plats.push(a.platform); });
  var chips = h("div",{class:"chips"}, plats.map(function(p){
    var total = 0; d.accounts.forEach(function(a){ if(p==="all"||a.platform===p) total+=a.views; });
    return h("button",{class:"chip"+(state.filter===p?" on":""), onclick:function(){state.filter=p;state.account=null;render();}}, (p==="all"?"전체":PLAT[p])+" "+fmt(total));
  }));

  var accTable;
  if (!accsAll.length) accTable = h("div",{class:"empty"},"계정이 없습니다. 오른쪽 위 \"+ 계정 추가\"로 시작하세요.");
  else accTable = h("table",{},[
    h("thead",{},h("tr",{},[th(""),th("플랫폼"),th("계정"),th("조회수","n"),th("오늘","n"),th("7일","n"),th("영상","n"),th("수집 상태"),th("")])),
    attachDrag(h("tbody",{}, accsAll.map(accRow)))
  ]);

  var vidTable;
  if (!vids.length) vidTable = h("div",{class:"empty"},"표시할 영상이 없습니다.");
  else vidTable = h("table",{},[
    h("thead",{},h("tr",{},[th("제목"),th("계정"),
      h("th",{class:"n s",onclick:function(){state.sort="views";render();}},"조회수"+(state.sort==="views"?" ▼":"")),
      th("좋아요","n"),
      h("th",{class:"s",onclick:function(){state.sort="date";render();}},"업로드"+(state.sort==="date"?" ▼":"")), th("")])),
    h("tbody",{}, vids.slice(0,100).map(function(v){ return vidRow(v, ids[v.account_id]); }))
  ]);

  root.replaceChildren(kpis, chips, h("h2",{},"계정별 (이름을 누르면 그 계정만 보기)"), h("div",{class:"tw"},accTable), vidHeading(sel, vids.length), h("div",{class:"tw"},vidTable));
}
function vidHeading(sel, n){
  if (!sel) return h("h2",{},"영상별 (전체 상위 100개)");
  return h("h2",{},[
    PLAT[sel.platform]+" · "+sel.label+" 영상 "+n+"개 ",
    h("button",{class:"sm",onclick:function(){ state.account=null; render(); }},"← 전체 보기")
  ]);
}
// ---- 드래그로 순서 바꾸기 (마우스·터치 공통: pointer 이벤트)
function attachDrag(tbody){
  var dragRow = null, overRow = null, after = false;
  function clear(){ if (overRow) overRow.classList.remove("over-top","over-bottom"); overRow = null; }
  tbody.addEventListener("pointerdown", function(e){
    var g = e.target.closest && e.target.closest(".grip"); if (!g) return;
    dragRow = g.closest("tr"); dragRow.classList.add("drag");
    try { g.setPointerCapture(e.pointerId); } catch(_) {}
    e.preventDefault();
  });
  tbody.addEventListener("pointermove", function(e){
    if (!dragRow) return;
    clear();
    var rows = tbody.querySelectorAll("tr");
    for (var i=0;i<rows.length;i++){
      var r = rows[i], b = r.getBoundingClientRect();
      if (r!==dragRow && e.clientY>=b.top && e.clientY<=b.bottom){
        after = e.clientY > b.top + b.height/2; overRow = r;
        r.classList.add(after ? "over-bottom" : "over-top"); break;
      }
    }
  });
  function finish(save){
    if (!dragRow) return;
    var row = dragRow, target = overRow, below = after;
    dragRow.classList.remove("drag"); clear(); dragRow = null;
    if (!save || !target) return;
    tbody.insertBefore(row, below ? target.nextSibling : target);
    var shown = [].map.call(tbody.querySelectorAll("tr"), function(tr){ return Number(tr.getAttribute("data-id")); });
    saveOrder(shown);
  }
  tbody.addEventListener("pointerup", function(){ finish(true); });
  tbody.addEventListener("pointercancel", function(){ finish(false); });
  return tbody;
}
// 필터로 일부만 보이는 경우에도 안 보이는 계정의 자리는 그대로 두고, 보이는 것들끼리만 순서를 바꾼다
function saveOrder(shownIds){
  var all = state.data.accounts.map(function(a){ return a.id; });
  var slots = [];
  all.forEach(function(id,i){ if (shownIds.indexOf(id) >= 0) slots.push(i); });
  var next = all.slice();
  slots.forEach(function(pos,k){ next[pos] = shownIds[k]; });
  api("POST","/api/accounts/reorder",{ids:next}).then(load).catch(function(e){ alert("순서 저장 실패: "+e.message); load(); });
}
function kpi(l,v){ return h("div",{class:"kpi"},[h("div",{class:"l"},l),h("div",{class:"v"},String(v))]); }
function th(t,c){ return h("th",{class:c||""},t); }

function accRow(a){
  var status = [];
  if (a.auto) {
    status.push(h("div",{class:"mut"}, a.last_synced_at ? ("수집 "+a.last_synced_at+" UTC") : "아직 수집 전"));
    if (a.last_error) status.push(h("div",{class:"err"}, a.last_error));
  } else status.push(h("div",{class:"mut"},"수동 입력"));
  var acts = [];
  if (a.auto) acts.push(h("button",{class:"sm",onclick:function(e){ syncOne(a.id,e.target); }},"새로고침"));
  else {
    acts.push(h("button",{class:"sm",onclick:function(){ setTotal(a); }},"총 조회수"));
    acts.push(h("button",{class:"sm",onclick:function(){ openVideoDialog(a); }},"영상 추가"));
  }
  if (a.platform==="instagram") acts.push(h("button",{class:"sm",onclick:function(){ openDiagnose(a); }},"진단"));
  acts.push(h("button",{class:"sm",onclick:function(){ openEditDialog(a); }},"수정"));
  acts.push(h("button",{class:"sm danger",onclick:function(){ delAccount(a); }},"삭제"));
  return h("tr",{"data-id":a.id, class:"click"+(a.id===state.account?" sel":""), onclick:function(){ state.account = (state.account===a.id ? null : a.id); render(); }},[
    h("td",{onclick:function(e){ e.stopPropagation(); }},h("span",{class:"grip",title:"끌어서 순서 바꾸기"},"⠿")),
    h("td",{},PLAT[a.platform]),
    h("td",{},[h("div",{},a.label), a.handle?h("div",{class:"mut"},a.handle):""]),
    h("td",{class:"n"},fmt(a.views)),
    h("td",{class:"n"+(a.delta_1d>0?" up":"")},delta(a.delta_1d)),
    h("td",{class:"n"+(a.delta_7d>0?" up":"")},delta(a.delta_7d)),
    h("td",{class:"n"},fmt(a.video_count)),
    h("td",{},status),
    h("td",{onclick:function(e){ e.stopPropagation(); }},h("div",{class:"act"},acts))
  ]);
}
function vidRow(v, a){
  var u = safeUrl(v.url);
  var title = v.title || "(제목 없음)";
  var del = a && !a.auto ? [
    h("button",{class:"sm",onclick:function(){ editVideo(v); }},"수정"),
    h("button",{class:"sm danger",onclick:function(){ delVideo(v); }},"삭제")
  ] : [];
  return h("tr",{},[
    h("td",{}, u ? h("a",{href:u,target:"_blank",rel:"noopener noreferrer"},title) : title),
    h("td",{}, a ? (PLAT[a.platform]+" · "+a.label) : ""),
    h("td",{class:"n"},fmt(v.views)),
    h("td",{class:"n"},fmt(v.likes)),
    h("td",{class:"mut"}, v.published_at ? String(v.published_at).slice(0,10) : "-"),
    h("td",{},h("div",{class:"act"},del))
  ]);
}

function busy(btn,on){ if(btn){ btn.disabled=on; } }
function syncOne(id,btn){
  busy(btn,true);
  return api("POST","/api/accounts/"+id+"/sync").catch(function(e){ alert("수집 실패: "+e.message); }).then(function(){ busy(btn,false); return load(); });
}
function syncAllAccounts(){
  var btn = document.getElementById("syncAll"); busy(btn,true);
  var autos = state.data.accounts.filter(function(a){return a.auto;});
  var p = Promise.resolve();
  autos.forEach(function(a,i){ p = p.then(function(){ btn.textContent = "수집 중 "+(i+1)+"/"+autos.length; return api("POST","/api/accounts/"+a.id+"/sync").catch(function(){}); }); });
  return p.then(function(){ btn.textContent="전체 새로고침"; busy(btn,false); return load(); });
}
function delAccount(a){
  if (!confirm("\""+a.label+"\" 계정과 수집된 영상 기록을 삭제할까요?")) return;
  api("DELETE","/api/accounts/"+a.id).then(load).catch(function(e){alert(e.message);});
}
function setTotal(a){
  var v = prompt("\""+a.label+"\"의 현재 총 조회수 (숫자만)", a.manual_total==null?"":a.manual_total);
  if (v===null) return;
  api("PUT","/api/accounts/"+a.id,{manual_total:v.replace(/[,\s]/g,"")}).then(load).catch(function(e){alert(e.message);});
}
function editVideo(v){
  var n = prompt("조회수 (숫자만)", v.views);
  if (n===null) return;
  api("PUT","/api/videos/"+v.id,{views:n.replace(/[,\s]/g,"")}).then(load).catch(function(e){alert(e.message);});
}
function delVideo(v){
  if (!confirm("이 영상 기록을 삭제할까요?")) return;
  api("DELETE","/api/videos/"+v.id).then(load).catch(function(e){alert(e.message);});
}

// ---- 다이얼로그
function field(label, name, type, ph){ return [h("label",{for:name},label), h("input",{id:name,name:name,type:type||"text",placeholder:ph||"",autocomplete:type==="password"?"new-password":"off"})]; }
function openDialog(title, bodyKids, onSubmit){
  var dlg = h("dialog",{});
  var form = h("form",{method:"dialog"},[h("h2",{style:"margin-top:0"},title)].concat(bodyKids,[
    h("div",{class:"row"},[h("button",{type:"button",onclick:function(){dlg.close();}},"취소"), h("button",{class:"pri",type:"submit"},"저장")])
  ]));
  form.addEventListener("submit",function(e){ e.preventDefault(); onSubmit(form, dlg); });
  dlg.appendChild(form); document.body.appendChild(dlg);
  dlg.addEventListener("close",function(){ dlg.remove(); });
  dlg.showModal();
}
function val(form,name){ return form.elements[name].value; }

function openDiagnose(a){
  var dlg = h("dialog",{});
  var ta = h("textarea",{readonly:"readonly",rows:"16",style:"width:100%;font:12px/1.4 monospace;background:var(--bg);color:var(--fg);border:1px solid var(--line);border-radius:8px;padding:8px"},"불러오는 중…");
  dlg.appendChild(h("h2",{style:"margin-top:0"},"Instagram 진단 — "+a.label));
  dlg.appendChild(h("div",{class:"mut"},"최근 영상 4개의 지표별 값입니다. 토큰은 포함되지 않습니다. 전체 선택(Ctrl+A) 후 복사해서 알려 주세요."));
  dlg.appendChild(ta);
  dlg.appendChild(h("div",{class:"row"},[h("button",{type:"button",onclick:function(){dlg.close();}},"닫기")]));
  document.body.appendChild(dlg); dlg.addEventListener("close",function(){ dlg.remove(); }); dlg.showModal();
  api("GET","/api/accounts/"+a.id+"/diagnose").then(function(r){ ta.value = JSON.stringify(r,null,2); }).catch(function(e){ ta.value = "오류: "+e.message; });
}
function fieldV(label, name, type, ph, value){
  return [h("label",{for:name},label), h("input",{id:name,name:name,type:type||"text",placeholder:ph||"",autocomplete:type==="password"?"new-password":"off",value:value==null?"":String(value)})];
}
function openEditDialog(a){
  var kids = [].concat(fieldV("이름","label","text","",a.label), fieldV("핸들 (표시용)","handle","text","@name",a.handle));
  if (a.platform==="youtube") kids = kids.concat(fieldV("채널 ID (UC...) 또는 @핸들","external_id","text","@mychannel",a.external_id));
  else if (a.platform==="instagram") {
    kids = kids.concat(fieldV("액세스 토큰","token","password","바꿀 때만 입력 (비우면 기존 유지)",""));
    kids = kids.concat(fieldV("IG 사용자 ID (숫자) — IGAA 토큰이면 비워도 됨","external_id","text","",a.external_id));
  } else kids = kids.concat(fieldV("현재 총 조회수 (비우면 영상 합계 사용)","manual_total","text","",a.manual_total));
  kids.push(h("div",{class:"mut"},"플랫폼은 바꿀 수 없습니다. 바꾸려면 삭제 후 다시 추가하세요."));
  openDialog("계정 수정 — "+PLAT[a.platform], kids, function(form,dlg){
    var body = {label:val(form,"label"), handle:val(form,"handle")};
    if (form.elements.external_id) body.external_id = val(form,"external_id").trim();
    if (form.elements.token) body.token = val(form,"token").trim();
    if (form.elements.manual_total) body.manual_total = val(form,"manual_total").replace(/[,\s]/g,"");
    api("PUT","/api/accounts/"+a.id,body).then(function(){
      dlg.close();
      if (!a.auto) return null;
      return api("POST","/api/accounts/"+a.id+"/sync").catch(function(){});  // 오류는 수집 상태 칸에 표시됨
    }).then(load).catch(function(e){ alert(e.message); });
  });
}
function openAccountDialog(){
  var sel = h("select",{id:"platform",name:"platform"}, Object.keys(PLAT).map(function(k){ return h("option",{value:k},PLAT[k]); }));
  var extra = h("div",{});
  function renderExtra(){
    var p = sel.value;
    var kids = [];
    if (p==="youtube") { kids = kids.concat(field("채널 ID (UC...) 또는 @핸들","external_id","text","@mychannel")); kids.push(h("div",{class:"mut"},"공개 조회수만 읽습니다. 서버에 YOUTUBE_API_KEY 가 등록돼 있어야 합니다.")); }
    else if (p==="instagram") { kids = kids.concat(field("액세스 토큰","token","password","IGAA... 또는 EAA...")); kids = kids.concat(field("IG 사용자 ID (숫자) — IGAA 토큰이면 비워도 됨","external_id","text")); kids.push(h("div",{class:"mut"},"비즈니스/크리에이터 계정 + Meta 앱 토큰이 필요합니다. 저장 후 화면에는 다시 표시되지 않습니다.")); }
    else { kids = kids.concat(field("현재 총 조회수 (선택, 나중에 입력 가능)","manual_total","text")); kids.push(h("div",{class:"mut"},"이 플랫폼은 자동 수집을 지원하지 않아 직접 입력합니다.")); }
    extra.replaceChildren.apply(extra, kids);
  }
  sel.addEventListener("change",renderExtra);
  openDialog("계정 추가", [h("label",{for:"platform"},"플랫폼"),sel].concat(field("이름 (구분용)","label","text","예: 쇼츠 3호"),field("핸들 (표시용, 선택)","handle","text","@name"),[extra]), function(form,dlg){
    var body = {platform:val(form,"platform"), label:val(form,"label"), handle:val(form,"handle")};
    ["external_id","token","manual_total"].forEach(function(n){
      if (!form.elements[n]) return;
      body[n] = n==="manual_total" ? val(form,n).replace(/[,\s]/g,"") : val(form,n).trim();
    });
    api("POST","/api/accounts",body).then(function(r){
      dlg.close();
      if (["youtube","instagram"].indexOf(body.platform) < 0) return null;
      return api("POST","/api/accounts/"+r.id+"/sync").catch(function(e){ alert("계정은 추가됐지만 첫 수집 실패: "+e.message); });
    }).then(load).catch(function(e){alert(e.message);});
  });
  renderExtra();
}
function openVideoDialog(a){
  openDialog("영상 추가 — "+a.label, [].concat(field("제목","title"),field("링크 (선택)","url","url","https://"),field("업로드일 (선택)","published_at","date"),field("조회수","views","text")), function(form,dlg){
    api("POST","/api/accounts/"+a.id+"/videos",{title:val(form,"title"),url:val(form,"url"),published_at:val(form,"published_at"),views:val(form,"views").replace(/[,\s]/g,"")}).then(function(){dlg.close();return load();}).catch(function(e){alert(e.message);});
  });
}

document.getElementById("syncAll").addEventListener("click",syncAllAccounts);
document.getElementById("addAcc").addEventListener("click",openAccountDialog);
load();
`;

export function renderPage(): string {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>조회수 대시보드</title>
<style>${CSS}</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>조회수 대시보드</h1>
    <div style="display:flex;gap:8px">
      <button id="syncAll">전체 새로고침</button>
      <button id="addAcc" class="pri">+ 계정 추가</button>
    </div>
  </header>
  <div id="root"><div class="empty">불러오는 중…</div></div>
</div>
<script>${JS}</script>
</body>
</html>`;
}
