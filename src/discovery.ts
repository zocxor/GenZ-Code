import {terms,Term} from './content';
import {Stage,Question} from './games';
function rng(seed:number){let value=seed|0;return()=>{value^=value<<13;value^=value>>>17;value^=value<<5;return(value>>>0)/4294967296;};}
export const localDay=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
export const seedFrom=(s:string)=>[...s].reduce((a,c)=>Math.imul(a,31)+c.charCodeAt(0)|0,173);
const pool=terms.filter(t=>t.sensitivity==='None'&&t.full.length>=4&&t.full.length<=90&&(t.priority>=100||t.source?.license==='Apache-2.0'||t.category==='Emoji'));
export function dailyTerm(day=localDay()):Term{const picks=pool.filter(t=>t.priority>=100&&t.example);return picks[Math.abs(seedFrom(day))%picks.length]!;}
export function quizRound(category='Chat',day?:string):Stage{
 const random=rng(seedFrom(day??String(Date.now())));let choices=pool.filter(t=>category==='All'||t.categories.includes(category));if(choices.length<5)choices=pool;
 const shuffled=[...choices].sort((a,b)=>a.id.localeCompare(b.id));for(let i=shuffled.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[shuffled[i],shuffled[j]]=[shuffled[j]!,shuffled[i]!];}
 const selected:Term[]=[];const used=new Set<string>();for(const t of shuffled){if(used.has(t.full.toLowerCase()))continue;used.add(t.full.toLowerCase());selected.push(t);if(selected.length===5)break;}
 const questions:Question[]=selected.map(t=>{const distractors:Term[]=[];for(const other of shuffled){if(other.id!==t.id&&other.full.toLowerCase()!==t.full.toLowerCase()&&!distractors.some(x=>x.full.toLowerCase()===other.full.toLowerCase()))distractors.push(other);if(distractors.length===2)break;}
 const options=[t,...distractors];for(let i=options.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[options[i],options[j]]=[options[j]!,options[i]!];}
 return {prompt:t.category==='Emoji'?`Which standard name matches ${t.expression}?`:`In this reference, what does “${t.expression}” mean?`,context:t.example||`Reference practice · ${t.region}. Other contexts may use other meanings.`,answers:options.map(x=>x.full),correct:options.findIndex(x=>x.id===t.id),why:`${t.expression}: ${t.meaning}${t.status==='Imported reference'?' Imported reference; not individually editor-reviewed.':''}`,termId:t.id};});
 return {id:day?'daily-'+day:'shuffle-'+category.toLowerCase(),name:day?'Daily five':category==='Emoji'?'Emoji name quest':'Shuffle: '+category,subtitle:'Fresh five-question practice',icon:category==='Emoji'?'happy':'sparkles',color:'#008493',questions};
}
export const quizPoolCount=pool.length;
