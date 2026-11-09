import type { FieldDef, Row } from './types';

export type SeasonInterval = [number, number];
export const SEASON_MAX = Number.MAX_SAFE_INTEGER - 1;
export const SEASON_FIELD = '$season';

export function mergeSeasonIntervals(ranges: SeasonInterval[]): SeasonInterval[] {
  const out: SeasonInterval[] = [];
  for (const [start, end] of ranges.map(r => [...r] as SeasonInterval).sort((a,b) => a[0]-b[0])) {
    const last = out[out.length-1];
    if (last && start <= last[1]+1) last[1] = Math.max(last[1], end);
    else out.push([start,end]);
  }
  return out;
}

/** null 表示通用兜底；区间端点均包含，不依赖当前登记的赛季。 */
export function parseSeasonScope(value: unknown): SeasonInterval[] | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  if (!/^\[[^\[\]]+\]$/.test(raw)) throw new Error('适用赛季格式无效');
  const result: SeasonInterval[] = [];
  const integer = (text: string): number => {
    if (!/^\d+$/.test(text)) throw new Error('赛季版本须为非负整数');
    const n = Number(text);
    if (!Number.isSafeInteger(n) || n > SEASON_MAX-100) throw new Error('赛季版本编号超出范围');
    return n;
  };
  for (const part of raw.slice(1,-1).split(',')) {
    const text = part.trim();
    if (text === '-1') { result.push([-1,-1]); continue; }
    if (text.includes('~')) {
      const match = /^(\d*)~(\d*)$/.exec(text);
      if (!match) throw new Error('赛季区间格式无效');
      const start = match[1] ? integer(match[1]) : 0;
      const end = match[2] ? integer(match[2]) : SEASON_MAX;
      if (start > end) throw new Error('起始版本不能大于结束版本');
      result.push([start,end]);
    } else {
      const n = integer(text);
      result.push([n, n % 100 === 0 ? n+99 : n]);
    }
  }
  return mergeSeasonIntervals(result);
}

export function serializeSeasonScope(ranges: SeasonInterval[]): string {
  const merged = mergeSeasonIntervals(ranges);
  if (!merged.length) throw new Error('适用范围为空，请保留至少一个范围');
  return '['+merged.map(([a,b]) => {
    if (a === b && (a % 100 !== 0 || a === -1)) return String(a);
    if (a % 100 === 0 && b === a+99) return String(a);
    return `${a===0?'':a}~${b===SEASON_MAX?'':b}`;
  }).join(',')+']';
}

export function subtractSeasonIntervals(ranges: SeasonInterval[], excluded: SeasonInterval[]): SeasonInterval[] {
  let out = mergeSeasonIntervals(ranges);
  for (const [a,b] of mergeSeasonIntervals(excluded)) {
    out = out.flatMap(([start,end]): SeasonInterval[] => {
      if (end<a || start>b) return [[start,end]];
      const parts: SeasonInterval[]=[];
      if (start<a) parts.push([start,a-1]);
      if (end>b) parts.push([b+1,end]);
      return parts;
    });
  }
  return out;
}

export function seasonScopeLabel(value: unknown): string {
  try {
    const ranges = parseSeasonScope(value);
    if (!ranges) return '通用';
    return ranges.map(([a,b]) => {
      if (a===-1 && b===-1) return '开发中';
      if (a===0 && b===SEASON_MAX) return '所有赛季版本';
      if (a % 100===0 && b===a+99) return `所有 ${a/100} 赛季版本`;
      if (a===b) return `赛季版本 ${a}`;
      if (b===SEASON_MAX) return a%100===0 ? `${a/100} 赛季之后（含）` : `赛季版本 ${a} 之后（含）`;
      if (a===0) return b%100===99 ? `${Math.floor(b/100)} 赛季之前（含）` : `赛季版本 ${b} 之前（含）`;
      if (a%100===0 && b%100===99) return `${a/100}～${Math.floor(b/100)} 赛季全部版本`;
      return `赛季版本 ${a}～${b}`;
    }).join(' 或 ');
  } catch { return `无效范围：${String(value)}`; }
}

export function supportsSeasons(struct: Row, fields: FieldDef[] = (struct.fields || []) as FieldDef[]): boolean {
  if (struct.kind==='enum' || struct.multi_season===false) return false;
  return struct.multi_season===true || fields.some(f => f.key===SEASON_FIELD);
}

export function seasonFields(struct: Row, fields: FieldDef[]): FieldDef[] {
  if (!supportsSeasons(struct,fields)) return fields;
  const scope: FieldDef = {key:SEASON_FIELD, label:'适用赛季', type:'string'};
  if (fields.some(f=>f.key===SEASON_FIELD)) return fields.map(f=>f.key===SEASON_FIELD?{...f,...scope}:f);
  const out=fields.slice(); out.splice(out[0]?.key==='id'?1:0,0,scope); return out;
}

export function seasonKeyFields(struct: Row, fields: FieldDef[]): string[] {
  if (Array.isArray(struct.season_key)) return struct.season_key.map(String).filter(Boolean);
  for (const value of Array.isArray(struct.processors)?struct.processors:[]) {
    const match=/^@unique\(([^)]+)\)$/.exec(String(value).trim());
    if (match) return match[1].split(',').map(v=>v.trim()).filter(v=>v && v!==SEASON_FIELD);
  }
  const first=fields.find(f=>f.key && f.key!==SEASON_FIELD);
  if (!first || first.key==='--' || String(first.type).replace(/\?$/,'')==='auto') return [];
  return [first.key];
}

export type SeasonIssue = { rowIndex:number; field:string; message:string };
export function checkSeasonRows(rows: Row[], keys: string[]): SeasonIssue[] {
  const errors: SeasonIssue[]=[];
  const groups=new Map<string,{index:number; scope:SeasonInterval[]|null}[]>();
  rows.forEach((row,index)=>{
    row = row || {};
    let scope:SeasonInterval[]|null;
    try { scope=parseSeasonScope(row[SEASON_FIELD]); }
    catch(error) {errors.push({rowIndex:index,field:SEASON_FIELD,message:(error as Error).message});return;}
    if (!keys.length || keys.some(k=>row[k]==null || row[k]==='' || row[k]==='-')) return;
    const key=JSON.stringify(keys.map(k=>String(row[k])));
    const previous=groups.get(key)||[];
    for (const other of previous) {
      const overlap=scope && other.scope ? scope.some(([a,b])=>other.scope!.some(([c,d])=>a<=d && c<=b)) : scope===null && other.scope===null;
      if (!overlap) continue;
      const message=`第 ${other.index+1} 行与第 ${index+1} 行的 ${keys.map(k=>`${k}=${row[k]}`).join('、')} ${scope?'专属范围重叠':'通用配置重复'}`;
      errors.push({rowIndex:index,field:SEASON_FIELD,message},{rowIndex:other.index,field:SEASON_FIELD,message});
    }
    previous.push({index,scope});groups.set(key,previous);
  });
  return errors;
}

export function selectSeasonRows(rows: Row[], version:number, keys:string[]): Row[] {
  const issues=checkSeasonRows(rows,keys);
  if(issues.length) throw new Error(issues.map(e=>e.message).join('\n'));
  const matches=(row:Row)=>parseSeasonScope(row[SEASON_FIELD])?.some(([a,b])=>a<=version && version<=b);
  const key=(row:Row)=>JSON.stringify(keys.map(k=>String(row[k])));
  const explicit=rows.filter(matches);
  const present=new Set(explicit.map(key));
  return rows.filter(row=>matches(row) || (parseSeasonScope(row[SEASON_FIELD])===null && (!keys.length || !present.has(key(row)))));
}

export function checkSeasonData(data: unknown, structure: unknown): {path:string;message:string}[] {
  const struct=(structure && typeof structure==='object'?structure:{}) as Row;
  const source=(data && typeof data==='object'?data:{}) as Row;
  const sheets=Array.isArray(struct.sheets)?struct.sheets as Row[]:[{...struct,id:'main'}];
  return sheets.flatMap(sheet=>{
    const metadata={...struct,...sheet};
    const fields=(Array.isArray(metadata.fields)?metadata.fields:[]) as FieldDef[];
    if(!supportsSeasons(metadata,fields))return [];
    const part=(source.sheets as Record<string,Row> | undefined)?.[String(sheet.id)];
    const rows=(part?.rows || (sheet.id===(struct.default_sheet||sheets[0]?.id)?source.rows:[]) || []) as Row[];
    if(!Array.isArray(rows))return [];
    return checkSeasonRows(rows,seasonKeyFields(metadata,fields)).map(error=>({path:`${Array.isArray(struct.sheets)?`sheets.${sheet.id}.`:''}rows.${error.rowIndex}.${error.field}`,message:error.message}));
  });
}
