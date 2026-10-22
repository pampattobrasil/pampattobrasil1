(() => {
'use strict';
if(window.__PAMPATTO_LISTA__)return;window.__PAMPATTO_LISTA__=true;
const $=id=>document.getElementById(id),db=()=>window.pampattoSupabase||window.supabaseClient||null;
const esc=(v='')=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const STATUS={pedido_realizado:'Pedido realizado',em_separacao:'Em separação',separado:'Separado',concluido:'Concluído',cancelado:'Cancelado'};
const LIST_STATUS={enviada:'Lista enviada',em_compra:'Em compra',comprada:'Compra realizada',concluida:'Concluída'};
const state={cart:[],orders:[],lists:[],channels:[],bound:false};
const cartSyncTimers=new Map(),cartSyncChains=new Map(),cartPendingValues=new Map();
const user=()=>window.PAMPATTO_CURRENT_USER||window.currentUser||null;
const cartStorageKey=()=>{const u=user();return u?`pampatto_cart_draft_${String(u.id||u.usuario||'cliente')}`:null};
function persistCartSnapshot(){
 const key=cartStorageKey();if(!key)return;
 try{localStorage.setItem(key,JSON.stringify({savedAt:new Date().toISOString(),items:state.cart||[]}))}catch(err){console.warn('Não foi possível preservar o rascunho do carrinho:',err)}
}
function loadCartSnapshot(){
 const key=cartStorageKey();if(!key)return [];
 try{const raw=localStorage.getItem(key);if(!raw)return [];const parsed=JSON.parse(raw);return Array.isArray(parsed?.items)?parsed.items:[]}catch(err){console.warn('Não foi possível ler o rascunho do carrinho:',err);return []}
}
function clearCartSnapshot(){const key=cartStorageKey();if(!key)return;try{localStorage.removeItem(key)}catch{}}
function notice(msg,error=false){const el=$('cartNotice');if(el){el.className=error?'notice error':'notice';el.textContent=msg}}
async function loadCart(){
 const u=user();if(!u)return;
 const localDraft=loadCartSnapshot();
 const {data,error}=await db().from('catalogo_carrinho_itens').select('*').eq('cliente_identificador',u.id).order('created_at');
 if(error){
   if(localDraft.length){state.cart=localDraft;renderCart();notice('Carrinho restaurado do rascunho local. Clique em “Salvar alterações” para sincronizar.',true);return}
   return notice(error.message,true);
 }
 state.cart=data||[];
 if(!state.cart.length&&localDraft.length){
   let restored=false;
   for(const item of localDraft){
     const produto=window.PAMPATTO_STATE?.produtos?.find(p=>String(p.id)===String(item.produto_id)||String(p.nome)===String(item.produto_nome));
     if(!produto)continue;
     const {error:restoreError}=await db().rpc('pampatto_adicionar_item_carrinho',{
       p_cliente_identificador:u.id,p_cliente_nome:u.nome,p_produto_id:produto.id,p_produto_nome:produto.nome,
       p_imagem_url:produto.imagem_url||item.imagem_url||null,p_quantidade:normalizeCartQuantity(item.quantidade),p_valor_unitario:Number(produto.valor||item.valor_unitario||0)
     });
     if(!restoreError)restored=true;
   }
   if(restored){
     const retry=await db().from('catalogo_carrinho_itens').select('*').eq('cliente_identificador',u.id).order('created_at');
     if(!retry.error)state.cart=retry.data||[];
   }
 }
 renderCart();
}
function renderCart(){
 persistCartSnapshot();
 const target=$('cartView');if(!target)return;
 const u=user(),mostrarPrecos=u?.perfil==='admin'||u?.mostrar_precos!==false;
 const count=state.cart.reduce((s,i)=>s+Number(i.quantidade||0),0);
 if($('cartBadge')){$('cartBadge').textContent=count;$('cartBadge').style.display=count?'grid':'none'}
 if(!state.cart.length){target.innerHTML='<div class="shopping-empty muted">Seu carrinho está vazio.</div>';return}
 const total=state.cart.reduce((s,i)=>s+Number(i.subtotal||0),0);
 target.innerHTML=`<div class="cart-items-list">${state.cart.map(i=>`<article class="cart-item-row" data-id="${i.id}"><div class="cart-item-main">${i.imagem_url?`<img src="${esc(i.imagem_url)}" alt="${esc(i.produto_nome)}">`:''}<div><strong>${esc(i.produto_nome)}</strong>${mostrarPrecos?`<span>${money(i.valor_unitario)} cada</span>`:''}</div></div><div class="catalog-stepper cart-stepper"><button type="button" data-action="minus" aria-label="Diminuir quantidade">−</button><input type="number" min="1" max="999" inputmode="numeric" value="${i.quantidade}" aria-label="Quantidade de ${esc(i.produto_nome)}"><button type="button" data-action="plus" aria-label="Aumentar quantidade">+</button></div>${mostrarPrecos?`<strong>${money(i.subtotal)}</strong>`:'<span class="price-hidden-label">Preço não exibido</span>'}<button type="button" class="outline-btn danger-outline" data-action="remove">Remover</button></article>`).join('')}</div>${mostrarPrecos?`<div class="cart-total"><span>Total do pedido</span><strong>${money(total)}</strong></div>`:'<div class="cart-total price-hidden-total"><span>Preços ocultos para este acesso</span></div>'}`
}
async function addCart(produtoId,quantidade){
 const u=user(),p=window.PAMPATTO_STATE?.produtos?.find(x=>String(x.id)===String(produtoId));if(!u||!p)return;
 const qtd=Math.max(1,Math.trunc(Number(quantidade)||1));
 const existing=state.cart.find(i=>String(i.produto_id)===String(p.id)||String(i.produto_nome)===String(p.nome));
 if(existing){
   await changeItem(existing.id,Number(existing.quantidade||0)+qtd,{immediate:true});
 }else{
   const {error}=await db().rpc('pampatto_adicionar_item_carrinho',{p_cliente_identificador:u.id,p_cliente_nome:u.nome,p_produto_id:p.id,p_produto_nome:p.nome,p_imagem_url:p.imagem_url||null,p_quantidade:qtd,p_valor_unitario:Number(p.valor||0)});
   if(error)return alert(error.message);
   await loadCart();
 }
 persistCartSnapshot();
 notice(`${p.nome} incluído no carrinho.`);
 document.dispatchEvent(new CustomEvent('pampatto:cart-added',{detail:{produtoId:p.id,quantidade:qtd}}));
}
function normalizeCartQuantity(q){
 const n=Math.trunc(Number(q));
 if(!Number.isFinite(n))return 1;
 return Math.min(999,Math.max(1,n));
}
function updateCartLocal(id,q){
 const item=state.cart.find(i=>String(i.id)===String(id));
 if(!item)return false;
 if(Number(q)<=0){state.cart=state.cart.filter(i=>String(i.id)!==String(id));renderCart();return true}
 const quantidade=normalizeCartQuantity(q);
 item.quantidade=quantidade;
 item.subtotal=quantidade*Number(item.valor_unitario||0);
 renderCart();
 return true;
}
function syncCartItem(id){
 const key=String(id);
 const previous=cartSyncChains.get(key)||Promise.resolve();
 const task=previous.catch(()=>{}).then(async()=>{
   if(!cartPendingValues.has(key))return;
   const q=cartPendingValues.get(key);
   cartPendingValues.delete(key);
   const query=Number(q)<=0
     ? db().from('catalogo_carrinho_itens').delete().eq('id',id)
     : db().from('catalogo_carrinho_itens').update({quantidade:normalizeCartQuantity(q)}).eq('id',id);
   const {error}=await query;
   if(error){
     notice(`Não foi possível atualizar a quantidade: ${error.message}`,true);
     await loadCart();
     throw error;
   }
 });
 cartSyncChains.set(key,task);
 task.finally(()=>{if(cartSyncChains.get(key)===task)cartSyncChains.delete(key)}).catch(()=>{});
 return task;
}
function queueCartSync(id,q,{immediate=false}={}){
 const key=String(id);
 cartPendingValues.set(key,q);
 const timer=cartSyncTimers.get(key);
 if(timer)clearTimeout(timer);
 cartSyncTimers.delete(key);
 if(immediate)return syncCartItem(id);
 cartSyncTimers.set(key,setTimeout(()=>{
   cartSyncTimers.delete(key);
   syncCartItem(id).catch(()=>{});
 },300));
}
function changeItem(id,q,{immediate=false}={}){
 const numeric=Number(q);
 const next=numeric<=0?0:normalizeCartQuantity(numeric);
 if(!updateCartLocal(id,next))return Promise.resolve();
 return queueCartSync(id,next,{immediate});
}
async function flushPendingCartChanges(){
 for(const [key,timer] of [...cartSyncTimers]){
   clearTimeout(timer);
   cartSyncTimers.delete(key);
   await syncCartItem(key);
 }
 if(cartSyncChains.size)await Promise.allSettled([...cartSyncChains.values()]);
 if(cartPendingValues.size){
   for(const key of [...cartPendingValues.keys()])await syncCartItem(key);
 }
}
async function saveCart(){
 const u=user();if(!u)return notice('Faça login novamente para salvar o carrinho.',true);
 const btn=$('saveCartBtn');const original=btn?.textContent||'Salvar alterações';
 if(btn){btn.disabled=true;btn.textContent='SALVANDO...'}
 try{
   await flushPendingCartChanges();
   persistCartSnapshot();
   await loadCart();
   notice('Alterações do carrinho salvas. Você pode voltar e finalizar o pedido depois.');
 }catch(err){
   console.error('Erro ao salvar carrinho:',err);
   notice(`Não foi possível salvar todas as alterações: ${err?.message||err}`,true);
 }finally{if(btn){btn.disabled=false;btn.textContent=original}}
}

async function clearCart(){
 const u=user();if(!u)return;
 if(!state.cart.length)return notice('O carrinho já está vazio.');
 if(!confirm('Deseja cancelar e esvaziar o carrinho?'))return;
 for(const timer of cartSyncTimers.values())clearTimeout(timer);
 cartSyncTimers.clear();cartPendingValues.clear();
 if(cartSyncChains.size)await Promise.allSettled([...cartSyncChains.values()]);
 const {error}=await db().from('catalogo_carrinho_itens').delete().eq('cliente_identificador',u.id);
 if(error)return notice(error.message,true);
 state.cart=[];clearCartSnapshot();renderCart();
 notice('Carrinho esvaziado.');
}
async function finish(){
 const u=user();
 if(!u)return notice('Faça login novamente para finalizar o pedido.',true);
 if(!state.cart.length)return notice('Inclua ao menos um produto.',true);
 const client=db();
 const btn=$('finishCartBtn');
 const originalText=btn?.textContent||'Finalizar pedido';
 if(btn){btn.disabled=true;btn.textContent='SALVANDO...'}
 try{
   await flushPendingCartChanges();
   const {data,error}=await client.rpc('pampatto_finalizar_pedido_v3',{
     p_cliente:String(u.id||u.usuario||''),
     p_cliente_nome:String(u.nome||u.usuario||'Cliente')
   });
   if(error)throw error;
   const resultado=Array.isArray(data)?data[0]:data;
   if(!resultado?.pedido_id)throw new Error('O banco não devolveu a identificação do pedido.');
   state.cart=[];
   clearCartSnapshot();
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
function addBusinessDays(dateValue,days=5){
 const d=new Date(dateValue);
 if(Number.isNaN(d.getTime()))return null;
 d.setHours(23,59,59,999);
 let added=0;
 while(added<days){
   d.setDate(d.getDate()+1);
   const dow=d.getDay();
   if(dow!==0&&dow!==6)added++;
 }
 return d;
}
function countBusinessDaysBetween(startValue,endValue){
 const start=new Date(startValue),end=new Date(endValue);
 if(Number.isNaN(start.getTime())||Number.isNaN(end.getTime()))return 0;
 start.setHours(0,0,0,0);end.setHours(0,0,0,0);
 if(start.getTime()===end.getTime())return 0;
 const direction=start<end?1:-1;
 let d=new Date(start),count=0;
 while(d.getTime()!==end.getTime()){
   d.setDate(d.getDate()+direction);
   const dow=d.getDay();
   if(dow!==0&&dow!==6)count++;
 }
 return count*direction;
}
function deliveryDeadlineInfo(createdAt){
 const due=addBusinessDays(createdAt,5);
 if(!due)return {html:'',due:null,overdue:false};
 const now=new Date();
 const today=new Date(now);today.setHours(0,0,0,0);
 const dueDay=new Date(due);dueDay.setHours(0,0,0,0);
 const overdue=today>dueDay;
 const dueText=dueDay.toLocaleDateString('pt-BR');
 const businessDiff=countBusinessDaysBetween(today,dueDay);
 let countdown='';
 if(overdue){
   const lateDays=Math.abs(businessDiff);
   countdown=lateDays===1?'Vencido há 1 dia útil':`Vencido há ${lateDays} dias úteis`;
 }else if(businessDiff===0){
   countdown='Vence hoje';
 }else{
   countdown=businessDiff===1?'Falta 1 dia útil':`Faltam ${businessDiff} dias úteis`;
 }
 return {
   due,
   overdue,
   html:`<div class="delivery-deadline-alert ${overdue?'overdue':'within-deadline'}">
     <div class="delivery-deadline-main">
       <span class="delivery-deadline-label">Prazo de entrega:</span>
       <strong class="delivery-deadline-status">${overdue?'VENCIDO':'DENTRO DO PRAZO'}</strong>
     </div>
     <div class="delivery-deadline-details">
       <span>Entrega até ${dueText}</span>
       <span class="delivery-deadline-countdown">${countdown}</span>
     </div>
   </div>`
 };
}

async function loadOrders(filter=state.orderFilter||'ativos'){
 const u=user(),target=$('ordersContent');
 if(!u||!target)return;
 state.orderFilter=filter;
 const admin=u.perfil==='admin';
 let q=db().from('catalogo_pedidos')
   .select('id,numero_pedido,sequencial,cliente_identificador,cliente_nome,status,valor_total,created_at,catalogo_pedido_itens(id,produto_nome,quantidade,valor_unitario,subtotal,ordem,entregue)')
   .order('created_at',{ascending:true});

 // Administrador: sem limite, para exibir todos os pedidos do filtro.
 // Cliente: preserva o comportamento atual de exibir apenas os 5 mais recentes.
 if(!admin)q=q.eq('cliente_identificador',u.id).limit(5);

 if(filter==='cancelados'){
   q=q.eq('status','cancelado');
 }else if(filter==='entregues'){
   q=q.in('status',['concluido','entregue']);
 }else{
   // Pedidos em aberto: somente os que ainda estão em andamento.
   q=q.in('status',['pedido_realizado','em_separacao','separado']);
 }

 const {data,error}=await q;
 if(error){target.innerHTML=`<div class="notice error">${esc(error.message)}</div>`;return}
 state.orders=data||[];
 const mostrarPrecos=admin||u.mostrar_precos!==false;
 const ids=[...new Set(state.orders.map(o=>String(o.cliente_identificador)).filter(Boolean))];
 let enderecos={};
 if(ids.length){const result=await db().from('usuarios').select('id,endereco').in('id',ids);if(!result.error)enderecos=Object.fromEntries((result.data||[]).map(x=>[String(x.id),x.endereco||'']));}

 const descricao=admin
   ? (filter==='ativos'?'Todos os pedidos em aberto são exibidos, sem limite de quantidade.':filter==='entregues'?'Pedidos entregues/concluídos para consulta e controle.':'Pedidos cancelados para consulta e controle.')
   : 'Os cinco pedidos mais recentes deste filtro ficam disponíveis. O histórico completo permanece nos relatórios.';

 target.innerHTML=`<div class="panel">
   <div class="panel-head">
     <div>
       <h3>${admin?'Pedidos':'Meus últimos pedidos'}</h3>
       <p class="muted">${descricao}</p>
     </div>
     <div class="orders-filter-actions">
       <button class="outline-btn ${filter==='ativos'?'active':''}" type="button" data-order-filter="ativos">Pedidos em aberto</button>
       ${admin?`<button class="outline-btn ${filter==='entregues'?'active':''}" type="button" data-order-filter="entregues">Pedidos entregues</button>`:''}
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
           <div class="order-number-line"><strong class="order-number">Pedido nº ${esc(o.numero_pedido||formatExistingNumber(o.created_at,o.sequencial))}</strong><button type="button" class="mini-btn" data-romaneio>Romaneio</button>${admin?`<button type="button" class="mini-btn" data-edit-order-items>Adicionar ou remover</button>`:""}</div>
           <div class="shopping-list-meta">
             <span>${new Date(o.created_at).toLocaleString('pt-BR')}</span>
             <span>Cliente: <strong>${esc(o.cliente_nome||u.nome||'Cliente')}</strong></span>
             <span>Endereço: ${esc(enderecos[String(o.cliente_identificador)]||'Não informado')}</span>
           </div>
         </div>
         <div class="order-value-status">
           ${mostrarPrecos?`<strong>${money(o.valor_total)}</strong>`:''}
           <div><span class="tag ${completed?'status-completed':cancelled?'status-cancelled':''}">${esc(STATUS[normalizedStatus]||'Pedido realizado')}</span></div>
         </div>
       </div>
       ${(!cancelled&&!completed)?deliveryDeadlineInfo(o.created_at).html:''}
       ${cancelled?'':timeline(normalizedStatus)}
       <div class="order-items">${(o.catalogo_pedido_itens||[]).sort((a,b)=>Number(a.ordem||0)-Number(b.ordem||0)).map(i=>`<div class="delivery-item-row"><span>${admin&&!completed&&!cancelled?`<button type="button" class="order-quantity-edit" data-edit-quantity="${esc(i.id)}" title="Editar quantidade deste item">${i.quantidade}× ${esc(i.produto_nome)}</button>`:`${i.quantidade}× ${esc(i.produto_nome)}`}</span>${admin?`<label class="delivery-check-label"><input type="checkbox" data-delivery-id="${esc(i.id)}" ${i.entregue?'checked':''} ${completed||cancelled?'disabled':''}><span class="delivery-check-mark" aria-hidden="true"></span></label>`:''}${mostrarPrecos?`<strong>${money(i.subtotal??(Number(i.quantidade||0)*Number(i.valor_unitario||0)))}</strong>`:''}</div>`).join('')}</div>
       ${cancelled?'':`<div class="order-card-actions">
         ${u.perfil==='admin'?`<div class="order-admin-status">${!completed&&!cancelled?'<button class="btn delivery-save-button" data-save-deliveries type="button" style="display:none">Salvar itens</button>':''}<label>Alterar status</label><select data-status>${Object.entries(STATUS).filter(([k])=>k!=='cancelado').map(([k,v])=>`<option value="${k}" ${normalizedStatus===k?'selected':''}>${v}</option>`).join('')}</select><button class="btn status-save-button" type="button" data-save-status>Salvar status</button></div>`:''}
         <button class="outline-btn order-delete-button" type="button" data-delete-order>Cancelar pedido</button>
       </div>`}
     </article>`;
   }).join(''):'<div class="shopping-empty muted">Nenhum pedido encontrado neste filtro.</div>'}</div>
 </div>`;

 target.querySelectorAll('[data-order-filter]').forEach(btn=>btn.addEventListener('click',()=>loadOrders(btn.dataset.orderFilter)));
 $('refreshOrdersBtn')?.addEventListener('click',()=>loadOrders(state.orderFilter));
}
async function openAdminItemsModal(card){
 const u=user();if(u?.perfil!=='admin')return;
 const order=state.orders.find(o=>String(o.id)===String(card.dataset.orderId));if(!order)return;
 const catalog=window.PAMPATTO_STATE?.produtos||[];
 let items=(order.catalogo_pedido_itens||[]).map(i=>({nome:i.produto_nome,qtd:Number(i.quantidade),preco:Number(i.valor_unitario)}));
 const overlay=document.createElement('div');overlay.style.cssText='position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.8);display:flex;align-items:center;justify-content:center;padding:16px';
 overlay.innerHTML=`<section style="width:min(720px,100%);max-height:90vh;overflow:auto;background:#181611;color:#f4cf55;border:1px solid #b88a22;border-radius:14px;padding:22px"><h2>Adicionar ou remover — Pedido ${esc(order.numero_pedido||'')}</h2><div data-admin-rows></div><div style="display:flex;gap:8px;flex-wrap:wrap;margin:14px 0"><select data-admin-product style="flex:1;min-width:180px;padding:10px;background:#26221b;color:white"><option value="">Selecione um produto</option>${catalog.map((p,n)=>`<option value="${n}">${esc(p.nome)}</option>`).join('')}</select><button type="button" data-admin-add>Adicionar item</button></div><strong data-admin-total></strong><div style="display:flex;gap:12px;justify-content:flex-end;margin-top:20px"><button type="button" data-admin-cancel>Cancelar</button><button type="button" data-admin-save>Salvar alterações</button></div></section>`;
 document.body.appendChild(overlay);
 const render=()=>{overlay.querySelector('[data-admin-rows]').innerHTML=items.map((i,n)=>`<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:10px 0"><span style="flex:1;min-width:160px">${esc(i.nome)}</span><input aria-label="Quantidade" type="number" min="0.001" step="any" data-admin-qty="${n}" value="${i.qtd}" style="width:90px;padding:8px"><span>${money(i.qtd*i.preco)}</span><button type="button" data-admin-remove="${n}">Remover</button></div>`).join('')||'<p>Nenhum item</p>';overlay.querySelector('[data-admin-total]').textContent='Total: '+money(items.reduce((t,i)=>t+i.qtd*i.preco,0));};
 render();
 overlay.addEventListener('click',async e=>{
  if(e.target===overlay||e.target.closest('[data-admin-cancel]')){overlay.remove();return;}
  const remove=e.target.closest('[data-admin-remove]');if(remove){items.splice(Number(remove.dataset.adminRemove),1);render();return;}
  if(e.target.closest('[data-admin-add]')){const idx=overlay.querySelector('[data-admin-product]').value;if(idx==='')return;const p=catalog[Number(idx)];const existing=items.find(i=>i.nome===p.nome);if(existing)existing.qtd++;else items.push({nome:p.nome,qtd:1,preco:Number(p.valor||0)});render();return;}
  const save=e.target.closest('[data-admin-save]');if(!save)return;
  if(!items.length){alert('O pedido precisa ter ao menos um item.');return;}
  save.disabled=true;save.textContent='Salvando...';
  const {error}=await db().rpc('pampatto_admin_atualizar_itens_pedido',{p_pedido_id:order.id,p_admin_id:u.id,p_itens:items.map(i=>({produto_nome:i.nome,quantidade:i.qtd,valor_unitario:i.preco}))});
  if(error){alert('Não foi possível salvar: '+error.message);save.disabled=false;save.textContent='Salvar alterações';return;}
  overlay.remove();await loadOrders(state.orderFilter);if(typeof window.PAMPATTO_REFRESH_DATA==='function')window.PAMPATTO_REFRESH_DATA();
 });
 overlay.addEventListener('change',e=>{const input=e.target.closest('[data-admin-qty]');if(!input)return;const q=Number(input.value);if(!Number.isFinite(q)||q<=0){alert('Informe uma quantidade válida.');render();return;}items[Number(input.dataset.adminQty)].qtd=q;render();});
}
function openOrderQuantityModal(card,itemId){
 if(user()?.perfil!=='admin')return;
 const order=state.orders.find(o=>String(o.id)===String(card.dataset.orderId));
 const item=order?.catalogo_pedido_itens?.find(i=>String(i.id)===String(itemId));
 if(!item||['concluido','cancelado','entregue'].includes(normalizeOrderStatus(order.status)))return;
 document.getElementById('pampattoQuantityModal')?.remove();
 const overlay=document.createElement('div');overlay.id='pampattoQuantityModal';overlay.className='pampatto-quantity-overlay';
 overlay.innerHTML=`<div class="pampatto-quantity-dialog" role="dialog" aria-modal="true" aria-labelledby="pampattoQuantityTitle"><h3 id="pampattoQuantityTitle">Editar quantidade</h3><p>${esc(item.produto_nome)}</p><label for="pampattoQuantityInput">Quantidade do item</label><input id="pampattoQuantityInput" type="number" min="1" max="999999" step="1" required value="${Number(item.quantidade)}"><div class="pampatto-quantity-actions"><button type="button" class="outline-btn" data-close-quantity>Cancelar</button><button type="button" class="btn" data-confirm-quantity>Salvar quantidade</button></div></div>`;
 document.body.appendChild(overlay);
 const close=()=>overlay.remove();
 overlay.querySelector('[data-close-quantity]').addEventListener('click',close);
 overlay.addEventListener('click',e=>{if(e.target===overlay)close()});
 const input=overlay.querySelector('#pampattoQuantityInput');input.focus();input.select();
 const save=async()=>{
  const quantity=Number(input.value);
  if(!Number.isSafeInteger(quantity)||quantity<1||quantity>999999)return alert('Informe uma quantidade inteira entre 1 e 999999.');
  const button=overlay.querySelector('[data-confirm-quantity]');button.disabled=true;
  try{
   const unit=Number(item.valor_unitario||0);
   const newSubtotal=Math.round(quantity*unit*100)/100;
   const oldSubtotal=Number(item.subtotal??Number(item.quantidade)*unit);
   const newTotal=Math.round((Number(order.valor_total||0)-oldSubtotal+newSubtotal)*100)/100;
   const {data:updated,error:itemError}=await db().from('catalogo_pedido_itens').update({quantidade:quantity}).eq('id',item.id).eq('pedido_id',order.id).select('id');
   if(itemError)throw itemError;
   if(!updated?.length)throw new Error('O banco não autorizou a atualização do item.');
   const {data:updatedOrder,error:orderError}=await db().from('catalogo_pedidos').update({valor_total:newTotal}).eq('id',order.id).select('id');
   if(orderError||!updatedOrder?.length){
    const rollback=await db().from('catalogo_pedido_itens').update({quantidade:item.quantidade}).eq('id',item.id);
    throw new Error((orderError?.message||'Não foi possível atualizar o total do pedido.')+(rollback.error?' Verifique o item no banco antes de tentar novamente.':''));
   }
   close();await loadOrders(state.orderFilter);
   await window.PAMPATTO_REFRESH_ALL?.();
  }catch(err){alert('Não foi possível salvar a quantidade: '+err.message)}finally{button.disabled=false}
 };
 overlay.querySelector('[data-confirm-quantity]').addEventListener('click',save);
 input.addEventListener('keydown',e=>{if(e.key==='Enter')save();if(e.key==='Escape')close()});
}
async function saveDeliveries(card,btn){
 const checks=[...card.querySelectorAll('[data-delivery-id]')];if(!checks.length)return;
 btn.disabled=true;
 try{
   for(const check of checks){const {error}=await db().from('catalogo_pedido_itens').update({entregue:check.checked}).eq('id',check.dataset.deliveryId);if(error)throw error;}
   await loadOrders();
 }catch(err){alert('Não foi possível salvar as entregas: '+err.message)}finally{btn.disabled=false}
}
function createRomaneio(card){
 const order=state.orders.find(o=>String(o.id)===String(card.dataset.orderId));if(!order)return;
 const jspdf=window.jspdf;if(!jspdf?.jsPDF)return alert('Biblioteca PDF não disponível.');
 const doc=new jspdf.jsPDF();const numero=order.numero_pedido||formatExistingNumber(order.created_at,order.sequencial);
 const endereco=card.querySelector('.shopping-list-meta span:last-child')?.textContent||'';
 const logo=document.querySelector('img[src*="login-logo"]')||new Image();
 if(!logo.src)logo.src='assets/images/login-logo.png';
 try{if(logo.complete&&logo.naturalWidth){const ratio=logo.naturalWidth/logo.naturalHeight;const h=23;doc.addImage(logo,'PNG',(210-h*ratio)/2,8,h*ratio,h);}}catch(err){console.warn('Logotipo indisponível para PDF',err);}
 doc.setFontSize(16);doc.text('ROMANEIO DE ENTREGA',105,40,{align:'center'});
 doc.setFontSize(11);doc.text('Pedido nº: '+numero,14,49);
 doc.text('Cliente: '+String(order.cliente_nome||'Cliente'),14,57,{maxWidth:180});
 const linhas=doc.splitTextToSize(endereco,180);doc.text(linhas,14,65);
 let y=65+linhas.length*6;
 doc.text('Data do pedido: '+new Date(order.created_at).toLocaleDateString('pt-BR'),14,y);y+=8;
 doc.text('Data de entrada: ____/____/________',14,y);y+=7;
 const items=(order.catalogo_pedido_itens||[]).slice().sort((a,b)=>Number(a.ordem||0)-Number(b.ordem||0));
 doc.autoTable({startY:y,head:[['Produto','Quantidade']],body:items.map(i=>[String(i.produto_nome),String(i.quantidade)]),theme:'grid',styles:{fontSize:10},headStyles:{fillColor:[55,55,55]}});
 y=Math.max(doc.lastAutoTable.finalY+30,doc.internal.pageSize.height-48);
 if(y>doc.internal.pageSize.height-20){doc.addPage();y=50;}
 doc.line(14,y,94,y);doc.line(116,y,196,y);
 doc.setFontSize(10);doc.text('Assinatura do gerente',54,y+6,{align:'center'});doc.text('Assinatura do entregador',156,y+6,{align:'center'});
 doc.save('romaneio-pedido-'+String(numero).replace(/[^a-zA-Z0-9-]/g,'')+'.pdf');
}
async function saveStatus(card,btn){
 const novoStatus=card.querySelector('[data-status]')?.value;
 if(!novoStatus)return;
 if(novoStatus==='concluido'){
  if(card.querySelector('[data-save-deliveries]')?.style.display!=='none')return alert('Salve as confirmações de entrega antes de concluir o pedido.');
  const {data,error}=await db().from('catalogo_pedido_itens').select('id,entregue').eq('pedido_id',card.dataset.orderId);
  if(error)return alert('Não foi possível verificar as entregas: '+error.message);
  if(!data?.length||data.some(i=>!i.entregue))return alert('Todos os itens precisam estar marcados como entregues antes de concluir o pedido.');
 }
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
   const button=e.target.closest('[data-action]');
   if(!button)return;
   const row=button.closest('.cart-item-row');if(!row)return;
   const item=state.cart.find(i=>String(i.id)===row.dataset.id);if(!item)return;
   const a=button.dataset.action;
   if(a==='minus')changeItem(item.id,Number(item.quantidade)-1);
   if(a==='plus')changeItem(item.id,Number(item.quantidade)+1);
   if(a==='remove')changeItem(item.id,0,{immediate:true});
 });
 $('cartView')?.addEventListener('change',e=>{
   if(!e.target.matches('input[type=number]'))return;
   const row=e.target.closest('.cart-item-row');if(!row)return;
   const q=normalizeCartQuantity(e.target.value);
   e.target.value=q;
   changeItem(row.dataset.id,q);
 });
 $('cartView')?.addEventListener('keydown',e=>{
   if(e.target.matches('input[type=number]')&&e.key==='Enter'){
     e.preventDefault();
     e.target.blur();
   }
 });
 $('clearCartBtn')?.addEventListener('click',clearCart);
 $('saveCartBtn')?.addEventListener('click',saveCart);
 $('finishCartBtn')?.addEventListener('click',finish);
 $('ordersContent')?.addEventListener('change',e=>{if(e.target.matches('[data-delivery-id]')){const card=e.target.closest('.order-card');const btn=card?.querySelector('[data-save-deliveries]');if(btn)btn.style.display='inline-flex';}});
 $('ordersContent')?.addEventListener('click',e=>{
   const card=e.target.closest('.order-card');
   if(!card)return;
   if(e.target.closest('[data-edit-order-items]')){openAdminItemsModal(card);return;}
   const quantityButton=e.target.closest('[data-edit-quantity]');
   if(quantityButton)openOrderQuantityModal(card,quantityButton.dataset.editQuantity);
   if(e.target.matches('[data-romaneio]'))createRomaneio(card);
   if(e.target.matches('[data-save-deliveries]'))saveDeliveries(card,e.target);
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
