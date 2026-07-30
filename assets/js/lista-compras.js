(() => {
'use strict';
if(window.__PAMPATTO_LISTA__)return;window.__PAMPATTO_LISTA__=true;
const $=id=>document.getElementById(id),db=()=>window.pampattoSupabase||window.supabaseClient||null;
const esc=(v='')=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const STATUS={pedido_realizado:'Pedido realizado',em_separacao:'Em separação',separado:'Separado',entregue:'Entregue'};
const state={cart:[],orders:[],lists:[],channels:[],bound:false};
const user=()=>window.PAMPATTO_CURRENT_USER||window.currentUser||null;
function notice(msg,error=false){const el=$('cartNotice');if(el){el.className=error?'notice error':'notice';el.textContent=msg}}
async function loadCart(){const u=user();if(!u)return;const {data,error}=await db().from('catalogo_carrinho_itens').select('*').eq('cliente_identificador',u.id).order('created_at');if(error)return notice(error.message,true);state.cart=data||[];renderCart()}
function renderCart(){const target=$('cartView');if(!target)return;const count=state.cart.reduce((s,i)=>s+Number(i.quantidade||0),0);if($('cartBadge')){$('cartBadge').textContent=count;$('cartBadge').style.display=count?'grid':'none'}if(!state.cart.length){target.innerHTML='<div class="shopping-empty muted">Seu carrinho está vazio.</div>';return}const total=state.cart.reduce((s,i)=>s+Number(i.subtotal||0),0);target.innerHTML=`<div class="cart-items-list">${state.cart.map(i=>`<article class="cart-item-row" data-id="${i.id}"><div class="cart-item-main">${i.imagem_url?`<img src="${esc(i.imagem_url)}" alt="${esc(i.produto_nome)}">`:''}<div><strong>${esc(i.produto_nome)}</strong><span>${money(i.valor_unitario)} cada</span></div></div><div class="catalog-stepper cart-stepper"><button data-action="minus">−</button><input type="number" min="1" max="999" value="${i.quantidade}"><button data-action="plus">+</button></div><strong>${money(i.subtotal)}</strong><button class="outline-btn danger-outline" data-action="remove">Remover</button></article>`).join('')}</div><div class="cart-total"><span>Total do pedido</span><strong>${money(total)}</strong></div>`}
async function addCart(produtoId,quantidade){const u=user(),p=window.PAMPATTO_STATE?.produtos?.find(x=>String(x.id)===String(produtoId));if(!u||!p)return;const {error}=await db().rpc('pampatto_adicionar_item_carrinho',{p_cliente_identificador:u.id,p_cliente_nome:u.nome,p_produto_id:p.id,p_produto_nome:p.nome,p_imagem_url:p.imagem_url||null,p_quantidade:Math.max(1,Number(quantidade)||1),p_valor_unitario:Number(p.valor||0)});if(error)return alert(error.message);await loadCart();notice(`${p.nome} incluído no carrinho.`)}
async function changeItem(id,q){const query=Number(q)<=0?db().from('catalogo_carrinho_itens').delete().eq('id',id):db().from('catalogo_carrinho_itens').update({quantidade:Math.max(1,Number(q))}).eq('id',id);const {error}=await query;if(error)return notice(error.message,true);await loadCart()}
async function clearCart(){const u=user();if(!u)return;if(!state.cart.length)return notice('O carrinho já está vazio.');if(!confirm('Deseja cancelar e esvaziar o carrinho?'))return;const {error}=await db().from('catalogo_carrinho_itens').delete().eq('cliente_identificador',u.id);if(error)return notice(error.message,true);await loadCart();notice('Carrinho esvaziado.')}
async function finish(){
 const u=user();
 if(!u)return notice('Faça login novamente para finalizar o pedido.',true);
 if(!state.cart.length)return notice('Inclua ao menos um produto.',true);
 const btn=$('finishCartBtn');
 const originalText=btn?.textContent||'Finalizar pedido';
 if(btn){btn.disabled=true;btn.textContent='SALVANDO...'}
 try{
   const {data,error}=await db().rpc('pampatto_finalizar_pedido',{
     p_cliente_identificador:String(u.id),
     p_cliente_nome:String(u.nome||u.usuario||'Cliente')
   });
   if(error)throw error;
   const result=Array.isArray(data)?data[0]:data;
   const numero=result?.numero_pedido||result?.pedido_numero||result?.numero||'—';
   const status=result?.status||'pedido_realizado';

   await loadCart();
   await loadOrders();

   if($('completedOrderNumber'))$('completedOrderNumber').textContent=numero;
   const modal=$('orderSuccessModal');
   if(modal){
     modal.classList.remove('open');
     modal.style.setProperty('display','none','important');
     modal.setAttribute('aria-hidden','true');
   }

   notice(`Pedido nº ${numero} salvo com sucesso. Status: ${STATUS[status]||status}.`);
   window.openTab?.('pedidos');
   setTimeout(()=>document.querySelector('#ordersContent .order-card')?.scrollIntoView({behavior:'smooth',block:'start'}),150);
 }catch(err){
   console.error('Erro ao finalizar pedido:',err);
   notice(`Não foi possível salvar o pedido: ${err.message||err}`,true);
 }finally{
   if(btn){btn.disabled=false;btn.textContent=originalText}
 }
}
function timeline(status){status=status||'pedido_realizado';const keys=Object.keys(STATUS),n=Math.max(0,keys.indexOf(status));return `<div class="order-timeline">${keys.map((k,i)=>`<div class="order-stage ${i<=n?'done':''} ${i===n?'current':''}"><span>${i+1}</span><small>${STATUS[k]}</small></div>`).join('')}</div>`}
async function loadOrders(){const u=user(),target=$('ordersContent');if(!u||!target)return;let q=db().from('catalogo_pedidos').select('id,numero_pedido,cliente_identificador,cliente_nome,status,valor_total,created_at,catalogo_pedido_itens(id,produto_nome,quantidade,valor_unitario,subtotal,ordem)').order('created_at',{ascending:false});if(u.perfil!=='admin')q=q.eq('cliente_identificador',u.id);const {data,error}=await q;if(error){target.innerHTML=`<div class="notice error">${esc(error.message)}</div>`;return}state.orders=data||[];target.innerHTML=`<div class="panel"><div class="panel-head"><div><h3>${u.perfil==='admin'?'Pedidos':'Meus pedidos'}</h3><p class="muted">Informações atualizadas diretamente do banco.</p></div><button class="outline-btn" id="refreshOrdersBtn">Atualizar</button></div><div class="orders-list">${state.orders.length?state.orders.map(o=>`<article class="order-card" data-order-id="${o.id}"><div class="order-card-head"><div><strong>Pedido nº ${esc(o.numero_pedido)}</strong><div class="shopping-list-meta"><span>${new Date(o.created_at).toLocaleString('pt-BR')}</span>${u.perfil==='admin'?`<span>Cliente: ${esc(o.cliente_nome)}</span>`:''}</div></div><div style="text-align:right"><strong>${money(o.valor_total)}</strong><div><span class="tag">${esc(STATUS[o.status]||o.status||'Pedido realizado')}</span></div></div></div>${timeline(o.status)}<div class="order-items">${(o.catalogo_pedido_itens||[]).sort((a,b)=>a.ordem-b.ordem).map(i=>`<div><span>${i.quantidade}× ${esc(i.produto_nome)}</span><strong>${money(i.subtotal)}</strong></div>`).join('')}</div>${u.perfil==='admin'?`<div class="order-admin-status"><label>Alterar status</label><select data-status>${Object.entries(STATUS).map(([k,v])=>`<option value="${k}" ${o.status===k?'selected':''}>${v}</option>`).join('')}</select><button class="btn" data-save-status>Salvar status</button></div>`:''}</article>`).join(''):'<div class="shopping-empty muted">Nenhum pedido encontrado.</div>'}</div></div>`;$('refreshOrdersBtn')?.addEventListener('click',loadOrders)}
async function saveStatus(card,btn){btn.disabled=true;const {error}=await db().rpc('atualizar_status_pedido',{p_pedido_id:card.dataset.orderId,p_novo_status:card.querySelector('[data-status]').value});btn.disabled=false;if(error)return alert(error.message);await loadOrders()}

function addListRow(nome='',quantidade=1){const box=$('listaComprasItens');if(!box)return;const row=document.createElement('div');row.className='shopping-list-item';row.innerHTML=`<input data-list-name placeholder="Produto" value="${esc(nome)}" required><select data-list-qty>${Array.from({length:10},(_,i)=>`<option value="${i+1}" ${i+1===quantidade?'selected':''}>${i+1}</option>`).join('')}</select><button type="button" class="outline-btn danger-outline" data-remove-list>Remover</button>`;box.appendChild(row)}
async function saveList(e){e.preventDefault();const u=user();const items=[...document.querySelectorAll('#listaComprasItens .shopping-list-item')].map(r=>({nome:r.querySelector('[data-list-name]').value.trim(),quantidade:Number(r.querySelector('[data-list-qty]').value)})).filter(i=>i.nome);if(!items.length)return alert('Adicione pelo menos um item.');const {data,error}=await db().from('listas_compras').insert({cliente_identificador:u.id,cliente_nome:u.nome,status:'enviada'}).select('id').single();if(error)return alert(error.message);const {error:itemError}=await db().from('lista_compras_itens').insert(items.map((i,n)=>({lista_id:data.id,produto_nome:i.nome,quantidade:i.quantidade,ordem:n+1})));if(itemError)return alert(itemError.message);$('listaComprasItens').innerHTML='';addListRow();alert('Lista salva com sucesso.');await loadLists()}
async function loadLists(){const u=user(),target=$('acompanharListaConteudo');if(!u||!target)return;let q=db().from('listas_compras').select('id,cliente_nome,status,created_at,lista_compras_itens(id,produto_nome,quantidade,ordem)').order('created_at',{ascending:false});if(u.perfil!=='admin')q=q.eq('cliente_identificador',u.id);const {data,error}=await q;if(error){target.innerHTML=`<div class="notice error">${esc(error.message)}</div>`;return}state.lists=data||[];target.innerHTML=state.lists.length?state.lists.map(l=>`<article class="order-card"><div class="order-card-head"><div><strong>Lista de ${esc(l.cliente_nome)}</strong><div class="shopping-list-meta">${new Date(l.created_at).toLocaleString('pt-BR')}</div></div><span class="tag">${esc(l.status)}</span></div><div class="order-items">${(l.lista_compras_itens||[]).sort((a,b)=>a.ordem-b.ordem).map(i=>`<div><span>${i.quantidade}× ${esc(i.produto_nome)}</span></div>`).join('')}</div></article>`).join(''):'<div class="shopping-empty muted">Nenhuma lista encontrada.</div>'}
function bind(){if(state.bound)return;state.bound=true;document.addEventListener('pampatto:add-cart',e=>addCart(e.detail.produtoId,e.detail.quantidade));document.addEventListener('pampatto:data-ready',()=>{loadCart();loadOrders();loadLists()});document.addEventListener('pampatto:tab',e=>{if(e.detail.tab==='carrinho')loadCart();if(e.detail.tab==='pedidos')loadOrders();if(e.detail.tab==='acompanhar-lista')loadLists()});$('cartView')?.addEventListener('click',e=>{const row=e.target.closest('.cart-item-row');if(!row)return;const item=state.cart.find(i=>String(i.id)===row.dataset.id);if(!item)return;const a=e.target.dataset.action;if(a==='minus')changeItem(item.id,Number(item.quantidade)-1);if(a==='plus')changeItem(item.id,Number(item.quantidade)+1);if(a==='remove')changeItem(item.id,0)});$('cartView')?.addEventListener('change',e=>{if(e.target.matches('input[type=number]'))changeItem(e.target.closest('.cart-item-row').dataset.id,e.target.value)});$('clearCartBtn')?.addEventListener('click',clearCart);$('finishCartBtn')?.addEventListener('click',finish);$('ordersContent')?.addEventListener('click',e=>{if(e.target.matches('[data-save-status]'))saveStatus(e.target.closest('.order-card'),e.target)});$('closeOrderSuccessModal')?.addEventListener('click',()=>{const m=$('orderSuccessModal');if(m){m.classList.remove('open');m.style.setProperty('display','none','important');m.setAttribute('aria-hidden','true')}window.openTab?.('pedidos')});$('adicionarItemLista')?.addEventListener('click',()=>addListRow());$('listaComprasItens')?.addEventListener('click',e=>{if(e.target.matches('[data-remove-list]'))e.target.closest('.shopping-list-item').remove()});$('listaComprasForm')?.addEventListener('submit',saveList);$('cancelarListaCompras')?.addEventListener('click',()=>{$('listaComprasItens').innerHTML='';addListRow()});$('atualizarListas')?.addEventListener('click',loadLists);addListRow()}
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',bind):bind();
})();
