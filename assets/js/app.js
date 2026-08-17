(() => {
'use strict';
if (window.__PAMPATTO_APP__) return;
window.__PAMPATTO_APP__ = true;

const $ = id => document.getElementById(id);
const db = () => window.pampattoSupabase || window.supabaseClient || null;
const esc = (v='') => String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = v => Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const sameId=(a,b)=>String(a??'')===String(b??'');
const state={produtos:[],usuarios:[],pedidos:[],logs:[],currentUser:null,filtroTipo:'Todos',reportStatus:'todos',busy:false,realtimeChannel:null,realtimeTimer:null};
window.PAMPATTO_STATE=state;

const categoryIcons={'Carnes Bovinas':'🥩','Carnes Suínas':'🐖','Carnes de Frango':'🍗','Miúdos de Frango':'🫀','Embutidos':'🌭','Industrializados':'🥫','Peixes':'🐟'};
const cats=['Todos',...Object.keys(categoryIcons)];
const PRODUCT_IMAGE_MAP={
 'acem':'acem.jpg','almondegas':'almondegas.jpg','almondegas 29':'almondegas-29.jpg',
 'bacon':'bacon.jpg','bacon especial magro':'bacon-especial-magro.jpg','carne moida':'carne-moida.jpg',
 'contrafile':'contrafile.jpg','coracao':'coracao.jpg','costela bovina':'costela-bovina.jpg',
 'costela suina':'costela-suina.jpg','coxa e sobrecoxa':'coxa-e-sobrecoxa.jpg','coxao duro':'coxao-duro.jpg',
 'coxao mole':'coxao-mole.jpg','cupim':'cupim.jpg','figado':'figado.jpg','file de peito':'file-de-peito.jpg',
 'file de peixe panga':'file-de-peixe-panga.jpg','frango em iscas':'frango-em-iscas.jpg','frango inteiro':'frango-inteiro.jpg',
 'hamburguer 36 un':'hamburguer-36-un.jpg','hamburguer de frango':'hamburguer-de-frango.jpg',
 'hamburguer':'hamburguer.jpg','lagarto':'lagarto.jpg','linguica calabresa':'linguica-calabresa.jpg',
 'linguica de frango':'linguica-de-frango.jpg','linguica toscana':'linguica-toscana.jpg',
 'meio da asa':'meio-da-asa.jpg','moela':'moela.jpg','patinho em bife':'patinho-em-bife.jpg','patinho em cubos':'patinho-em-cubos.jpg',
 'patinho moido':'patinho-moido.jpg','pe de frango':'pe-de-frango.jpg','peito de frango':'peito-de-frango.jpg',
 'pernil em cubos':'pernil-em-cubos.jpg','picanha':'picanha.jpg','salmao':'salmao.jpg','tilapia':'tilapia.jpg'
};
function normalizeText(v=''){return String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()}
function resolveProductImage(product){
 const raw=String(product.imagem_url||product.imagem||product.foto_url||product.foto||'').trim();
 const looksLikeLogo=!raw||/logo(?:\.jpg|\.png)?(?:\?|$)/i.test(raw);
 if(!looksLikeLogo)return raw;
 const key=normalizeText(product.nome||product.produto_nome||product.titulo||'');
 const exact=PRODUCT_IMAGE_MAP[key];
 if(exact)return `assets/images/${exact}`;
 const partial=Object.keys(PRODUCT_IMAGE_MAP).sort((a,b)=>b.length-a.length).find(k=>key.includes(k)||k.includes(key));
 return partial?`assets/images/${PRODUCT_IMAGE_MAP[partial]}`:'assets/images/logo.jpg';
}
function dedupeProducts(rows){
 const map=new Map();
 for(const p of rows){
   const key=`${normalizeText(p.nome)}|${normalizeText(p.tipo)}`;
   const current=map.get(key);
   if(!current){map.set(key,p);continue}
   const currentHasRealImage=!/logo(?:\.jpg|\.png)?(?:\?|$)/i.test(current.imagem_url||'');
   const nextHasRealImage=!/logo(?:\.jpg|\.png)?(?:\?|$)/i.test(p.imagem_url||'');
   if((nextHasRealImage&&!currentHasRealImage)||Number(p.valor||0)>Number(current.valor||0))map.set(key,p);
 }
 return [...map.values()];
}
function isAdmin(){return state.currentUser?.perfil==='admin'}
function canSeePrices(){return isAdmin()||state.currentUser?.mostrar_precos!==false}
window.PAMPATTO_CAN_SEE_PRICES=canSeePrices;
function exposeUser(){window.currentUser=state.currentUser;window.PAMPATTO_CURRENT_USER=state.currentUser}
function showError(message){const el=$('errorAlert');if(el){el.textContent=message;el.style.display='block'}}
function hideError(){const el=$('errorAlert');if(el)el.style.display='none'}
function setLoading(active,text='Aguarde...'){
 const btn=$('loginForm')?.querySelector('button[type=submit]');
 if(btn){btn.disabled=active;btn.textContent=active?text:'ENTRAR'}
}
function requireDb(){const client=db();if(!client)throw new Error('Supabase não foi carregado. Verifique o arquivo supabase-config.js.');return client}

async function login(usuario,senha){
 const client=requireDb();
 const {data,error}=await client.rpc('autenticar_usuario',{p_usuario:usuario,p_senha:senha});
 if(error)throw error;
 const user=Array.isArray(data)?data[0]:data;
 if(!user)throw new Error('Usuário ou senha inválidos.');
 let mostrarPrecos=true;
 const pref=await client.rpc('pampatto_obter_visualizacao_precos_v22',{p_usuario:String(user.id||user.usuario)});
 if(!pref.error&&typeof pref.data==='boolean')mostrarPrecos=pref.data;
 state.currentUser={id:user.id,nome:user.nome,cnpj:user.cnpj||'',usuario:user.usuario,perfil:user.perfil,ativo:user.ativo,mostrar_precos:mostrarPrecos};
 exposeUser();
 await client.rpc('pampatto_registrar_log_v13',{
   p_usuario:String(user.id||user.usuario),
   p_evento:'login'
 });
}
async function restoreSession(){
 return false;
}

async function loadProducts(){
 const client=requireDb();
 const batchSize=5;
 const rows=[];

 // Mantém SELECT * para preservar todos os campos, inclusive imagem_url.
 // A única mudança é dividir a leitura em lotes pequenos para evitar timeout.
 for(let offset=0;;offset+=batchSize){
   const {data,error}=await client
     .from('produtos')
     .select('*')
     .eq('ativo',true)
     .order('id',{ascending:true})
     .range(offset,offset+batchSize-1);

   if(error)throw error;

   const batch=data||[];
   rows.push(...batch);

   if(batch.length<batchSize)break;
 }

 const normalized=rows.map((p,index)=>{
   const item={
     ...p,
     id:p.id ?? p.produto_id ?? p.codigo ?? `produto-${index}`,
     nome:String(p.nome ?? p.produto_nome ?? p.titulo ?? p.descricao ?? 'Produto sem nome').trim(),
     tipo:String(p.tipo ?? p.categoria ?? p.grupo ?? 'Outros').trim(),
     valor:Number(p.valor ?? p.preco ?? p.valor_unitario ?? 0),
     quantidade:Number(p.quantidade ?? p.estoque ?? p.saldo ?? 0),
     ativo:p.ativo !== false
   };
   item.imagem_url=resolveProductImage(item);
   return item;
 });
 state.produtos=dedupeProducts(normalized).sort((a,b)=>a.tipo.localeCompare(b.tipo,'pt-BR')||a.nome.localeCompare(b.nome,'pt-BR'));
}
async function loadUsers(){
 if(!isAdmin())return;
 const {data,error}=await requireDb()
   .from('usuarios')
   .select('id,nome,cnpj,usuario,perfil,ativo,mostrar_precos,created_at')
   .order('nome');
 if(error)throw error;
 state.usuarios=data||[];
}
async function loadOrderMetrics(){
 const client=requireDb();
 let q=client.from('catalogo_pedidos')
   .select('id,numero_pedido,sequencial,cliente_identificador,cliente_nome,status,valor_total,created_at,catalogo_pedido_itens(id,produto_nome,quantidade,valor_unitario,subtotal,ordem)')
   .order('created_at',{ascending:false});
 if(!isAdmin())q=q.eq('cliente_identificador',state.currentUser.id).limit(5);
 const {data,error}=await q;
 if(error)throw error;
 state.pedidos=data||[];
}

async function loadLogs(){
 if(!isAdmin())return;
 const {data,error}=await requireDb().rpc('pampatto_listar_logs_v13',{
   p_admin:String(state.currentUser.id||state.currentUser.usuario),
   p_limite:500
 });
 if(error)throw error;
 state.logs=data||[];
}


function catButtons(){return `<div class="category-buttons">${cats.map(c=>`<button class="cat-btn ${state.filtroTipo===c?'active':''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}</div>`}
function productCard(p){
 const nome=String(p.nome||p.produto_nome||p.titulo||p.descricao||'Produto sem nome').trim();
 const imagem=resolveProductImage(p);
 const fallback='assets/images/logo.jpg';
 const vendidoPorKg=!normalizeText(nome).includes('hamburguer');
 const mostrarPreco=canSeePrices();
 return `<article class="product-card" data-product-id="${esc(p.id)}" data-product-name-value="${esc(nome)}">
   <img src="${esc(imagem||fallback)}" alt="${esc(nome)}" onerror="if(!this.dataset.fallback){this.dataset.fallback='1';this.src='${fallback}'}">
   <h4 class="product-name" data-product-name title="${esc(nome)}" style="display:block!important;visibility:visible!important;opacity:1!important;color:#fff3c4!important;font-size:14px!important;line-height:1.25!important;margin:10px 8px 6px!important;min-height:35px!important;position:relative!important;z-index:2!important;">${esc(nome)}</h4>
   ${vendidoPorKg?'<div class="product-unit-badge" title="Valor por quilograma">KG</div>':''}
   <div class="product-meta"><div class="price">${mostrarPreco?money(p.valor):'<span class="price-hidden-label">Preço não exibido</span>'}</div></div>
   <div class="catalog-quantity-controls"><div class="catalog-stepper"><button type="button" data-q="minus">−</button><input type="number" min="1" max="999" value="1"><button type="button" data-q="plus">+</button></div><button type="button" class="btn" data-q="add">Incluir</button></div>
 </article>`
}
function renderProductArea(id){
 const root=$(id);if(!root)return;const input=id==='dashProducts'?$('buscaDash'):$('buscaProdutos');const termo=(input?.value||'').trim().toLowerCase();const base=state.produtos.filter(p=>(state.filtroTipo==='Todos'||p.tipo===state.filtroTipo)&&`${p.nome} ${p.tipo}`.toLowerCase().includes(termo));let html=catButtons();const groups=state.filtroTipo==='Todos'?Object.keys(categoryIcons):[state.filtroTipo];for(const cat of groups){const items=base.filter(p=>p.tipo===cat);if(items.length)html+=`<section class="product-section"><div class="section-title"><span>${categoryIcons[cat]||'•'}</span>${esc(cat)}</div><div class="product-grid">${items.map(productCard).join('')}</div></section>`}root.innerHTML=html||'<div class="empty">Nenhum produto encontrado.</div>';
}
function renderStock(){
 if(!isAdmin()||!$('tbody'))return;
 const table=$('tbody').closest('table');
 const headRow=table?.querySelector('thead tr');
 if(headRow)headRow.innerHTML='<th>Foto</th><th>Produto</th><th>Categoria</th><th>Valor</th><th>Ações</th>';
 const termo=($('busca')?.value||'').toLowerCase();
 const list=state.produtos.filter(p=>`${p.nome} ${p.tipo}`.toLowerCase().includes(termo));
 $('tbody').innerHTML=list.map(p=>`<tr><td><img class="thumb" src="${esc(resolveProductImage(p))}" alt="${esc(p.nome)}" onerror="this.src='assets/images/logo.jpg'"></td><td><strong>${esc(p.nome)}</strong><br><span class="muted">${esc(p.fabricante||'')}</span></td><td><span class="tag">${esc(p.tipo)}</span></td><td><input class="stock-edit" id="stock-price-${p.id}" type="number" min="0" step="0.01" value="${Number(p.valor||0).toFixed(2)}"></td><td><div class="actions"><button class="mini-btn" data-save-stock="${p.id}">Salvar valor</button><button class="mini-btn" data-edit-product="${p.id}">Editar dados</button></div><span class="stock-save-ok" id="stock-ok-${p.id}"></span></td></tr>`).join('')||'<tr><td colspan="5" class="empty">Nenhum produto encontrado.</td></tr>';
}
function renderUsers(){
 if(!isAdmin()||!$('usersBody'))return;
 $('usersBody').innerHTML=state.usuarios.map(u=>{
   const mostrar=u.mostrar_precos!==false;
   return `
   <tr>
     <td>${esc(u.nome)}</td>
     <td>${esc(u.cnpj||'—')}</td>
     <td>${esc(u.usuario)}</td>
     <td><span class="password-mask">••••••••</span></td>
     <td><span class="role-badge">${u.perfil==='admin'?'Administrador':'Cliente'}</span></td>
     <td>${u.ativo?'Ativo':'Inativo'}</td>
     <td>${u.perfil==='admin'
       ?'<span class="price-visibility-admin">Sempre visível</span>'
       :`<label class="price-visibility-switch" title="Ativar ou desativar a visualização dos preços para este cliente">
           <input type="checkbox" data-price-visibility="${u.id}" ${mostrar?'checked':''}>
           <span class="price-visibility-slider" aria-hidden="true"></span>
           <span class="price-visibility-text">${mostrar?'Exibir':'Ocultar'}</span>
         </label>`}
     </td>
     <td>
       <button class="mini-btn" data-reset-password="${u.id}">Alterar senha</button>
       ${u.usuario==='teste'
         ?'<span class="muted">Acesso principal</span>'
         :`<button class="mini-btn" data-toggle-user="${u.id}">${u.ativo?'Desativar':'Ativar'}</button>
           <button class="mini-btn danger" data-delete-user="${u.id}">Arquivar</button>`}
     </td>
   </tr>`;
 }).join('');
}
function renderMetrics(){
 const month=new Date().toISOString().slice(0,7);const monthly=state.pedidos.filter(p=>String(p.created_at||'').slice(0,7)===month);if($('metricProducts'))$('metricProducts').textContent=state.produtos.length;if($('metricOrders'))$('metricOrders').textContent=state.pedidos.length;if(isAdmin()){if($('metricLow'))$('metricLow').textContent=state.produtos.filter(p=>Number(p.quantidade||0)<=0).length;if($('metricSales'))$('metricSales').textContent=money(monthly.reduce((s,p)=>s+Number(p.valor_total||0),0))}
}
function applyPermissions(){document.querySelectorAll('.admin-only').forEach(el=>el.style.display=isAdmin()?'':'none');if($('currentUserName'))$('currentUserName').textContent=state.currentUser.nome;if($('currentUserRole'))$('currentUserRole').textContent=isAdmin()?'Administrador':state.currentUser.usuario;if($('ordersMenuLabel'))$('ordersMenuLabel').textContent=isAdmin()?'Pedidos':'Meus pedidos';if($('acompanharListaMenu'))$('acompanharListaMenu').style.display=isAdmin()?'':'none'}
function reportFilterValues(){
 return {
   mes:$('reportMes')?.value||'',
   ano:$('reportAno')?.value||'',
   cliente:$('reportCliente')?.value||'',
   numero:($('reportNumero')?.value||'').trim().toLowerCase(),
   status:state.reportStatus||'todos'
 };
}
function filteredReportOrders(){
 const f=reportFilterValues();
 return state.pedidos.filter(p=>{
   const d=new Date(p.created_at);
   const mes=String(d.getMonth()+1).padStart(2,'0');
   const ano=String(d.getFullYear());
   const cliente=String(p.cliente_identificador||p.cliente_nome||'');
   const numero=String(p.numero_pedido||'').toLowerCase();
   return (!f.mes||mes===f.mes)
     &&(!f.ano||ano===f.ano)
     &&(!f.cliente||cliente===f.cliente)
     &&(!f.numero||numero.includes(f.numero))
     &&(f.status==='todos'||(f.status==='cancelados'?p.status==='cancelado':p.status!=='cancelado'));
 });
}
function reportStatusLabel(status){
 return ({
   pedido_realizado:'Pedido realizado',
   em_separacao:'Em separação',
   separado:'Separado',
   entregue:'Concluído',
   concluido:'Concluído',
   cancelado:'Cancelado'
 })[status]||status||'Pedido realizado';
}
function renderReportResults(){
 const target=$('reportResults');
 if(!target)return;
 const pedidos=filteredReportOrders();
 const total=pedidos.reduce((s,p)=>s+Number(p.valor_total||0),0);
 const qtdItens=pedidos.reduce((s,p)=>s+(p.catalogo_pedido_itens||[]).reduce((x,i)=>x+Number(i.quantidade||0),0),0);
 if($('reportCount'))$('reportCount').textContent=pedidos.length;
 if($('reportItems'))$('reportItems').textContent=qtdItens;
 if($('reportTotal'))$('reportTotal').textContent=money(total);
 target.innerHTML=pedidos.length?`
   <div class="table-wrap report-table-wrap">
     <table class="report-table">
       <thead><tr><th>Pedido</th><th>Data</th><th>Cliente</th><th>Status</th><th>Itens</th><th>Total</th></tr></thead>
       <tbody>${pedidos.map(p=>`
         <tr>
           <td><strong>${esc(p.numero_pedido||'—')}</strong></td>
           <td>${new Date(p.created_at).toLocaleDateString('pt-BR')}</td>
           <td>${esc(p.cliente_nome||'Cliente')}</td>
           <td><span class="tag ${['entregue','concluido'].includes(p.status)?'status-completed':p.status==='cancelado'?'status-cancelled':''}">${esc(reportStatusLabel(p.status))}</span></td>
           <td>${(p.catalogo_pedido_itens||[]).reduce((s,i)=>s+Number(i.quantidade||0),0)}</td>
           <td><strong>${money(p.valor_total)}</strong></td>
         </tr>
         <tr class="report-items-row"><td colspan="6">
           <div class="report-products">${(p.catalogo_pedido_itens||[]).sort((a,b)=>Number(a.ordem||0)-Number(b.ordem||0)).map(i=>`
             <span>${Number(i.quantidade||0)}× ${esc(i.produto_nome)} — ${money(i.subtotal??(Number(i.quantidade||0)*Number(i.valor_unitario||0)))}</span>
           `).join('')}</div>
         </td></tr>`).join('')}</tbody>
     </table>
   </div>`:'<div class="empty">Nenhum pedido encontrado para os filtros selecionados.</div>';
}
function exportReportPdf(){
 const pedidos=filteredReportOrders();
 if(!pedidos.length)return alert('Nenhum pedido encontrado para gerar o PDF.');
 const jsPDFCtor=window.jspdf?.jsPDF;
 if(!jsPDFCtor)return alert('O gerador de PDF ainda não foi carregado. Atualize a página.');
 const doc=new jsPDFCtor({orientation:'portrait',unit:'mm',format:'a4'});
 const f=reportFilterValues();
 const filtros=[
   f.mes?`Mês: ${f.mes}`:'',
   f.ano?`Ano: ${f.ano}`:'',
   f.cliente?`Cliente: ${$('reportCliente')?.selectedOptions?.[0]?.textContent||f.cliente}`:'',
   f.numero?`Pedido: ${f.numero}`:''
 ].filter(Boolean).join(' | ')||'Todos os pedidos';
 doc.setFontSize(16);
 doc.text('Empório Pampatto Brasil - Relatório de Pedidos',14,16);
 doc.setFontSize(9);
 doc.text(`Filtros: ${filtros}`,14,23);
 doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`,14,28);
 const rows=[];
 pedidos.forEach(p=>{
   const itens=(p.catalogo_pedido_itens||[]).sort((a,b)=>Number(a.ordem||0)-Number(b.ordem||0));
   if(!itens.length){
     rows.push([p.numero_pedido||'—',new Date(p.created_at).toLocaleDateString('pt-BR'),p.cliente_nome||'Cliente','—','—',money(p.valor_total)]);
   }else{
     itens.forEach((i,n)=>rows.push([
       n===0?(p.numero_pedido||'—'):'',
       n===0?new Date(p.created_at).toLocaleDateString('pt-BR'):'',
       n===0?(p.cliente_nome||'Cliente'):'',
       i.produto_nome||'Produto',
       String(Number(i.quantidade||0)),
       money(i.subtotal??(Number(i.quantidade||0)*Number(i.valor_unitario||0)))
     ]));
     rows.push(['','','','Total do pedido','',money(p.valor_total)]);
   }
 });
 doc.autoTable({
   startY:34,
   head:[['Pedido','Data','Cliente','Produto','Qtd.','Valor']],
   body:rows,
   styles:{fontSize:8,cellPadding:2},
   headStyles:{fillColor:[35,30,12],textColor:[245,190,55]},
   alternateRowStyles:{fillColor:[248,246,238]},
   columnStyles:{5:{halign:'right'}}
 });
 const total=pedidos.reduce((s,p)=>s+Number(p.valor_total||0),0);
 const y=(doc.lastAutoTable?.finalY||34)+8;
 doc.setFontSize(11);
 doc.text(`Quantidade de pedidos: ${pedidos.length}`,14,y);
 doc.text(`Valor total filtrado: ${money(total)}`,14,y+6);
 doc.save(`relatorio-pedidos-${new Date().toISOString().slice(0,10)}.pdf`);
}
function renderReports(){
 const target=$('reportsContent');
 if(!target||!isAdmin())return;
 const anos=[...new Set(state.pedidos.map(p=>String(new Date(p.created_at).getFullYear())))].sort((a,b)=>b-a);
 const clientesMap=new Map();
 state.pedidos.forEach(p=>clientesMap.set(String(p.cliente_identificador||p.cliente_nome||''),p.cliente_nome||'Cliente'));
 target.innerHTML=`
 <div class="panel">
   <div class="panel-head"><div><h3>Relatórios de pedidos</h3><p class="muted">Filtre os pedidos salvos no Supabase e exporte os resultados em PDF.</p></div></div>
   <div class="report-status-buttons">
     <button type="button" class="outline-btn report-status-btn active" data-report-status="todos">Todos os pedidos</button>
     <button type="button" class="outline-btn report-status-btn" data-report-status="ativos">Pedidos ativos</button>
     <button type="button" class="outline-btn report-status-btn cancelled-filter" data-report-status="cancelados">Pedidos cancelados</button>
   </div>
   <div class="report-filters">
     <label>Mês<select id="reportMes"><option value="">Todos</option>${Array.from({length:12},(_,i)=>`<option value="${String(i+1).padStart(2,'0')}">${new Date(2026,i,1).toLocaleDateString('pt-BR',{month:'long'})}</option>`).join('')}</select></label>
     <label>Ano<select id="reportAno"><option value="">Todos</option>${anos.map(a=>`<option value="${a}">${a}</option>`).join('')}</select></label>
     <label>Cliente<select id="reportCliente"><option value="">Todos</option>${[...clientesMap.entries()].sort((a,b)=>a[1].localeCompare(b[1],'pt-BR')).map(([id,nome])=>`<option value="${esc(id)}">${esc(nome)}</option>`).join('')}</select></label>
     <label>Número do pedido<input id="reportNumero" placeholder="Digite o número"></label>
     <div class="report-filter-actions"><button class="btn" type="button" id="applyReportFilters">Filtrar</button><button class="outline-btn" type="button" id="clearReportFilters">Limpar</button><button class="outline-btn report-pdf-btn" type="button" id="exportReportPdf">Exportar PDF</button></div>
   </div>
   <div class="metrics report-metrics">
     <div class="metric"><div><span class="muted">PEDIDOS FILTRADOS</span><div class="big" id="reportCount">0</div></div></div>
     <div class="metric"><div><span class="muted">ITENS</span><div class="big" id="reportItems">0</div></div></div>
     <div class="metric"><div><span class="muted">VALOR TOTAL</span><div class="big small" id="reportTotal">R$ 0,00</div></div></div>
   </div>
   <div id="reportResults"></div>
 </div>`;
 target.querySelectorAll('[data-report-status]').forEach(btn=>btn.addEventListener('click',()=>{
   state.reportStatus=btn.dataset.reportStatus;
   target.querySelectorAll('[data-report-status]').forEach(b=>b.classList.toggle('active',b===btn));
   renderReportResults();
 }));
 $('applyReportFilters')?.addEventListener('click',renderReportResults);
 $('clearReportFilters')?.addEventListener('click',()=>{['reportMes','reportAno','reportCliente','reportNumero'].forEach(id=>{if($(id))$(id).value=''});renderReportResults()});
 $('exportReportPdf')?.addEventListener('click',exportReportPdf);
 ['reportMes','reportAno','reportCliente'].forEach(id=>$(id)?.addEventListener('change',renderReportResults));
 $('reportNumero')?.addEventListener('input',renderReportResults);
 renderReportResults();
}

function renderLogs(){
 const target=$('logsContent');
 if(!target||!isAdmin())return;
 target.innerHTML=`
 <div class="panel">
   <div class="panel-head">
     <div><h3>Logs de acesso</h3><p class="muted">Entradas e saídas registradas diretamente no banco de dados.</p></div>
     <button class="outline-btn" type="button" id="refreshLogsBtn">Atualizar</button>
   </div>
   <div class="table-wrap">
     <table>
       <thead><tr><th>Data e hora</th><th>Cliente</th><th>Usuário</th><th>Evento</th></tr></thead>
       <tbody>${state.logs.length?state.logs.map(l=>`
         <tr>
           <td>${new Date(l.ocorrido_em).toLocaleString('pt-BR')}</td>
           <td>${esc(l.nome||'—')}</td>
           <td>${esc(l.usuario||'—')}</td>
           <td><span class="tag ${l.evento==='login'?'log-login':'log-logout'}">${l.evento==='login'?'Login':'Logout'}</span></td>
         </tr>`).join(''):'<tr><td colspan="4" class="empty">Nenhum log registrado.</td></tr>'}</tbody>
     </table>
   </div>
 </div>`;
 $('refreshLogsBtn')?.addEventListener('click',async()=>{await loadLogs();renderLogs()});
}

function ensureProductNamesVisible(){
 document.querySelectorAll('.product-card .product-name,[data-product-name]').forEach(el=>{
   el.style.setProperty('display','block','important');
   el.style.setProperty('visibility','visible','important');
   el.style.setProperty('opacity','1','important');
   el.style.setProperty('color','#fff3c4','important');
   el.style.setProperty('min-height','35px','important');
 });
}
function renderAll(){applyPermissions();renderProductArea('dashProducts');renderProductArea('produtosView');ensureProductNamesVisible();renderStock();renderUsers();renderMetrics();renderReports();renderLogs();document.dispatchEvent(new CustomEvent('pampatto:data-ready'))}
async function refreshAll(){await Promise.all([loadProducts(),loadUsers(),loadOrderMetrics(),loadLogs()]);renderAll()}
window.PAMPATTO_REFRESH_ALL=refreshAll;

function openTab(tab){if(['estoque','empresa','relatorios','logs','acompanhar-lista'].includes(tab)&&!isAdmin())return;document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));$('tab-'+tab)?.classList.add('active');document.querySelectorAll('.nav button').forEach(b=>b.classList.remove('active'));document.querySelector(`[data-tab="${tab}"]`)?.classList.add('active');document.dispatchEvent(new CustomEvent('pampatto:tab',{detail:{tab}}))}
window.openTab=openTab;

async function saveStock(id){const valor=Number($('stock-price-'+id)?.value);if(!Number.isFinite(valor)||valor<0)return alert('Informe um valor válido.');const {error}=await requireDb().from('produtos').update({valor,updated_at:new Date().toISOString()}).eq('id',id);if(error)return alert(error.message);await loadProducts();renderAll()}
function editProduct(id){const p=state.produtos.find(x=>sameId(x.id,id));if(!p)return;$('produtoId').value=p.id;$('nome').value=p.nome;$('fabricante').value=p.fabricante||'';$('quantidade').value=Number(p.quantidade||0);$('valor').value=Number(p.valor||0).toFixed(2);$('tipo').value=p.tipo;$('validade').value=p.validade||'';$('stockFormTitle').textContent='Editar produto';$('cancelProductEdit').style.display='block';openTab('estoque')}
async function fileToDataUrl(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file)})}
async function submitProduct(e){e.preventDefault();const id=$('produtoId').value;const file=$('imagem').files[0];const current=state.produtos.find(p=>sameId(p.id,id));const payload={nome:$('nome').value.trim(),fabricante:$('fabricante').value.trim()||'Empório Pampatto',quantidade:Number($('quantidade').value||0),valor:Number($('valor').value||0),tipo:$('tipo').value,validade:$('validade').value||null,imagem_url:file?await fileToDataUrl(file):(current?.imagem_url||resolveProductImage({nome:$('nome').value.trim()})),ativo:true,updated_at:new Date().toISOString()};if(!payload.nome)return alert('Informe o nome do produto.');let result=id?await requireDb().from('produtos').update(payload).eq('id',id):await requireDb().from('produtos').insert(payload);if(result.error)return alert(result.error.message);e.target.reset();$('produtoId').value='';$('stockFormTitle').textContent='Cadastrar produto';$('cancelProductEdit').style.display='none';await loadProducts();renderAll()}
async function submitUser(e){e.preventDefault();const payload={p_nome:$('clienteNome').value.trim(),p_cnpj:$('clienteCnpj').value.trim(),p_usuario:$('clienteUsuario').value.trim(),p_senha:$('clienteSenha').value,p_perfil:$('clientePerfil').value};const {error}=await requireDb().rpc('cadastrar_usuario',payload);if(error)return alert(error.message);e.target.reset();await loadUsers();renderUsers();const n=$('userNotice');if(n){n.style.display='block';n.textContent='Cliente cadastrado com sucesso.';setTimeout(()=>n.style.display='none',2500)}}

async function setUserPriceVisibility(id,mostrar){
 const usuario=state.usuarios.find(u=>sameId(u.id,id));
 if(!usuario||usuario.perfil==='admin')return;
 const {error}=await requireDb().rpc('pampatto_definir_visualizacao_precos_v22',{
   p_admin:String(state.currentUser.id||state.currentUser.usuario),
   p_usuario_id:id,
   p_mostrar_precos:Boolean(mostrar)
 });
 if(error){
   alert(`Não foi possível alterar a visualização dos preços.\n\n${error.message}`);
   await loadUsers();renderUsers();
   return;
 }
 usuario.mostrar_precos=Boolean(mostrar);
 renderUsers();
}

async function resetUserPassword(id){
 const usuario=state.usuarios.find(u=>sameId(u.id,id));
 if(!usuario)return;
 const novaSenha=prompt(`Informe a nova senha para ${usuario.nome}:`);
 if(novaSenha===null)return;
 if(novaSenha.length<8)return alert('A nova senha deve ter pelo menos 8 caracteres.');
 const confirmacao=prompt('Digite novamente a nova senha:');
 if(confirmacao!==novaSenha)return alert('As senhas informadas não coincidem.');
 const {error}=await requireDb().rpc('pampatto_redefinir_senha_v13',{
   p_admin:String(state.currentUser.id||state.currentUser.usuario),
   p_usuario_id:id,
   p_nova_senha:novaSenha
 });
 if(error)return alert(error.message);
 alert('Senha alterada com sucesso.');
}

async function toggleUser(id){const u=state.usuarios.find(x=>sameId(x.id,id));if(!u)return;const {error}=await requireDb().from('usuarios').update({ativo:!u.ativo}).eq('id',id);if(error)return alert(error.message);await loadUsers();renderUsers()}
async function deleteUser(id){
 const usuario=state.usuarios.find(u=>sameId(u.id,id));
 if(!usuario)return;

 const confirmar=confirm(
   `Arquivar o cliente ${usuario.nome}?\n\n`+
   `O acesso será bloqueado, mas pedidos, listas e logs permanecerão salvos no banco.`
 );
 if(!confirmar)return;

 const {error}=await requireDb().rpc('pampatto_arquivar_cliente_v17',{
   p_admin:String(state.currentUser.id||state.currentUser.usuario),
   p_usuario_id:id
 });

 if(error)return alert(`Não foi possível arquivar o cliente.\n\n${error.message}`);

 await loadUsers();
 renderUsers();
 alert('Cliente arquivado e acesso bloqueado com sucesso.');
}
function stopRealtime(){
 if(state.realtimeTimer){
   clearTimeout(state.realtimeTimer);
   state.realtimeTimer=null;
 }

 const client=db();
 if(state.realtimeChannel&&client){
   try{
     client.removeChannel(state.realtimeChannel);
   }catch(err){
     console.warn('Não foi possível encerrar o canal Realtime:',err);
   }
 }

 state.realtimeChannel=null;
}

function scheduleRealtimeRefresh(){
 if(state.realtimeTimer)clearTimeout(state.realtimeTimer);
 state.realtimeTimer=setTimeout(async()=>{
   try{
     await loadOrderMetrics();
     renderMetrics();
     renderReports();
     document.dispatchEvent(new CustomEvent('pampatto:orders-realtime'));
   }catch(err){console.error('Falha na atualização em tempo real:',err)}
 },250);
}
function startRealtime(){
 stopRealtime();
 const client=db();
 if(!client||!state.currentUser)return;
 state.realtimeChannel=client.channel(`pampatto-realtime-${state.currentUser.id}-${Date.now()}`)
   .on('postgres_changes',{event:'*',schema:'public',table:'catalogo_pedidos'},scheduleRealtimeRefresh)
   .on('postgres_changes',{event:'*',schema:'public',table:'catalogo_pedido_itens'},scheduleRealtimeRefresh)
   .subscribe();
}

function bind(){
 document.querySelectorAll('.nav button[data-tab]').forEach(btn=>btn.addEventListener('click',()=>openTab(btn.dataset.tab)));
 const ordersMetric=$('metricOrders')?.closest('.metric');
 if(ordersMetric){
   ordersMetric.classList.add('metric-link');
   ordersMetric.setAttribute('role','button');
   ordersMetric.setAttribute('tabindex','0');
   ordersMetric.setAttribute('aria-label','Abrir menu de pedidos');
   ordersMetric.title='Abrir pedidos';
   ordersMetric.addEventListener('click',()=>openTab('pedidos'));
   ordersMetric.addEventListener('keydown',e=>{
     if(e.key==='Enter'||e.key===' '){
       e.preventDefault();
       openTab('pedidos');
     }
   });
 }
 document.querySelectorAll('[data-new-product]').forEach(b=>b.addEventListener('click',()=>openTab('estoque')));
 $('loginForm')?.addEventListener('submit',async e=>{e.preventDefault();if(state.busy)return;state.busy=true;hideError();setLoading(true,'ENTRANDO...');try{await login($('login').value.trim().toLowerCase(),$('senha').value);await refreshAll();startRealtime();$('loginPage').style.display='none';$('appPage').style.display='block';openTab('dashboard')}catch(err){showError(err.message||'Não foi possível entrar.')}finally{state.busy=false;setLoading(false)}});
 $('toggleSenha')?.addEventListener('click',()=>{$('senha').type=$('senha').type==='password'?'text':'password'});
 $('senha')?.addEventListener('keyup',e=>{
 const caps=$('capsAlert');
 if(!caps)return;
 const capsOn=typeof e?.getModifierState==='function' ? e.getModifierState('CapsLock') : false;
 caps.style.display=capsOn?'block':'none';
});
 $('logoutBtn')?.addEventListener('click',async()=>{
   const atual=state.currentUser;
   if(atual){
     await requireDb().rpc('pampatto_registrar_log_v13',{
       p_usuario:String(atual.id||atual.usuario),
       p_evento:'logout'
     });
   }
   stopRealtime();
   state.currentUser=null;
   exposeUser();
   $('appPage').style.display='none';
   $('loginPage').style.display='flex';
   $('senha').value='';
 });
 $('busca')?.addEventListener('input',renderStock);$('buscaDash')?.addEventListener('input',()=>renderProductArea('dashProducts'));$('buscaProdutos')?.addEventListener('input',()=>renderProductArea('produtosView'));
 $('dashProducts')?.addEventListener('click',catalogClick);$('produtosView')?.addEventListener('click',catalogClick);
 $('tbody')?.addEventListener('click',e=>{const save=e.target.dataset.saveStock,edit=e.target.dataset.editProduct;if(save)saveStock(save);if(edit)editProduct(edit)});
 $('usersBody')?.addEventListener('click',e=>{
   if(e.target.dataset.resetPassword)resetUserPassword(e.target.dataset.resetPassword);
   if(e.target.dataset.toggleUser)toggleUser(e.target.dataset.toggleUser);
   if(e.target.dataset.deleteUser)deleteUser(e.target.dataset.deleteUser);
 });
 $('usersBody')?.addEventListener('change',e=>{
   if(e.target.dataset.priceVisibility)setUserPriceVisibility(e.target.dataset.priceVisibility,e.target.checked);
 });
 $('stockForm')?.addEventListener('submit',submitProduct);$('cancelProductEdit')?.addEventListener('click',()=>{$('stockForm').reset();$('produtoId').value='';$('stockFormTitle').textContent='Cadastrar produto';$('cancelProductEdit').style.display='none'});
 $('userForm')?.addEventListener('submit',submitUser);
 $('exportBtn')?.addEventListener('click',async()=>{const snapshot={produtos:state.produtos,usuarios:state.usuarios,pedidos:state.pedidos,exportado_em:new Date().toISOString()};const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(snapshot,null,2)],{type:'application/json'}));a.download='pampatto-supabase-backup.json';a.click();URL.revokeObjectURL(a.href)});
}
function catalogClick(e){
 const categoryButton=e.target.closest('[data-cat]');
 if(categoryButton){
   state.filtroTipo=categoryButton.dataset.cat||'Todos';
   renderProductArea('dashProducts');
   renderProductArea('produtosView');
   return;
 }

 const card=e.target.closest('[data-product-id]');
 if(!card)return;

 const input=card.querySelector('input[type=number]');
 const action=e.target.dataset.q;
 if(action==='minus')input.value=Math.max(1,Number(input.value||1)-1);
 if(action==='plus')input.value=Math.min(999,Number(input.value||1)+1);
 if(action==='add'){
   document.dispatchEvent(new CustomEvent('pampatto:add-cart',{
     detail:{
       produtoId:card.dataset.productId,
       quantidade:Number(input.value||1)
     }
   }));
 }
}

async function init(){
 bind();const modal=$('orderSuccessModal');if(modal){modal.classList.remove('open');modal.style.display='none'}
 if(!db()){showError('Falha ao carregar o Supabase. Atualize a página.');return}
 const restored=await restoreSession();if(restored){try{await refreshAll();startRealtime();$('loginPage').style.display='none';$('appPage').style.display='block';openTab('dashboard')}catch(err){console.error(err);showError('Não foi possível carregar os dados do banco: '+err.message)}}
}
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init):init();
})();
