'use strict';
const $ = id => document.getElementById(id);
const METRICS = {
  usd: ['Total assets', 'US$ trillion', 'BIS break-adjusted total assets at year-end. Dollar values reflect exchange rates as well as balance-sheet changes.'],
  gdp: ['Total assets relative to GDP', '% of GDP', 'Year-end total assets divided by nominal GDP. A shared scale makes balance sheets comparable relative to economy size.'],
  index: ['Balance-sheet expansion', '2006 = 100', 'Break-adjusted domestic-currency total assets, indexed to 2006. Nominal growth includes inflation and valuation changes.'],
  growth: ['Annual balance-sheet growth', 'Annual change (%)', 'Year-on-year change in break-adjusted domestic-currency assets. Growth is unavailable in 2006; negative growth requires a linear scale.'],
  reserves: ['International reserves, including gold', 'US$ billion', 'World Bank / IMF reserve assets. Different institutional scope and valuation from BIS balance sheets; not a harmonized component breakdown.'],
  reserves_ex_gold: ['International reserves, excluding gold', 'US$ billion', 'World Bank / IMF reserves excluding monetary gold. Includes other reserve assets such as SDR holdings and the IMF reserve position.'],
  gold: ['Monetary gold in international reserves', 'US$ billion', 'Difference between reserve totals including and excluding gold. Changes reflect gold prices as well as quantities held.'],
  fx_index: ['Exchange-rate movements', '2006 = 100', 'Implied local-currency / US-dollar rate, indexed to 2006. Higher values mean depreciation against the dollar. US dollar remains at 100.'],
  fx: ['Implied exchange rate', 'Local currency per US$', 'Break-adjusted local-currency assets divided by dollar assets. Currency units differ across countries; use the indexed measure to compare movements.']
};
const PALETTE = ['#0072B2','#D55E00','#009E73','#CC79A7','#824c9c','#877000','#467a91','#b34758','#4f7954','#7c5939','#4559a5','#a45522'];
const DASHES = ['solid','dash','dot','dashdot'];
let data, selected = new Set(['US','XM','CN','JP']);
let drawVersion = 0;
function points(bank) { return bank.points.filter(p => p.year >= +$('start').value && p.year <= +$('end').value); }
function setSelection(codes) {
  selected = new Set(codes);
  document.querySelectorAll('.country input').forEach(el => {el.checked = selected.has(el.value);});
  render();
}
function traces(metric, log) {
  return data.banks.filter(b => selected.has(b.code)).map(b => {
    const i = data.banks.findIndex(x => x.code === b.code), rows = points(b);
    return {x:rows.map(p=>p.year), y:rows.map(p=>p[metric] == null || (log && p[metric] <= 0) ? null : p[metric]),
      name:b.name, type:'scatter', mode:'lines+markers', connectgaps:false,
      line:{color:PALETTE[i%PALETTE.length],dash:DASHES[Math.floor(i/PALETTE.length)],width:2.2},
      marker:{size:4}, customdata:rows.map(()=>b.currency),
      hovertemplate: '%{x}: %{y:,.3f}' + (metric==='fx' ? ' %{customdata}/US$' : '') + '<extra>%{fullData.name}</extra>'};
  });
}
function plot(id, metric, log, both) {
  const layout = {
    font:{family:'system-ui, sans-serif',size:12,color:'#304740'},paper_bgcolor:'white',plot_bgcolor:'white',
    margin:{l:70,r:22,t:both?45:20,b:55},
    title:both?{text:log?'Logarithmic scale':'Linear scale',font:{size:15},x:0.07}:undefined,
    xaxis:{title:{text:'Year'},range:[+$('start').value-.2,+$('end').value+.2],tickformat:'d',tickvals:[+$('start').value,...[2010,2015,2020].filter(y=>y>+$('start').value&&y<+$('end').value),...($('end').value!==$('start').value?[+$('end').value]:[])],gridcolor:'#edf1ef',zeroline:false},
    yaxis:{title:{text:METRICS[metric][1]},type:log?'log':'linear',rangemode:log?'normal':'tozero',gridcolor:'#e2e9e5',zerolinecolor:'#b8c6bf',exponentformat:'none',dtick:log?1:undefined,tickformat:log?',.3~g':undefined},
    showlegend:false,hovermode:'closest',
    uirevision:`${metric}-${log}-${$('start').value}-${$('end').value}`,
    annotations:selected.size?[]:[{text:'Select at least one central bank to start comparing.',xref:'paper',yref:'paper',x:.5,y:.5,showarrow:false,font:{size:14}}]
  };
  return Plotly.react(id,traces(metric,log),layout,{responsive:true,displaylogo:false,scrollZoom:false,toImageButtonOptions:{format:'png',filename:`central-bank-${metric}-${log?'log':'linear'}`,width:1500,height:900,scale:2}});
}
async function render() {
  if (!data) return;
  const version = ++drawVersion, metric=$('metric').value;
  if (+$('start').value > +$('end').value) $('end').value = $('start').value;
  // Ordinary logarithms cannot display zero or negative annual growth.
  const growth = metric==='growth';
  for (const o of $('scale').options) o.disabled = growth && o.value!=='linear';
  if (growth) $('scale').value='linear';
  const scale=$('scale').value, both=scale==='both';
  history.replaceState(null, '', '#' + new URLSearchParams({countries:[...selected].sort().join(','),metric,scale,from:$('start').value,to:$('end').value}));
  $('scale-note').textContent=growth?'Growth can be negative, so this measure uses a linear scale.':scale==='linear'?'Equal distances represent equal absolute changes.':'Equal distances on a log axis represent equal proportional changes; zero is not defined.';
  $('chart-title').textContent=METRICS[metric][0];$('description').textContent=METRICS[metric][2];
  $('period').textContent=`${$('start').value}–${$('end').value} · ${selected.size} SELECTED`;
  $('count').textContent=`${selected.size} / 24`;
  const banks=data.banks.filter(b=>selected.has(b.code));
  $('legend').replaceChildren();
  banks.forEach(b=>{const i=data.banks.findIndex(x=>x.code===b.code),item=document.createElement('span'),line=document.createElement('span');item.className='legend-item';line.className='legend-line';line.style.borderTopColor=PALETTE[i%PALETTE.length];line.style.borderTopStyle=i<12?'solid':'dashed';item.append(line,document.createTextNode(b.name));$('legend').append(item);});
  const unavailable=banks.filter(b=>!points(b).some(p=>p[metric]!=null)).map(b=>b.name);
  const missing=banks.reduce((n,b)=>n+points(b).filter(p=>p[metric]==null).length,0);
  const nonpositive=scale!=='linear'?banks.reduce((n,b)=>n+points(b).filter(p=>p[metric]!=null&&p[metric]<=0).length,0):0;
  $('status').textContent=[unavailable.length?`No data in this period: ${unavailable.join(', ')}.`:'',missing?`${missing} missing observations; gaps are preserved.`:'',nonpositive?`${nonpositive} zero or negative values omitted on the log chart.`:''].filter(Boolean).join(' ');
  $('chart-log').hidden=!both;
  await plot('chart',metric,scale==='log',both);
  if (both && version===drawVersion) await plot('chart-log',metric,true,true);
}
function download() {
  const metric=$('metric').value;
  const rows=[['country','central_bank','currency','year',metric,'unit']];
  data.banks.filter(b=>selected.has(b.code)).forEach(b=>points(b).forEach(p=>rows.push([b.name,b.bank,b.currency,p.year,p[metric]??'',METRICS[metric][1]])));
  const csv=rows.map(row=>row.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));
  const a=document.createElement('a');a.href=url;a.download=`central-bank-${metric}-${$('start').value}-${$('end').value}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function init() {
  const response=await fetch('data.json');if(!response.ok) throw Error(`Data request failed (${response.status})`);
  data=await response.json();
  for(let y=2006;y<=2025;y++) for(const id of ['start','end']) {const o=document.createElement('option');o.value=y;o.textContent=y;$(id).append(o);}
  $('start').value='2006';$('end').value='2025';
  const hash=new URLSearchParams(location.hash.slice(1));
  if(hash.has('countries')) selected=new Set(hash.get('countries').split(',').filter(c=>data.banks.some(b=>b.code===c)));
  if(METRICS[hash.get('metric')]) $('metric').value=hash.get('metric');
  if(['linear','log','both'].includes(hash.get('scale'))) $('scale').value=hash.get('scale');
  for(const [id,key] of [['start','from'],['end','to']]) if (/^20[0-9]{2}$/.test(hash.get(key)) && +hash.get(key)>=2006 && +hash.get(key)<=2025) $(id).value=hash.get(key);
  data.banks.forEach((b,i)=>{
    const label=document.createElement('label');label.className='country';label.title=b.bank;
    const input=document.createElement('input');input.type='checkbox';input.value=b.code;input.checked=selected.has(b.code);input.addEventListener('change',()=>{input.checked?selected.add(b.code):selected.delete(b.code);render();});
    const swatch=document.createElement('span');swatch.className='swatch';swatch.style.background=PALETTE[i%PALETTE.length];swatch.setAttribute('aria-hidden','true');
    label.append(input,swatch,document.createTextNode(b.name));$('countries').append(label);
  });
  $('all').onclick=()=>setSelection(data.banks.map(b=>b.code));$('none').onclick=()=>setSelection([]);$('core').onclick=()=>setSelection(['US','XM','CN','JP']);
  $('search').oninput=()=>document.querySelectorAll('.country').forEach(el=>{el.style.display=el.textContent.toLowerCase().includes($('search').value.toLowerCase())?'':'none';});
  for(const id of ['metric','scale','start','end']) $(id).addEventListener('change',()=>{if(id==='end' && +$('end').value < +$('start').value) $('start').value=$('end').value;render();});
  $('download').onclick=download;
  $('vintage').textContent=`BIS snapshot: ${data.bis_date}; annual balance sheets through 2025. World Bank snapshot: ${data.reserves_date}; reserve availability varies by country and year.`;
  await render();
}
init().catch(error=>{$('status').textContent=`Unable to load this dashboard: ${error.message}. Please reload or use the source repository downloads.`;console.error(error);});
