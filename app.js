const $ = selector => document.querySelector(selector);
const fmt = d3.format('.3f');
const esc = value => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);

const palette = {
  Europe: '#2a78d6', Africa: '#eb6834', 'North America': '#1baf7a',
  'South America': '#e87ba4', Asia: '#6250d6', Oceania: '#52514e'
};
let data;
let world;
let rows;
let latest;
let meta;
let year = 2025;
let selectedMapCountry = null;
let selectedA = 'Kosovo';
let selectedB = 'Yemen';
const tip = $('#tooltip');

function show(event, html) {
  tip.innerHTML = html;
  tip.hidden = false;
  const rect = event.currentTarget.getBoundingClientRect();
  const x = event.clientX || rect.x + rect.width / 2;
  const y = event.clientY || rect.y;
  tip.style.left = Math.max(8, Math.min(innerWidth - tip.offsetWidth - 10, x + 12)) + 'px';
  tip.style.top = Math.max(8, Math.min(innerHeight - tip.offsetHeight - 10, y - tip.offsetHeight - 15)) + 'px';
}

function hide() { tip.hidden = true; }

function interactive(selection, content, focusable = () => true) {
  selection
    .attr('tabindex', datum => focusable(datum) ? 0 : -1)
    .attr('role', 'img')
    .on('pointermove focus', (event, datum) => show(event, content(datum)))
    .on('pointerleave blur', hide)
    .on('keydown', event => { if (event.key === 'Escape') hide(); });
}

function renderCountryDetail() {
  const detail = $('#country-detail');
  if (!selectedMapCountry) { detail.hidden = true; detail.innerHTML = ''; return; }
  const history = new Map(rows.filter(row => row.country === selectedMapCountry && Number.isFinite(row.score)).map(row => [row.year, row]));
  const current = history.get(year);
  detail.innerHTML = `<div class="country-detail-head"><h4>${esc(selectedMapCountry)}</h4><button type="button" aria-label="Close country details">Close</button></div>
    <p>${current ? `${year - 2}–${year}: life evaluation ${fmt(current.score)} out of 10, global rank ${current.rank} of ${rows.filter(row => row.year === year && Number.isFinite(row.score)).length}.` : `No life-evaluation data for ${year - 2}–${year}.`}</p>
    <table><caption>Life evaluation and global rank by three-year period</caption><thead><tr><th scope="col">Period ending</th><th scope="col">Score</th><th scope="col">Global rank</th></tr></thead><tbody>${d3.range(2019, 2026).reverse().map(period => {
      const row = history.get(period);
      return `<tr ${period === year ? 'class="current-period"' : ''}><th scope="row">${period}</th><td>${row ? fmt(row.score) : '—'}</td><td>${row ? row.rank : '—'}</td></tr>`;
    }).join('')}</tbody></table>`;
  detail.hidden = false;
  detail.querySelector('button').addEventListener('click', () => { selectedMapCountry = null; renderCountryDetail(); });
}

function renderMapContext(sample) {
  const valid = sample.filter(row => Number.isFinite(row.score) && Number.isFinite(row.rank));
  const ordered = [...valid].sort((a, b) => a.rank - b.rank);
  const list = items => items.map(row => `<li aria-label="${esc(row.country)}: life evaluation ${fmt(row.score)} out of 10"><span class="contrast-country">${esc(row.country)}</span><span class="contrast-track"><span class="contrast-bar" style="width:${row.score * 10}%"></span></span><strong>${fmt(row.score)}</strong></li>`).join('');
  $('#highest-scores').innerHTML = list(ordered.slice(0, 5));
  $('#lowest-scores').innerHTML = list(ordered.slice(-5).reverse());
  $('#contrasts-period').textContent = `${year - 2}–${year} three-year average · Life evaluation (0–10)`;
  const top = ordered.slice(0, 15), bottom = ordered.slice(-15);
  const europeanTop = top.filter(row => meta[row.country].region === 'Europe').length;
  const africanBottom = bottom.filter(row => meta[row.country].region === 'Africa').length;
  const exception = top.find(row => meta[row.country].region !== 'Europe');
  const exceptionText = exception ? `${exception.country}, in ${meta[exception.country].region === 'North America' ? 'North & Central America' : meta[exception.country].region}, ranks ${exception.rank}, showing that the high end extends beyond Europe.` : 'All fifteen highest-scoring countries in this period are in Europe.';
  $('#map-story').textContent = `In ${year - 2}–${year}, ${europeanTop} of the 15 highest-scoring countries are in Europe, while ${africanBottom} of the 15 lowest-scoring are in Africa. ${exceptionText} The geography is visible, but does place itself explain the gap?`;
  renderCountryDetail();
}

function map() {
  const svg = d3.select('#map');
  const width = $('#map').clientWidth;
  const height = Math.max(220, width * .46);
  svg.attr('viewBox', `0 0 ${width} ${height}`);
  svg.selectAll('title').data([null]).join('title').text(`Country life evaluations for ${year - 2}–${year}`);

  const projection = d3.geoEqualEarth().fitExtent([[1, 5], [width - 1, height - 5]], world);
  const path = d3.geoPath(projection);
  const sample = rows.filter(row => row.year === year && Number.isFinite(row.score));
  const byIso = new Map(sample.map(row => [meta[row.country]?.iso, row]));
  const colour = d3.scaleThreshold().domain([4, 5, 6, 7]).range(['#e4d4f7', '#b996e8', '#8e5bd9', '#5a2fb0', '#2a1060']);
  const countries = svg.selectAll('path.map-country').data(world.features).join('path')
    .attr('class', 'map-country')
    .attr('d', path)
    .attr('stroke', '#faf7fc')
    .attr('stroke-width', .45)
    .attr('fill', feature => {
      const row = byIso.get(feature.properties.iso3);
      return row ? colour(row.score) : '#d9d7de';
    })
    .attr('aria-label', feature => {
      const row = byIso.get(feature.properties.iso3);
      return `${feature.properties.name}: ${row ? `${fmt(row.score)} out of 10, rank ${row.rank} of ${sample.length}, ${year - 2}–${year} average` : 'no matched life-evaluation value'}`;
    });
  interactive(countries, feature => {
    const row = byIso.get(feature.properties.iso3);
    return `<strong>${esc(feature.properties.name)}</strong>${row ? `Life evaluation: ${fmt(row.score)} / 10<br>Rank: ${row.rank} of ${sample.length}<br>${year - 2}–${year} three-year average` : 'No matched life-evaluation value'}`;
  }, feature => byIso.has(feature.properties.iso3));
  countries.attr('role', feature => byIso.has(feature.properties.iso3) ? 'button' : 'img')
    .on('click', (event, feature) => {
      const row = byIso.get(feature.properties.iso3);
      if (!row) return;
      selectedMapCountry = row.country;
      hide();
      renderCountryDetail();
      $('#country-detail').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    })
    .on('keydown.map', (event, feature) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const row = byIso.get(feature.properties.iso3);
      if (!row) return;
      event.preventDefault();
      selectedMapCountry = row.country;
      hide();
      renderCountryDetail();
      $('#country-detail').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });

  $('#yearvalue').textContent = year;
  $('#year').setAttribute('aria-valuetext', `${year}, ${year - 2}–${year} three-year average`);
  renderMapContext(sample);
}

function base(id, domain, xTitle) {
  const element = $('#' + id);
  const svg = d3.select(element);
  svg.selectAll('*').remove();
  const width = element.clientWidth;
  const height = width < 600 ? 410 : 540;
  const margin = { l: width < 600 ? 49 : 65, r: 22, t: 24, b: 76 };
  const x = d3.scaleLinear().domain(domain).range([margin.l, width - margin.r]);
  const y = d3.scaleLinear().domain([0, 10]).range([height - margin.b, margin.t]);
  svg.attr('viewBox', `0 0 ${width} ${height}`);
  svg.append('g').attr('class', 'grid').attr('transform', `translate(${margin.l},0)`)
    .call(d3.axisLeft(y).ticks(5).tickSize(-(width - margin.l - margin.r)));
  svg.append('g').attr('class', 'axis').attr('transform', `translate(${margin.l},0)`)
    .call(d3.axisLeft(y).ticks(5).tickSize(0).tickPadding(9));
  svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${height - margin.b})`)
    .call(d3.axisBottom(x).ticks(width < 600 ? 4 : 7).tickSize(4).tickPadding(8));
  svg.append('text').attr('class', 'axis-title').attr('text-anchor', 'middle')
    .attr('transform', `translate(14,${(margin.t + height - margin.b) / 2}) rotate(-90)`)
    .text('Life evaluation (0–10)');
  svg.append('text').attr('class', 'axis-title').attr('text-anchor', 'middle')
    .attr('x', (margin.l + width - margin.r) / 2).attr('y', height - 15).text(xTitle);
  return { svg, width, height, margin, x, y };
}

function supportNew(){
  const chart=base('support',[0,1.9],'Social-support contribution (life-evaluation points)'),sample=latest.filter(d=>d.support!=null);
  const k=sample.find(d=>d.country==='Kosovo'),y=sample.find(d=>d.country==='Yemen');
  const healthValues=sample.map(d=>d.health).filter(Number.isFinite).sort((a,b)=>a-b);
  const healthRadius=value=>value==null||value===0?2.5:Math.sqrt(value/healthValues.at(-1))*9.5;
  chart.svg.append('line').attr('x1',chart.x((k.support+y.support)/2)).attr('x2',chart.x((k.support+y.support)/2)).attr('y1',chart.y(k.score)).attr('y2',chart.y(y.score)).attr('stroke','#30213e').attr('stroke-width',2).attr('stroke-dasharray','5 4');
  const marks=chart.svg.append('g').selectAll('circle').data(sample).join('circle').attr('class','country-dot').attr('cx',d=>chart.x(d.support)).attr('cy',d=>chart.y(d.score)).attr('r',d=>healthRadius(d.health)).attr('fill',d=>d.country==='Kosovo'?'#2a1060':d.country==='Yemen'?'#eb6834':'#cbb6e7').attr('stroke','#faf7fc').attr('stroke-width',1.5).attr('fill-opacity',.9).attr('aria-label',d=>`${d.country}: score ${fmt(d.score)}, support ${fmt(d.support)}, healthy-life-expectancy model contribution ${d.health==null?'missing':fmt(d.health)}`);
  interactive(marks,d=>`<strong>${esc(d.country)}</strong>Life evaluation: ${fmt(d.score)}<br>Social-support contribution: ${fmt(d.support)}<br>Healthy-life-expectancy contribution: ${d.health==null?'not available':fmt(d.health)}`);
  marks.filter(d=>d.country==='Kosovo'||d.country==='Yemen').raise();
  for(const [d,offset] of [[k,-13],[y,23]])chart.svg.append('text').attr('class','point-label').attr('x',chart.x(d.support)+12).attr('y',chart.y(d.score)+offset).text(`${d.country} ${fmt(d.score)}`);
  chart.svg.append('text').attr('class','cluster-label').attr('x',chart.x(1.27)-12).attr('y',chart.y((k.score+y.score)/2)).attr('text-anchor','end').text('Support: 1.293 vs 1.292');
  const examples=[.25,.5,.75].map(fraction=>healthValues[Math.floor(fraction*healthValues.length)]);
  $('#healthlegend').innerHTML='<span class="support-key"><i style="background:#cbb6e7"></i>Other countries</span><span class="support-key"><i style="background:#2a1060"></i>Kosovo</span><span class="support-key"><i style="background:#eb6834"></i>Yemen</span><strong>Bubble area: healthy-life-expectancy model contribution (life-evaluation points); zero or missing values use a locating dot</strong>'+examples.map(value=>`<span class="bubble-key"><i style="width:${healthRadius(value)*2}px;height:${healthRadius(value)*2}px"></i>${value.toFixed(3)}</span>`).join('');
}

const parts=[['gdp','GDP','#6250d6'],['support','Social support','#e87ba4'],['health','Healthy life expectancy','#1baf7a'],['freedom','Freedom','#eda100'],['generosity','Generosity','#2a78d6'],['corruption','Perceptions of corruption','#e34948'],['residual','Dystopia + residual','pattern']];
let activeCase='support';
const cases={support:['Kosovo','Yemen'],climate:['Costa Rica','Ethiopia'],mix:['Singapore','El Salvador']};
function decompositionNew(){
  const a=latest.find(d=>d.country===selectedA),b=latest.find(d=>d.country===selectedB);
  const gap=a.score-b.score,absGap=Math.abs(gap);
  if(activeCase==='support')$('#pair-insight').textContent=`Kosovo and Yemen have social-support contributions of ${fmt(a.support)} and ${fmt(b.support)}, yet their scores differ by ${fmt(absGap)} points.`;
  else if(activeCase==='climate')$('#pair-insight').textContent=`Costa Rica and Ethiopia differ in mean temperature by ${Math.abs(meta[a.country].temp-meta[b.country].temp).toFixed(2)}°C and in latitude by ${Math.abs(meta[a.country].lat-meta[b.country].lat).toFixed(2)}°, yet their scores differ by ${fmt(absGap)} points.`;
  else if(activeCase==='mix')$('#pair-insight').textContent=`Singapore and El Salvador differ in score by only ${fmt(absGap)} points, but in GDP contribution by ${fmt(Math.abs(a.gdp-b.gdp))} and Dystopia plus residual by ${fmt(Math.abs(a.residual-b.residual))}; this pair has the largest summed component difference among 75 complete pairs whose rounded scores differ by no more than 0.01.`;
  else $('#pair-insight').textContent=`${selectedA} and ${selectedB} differ in life evaluation by ${fmt(absGap)} points; the bars below show where their modelled contributions differ.`;
  const differences=parts.map(([key,label,color])=>({key,label,color,value:a[key]==null||b[key]==null?null:a[key]-b[key]}));
  const maxGap=Math.max(1.5,Math.ceil(Math.max(...differences.map(d=>Math.abs(d.value||0)))*4)/4);
  const divergences=differences.map(({key,label,color,value})=>{
    const width=value==null?0:Math.abs(value)/maxGap*50;
    const left=value<0?50-width:50;
    return `<div class="diverge-row" data-part="${key}" data-value="${value==null?'':value.toFixed(3)}"><span class="diverge-name">${label}</span><div class="diverge-track"><i class="zero-line"></i>${value==null?'<small>not available</small>':`<i class="diverge-bar ${color==='pattern'?'pattern':''}" style="left:${left}%;width:${width}%;${color==='pattern'?'':`background:${color}`}\"></i><b class="diverge-value ${value<0?'left':'right'}" style="left:${value<0?left:50+width}%">${value>0?'+':''}${fmt(value)}</b>`}</div></div>`;
  }).join('');
  const componentGap=differences.every(d=>d.value!=null)?d3.sum(differences,d=>d.value):null;
  const roundingNote=componentGap==null?'Some model contributions are unavailable for this pair.':`The model contributions sum to ${fmt(componentGap)} points; the ${fmt(Math.abs(gap-componentGap))}-point difference from the score gap comes from published rounding.`;
  $('#contributions').innerHTML=`<div class="score-summary"><span>${esc(selectedA)} <strong>${fmt(a.score)}</strong></span><span>${esc(selectedB)} <strong>${fmt(b.score)}</strong></span><span>Life-evaluation gap <strong>${fmt(absGap)}</strong></span></div><p class="difference-title">Contribution difference (${esc(selectedA)} minus ${esc(selectedB)})</p><div class="diverge-axis"><span>−${fmt(maxGap)}</span><span>0</span><span>+${fmt(maxGap)}</span></div>${divergences}<p class="rounding-note">${roundingNote} Dystopia + residual combines the model reference level and the unexplained remainder; it is not an independent real-world factor.</p>`;
}
function populateComparisonControls(){
  const names=latest.map(d=>d.country).sort((a,b)=>a.localeCompare(b));
  const selectA=$('#country-a'),selectB=$('#country-b');
  for(const name of names){selectA.add(new Option(name,name));selectB.add(new Option(name,name));}
  function updateDisabled(){for(const option of selectA.options)option.disabled=option.value===selectedB;for(const option of selectB.options)option.disabled=option.value===selectedA;}
  function update(){selectA.value=selectedA;selectB.value=selectedB;updateDisabled();decompositionNew();}
  document.querySelectorAll('#case-buttons button').forEach(button=>button.addEventListener('click',()=>{
    activeCase=button.dataset.case;
    document.querySelectorAll('#case-buttons button').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
    $('#compare-controls').hidden=activeCase!=='custom';
    if(cases[activeCase])[selectedA,selectedB]=cases[activeCase];
    update();
  }));
  selectA.addEventListener('change',event=>{selectedA=event.target.value;update();});
  selectB.addEventListener('change',event=>{selectedB=event.target.value;update();});
  update();
}
const continentNames = Object.keys(palette);
let activeContinent = null;
function continentLegend(id, omitOceania = false) {
  const target = $(id);
  target.innerHTML = '<strong>Continent</strong>' + continentNames.filter(name=>!omitOceania || name!=='Oceania').map(name => `<button type="button" data-continent="${name}" aria-pressed="false"><i style="background:${palette[name]}"></i>${name === 'North America' ? 'North &amp; Central America' : name}</button>`).join('');
  target.querySelectorAll('button').forEach(button => button.addEventListener('click', () => {
    activeContinent = activeContinent === button.dataset.continent ? null : button.dataset.continent;
    document.querySelectorAll('.continent-legend button').forEach(item => item.setAttribute('aria-pressed', String(item.dataset.continent === activeContinent)));
    document.querySelectorAll('[data-region]').forEach(mark => { mark.style.opacity = activeContinent && mark.dataset.region !== activeContinent ? '.2' : ''; });
  }));
}
function regionalTrends() {
  const svg = d3.select('#regional-trends'); svg.selectAll('*').remove();
  const w = $('#regional-trends').clientWidth, h = w < 650 ? 420 : 460;
  const m = {l: 53, r: w < 650 ? 94 : 170, t: 25, b: 46};
  svg.attr('viewBox', `0 0 ${w} ${h}`);
  const x = d3.scaleLinear().domain([2019, 2025]).range([m.l, w-m.r]);
  const y = d3.scaleLinear().domain([4, 7]).range([h-m.b, m.t]);
  svg.append('g').attr('class','axis').attr('transform',`translate(0,${h-m.b})`).call(d3.axisBottom(x).tickValues(d3.range(2019,2026)).tickFormat(d3.format('d')));
  svg.append('g').attr('class','axis').attr('transform',`translate(${m.l},0)`).call(d3.axisLeft(y).ticks(6));
  const common = d3.intersection(...d3.range(2019,2026).map(yr => new Set(rows.filter(d => d.year === yr).map(d => d.country))));
  for (const name of continentNames.filter(n => n !== 'Oceania')) {
    const points = d3.range(2019,2026).map(yr => ({year:yr, value:d3.mean(rows.filter(d => d.year === yr && common.has(d.country) && meta[d.country].region === name), d => d.score)}));
    svg.append('path').datum(points).attr('data-region',name).attr('fill','none').attr('stroke',palette[name]).attr('stroke-width',3).attr('d',d3.line().x(d=>x(d.year)).y(d=>y(d.value)));
    svg.selectAll(null).data(points).enter().append('circle').attr('data-region',name).attr('cx',d=>x(d.year)).attr('cy',d=>y(d.value)).attr('r',4).attr('fill',palette[name]);
    const last=points.at(-1); svg.append('text').attr('data-region',name).attr('class','line-label').attr('x',x(2025)+7).attr('y',y(last.value)+(name==='North America'?-8:name==='Europe'?16:4)).attr('fill',palette[name]).text(name === 'North America' ? 'N. & C. America' : name);
  }
}
function temperatureNew() {
  const sample=latest.filter(d=>meta[d.country].temp!=null), svg=d3.select('#temperature'); svg.selectAll('*').remove();
  const w=$('#temperature').clientWidth,h=w<650?480:530,m={l:52,r:22,t:28,b:58}; svg.attr('viewBox',`0 0 ${w} ${h}`);
  const x=d3.scaleLinear().domain([-5,30]).range([m.l,w-m.r]),y=d3.scaleLinear().domain([1,8]).range([h-m.b,m.t]);
  svg.append('g').attr('class','grid').attr('transform',`translate(${m.l},0)`).call(d3.axisLeft(y).ticks(7).tickSize(-(w-m.l-m.r)));
  svg.append('g').attr('class','axis').attr('transform',`translate(${m.l},0)`).call(d3.axisLeft(y).ticks(7));
  svg.append('g').attr('class','axis').attr('transform',`translate(0,${h-m.b})`).call(d3.axisBottom(x).ticks(7));
  svg.append('text').attr('class','axis-title').attr('x',w/2).attr('y',h-9).attr('text-anchor','middle').text('Mean annual temperature (°C), 1991–2020');
  svg.append('text').attr('class','axis-title').attr('transform',`translate(15,${h/2}) rotate(-90)`).attr('text-anchor','middle').text('Life evaluation (0–10)');
  const marks=svg.append('g').selectAll('circle').data(sample).join('circle').attr('data-region',d=>meta[d.country].region).attr('class','country-dot').attr('cx',d=>x(meta[d.country].temp)).attr('cy',d=>y(d.score)).attr('r',5.7).attr('fill',d=>palette[meta[d.country].region]).attr('stroke','#faf7fc').attr('stroke-width',1.5).attr('fill-opacity',.9).attr('aria-label',d=>`${d.country}: ${fmt(d.score)} points, ${fmt(meta[d.country].temp)} degrees Celsius`);
  interactive(marks,d=>`<strong>${esc(d.country)}</strong>Life evaluation: ${fmt(d.score)}<br>Temperature: ${fmt(meta[d.country].temp)}°C`);
  if(w>=650)for(const [name,tx,ty] of [['Europe',3,6.3],['Africa',19,3.8],['Asia',15,5.1],['North America',16,7.6],['South America',19,6.5]])svg.append('text').attr('data-region',name).attr('class','cluster-label').attr('x',x(tx)).attr('y',y(ty)).attr('fill',palette[name]).text(name==='North America'?'N. & C. America':name);
  const costa=sample.find(d=>d.country==='Costa Rica'),ethiopia=sample.find(d=>d.country==='Ethiopia');
  svg.append('line').attr('x1',x(meta[costa.country].temp)).attr('y1',y(costa.score)).attr('x2',x(meta[ethiopia.country].temp)).attr('y2',y(ethiopia.score)).attr('stroke','#30213e').attr('stroke-width',1.5).attr('stroke-dasharray','4 3');
  svg.append('text').attr('class','point-label').attr('x',x(29.5)).attr('y',y(5.8)).attr('text-anchor','end').text('Similar temperature,');
  svg.append('text').attr('class','point-label').attr('x',x(29.5)).attr('y',y(5.8)+17).attr('text-anchor','end').text('3.5 points apart');
  for(const name of ['Costa Rica','Ethiopia']){const d=sample.find(v=>v.country===name);svg.append('text').attr('class','point-label').attr('x',x(meta[name].temp)+(name==='Costa Rica'?-8:8)).attr('y',y(d.score)+(name==='Ethiopia'?18:-9)).attr('text-anchor',name==='Costa Rica'?'end':'start').text(name);}
}
function latitudeNew() {
  const svg=d3.select('#latitude');svg.selectAll('*').remove();
  const w=$('#latitude').clientWidth,mobile=w<800,h=mobile?650:640;
  const m={l:mobile?55:78,r:mobile?20:300,t:30,b:60};
  svg.attr('viewBox',`0 0 ${w} ${h}`);
  const x=d3.scaleLinear().domain([1,8]).range([m.l,w-m.r]);
  const y=d3.scaleLinear().domain([-45,70]).range([h-m.b,m.t]);
  const zones=[[-45,-23.4,'Southern temperate'],[-23.4,0,'Southern tropics'],[0,23.4,'Northern tropics'],[23.4,66.6,'Northern temperate']];
  zones.forEach(([lo,hi],i)=>svg.append('rect').attr('x',m.l).attr('y',y(hi)).attr('width',w-m.l-m.r).attr('height',y(lo)-y(hi)).attr('fill',i%2?'#f1ebf5':'#f8f3fa'));
  for(const [lat,label] of [[0,'Equator'],[23.4,'Tropic of Cancer'],[-23.4,'Tropic of Capricorn'],[66.6,'Arctic Circle']]){
    svg.append('line').attr('x1',m.l).attr('x2',w-m.r).attr('y1',y(lat)).attr('y2',y(lat)).attr('stroke','#b9aabd').attr('stroke-dasharray','4 4');
    if(!mobile||lat===0)svg.append('text').attr('class','reference-label').attr('x',m.l+5).attr('y',y(lat)-5).text(label);
  }
  svg.append('g').attr('class','axis').attr('transform',`translate(0,${h-m.b})`).call(d3.axisBottom(x).ticks(7));
  svg.append('g').attr('class','axis').attr('transform',`translate(${m.l},0)`).call(d3.axisLeft(y).ticks(8).tickFormat(v=>v===0?'0°':`${Math.abs(v)}°${v<0?'S':'N'}`));
  svg.append('text').attr('class','axis-title').attr('x',(m.l+w-m.r)/2).attr('y',h-8).attr('text-anchor','middle').text('Life evaluation (0–10)');
  const marks=svg.append('g').selectAll('circle').data(latest).join('circle').attr('data-region',d=>meta[d.country].region).attr('class','country-dot').attr('cx',d=>x(d.score)).attr('cy',d=>y(meta[d.country].lat)).attr('r',5.7).attr('fill',d=>palette[meta[d.country].region]).attr('stroke','#faf7fc').attr('stroke-width',1.5).attr('fill-opacity',.9).attr('aria-label',d=>`${d.country}: life evaluation ${fmt(d.score)}, latitude ${meta[d.country].lat.toFixed(1)} degrees`);
  interactive(marks,d=>`<strong>${esc(d.country)}</strong>Life evaluation: ${fmt(d.score)}<br>Latitude: ${meta[d.country].lat.toFixed(1)}°`);
  const summaries=[];
  zones.forEach(([lo,hi,label])=>{
    const sample=latest.filter(d=>meta[d.country].lat>=lo&&meta[d.country].lat<hi),mid=(lo+hi)/2,mean=d3.mean(sample,d=>d.score);
    summaries.push(`${label} · ${sample.length} countries · average ${mean.toFixed(2)}`);
    svg.append('path').attr('d',d3.symbol().type(d3.symbolDiamond).size(115)()).attr('transform',`translate(${x(mean)},${y(mid)})`).attr('fill','#faf7fc').attr('stroke','#30213e').attr('stroke-width',2);
    if(!mobile)svg.append('text').attr('class','zone-label').attr('x',w-m.r+18).attr('y',y(mid)+4).text(`${label} · ${sample.length} countries · average ${mean.toFixed(2)}`);
  });
  $('#latitude-zones').innerHTML=summaries.map(item=>`<p>${item}</p>`).join('');
  for(const name of ['Finland','Costa Rica','New Zealand','Afghanistan']){
    const d=latest.find(v=>v.country===name),left=name==='Finland'||name==='Costa Rica'||name==='New Zealand';
    svg.append('text').attr('class','extreme-label').attr('x',x(d.score)+(left?-8:8)).attr('y',y(meta[name].lat)-10).attr('text-anchor',left?'end':'start').text(`${name} ${d.score.toFixed(2)}`);
  }
}
function render() {
  map();
  regionalTrends();
  temperatureNew();
  latitudeNew();
  supportNew();
  document.querySelectorAll('[data-region]').forEach(mark => { mark.style.opacity = activeContinent && mark.dataset.region !== activeContinent ? '.2' : ''; });
}

async function init() {
  try {
    [data, world] = await Promise.all([
      fetch(new URL('./assets/data.json', import.meta.url)).then(response => {
        if (!response.ok) throw new Error(`Could not load data.json (${response.status})`);
        return response.json();
      }),
      fetch(new URL('./assets/world.json', import.meta.url)).then(response => {
        if (!response.ok) throw new Error(`Could not load world.json (${response.status})`);
        return response.json();
      })
    ]);
    meta = data.meta;
    rows = data.rows.map(row => ({
      year: row[0], rank: row[1], country: row[2], score: row[3], gdp: row[6], support: row[7],
      health: row[8], freedom: row[9], generosity: row[10], corruption: row[11], residual: row[12]
    }));
    latest = rows.filter(row => row.year === 2025);
    $('#maplegend').innerHTML = '<strong>Life evaluation (0–10)</strong>'+[['0–&lt;4','#e4d4f7'],['4–&lt;5','#b996e8'],['5–&lt;6','#8e5bd9'],['6–&lt;7','#5a2fb0'],['7–10','#2a1060'],['No data','#d9d7de']].map(([label,color])=>`<span><i style="background:${color}"></i>${label}</span>`).join('');
    continentLegend('#regions'); continentLegend('#regional-legend', true); continentLegend('#latitude-legend');
    $('#latitude-legend').insertAdjacentHTML('beforeend','<span class="average-key">◇ Average score of the zone</span>');
    for(const [region,r] of [['Europe','−0.35'],['Africa','+0.07'],['North America','−0.30'],['South America','−0.30'],['Asia','−0.05']]){const button=[...document.querySelectorAll('#regions button')].find(item=>item.dataset.continent===region);button.insertAdjacentHTML('beforeend',` <span class="legend-r">r = ${r}</span>`);}
    $('#year').addEventListener('input', event => {
      year = +event.target.value;
      hide();
      map();
    });
    populateComparisonControls();
    render();
    decompositionNew();
    $('#loadstate').hidden = true;

    let timer;
    addEventListener('resize', () => {
      clearTimeout(timer);
      timer = setTimeout(render, 150);
    });
  } catch (error) {
    $('#loadstate').textContent = 'The source data could not be loaded. Please reload.';
    console.error(error);
  }
}

init();
