const entries = [
  ['데이터 저장','현재 진행 상황을 저장합니다.','01'],
  ['유닛 개조','기체의 성능을 강화합니다.','02'],
  ['무기 개조','무기의 공격력을 강화합니다.','03'],
  ['유닛 능력','기체의 능력과 장비를 확인합니다.','04'],
  ['파일럿 능력','파일럿의 능력과 정신기를 확인합니다.','05'],
  ['갈아타기','파일럿의 탑승 기체를 변경합니다.','06'],
  ['강화파츠','기체에 강화파츠를 장착합니다.','07'],
  ['다음 전장으로','정비를 마치고 다음 시나리오로 진행합니다.','08'],
];
export function createIntermission({stage, canvas, send, initialEnabled=true, onEnabledChange=()=>{}}) {
  let state={active:false}, selected=0, enabled=initialEnabled, pending=false;
  const panel=document.createElement('section');
  panel.className='intermission';panel.hidden=true;panel.setAttribute('aria-label','인터미션');
  panel.innerHTML=`<header class="im-head"><div><span class="im-eyebrow">SUPER ROBOT WARS F FINAL</span><h2>인터미션<span>출격 전 정비</span></h2></div><button type="button" class="im-original">원작 화면</button></header><div class="im-stats"><span>총 턴 <strong class="im-turns">—</strong></span><span>보유 자금 <strong class="im-funds">—</strong></span></div><nav class="im-grid" aria-label="인터미션 메뉴"></nav><footer class="im-foot"><span class="im-description" aria-live="polite"></span><span class="im-keys">↑ ↓ ← → 이동 · Enter 선택</span></footer>`;
  const grid=panel.querySelector('.im-grid'), description=panel.querySelector('.im-description');
  const buttons=entries.map(([label,help,num],i)=>{
    const b=document.createElement('button');b.type='button';b.className='im-card'+(i===7?' im-launch':'');
    b.innerHTML=`<span class="im-number">${num}</span><span class="im-card-copy"><strong>${label}</strong><span>${help}</span></span><span class="im-arrow" aria-hidden="true">↗</span>`;
    b.onclick=()=>activate(i);
    b.onfocus=()=>{selected=i;paint();};
    grid.append(b);return b;
  });
  const restore=document.createElement('button');restore.type='button';restore.className='im-restore';restore.textContent='새 인터미션 UI';restore.hidden=true;
  const focusSelected=()=>buttons[selected]?.focus({preventScroll:true});
  function paint() {
    buttons.forEach((b,i)=>{b.classList.toggle('is-selected',i===selected);b.tabIndex=i===selected?0:-1;b.disabled=!!state.busy||pending;});
    panel.setAttribute('aria-busy',String(!!state.busy||pending));
    description.textContent=state.busy||pending?'메뉴를 여는 중…':entries[selected][1];
  }
  function activate(i) {
    if(!state.active||state.busy||pending)return;
    selected=i;pending=true;paint();send(i,state.epoch);
  }
  panel.addEventListener('keydown',e=>{
    if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyZ'].includes(e.code)) {
      e.preventDefault();e.stopPropagation();if(state.busy||pending)return;
      if(e.code==='KeyZ'){activate(selected);return;}
      selected=(selected+({ArrowUp:6,ArrowDown:2,ArrowLeft:7,ArrowRight:1}[e.code]))%8;
      focusSelected();
    }
  });
  function visibility(){
    const hadFocus=panel.contains(document.activeElement);
    panel.hidden=!state.active||!enabled;restore.hidden=!state.active||enabled;
    if(panel.hidden&&hadFocus)canvas.focus({preventScroll:true});
  }
  function setEnabled(value) {
    enabled=!!value;selected=state.cursor??0;visibility();onEnabledChange(enabled);
  }
  panel.querySelector('.im-original').onclick=()=>{setEnabled(false);canvas.focus();};
  restore.onclick=()=>{setEnabled(true);focusSelected();};
  stage.append(panel,restore);
  return {
    setEnabled,
    update(next){
      const entering=next.active&&!state.active, exiting=!next.active&&state.active, wasBusy=state.busy;
      if(entering||!next.active||next.busy||wasBusy)pending=false;
      state=next;
      panel.querySelector(".im-turns").textContent=String(next.turns??"—");
      panel.querySelector(".im-funds").textContent=next.funds==null?"—":next.funds.toLocaleString("ko-KR");
      if(entering)selected=next.cursor;
      visibility();paint();
      if(exiting&&enabled&&(document.activeElement===document.body||panel.contains(document.activeElement)))canvas.focus({preventScroll:true});
      if((entering||wasBusy&&!next.busy)&&!panel.hidden)focusSelected();
    },
    reset(){pending=false;state={active:false};visibility();},
  };
}
