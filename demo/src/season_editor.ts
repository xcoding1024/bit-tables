import { escapeAttr, escapeHtml } from './dom';
import { checkSeasonRows, parseSeasonScope, seasonScopeLabel, serializeSeasonScope, subtractSeasonIntervals, SEASON_MAX, type SeasonInterval } from './season';
import type { Row } from './types';

type Clause = { exclude:boolean; unit:'season'|'version'; op:'at'|'after'|'before'|'between'; start:string; end:string };
export function openSeasonDialog(options: { host:HTMLElement; rows:Row[]; indexes:number[]; keys:string[]; canApply:()=>boolean; apply:(value:string)=>void }): void {
  const {host,rows,indexes,keys}=options;
  if (!indexes.length || !options.canApply()) return;
  const original=rows.map(row=>row.$season);
  const values=[...new Set(indexes.map(i=>String(rows[i].$season??'').trim()))];
  let common=values.length===1 && !values[0];
  let clauses:Clause[]=[];
  if(values.length===1 && values[0]) {
    try { clauses=(parseSeasonScope(values[0])||[]).map(([a,b]):Clause=>{
      if(a===b)return {exclude:false,unit:'version',op:'at',start:String(a),end:''};
      if(a%100===0 && b===a+99)return {exclude:false,unit:'season',op:'at',start:String(a/100),end:''};
      if(b===SEASON_MAX)return {exclude:false,unit:a%100===0?'season':'version',op:'after',start:String(a%100===0?a/100:a),end:''};
      if(a===0)return {exclude:false,unit:b%100===99?'season':'version',op:'before',start:String(b%100===99?Math.floor(b/100):b),end:''};
      const whole=a%100===0 && b%100===99;
      return {exclude:false,unit:whole?'season':'version',op:'between',start:String(whole?a/100:a),end:String(whole?Math.floor(b/100):b)};
    }); } catch { /* 非法旧值由新范围替换。 */ }
  }
  if(!clauses.length) clauses=[{exclude:false,unit:'season',op:'at',start:'',end:''}];
  const overlay=document.createElement('div');
  overlay.dataset.seasonDialog='1'; overlay.setAttribute('role','dialog'); overlay.setAttribute('aria-label','设置适用赛季'); overlay.setAttribute('aria-modal','true');
  overlay.style.cssText='position:fixed;inset:0;z-index:1000;background:#0008;display:flex;align-items:center;justify-content:center;padding:20px';
  const input='height:30px;border:1px solid #555;border-radius:4px;background:#202020;color:#eee;padding:0 8px;max-width:100%';
  const button=input+';cursor:pointer';
  const close=()=>overlay.remove();
  function range(clause:Clause):SeasonInterval {
    const read=(s:string)=>{
      if(!/^\d+$/.test(s))throw new Error('请填写完整的非负整数编号');
      const n=Number(s);
      if(!Number.isSafeInteger(n) || n>(clause.unit==='season'?(SEASON_MAX-100)/100:SEASON_MAX-100))throw new Error('编号超出范围');
      return n;
    };
    const a=read(clause.start), b=clause.op==='between'?read(clause.end):a;
    if(b<a)throw new Error('起始编号不能大于结束编号');
    const start=clause.unit==='season'?a*100:a, end=clause.unit==='season'?b*100+99:b;
    return [clause.op==='before'?0:start,clause.op==='after'?SEASON_MAX:end];
  }
  function value():string {
    if(common)return '';
    if(!clauses.length)throw new Error('请添加适用范围');
    const included=clauses.filter(c=>!c.exclude).map(range), excluded=clauses.filter(c=>c.exclude).map(range);
    return serializeSeasonScope(subtractSeasonIntervals(included.length?included:[[0,SEASON_MAX]],excluded));
  }
  function preview() {
    const node=overlay.querySelector('[data-season-preview]')!;
    const apply=overlay.querySelector('[data-season-apply]') as HTMLButtonElement;
    try { node.textContent=seasonScopeLabel(value());apply.disabled=false; }
    catch(error) {node.textContent=(error as Error).message;apply.disabled=true;}
  }
  function render() {
    const opt=(v:string,label:string,current:string)=>`<option value="${v}"${v===current?' selected':''}>${label}</option>`;
    overlay.innerHTML=`<div style="width:680px;max-width:100%;max-height:90vh;overflow:auto;background:#252525;color:#eee;border:1px solid #555;border-radius:8px;padding:18px">
      <div style="font-size:16px;margin-bottom:8px">设置适用赛季 · ${indexes.length} 行</div>
      <div style="margin-bottom:12px;color:#bbb">当前：${values.length>1?'多种范围':escapeHtml(seasonScopeLabel(values[0]))}</div>
      <label><input type="checkbox" data-season-common ${common?'checked':''}> 通用（没有专属配置时生效）</label>
      ${common?'':`<div style="margin-top:12px">${clauses.map((c,i)=>`<div data-clause="${i}" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">
        <select aria-label="条件关系 ${i+1}" data-part="exclude" style="${input}">${opt('false','包含',String(c.exclude))}${opt('true','排除',String(c.exclude))}</select>
        <select aria-label="范围粒度 ${i+1}" data-part="unit" style="${input}">${opt('season','赛季',c.unit)}${opt('version','赛季版本',c.unit)}</select>
        <select aria-label="范围类型 ${i+1}" data-part="op" style="${input}">${opt('at','指定',c.op)}${opt('after','之后（含）',c.op)}${opt('before','之前（含）',c.op)}${opt('between','区间（含两端）',c.op)}</select>
        <input aria-label="起始编号 ${i+1}" data-part="start" value="${escapeAttr(c.start)}" placeholder="${c.unit==='season'?'101':'10101'}" inputmode="numeric" style="${input};width:100px">
        ${c.op==='between'?`<input aria-label="结束编号 ${i+1}" data-part="end" value="${escapeAttr(c.end)}" inputmode="numeric" style="${input};width:100px">`:''}
        <button type="button" data-remove="${i}" aria-label="移除条件 ${i+1}" style="${button}">移除</button></div>`).join('')}
        <button type="button" data-season-add style="${button}">添加范围</button></div>`}
      <p style="color:#bbb">之前、之后和区间均包含端点；按完整编号跨剧本比较。包含条件取并集，再扣除排除范围。</p>
      <div data-season-preview aria-live="polite" style="margin:12px 0"></div>
      <div data-season-error role="alert" style="color:#ffaaaa;white-space:pre-wrap"></div>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px"><button type="button" data-season-cancel style="${button}">取消</button><button type="button" data-season-apply style="${button}">应用到选中行</button></div>
    </div>`;
    overlay.querySelector('[data-season-common]')!.addEventListener('change',event=>{common=(event.target as HTMLInputElement).checked;render();});
    overlay.querySelector('[data-season-cancel]')!.addEventListener('click',close);
    overlay.querySelector('[data-season-add]')?.addEventListener('click',()=>{clauses.push({exclude:false,unit:'season',op:'at',start:'',end:''});render();});
    overlay.querySelectorAll('[data-remove]').forEach(button=>button.addEventListener('click',()=>{clauses.splice(Number(button.getAttribute('data-remove')),1);render();}));
    overlay.querySelectorAll('[data-part]').forEach(control=>control.addEventListener(control.tagName==='INPUT'?'input':'change',()=>{
      const clause=clauses[Number(control.closest('[data-clause]')!.getAttribute('data-clause'))];
      const part=control.getAttribute('data-part') as keyof Clause;
      const next=(control as HTMLInputElement).value;
      Object.assign(clause,{[part]:part==='exclude'?next==='true':next});
      if(part==='op' || part==='unit')render();else preview();
    }));
    overlay.querySelector('[data-season-apply]')!.addEventListener('click',()=>{
      try {
        if(!options.canApply() || original.length!==rows.length || rows.some((r,i)=>r.$season!==original[i]))throw new Error('数据或编辑状态已变化，请重新选择');
        const next=value(), targets=new Set(indexes);
        const proposed=rows.map((r,i)=>targets.has(i)?{...r,$season:next}:r);
        const issues=checkSeasonRows(proposed,keys).filter(e=>targets.has(e.rowIndex));
        if(issues.length)throw new Error([...new Set(issues.map(e=>e.message))].join('\n'));
        options.apply(next);close();
      } catch(error) {overlay.querySelector('[data-season-error]')!.textContent=(error as Error).message;}
    });
    preview();
  }
  overlay.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close();}},true);
  overlay.addEventListener('click',event=>{if(event.target===overlay)close();});
  host.appendChild(overlay);render();
  (overlay.querySelector('input') as HTMLInputElement)?.focus();
}
