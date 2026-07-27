const DEFAULT_PRODUCTS = [
  { nome:'Picanha', tipo:'Carnes Bovinas', imagem:'assets/images/picanha.jpg' },
  { nome:'Contrafilé', tipo:'Carnes Bovinas', imagem:'assets/images/contrafile.jpg' },
  { nome:'Costela bovina', tipo:'Carnes Bovinas', imagem:'assets/images/costela-bovina.jpg' },
  { nome:'Carne moída', tipo:'Carnes Bovinas', imagem:'assets/images/carne-moida.jpg' },
  { nome:'Cupim', tipo:'Carnes Bovinas', imagem:'assets/images/cupim.jpg' },
  { nome:'Patinho em cubos', tipo:'Carnes Bovinas', imagem:'assets/images/patinho-em-cubos.jpg' },
  { nome:'Acém', tipo:'Carnes Bovinas', imagem:'assets/images/acem.jpg' },
  { nome:'Coxão mole', tipo:'Carnes Bovinas', imagem:'assets/images/coxao-mole.jpg' },
  { nome:'Coxão duro', tipo:'Carnes Bovinas', imagem:'assets/images/coxao-duro.jpg' },
  { nome:'Lagarto', tipo:'Carnes Bovinas', imagem:'assets/images/lagarto.jpg' },
  { nome:'Costela suína', tipo:'Carnes Suínas', imagem:'assets/images/costela-suina.jpg' },
  { nome:'Pernil em cubos', tipo:'Carnes Suínas', imagem:'assets/images/pernil-em-cubos.jpg' },
  { nome:'Bacon', tipo:'Carnes Suínas', imagem:'assets/images/bacon.jpg' },
  { nome:'Frango inteiro', tipo:'Carnes de Frango', imagem:'assets/images/frango-inteiro.jpg' },
  { nome:'Peito de frango', tipo:'Carnes de Frango', imagem:'assets/images/peito-de-frango.jpg' },
  { nome:'Filé de peito', tipo:'Carnes de Frango', imagem:'assets/images/file-de-peito.jpg' },
  { nome:'Coxa e sobrecoxa', tipo:'Carnes de Frango', imagem:'assets/images/coxa-e-sobrecoxa.jpg' },
  { nome:'Meio da asa', tipo:'Carnes de Frango', imagem:'assets/images/meio-da-asa.jpg' },
  { nome:'Linguiça de frango', tipo:'Carnes de Frango', imagem:'assets/images/linguica-de-frango.jpg' },
  { nome:'Hambúrguer de frango', tipo:'Carnes de Frango', imagem:'assets/images/hamburguer-de-frango.jpg' },
  { nome:'Almôndegas', tipo:'Carnes de Frango', imagem:'assets/images/almondegas.jpg' },
  { nome:'Moela', tipo:'Miúdos de Frango', imagem:'assets/images/moela.jpg' },
  { nome:'Coração', tipo:'Miúdos de Frango', imagem:'assets/images/coracao.jpg' },
  { nome:'Fígado', tipo:'Miúdos de Frango', imagem:'assets/images/figado.jpg' },
  { nome:'Pé de frango', tipo:'Miúdos de Frango', imagem:'assets/images/pe-de-frango.jpg' },
  { nome:'Linguiça toscana', tipo:'Embutidos', imagem:'assets/images/linguica-toscana.jpg' },
  { nome:'Hambúrguer', tipo:'Industrializados', imagem:'assets/images/hamburguer.jpg' },
  { nome:'Almôndegas', tipo:'Industrializados', imagem:'assets/images/almondegas-29.jpg' },
  { nome:'Tilápia', tipo:'Peixes', imagem:'assets/images/tilapia.jpg' },
  { nome:'Salmão', tipo:'Peixes', imagem:'assets/images/salmao.jpg' },
  { nome:'Filé de peixe panga', tipo:'Peixes', imagem:'assets/images/file-de-peixe-panga.jpg' }
];

const $ = id => document.getElementById(id);
const STORAGE = 'pampattoStateV5';
const OLD_KEYS = ['pampattoStateV4','pampattoStateV3'];
let filtroTipo = 'Todos';
let currentUser = null;

function initialProducts(){
  return DEFAULT_PRODUCTS.map((p,i)=>({
    id:String(i+1), nome:p.nome, tipo:p.tipo, imagem:p.imagem,
    fabricante:'Empório Pampatto', quantidade:0, validade:'', valor:0
  }));
}

function loadState(){
  let raw = localStorage.getItem(STORAGE);
  if(!raw){
    for(const key of OLD_KEYS){ raw = localStorage.getItem(key); if(raw) break; }
  }
  try { return raw ? JSON.parse(raw) : null; } catch { return null; }
}

let state = loadState() || {
  produtos:initialProducts(), pedidos:[], carrinhos:{},
  usuarios:[{id:'admin',nome:'Administrador',cnpj:'',usuario:'teste',senha:'teste',perfil:'admin',ativo:true}],
  proximaSequenciaPedido:3000
};

if(!Array.isArray(state.produtos)) state.produtos = initialProducts();
if(!Array.isArray(state.pedidos)) state.pedidos = [];
if(!state.carrinhos) state.carrinhos = {};
if(!Array.isArray(state.usuarios)) state.usuarios = [];
if(!Number.isInteger(state.proximaSequenciaPedido) || state.proximaSequenciaPedido < 3000){
  const maior = state.pedidos.reduce((m,p)=>Math.max(m, Number(String(p.numero||'').slice(-4)) || 0), 2999);
  state.proximaSequenciaPedido = Math.max(3000, maior + 1);
}
if(!state.usuarios.some(u=>u.perfil==='admin')){
  state.usuarios.unshift({id:'admin',nome:'Administrador',cnpj:'',usuario:'teste',senha:'teste',perfil:'admin',ativo:true});
}
state.produtos.forEach(p=>{ if(p.valor == null) p.valor = 0; });

function save(){ localStorage.setItem(STORAGE, JSON.stringify(state)); }
function esc(value){ return String(value ?? '').replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }[m])); }
function money(value){ return Number(value || 0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}); }
function isAdmin(){ return currentUser?.perfil === 'admin'; }
function cart(){ if(!currentUser) return []; state.carrinhos[currentUser.id] ??= []; return state.carrinhos[currentUser.id]; }
function currentMonth(){ return new Date().toISOString().slice(0,7); }

const categoryIcons = {'Carnes Bovinas':'♉','Carnes Suínas':'♘','Carnes de Frango':'♞','Miúdos de Frango':'♞','Embutidos':'▣','Industrializados':'▤','Peixes':'♓'};
const ORDER_STEPS = ['Pedido realizado','Em separação','Separado','Entregue'];

function catButtons(){
  const cats=['Todos',...Object.keys(categoryIcons)];
  return `<div class="category-buttons">${cats.map(c=>`<button class="cat-btn ${filtroTipo===c?'active':''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}</div>`;
}

function productCard(p){
  const controls = isAdmin() ? '' : `
    <div class="buy-box">
      <div class="qty-control" aria-label="Selecionar quantidade">
        <button type="button" data-action="product-minus" data-id="${p.id}" aria-label="Diminuir">−</button>
        <input class="buy-qty" id="buyQty-${p.id}" data-id="${p.id}" type="number" min="1" step="1" value="1" inputmode="numeric">
        <button type="button" data-action="product-plus" data-id="${p.id}" aria-label="Aumentar">+</button>
      </div>
      <button class="cart-add" type="button" data-action="add-cart" data-id="${p.id}">Incluir</button>
    </div>`;
  return `<article class="product-card" data-product-id="${p.id}">
    <img src="${esc(p.imagem)}" alt="${esc(p.nome)}">
    <div class="product-meta">
      <h4>${esc(p.nome)}</h4>
      <div class="price">${money(p.valor)}</div>
    </div>
    ${controls}
  </article>`;
}

function renderProductArea(targetId){
  const target=$(targetId); if(!target) return;
  const input=targetId==='dashProducts'?$('buscaDash'):$('buscaProdutos');
  const termo=(input?.value||'').toLowerCase();
  const base=state.produtos
    .filter(p=>filtroTipo==='Todos'||p.tipo===filtroTipo)
    .filter(p=>`${p.nome} ${p.tipo}`.toLowerCase().includes(termo));
  let html=catButtons();
  const cats=filtroTipo==='Todos'?Object.keys(categoryIcons):[filtroTipo];
  cats.forEach(cat=>{
    const items=base.filter(p=>p.tipo===cat);
    if(items.length) html+=`<section class="product-section"><div class="section-title"><span>${categoryIcons[cat]||'•'}</span>${esc(cat)}</div><div class="product-grid">${items.map(productCard).join('')}</div></section>`;
  });
  target.innerHTML=html||'<div class="empty">Nenhum produto encontrado.</div>';
  target.querySelectorAll('.cat-btn').forEach(btn=>btn.addEventListener('click',()=>{ filtroTipo=btn.dataset.cat; renderAll(); }));
}

function sanitizeQty(value){
  const n=Math.floor(Number(value));
  return Number.isFinite(n)&&n>0?n:1;
}

function changeProductQty(id,delta){
  const input=$(`buyQty-${id}`); if(!input) return;
  input.value=String(Math.max(1,sanitizeQty(input.value)+delta));
}

function addToCart(id){
  if(isAdmin()) return;
  const product=state.produtos.find(p=>p.id===id); const input=$(`buyQty-${id}`);
  if(!product||!input) return;
  const quantity=sanitizeQty(input.value);
  const existing=cart().find(i=>i.produtoId===id);
  if(existing) existing.quantidade += quantity;
  else cart().push({produtoId:id,quantidade:quantity});
  save(); renderCarrinho(); updateCartBadge();
  input.value='1';
  showToast(`${product.nome} incluído no carrinho.`);
}

function updateCartBadge(){
  const badge=$('cartBadge'); if(!badge||isAdmin()) return;
  const total=cart().reduce((sum,item)=>sum+Number(item.quantidade||0),0);
  badge.textContent=String(total); badge.style.display=total?'grid':'none';
}

function changeCartQty(id,delta){
  const item=cart().find(i=>i.produtoId===id); if(!item) return;
  item.quantidade=Math.max(1,Number(item.quantidade||1)+delta);
  save(); renderCarrinho(); updateCartBadge();
}
function setCartQty(id,value){
  const item=cart().find(i=>i.produtoId===id); if(!item) return;
  item.quantidade=sanitizeQty(value); save(); renderCarrinho(); updateCartBadge();
}
function removeCartItem(id){
  state.carrinhos[currentUser.id]=cart().filter(i=>i.produtoId!==id); save(); renderCarrinho(); updateCartBadge();
}

function setCartNotice(message,type='success'){
  const notice=$('cartNotice'); if(!notice) return;
  notice.className=type==='error'?'cart-warning':'cart-success'; notice.textContent=message;
  setTimeout(()=>{ if(notice.textContent===message) notice.textContent=''; },3500);
}
function showToast(message){ setCartNotice(message); }

function renderCarrinho(){
  if(isAdmin()) return;
  const view=$('cartView'); if(!view) return;
  const items=cart();
  if(!items.length){ view.innerHTML='<div class="empty">Seu carrinho está vazio.</div>'; updateCartBadge(); return; }
  let total=0;
  const rows=items.map(item=>{
    const p=state.produtos.find(x=>x.id===item.produtoId); if(!p) return '';
    const subtotal=Number(p.valor||0)*Number(item.quantidade||0); total+=subtotal;
    return `<div class="cart-item">
      <img src="${esc(p.imagem)}" alt="${esc(p.nome)}">
      <div><strong>${esc(p.nome)}</strong><br><span class="muted">${money(p.valor)} por unidade</span></div>
      <div class="cart-item-price"><strong>${money(subtotal)}</strong>
        <div class="cart-actions">
          <button type="button" data-action="cart-minus" data-id="${p.id}">−</button>
          <input class="cart-qty-input" data-action="cart-input" data-id="${p.id}" type="number" min="1" value="${item.quantidade}">
          <button type="button" data-action="cart-plus" data-id="${p.id}">+</button>
          <button type="button" class="remove-cart" data-action="cart-remove" data-id="${p.id}" title="Remover">×</button>
        </div>
      </div>
    </div>`;
  }).join('');
  view.innerHTML=`<div class="cart-list">${rows}</div><div class="cart-total"><span>Valor total do pedido</span><strong>${money(total)}</strong></div>`;
  updateCartBadge();
}

function gerarNumeroPedido(){
  const d=new Date();
  const prefix=`${String(d.getDate()).padStart(2,'0')}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getFullYear()).slice(-2)}`;
  const sequence=state.proximaSequenciaPedido++;
  return `${prefix}${sequence}`;
}

function finalizarCompra(){
  const items=cart();
  if(!items.length) return setCartNotice('Seu carrinho está vazio.','error');
  const orderItems=items.map(item=>{
    const p=state.produtos.find(x=>x.id===item.produtoId);
    return {produtoId:p.id,nome:p.nome,quantidade:Number(item.quantidade),valorUnitario:Number(p.valor||0),subtotal:Number(item.quantidade)*Number(p.valor||0)};
  });
  const pedido={
    id:crypto.randomUUID(), numero:gerarNumeroPedido(), data:new Date().toISOString(),
    clienteId:currentUser.id, clienteNome:currentUser.nome, clienteUsuario:currentUser.usuario,
    status:'Pedido realizado', itens:orderItems, total:orderItems.reduce((s,i)=>s+i.subtotal,0)
  };
  state.pedidos.push(pedido); state.carrinhos[currentUser.id]=[]; save(); renderAll();
  $('completedOrderNumber').textContent=pedido.numero;
  $('orderSuccessModal').classList.add('show'); $('orderSuccessModal').setAttribute('aria-hidden','false');
}

function statusIndex(status){
  const normalized={'Realizado':'Pedido realizado','Em andamento':'Em separação','Pedido realizado':'Pedido realizado'}[status]||status;
  return Math.max(0,ORDER_STEPS.indexOf(normalized));
}
function orderTimeline(status){
  const active=statusIndex(status);
  return `<div class="order-timeline">${ORDER_STEPS.map((step,index)=>`<div class="timeline-step ${index<active?'done':''} ${index===active?'active':''}"><span>${index<active?'✓':index+1}</span><small>${step}</small></div>`).join('')}</div>`;
}
function orderHtml(order){
  const adminControl=isAdmin()?`<label class="status-control">Alterar status<select data-action="status-change" data-id="${order.id}">${ORDER_STEPS.map(s=>`<option value="${s}" ${s===ORDER_STEPS[statusIndex(order.status)]?'selected':''}>${s}</option>`).join('')}</select></label>`:'';
  return `<div class="order-card" data-order-id="${order.id}">
    <div class="order-head"><div><strong>Pedido nº ${esc(order.numero)}</strong><br><span class="muted">${new Date(order.data).toLocaleString('pt-BR')} · ${esc(order.clienteNome||'Cliente')}</span></div><div class="order-summary"><strong>${money(order.total)}</strong>${adminControl}</div></div>
    ${orderTimeline(order.status)}
    <div class="order-items">${(order.itens||[]).map(i=>`<div class="order-line"><span>${esc(i.nome)} × ${i.quantidade}</span><strong>${money(i.subtotal)}</strong></div>`).join('')}</div>
  </div>`;
}
function renderPedidos(){
  const box=$('ordersContent'); if(!currentUser||!box) return;
  const list=(isAdmin()?state.pedidos:state.pedidos.filter(p=>p.clienteId===currentUser.id)).sort((a,b)=>new Date(b.data)-new Date(a.data));
  box.innerHTML=`<div class="panel"><div class="panel-head"><div><h3>${isAdmin()?'Pedidos realizados':'Meus pedidos'}</h3><p class="muted">${isAdmin()?'Acompanhe e altere o status dos pedidos.':'Acompanhe a situação dos seus pedidos.'}</p></div></div>${list.map(orderHtml).join('')||'<div class="empty">Nenhum pedido realizado.</div>'}</div>`;
}
function updateOrderStatus(id,status){
  if(!isAdmin()||!ORDER_STEPS.includes(status)) return;
  const order=state.pedidos.find(p=>p.id===id); if(!order) return;
  order.status=status; save(); renderPedidos(); renderMetrics();
}

function renderTabela(){
  if(!isAdmin()) return;
  const termo=($('busca')?.value||'').toLowerCase();
  const list=state.produtos.filter(p=>`${p.nome} ${p.tipo}`.toLowerCase().includes(termo));
  $('tbody').innerHTML=list.map(p=>`<tr><td><img class="thumb" src="${esc(p.imagem)}" alt="${esc(p.nome)}"></td><td><strong>${esc(p.nome)}</strong><br><span class="muted">${esc(p.fabricante)}</span></td><td><span class="tag">${esc(p.tipo)}</span></td><td><input class="stock-edit" id="stock-price-${p.id}" type="number" min="0" step="0.01" value="${Number(p.valor||0).toFixed(2)}"></td><td><input class="stock-edit" id="stock-qty-${p.id}" type="number" min="0" step="0.01" value="${Number(p.quantidade||0)}"></td><td><span class="success-text">Livre</span></td><td><div class="actions"><button class="mini-btn" data-action="save-stock" data-id="${p.id}">Salvar</button><button class="mini-btn" data-action="edit-product" data-id="${p.id}">Editar dados</button></div><span class="stock-save-ok" id="stock-ok-${p.id}"></span></td></tr>`).join('')||'<tr><td colspan="7" class="empty">Nenhum produto encontrado.</td></tr>';
}
function saveStockRow(id){
  const p=state.produtos.find(x=>x.id===id); const q=Number($(`stock-qty-${id}`)?.value); const v=Number($(`stock-price-${id}`)?.value);
  if(!p||!Number.isFinite(q)||q<0||!Number.isFinite(v)||v<0) return alert('Informe quantidade e valor válidos.');
  p.quantidade=q; p.valor=v; save(); renderAll();
}

function renderUsers(){
  if(!isAdmin()) return;
  $('usersBody').innerHTML=state.usuarios.map(u=>`<tr><td>${esc(u.nome)}</td><td>${esc(u.cnpj||'—')}</td><td>${esc(u.usuario)}</td><td><span class="role-badge">${u.perfil==='admin'?'Administrador':'Cliente'}</span></td><td>${u.ativo!==false?'Ativo':'Inativo'}</td><td>${u.perfil==='admin'?'<span class="muted">Acesso principal</span>':`<button class="mini-btn" data-action="toggle-user" data-id="${u.id}">${u.ativo!==false?'Desativar':'Ativar'}</button><button class="mini-btn danger" data-action="delete-user" data-id="${u.id}">Excluir</button>`}</td></tr>`).join('');
}

function renderMetrics(){
  const own=isAdmin()?state.pedidos:state.pedidos.filter(p=>p.clienteId===currentUser.id);
  const monthly=state.pedidos.filter(p=>p.data.slice(0,7)===currentMonth());
  $('metricProducts').textContent=state.produtos.length; $('metricOrders').textContent=own.length;
  if(isAdmin()){ $('metricLow').textContent='Livre'; $('metricSales').textContent=money(monthly.reduce((s,p)=>s+Number(p.total||0),0)); }
}
function renderRelatorios(){
  if(!isAdmin()) return;
  const box=$('reportsContent'); if(!box) return;
  const list=state.pedidos.sort((a,b)=>new Date(b.data)-new Date(a.data));
  box.innerHTML=`<div class="panel"><div class="panel-head"><div><h3>Relatórios</h3><p class="muted">Resumo geral dos pedidos.</p></div></div><div class="cart-total"><span>Total (${list.length} pedido(s))</span><strong>${money(list.reduce((s,p)=>s+Number(p.total||0),0))}</strong></div><div style="margin-top:16px">${list.map(orderHtml).join('')||'<div class="empty">Nenhum pedido.</div>'}</div></div>`;
}

function applyPermissions(){
  document.querySelectorAll('.admin-only').forEach(el=>el.style.display=isAdmin()?'':'none');
  document.querySelectorAll('.client-only').forEach(el=>el.style.display=isAdmin()?'none':'');
  $('currentUserName').textContent=currentUser.nome;
  $('currentUserRole').textContent=isAdmin()?'Administrador':`Cliente · ${currentUser.usuario}`;
  $('ordersMenuLabel').textContent=isAdmin()?'Pedidos':'Meus pedidos';
}
function renderAll(){
  if(!currentUser) return;
  applyPermissions(); renderProductArea('dashProducts'); renderProductArea('produtosView');
  if(isAdmin()){ renderTabela(); renderUsers(); renderRelatorios(); } else renderCarrinho();
  renderPedidos(); renderMetrics(); updateCartBadge();
}
function openTab(tab){
  if(['estoque','empresa','relatorios'].includes(tab)&&!isAdmin()) return;
  if(tab==='carrinho'&&isAdmin()) return;
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  $(`tab-${tab}`)?.classList.add('active');
  document.querySelectorAll('.nav button').forEach(b=>b.classList.remove('active'));
  document.querySelector(`[data-tab="${tab}"]`)?.classList.add('active');
  if(tab==='carrinho') renderCarrinho(); if(tab==='pedidos') renderPedidos();
}

function editProduct(id){
  const p=state.produtos.find(x=>x.id===id); if(!p) return;
  $('produtoId').value=p.id; $('nome').value=p.nome; $('fabricante').value=p.fabricante; $('quantidade').value=p.quantidade||0; $('valor').value=Number(p.valor||0).toFixed(2); $('tipo').value=p.tipo; $('validade').value=p.validade||'';
  $('stockFormTitle').textContent='Editar produto'; $('cancelProductEdit').style.display='block'; openTab('estoque');
}

// Delegação global: funciona mesmo após os cards serem recriados.
document.addEventListener('click',event=>{
  const button=event.target.closest('[data-action]'); if(!button) return;
  const {action,id}=button.dataset;
  if(action==='product-minus') changeProductQty(id,-1);
  if(action==='product-plus') changeProductQty(id,1);
  if(action==='add-cart') addToCart(id);
  if(action==='cart-minus') changeCartQty(id,-1);
  if(action==='cart-plus') changeCartQty(id,1);
  if(action==='cart-remove') removeCartItem(id);
  if(action==='save-stock') saveStockRow(id);
  if(action==='edit-product') editProduct(id);
  if(action==='toggle-user'){ const u=state.usuarios.find(x=>x.id===id); if(u){u.ativo=u.ativo===false;save();renderUsers();} }
  if(action==='delete-user'){ if(confirm('Excluir este cliente?')){state.usuarios=state.usuarios.filter(u=>u.id!==id);save();renderUsers();} }
});
document.addEventListener('change',event=>{
  const el=event.target;
  if(el.matches('[data-action="cart-input"]')) setCartQty(el.dataset.id,el.value);
  if(el.matches('[data-action="status-change"]')) updateOrderStatus(el.dataset.id,el.value);
});

document.querySelectorAll('.nav button[data-tab]').forEach(btn=>btn.addEventListener('click',()=>openTab(btn.dataset.tab)));
document.querySelectorAll('[data-new-product]').forEach(btn=>btn.addEventListener('click',()=>openTab('estoque')));

$('loginForm').addEventListener('submit',event=>{
  event.preventDefault();
  const user=state.usuarios.find(u=>u.usuario===$('login').value.trim()&&u.senha===$('senha').value&&u.ativo!==false);
  if(!user){ $('errorAlert').style.display='block'; return; }
  currentUser=user; $('errorAlert').style.display='none'; $('loginPage').style.display='none'; $('appPage').style.display='block'; openTab('dashboard'); renderAll();
});
$('toggleSenha').addEventListener('click',()=>{$('senha').type=$('senha').type==='password'?'text':'password';});
$('senha').addEventListener('keyup',e=>{$('capsAlert').style.display=e.getModifierState('CapsLock')?'block':'none';});
$('logoutBtn').addEventListener('click',()=>{currentUser=null;$('appPage').style.display='none';$('loginPage').style.display='flex';$('senha').value='';});
$('busca').addEventListener('input',renderTabela); $('buscaDash').addEventListener('input',()=>renderProductArea('dashProducts')); $('buscaProdutos').addEventListener('input',()=>renderProductArea('produtosView'));
$('clearCartBtn').addEventListener('click',()=>{if(!cart().length||confirm('Deseja cancelar e esvaziar o carrinho?')){state.carrinhos[currentUser.id]=[];save();renderCarrinho();updateCartBadge();setCartNotice('Pedido cancelado.');}});
$('finishCartBtn').addEventListener('click',finalizarCompra);
$('closeOrderSuccessModal').addEventListener('click',()=>{$('orderSuccessModal').classList.remove('show');$('orderSuccessModal').setAttribute('aria-hidden','true');openTab('pedidos');});

$('stockForm').addEventListener('submit',event=>{
  event.preventDefault(); const id=$('produtoId').value;
  const data={nome:$('nome').value.trim(),fabricante:$('fabricante').value.trim()||'Empório Pampatto',quantidade:Number($('quantidade').value||0),valor:Number($('valor').value||0),tipo:$('tipo').value,validade:$('validade').value};
  if(!data.nome) return alert('Informe o nome do produto.');
  const finish=image=>{if(id){const p=state.produtos.find(x=>x.id===id);Object.assign(p,data);if(image)p.imagem=image;}else state.produtos.unshift({id:crypto.randomUUID(),...data,imagem:image||DEFAULT_PRODUCTS[0].imagem});save();event.target.reset();$('produtoId').value='';$('stockFormTitle').textContent='Cadastrar produto';$('cancelProductEdit').style.display='none';renderAll();};
  const file=$('imagem').files[0]; if(file){const reader=new FileReader();reader.onload=e=>finish(e.target.result);reader.readAsDataURL(file);}else finish(null);
});
$('cancelProductEdit').addEventListener('click',()=>{$('stockForm').reset();$('produtoId').value='';$('stockFormTitle').textContent='Cadastrar produto';$('cancelProductEdit').style.display='none';});
$('userForm').addEventListener('submit',event=>{
  event.preventDefault(); const usuario=$('clienteUsuario').value.trim();
  if(state.usuarios.some(u=>u.usuario.toLowerCase()===usuario.toLowerCase())) return alert('Este usuário já existe.');
  state.usuarios.push({id:crypto.randomUUID(),nome:$('clienteNome').value.trim(),cnpj:$('clienteCnpj').value.trim(),usuario,senha:$('clienteSenha').value,perfil:$('clientePerfil').value||'cliente',ativo:true});
  save();event.target.reset();renderUsers();const n=$('userNotice');n.style.display='block';n.textContent='Cliente cadastrado com sucesso.';setTimeout(()=>n.style.display='none',3000);
});
$('exportBtn').addEventListener('click',()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}));a.download='emporio-pampatto-backup.json';a.click();URL.revokeObjectURL(a.href);});
$('importBtn').addEventListener('click',()=>$('importFile').click());
$('importFile').addEventListener('change',event=>{const file=event.target.files[0];if(!file)return;const reader=new FileReader();reader.onload=e=>{try{const imported=JSON.parse(e.target.result);if(!imported.produtos||!imported.usuarios)throw new Error();state=imported;save();renderAll();alert('Backup importado.');}catch{alert('Arquivo de backup inválido.');}};reader.readAsText(file);});

save();
