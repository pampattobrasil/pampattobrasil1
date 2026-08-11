(() => {
'use strict';
if(window.__PAMPATTO_LISTA__)return;window.__PAMPATTO_LISTA__=true;
const $=id=>document.getElementById(id),db=()=>window.pampattoSupabase||window.supabaseClient||null;
const esc=(v='')=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const STATUS={pedido_realizado:'Pedido realizado',em_separacao:'Em separação',separado:'Separado',concluido:'Concluído',cancelado:'Cancelado'};
const LIST_STATUS={enviada:'Lista enviada',em_compra:'Em compra',comprada:'Compra realizada',concluida:'Concluída'};
const state={cart:[],orders:[],lists:[],channels:[],bound:false};
const user=()=>window.PAMPATTO_CURRENT_USER||window.currentUser||null;
function notice(msg,error=false){const el=$('cartNotice');if(el){el.className=error?'notice error':'notice';el.textContent=msg}}
async function loadCart(){const u=user();if(!u)return;const {data,error}=await db().from('catalogo_carrinho_itens').select('*').eq('cliente_identificador',u.id).order('created_at');if(error)return notice(error.message,true);state.cart=data||[];renderCart()}
function renderCart(){
 const target=$('cartView');if(!target)return;
 const u=user(),mostrarPrecos=u?.perfil==='admin'||u?.mostrar_precos!==false;
 const count=state.cart.reduce((s,i)=>s+Number(i.quantidade||0),0);
 if($('cartBadge')){$('cartBadge').textContent=count;$('cartBadge').style.display=count?'grid':'none'}
 if(!state.cart.length){target.innerHTML='<div class="shopping-empty muted">Seu carrinho está vazio.</div>';return}
 const total=state.cart.reduce((s,i)=>s+Number(i.subtotal||0),0);
 target.innerHTML=`<div class="cart-items-list">${state.cart.map(i=>`<article class="cart-item-row" data-id="${i.id}"><div class="cart-item-main">${i.imagem_url?`<img src="${esc(i.imagem_url)}" alt="${esc(i.produto_nome)}">`:''}<div><strong>${esc(i.produto_nome)}</strong>${mostrarPrecos?`<span>${money(i.valor_unitario)} cada</span>`:''}</div></div><div class="catalog-stepper cart-stepper"><button data-action="minus">−</button><input type="number" min="1" max="999" value="${i.quantidade}"><button data-action="plus">+</button></div>${mostrarPrecos?`<strong>${money(i.subtotal)}</strong>`:'<span class="price-hidden-label">Preço não exibido</span>'}<button class="outline-btn danger-outline" data-action="remove">Remover</button></article>`).join('')}</div>${mostrarPrecos?`<div class="cart-total"><span>Total do pedido</span><strong>${money(total)}</strong></div>`:'<div class="cart-total price-hidden-total"><span>Preços ocultos para este acesso</span></div>'}`
}
async function addCart(produtoId,quantidade){const u=user(),p=window.PAMPATTO_STATE?.produtos?.find(x=>String(x.id)===String(produtoId));if(!u||!p)return;const {error}=await db().rpc('pampatto_adicionar_item_carrinho',{p_cliente_identificador:u.id,p_cliente_nome:u.nome,p_produto_id:p.id,p_produto_nome:p.nome,p_imagem_url:p.imagem_url||null,p_quantidade:Math.max(1,Number(quantidade)||1),p_valor_unitario:Number(p.valor||0)});if(error)return alert(error.message);await loadCart();notice(`${p.nome} incluído no carrinho.`)}
async function changeItem(id,q){const query=Number(q)<=0?db().from('catalogo_carrinho_itens').delete().eq('id',id):db().from('catalogo_carrinho_itens').update({quantidade:Math.max(1,Number(q))}).eq('id',id);const {error}=await query;if(error)return notice(error.message,true);await loadCart()}
async function clearCart(){const u=user();if(!u)return;if(!state.cart.length)return notice('O carrinho já está vazio.');if(!confirm('Deseja cancelar e esvaziar o carrinho?'))return;const {error}=await db().from('catalogo_carrinho_itens').delete().eq('cliente_identificador',u.id);if(error)return notice(error.message,true);await loadCart();notice('Carrinho esvaziado.')}
async function finish(){
 const u=user();
 if(!u)return notice('Faça login novamente para finalizar o pedido.',true);
 if(!state.cart.length)return notice('Inclua ao menos um produto.',true);
 const client=db();
 const btn=$('finishCartBtn');
 const originalText=btn?.textContent||'Finalizar pedido';
 if(btn){btn.disabled=true;btn.textContent='SALVANDO...'}
 try{
   const {data,error}=await client.rpc('pampatto_finalizar_pedido_v3',{
     p_cliente:String(u.id||u.usuario||''),
     p_cliente_nome:String(u.nome||u.usuario||'Cliente')
   });
   if(error)throw error;
   const resultado=Array.isArray(data)?data[0]:data;
   if(!resultado?.pedido_id)throw new Error('O banco não devolveu a identificação do pedido.');
   state.cart=[];
   renderCart();
   await Promise.all([loadCart(),loadOrders()]);
   await window.PAMPATTO_REFRESH_ALL?.();
   notice(`Pedido nº ${resultado.numero_pedido} salvo com sucesso. Status: ${STATUS[resultado.status]||'Pedido realizado'}.`);
   window.openTab?.('pedidos');
   document.dispatchEvent(new CustomEvent('pampatto:tab',{detail:{tab:'pedidos'}}));
   setTimeout(()=>document.querySelector('#ordersContent .order-card')?.scrollIntoView({behavior:'smooth',block:'start'}),150);
 }catch(err){
   console.error('Erro ao finalizar pedido:',err);
   const detalhe=[err?.message,err?.details,err?.hint].filter(Boolean).join(' | ')||String(err);
   notice(`Não foi possível salvar o pedido: ${detalhe}`,true);
   alert(`Não foi possível finalizar o pedido.\n\n${detalhe}`);
 }finally{
   if(btn){btn.disabled=false;btn.textContent=originalText}
 }
}

function formatExistingNumber(dateValue,sequencial,prefix=''){
 const seq=Number(sequencial);
 if(!Number.isFinite(seq)||seq<3000)return '—';
 const d=new Date(dateValue);
 const dd=String(d.getDate()).padStart(2,'0');
 const mm=String(d.getMonth()+1).padStart(2,'0');
 const yy=String(d.getFullYear()).slice(-2);
 return `${dd}${mm}${yy}${prefix}${seq}`;
}

function normalizeOrderStatus(status){
 if(status==='entregue')return 'concluido';
 if(status==='cancelado')return 'cancelado';
 return STATUS[status]?status:'pedido_realizado';
}
function timeline(status,labels=STATUS){
 const visibleEntries=Object.entries(labels).filter(([key])=>key!=='cancelado');
 const keys=visibleEntries.map(([key])=>key);
 const visibleLabels=Object.fromEntries(visibleEntries);
 const normalized=status==='entregue'?'concluido':status;
 const current=Math.max(0,keys.indexOf(normalized));
 const progress=keys.length>1?(current/(keys.length-1))*100:0;
 return `<div class="pampatto-status-ruler" style="--status-progress:${progress}%">
   <div class="status-ruler-line"><span></span></div>
   ${keys.map((key,index)=>`
     <div class="status-ruler-step ${index<=current?'completed':''} ${index===current?'current':''}">
       <span class="status-ruler-circle">${index<current?'✓':index+1}</span>
       <span class="status-ruler-label">${esc(visibleLabels[key])}</span>
     </div>`).join('')}
 </div>`;
}
async function loadOrders(filter=state.orderFilter||'ativos'){
 const u=user(),target=$('ordersContent');
 if(!u||!target)return;
 state.orderFilter=filter;
 let q=db().from('catalogo_pedidos')
   .select('id,numero_pedido,sequencial,cliente_identificador,cliente_nome,status,valor_total,created_at,catalogo_pedido_itens(id,produto_nome,quantidade,valor_unitario,subtotal,ordem)')
   .order('created_at',{ascending:false})
   .limit(5);

 if(u.perfil!=='admin')q=q.eq('cliente_identificador',u.id);
 q=filter==='cancelados'?q.eq('status','cancelado'):q.neq('status','cancelado');

 const {data,error}=await q;
 if(error){target.innerHTML=`<div class="notice error">${esc(error.message)}</div>`;return}
 state.orders=data||[];
 const mostrarPrecos=u.perfil==='admin'||u.mostrar_precos!==false;

 target.innerHTML=`<div class="panel">
   <div class="panel-head">
     <div>
       <h3>${u.perfil==='admin'?'Pedidos':'Meus últimos pedidos'}</h3>
       <p class="muted">Os cinco pedidos mais recentes deste filtro ficam disponíveis. O histórico completo permanece nos relatórios.</p>
     </div>
     <div class="orders-filter-actions">
       <button class="outline-btn ${filter==='ativos'?'active':''}" type="button" data-order-filter="ativos">Pedidos ativos</button>
       <button class="outline-btn cancelled-filter ${filter==='cancelados'?'active':''}" type="button" data-order-filter="cancelados">Pedidos cancelados</button>
       <button class="outline-btn" id="refreshOrdersBtn">Atualizar</button>
     </div>
   </div>
   <div class="orders-list">${state.orders.length?state.orders.map(o=>{
     const normalizedStatus=normalizeOrderStatus(o.status);
     const completed=normalizedStatus==='concluido';
     const cancelled=normalizedStatus==='cancelado';
     return `<article class="order-card ${completed?'order-completed':''} ${cancelled?'order-cancelled':''}" data-order-id="${o.id}">
       <div class="order-card-head">
         <div>
           <strong class="order-number">Pedido nº ${esc(o.numero_pedido||formatExistingNumber(o.created_at,o.sequencial))}</strong>
           <div class="shopping-list-meta">
             <span>${new Date(o.created_at).toLocaleString('pt-BR')}</span>
             <span>Cliente: <strong>${esc(o.cliente_nome||u.nome||'Cliente')}</strong></span>
           </div>
         </div>
         <div class="order-value-status">
           ${mostrarPrecos?`<strong>${money(o.valor_total)}</strong>`:''}
           <div><span class="tag ${completed?'status-completed':cancelled?'status-cancelled':''}">${esc(STATUS[normalizedStatus]||'Pedido realizado')}</span></div>
         </div>
       </div>
       ${cancelled?'':timeline(normalizedStatus)}
       <div class="order-items">${(o.catalogo_pedido_itens||[]).sort((a,b)=>Number(a.ordem||0)-Number(b.ordem||0)).map(i=>`<div><span>${i.quantidade}× ${esc(i.produto_nome)}</span>${mostrarPrecos?`<strong>${money(i.subtotal??(Number(i.quantidade||0)*Number(i.valor_unitario||0)))}</strong>`:''}</div>`).join('')}</div>
       ${cancelled?'':`<div class="order-card-actions">
         ${u.perfil==='admin'?`<div class="order-admin-status"><label>Alterar status</label><select data-status>${Object.entries(STATUS).filter(([k])=>k!=='cancelado').map(([k,v])=>`<option value="${k}" ${normalizedStatus===k?'selected':''}>${v}</option>`).join('')}</select><button class="btn status-save-button" type="button" data-save-status>Salvar status</button></div>`:''}
         <button class="outline-btn order-delete-button" type="button" data-delete-order>Cancelar pedido</button>
       </div>`}
     </article>`;
   }).join(''):'<div class="shopping-empty muted">Nenhum pedido encontrado neste filtro.</div>'}</div>
 </div>`;

 target.querySelectorAll('[data-order-filter]').forEach(btn=>btn.addEventListener('click',()=>loadOrders(btn.dataset.orderFilter)));
 $('refreshOrdersBtn')?.addEventListener('click',()=>loadOrders(state.orderFilter));
}
async function saveStatus(card,btn){
 const novoStatus=card.querySelector('[data-status]')?.value;
 if(!novoStatus)return;
 const original=btn.textContent;
 btn.disabled=true;
 btn.textContent='Salvando...';
 const {error}=await db().rpc('pampatto_atualizar_status_pedido_v8',{
   p_pedido_id:card.dataset.orderId,
   p_status:novoStatus
 });
 btn.disabled=false;
 btn.textContent=original;
 if(error)return alert(`Não foi possível atualizar o status do pedido.

${error.message}`);
 await loadOrders();
}

async function deleteOrder(card,btn){
 const u=user();
 const numero=card.querySelector('.order-number')?.textContent?.trim()||'este pedido';
 if(!confirm(`Cancelar ${numero}?

O pedido ficará salvo no histórico e o número nunca será reutilizado.`))return;

 const original=btn.textContent;
 btn.disabled=true;
 btn.textContent='Cancelando...';

 const {error}=await db().rpc('pampatto_cancelar_pedido_v13',{
   p_pedido_id:card.dataset.orderId,
   p_usuario:String(u.id||u.usuario||'')
 });

 btn.disabled=false;
 btn.textContent=original;

 if(error)return alert(`Não foi possível cancelar o pedido.

${error.message}`);

 await loadOrders('ativos');
 await window.PAMPATTO_REFRESH_ALL?.();
}


function focusNextListRow(current){
 const rows=[...document.querySelectorAll('#listaComprasItens .shopping-list-item')];
 const row=current.closest('.shopping-list-item');
 const index=rows.indexOf(row);
 if(index===rows.length-1)addListRow();
 const updated=[...document.querySelectorAll('#listaComprasItens .shopping-list-item')];
 updated[index+1]?.querySelector('[data-list-name]')?.focus();
}
function refreshListRemoveButtons(){
 const rows=[...document.querySelectorAll('#listaComprasItens .shopping-list-item')];
 rows.forEach((row,index)=>{
   const btn=row.querySelector('[data-remove-list]');
   if(btn)btn.style.visibility=rows.length>1||index>0?'visible':'hidden';
 });
}
function addListRow(nome='',quantidade=1){
 const box=$('listaComprasItens');if(!box)return;
 const row=document.createElement('div');
 row.className='shopping-list-item';
 row.innerHTML=`
   <input data-list-name placeholder="Digite o produto" value="${esc(nome)}" required>
   <select data-list-qty aria-label="Quantidade">${Array.from({length:10},(_,i)=>`<option value="${i+1}" ${i+1===quantidade?'selected':''}>${i+1}</option>`).join('')}</select>
   <button type="button" class="list-remove-x" data-remove-list aria-label="Excluir item" title="Excluir item">×</button>`;
 box.appendChild(row);
 refreshListRemoveButtons();
}
async function saveList(e){
 e.preventDefault();
 const u=user();
 const items=[...document.querySelectorAll('#listaComprasItens .shopping-list-item')]
   .map((r,index)=>({
     produto_nome:r.querySelector('[data-list-name]').value.trim(),
     quantidade:Number(r.querySelector('[data-list-qty]').value),
     ordem:index+1
   })).filter(i=>i.produto_nome);
 if(!items.length)return alert('Adicione pelo menos um item.');
 const {data,error}=await db().rpc('pampatto_salvar_lista_v7',{
   p_cliente:String(u.id||u.usuario||''),
   p_cliente_nome:String(u.nome||u.usuario||'Cliente'),
   p_itens:items
 });
 if(error)return alert(error.message);
 const result=Array.isArray(data)?data[0]:data;
 $('listaComprasItens').innerHTML='';
 addListRow();
 alert(`Lista nº ${result?.numero_lista||''} salva com sucesso.`);
 await loadLists();
}
function listPdf(lista){
 const jsPDFCtor=window.jspdf?.jsPDF;
 if(!jsPDFCtor)return alert('O gerador de PDF não foi carregado.');
 const doc=new jsPDFCtor({unit:'mm',format:'a4'});
 doc.setFontSize(16);
 doc.text('Empório Pampatto Brasil - Lista de Compras',14,16);
 doc.setFontSize(10);
 doc.text(`Lista nº: ${lista.numero_lista||'—'}`,14,24);
 doc.text(`Cliente: ${lista.cliente_nome||'Cliente'}`,14,30);
 doc.text(`Data e hora: ${new Date(lista.created_at).toLocaleString('pt-BR')}`,14,36);
 doc.text(`Status: ${LIST_STATUS[lista.status]||lista.status}`,14,42);
 const rows=(lista.lista_compras_itens||[])
   .sort((a,b)=>Number(a.ordem||0)-Number(b.ordem||0))
   .map(i=>[String(i.quantidade||1),i.produto_nome||'Produto']);
 doc.autoTable({
   startY:49,
   head:[['Quantidade','Produto']],
   body:rows,
   headStyles:{fillColor:[35,30,12],textColor:[245,190,55]},
   styles:{fontSize:10}
 });
 doc.save(`lista-${lista.numero_lista||lista.id}.pdf`);
}
async function saveListStatus(card,btn){
 const status=card.querySelector('[data-list-status]')?.value;
 if(!status)return;
 const original=btn.textContent;
 btn.disabled=true;
 btn.textContent='Salvando...';
 const {error}=await db().rpc('pampatto_atualizar_status_lista_v8',{
   p_lista_id:card.dataset.listId,
   p_status:status
 });
 btn.disabled=false;
 btn.textContent=original;
 if(error)return alert(`Não foi possível atualizar o status da lista.

${error.message}`);
 await loadLists();
}
async function loadLists(){
 const u=user(),target=$('acompanharListaConteudo');
 if(!u||!target)return;
 let q=db().from('listas_compras')
   .select('id,numero_lista,sequencial,cliente_identificador,cliente_nome,status,created_at,updated_at,lista_compras_itens(id,produto_nome,quantidade,ordem)')
   .order('created_at',{ascending:false});
 if(u.perfil!=='admin')q=q.eq('cliente_identificador',u.id).limit(5);
 const {data,error}=await q;
 if(error){target.innerHTML=`<div class="notice error">${esc(error.message)}</div>`;return}
 state.lists=data||[];
 target.innerHTML=state.lists.length?state.lists.map(l=>{
   const status=LIST_STATUS[l.status]?l.status:'enviada';
   const completed=status==='concluida';
   return `<article class="order-card list-card ${completed?'order-completed':''}" data-list-id="${l.id}">
     <div class="order-card-head">
       <div>
         <strong class="order-number">Lista nº ${esc(l.numero_lista||formatExistingNumber(l.created_at,l.sequencial,'C'))}</strong>
         <div class="shopping-list-meta">
           <span>Cliente: <strong>${esc(l.cliente_nome||'Cliente')}</strong></span>
           <span>${new Date(l.created_at).toLocaleString('pt-BR')}</span>
         </div>
       </div>
       <div class="list-card-actions">
         <span class="tag ${completed?'status-completed':''}">${esc(LIST_STATUS[status])}</span>
         <button class="outline-btn list-pdf-btn" type="button" data-list-pdf>Exportar PDF</button>
       </div>
     </div>
     ${timeline(status,LIST_STATUS)}
     <div class="order-items list-yellow">${(l.lista_compras_itens||[]).sort((a,b)=>Number(a.ordem||0)-Number(b.ordem||0)).map(i=>`
       <div><span>${i.quantidade}× ${esc(i.produto_nome)}</span></div>`).join('')}</div>
     ${u.perfil==='admin'?`<div class="order-admin-status">
       <label>Alterar status</label>
       <select data-list-status>${Object.entries(LIST_STATUS).map(([k,v])=>`<option value="${k}" ${status===k?'selected':''}>${v}</option>`).join('')}</select>
       <button class="btn status-save-button" type="button" data-save-list-status>Salvar status</button>
     </div>`:''}
   </article>`;
 }).join(''):'<div class="shopping-empty muted">Nenhuma lista encontrada.</div>';
}
function bind(){
 if(state.bound)return;state.bound=true;
 document.addEventListener('pampatto:add-cart',e=>addCart(e.detail.produtoId,e.detail.quantidade));
 document.addEventListener('pampatto:data-ready',()=>{loadCart();loadOrders(state.orderFilter||'ativos');loadLists()});
 document.addEventListener('pampatto:orders-realtime',()=>loadOrders(state.orderFilter||'ativos'));
 document.addEventListener('pampatto:tab',e=>{
   if(e.detail.tab==='carrinho')loadCart();
   if(e.detail.tab==='pedidos')loadOrders();
   if(e.detail.tab==='acompanhar-lista')loadLists();
 });
 $('cartView')?.addEventListener('click',e=>{
   const row=e.target.closest('.cart-item-row');if(!row)return;
   const item=state.cart.find(i=>String(i.id)===row.dataset.id);if(!item)return;
   const a=e.target.dataset.action;
   if(a==='minus')changeItem(item.id,Number(item.quantidade)-1);
   if(a==='plus')changeItem(item.id,Number(item.quantidade)+1);
   if(a==='remove')changeItem(item.id,0);
 });
 $('cartView')?.addEventListener('change',e=>{
   if(e.target.matches('input[type=number]'))changeItem(e.target.closest('.cart-item-row').dataset.id,e.target.value)
 });
 $('clearCartBtn')?.addEventListener('click',clearCart);
 $('finishCartBtn')?.addEventListener('click',finish);
 $('ordersContent')?.addEventListener('click',e=>{
   const card=e.target.closest('.order-card');
   if(!card)return;
   if(e.target.matches('[data-save-status]'))saveStatus(card,e.target);
   if(e.target.matches('[data-delete-order]'))deleteOrder(card,e.target);
 });
 $('closeOrderSuccessModal')?.addEventListener('click',()=>{
   const m=$('orderSuccessModal');
   if(m){m.classList.remove('open');m.style.setProperty('display','none','important');m.setAttribute('aria-hidden','true')}
   window.openTab?.('pedidos')
 });
 $('adicionarItemLista')?.addEventListener('click',()=>{addListRow();document.querySelector('#listaComprasItens .shopping-list-item:last-child [data-list-name]')?.focus()});
 $('listaComprasItens')?.addEventListener('keydown',e=>{
   if(e.key==='Enter'&&e.target.matches('[data-list-name]')){
     e.preventDefault();
     focusNextListRow(e.target);
   }
 });
 $('listaComprasItens')?.addEventListener('click',e=>{
   if(e.target.matches('[data-remove-list]')){
     e.target.closest('.shopping-list-item').remove();
     if(!$('listaComprasItens').children.length)addListRow();
     refreshListRemoveButtons();
   }
 });
 $('listaComprasForm')?.addEventListener('submit',saveList);
 $('cancelarListaCompras')?.addEventListener('click',()=>{$('listaComprasItens').innerHTML='';addListRow()});
 $('atualizarListas')?.addEventListener('click',loadLists);
 $('acompanharListaConteudo')?.addEventListener('click',e=>{
   const card=e.target.closest('[data-list-id]');if(!card)return;
   const item=state.lists.find(l=>String(l.id)===String(card.dataset.listId));
   if(e.target.matches('[data-list-pdf]')&&item)listPdf(item);
   if(e.target.matches('[data-save-list-status]'))saveListStatus(card,e.target);
 });
 addListRow();
}
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',bind):bind();
})();
