(() => {
'use strict';
if (window.__PAMPATTO_APP__) return;
window.__PAMPATTO_APP__ = true;

const $ = id => document.getElementById(id);
const db = () => window.pampattoSupabase || window.supabaseClient || null;
const esc = (v='') => String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = v => Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const sameId=(a,b)=>String(a??'')===String(b??'');
const state={produtos:[],usuarios:[],pedidos:[],currentUser:null,filtroTipo:'Todos',busy:false};
window.PAMPATTO_STATE=state;

const categoryIcons={'Carnes Bovinas':'♉','Carnes Suínas':'♘','Carnes de Frango':'♞','Miúdos de Frango':'♞','Embutidos':'▣','Industrializados':'▤','Peixes':'♓'};
const cats=['Todos',...Object.keys(categoryIcons)];
function isAdmin(){return state.currentUser?.perfil==='admin'}
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
 state.currentUser={id:user.id,nome:user.nome,cnpj:user.cnpj||'',usuario:user.usuario,perfil:user.perfil,ativo:user.ativo};
 exposeUser();
 sessionStorage.setItem('pampatto_user',JSON.stringify(state.currentUser));
}
async function restoreSession(){
 try{const raw=sessionStorage.getItem('pampatto_user');if(!raw)return false;const saved=JSON.parse(raw);const client=requireDb();const {data,error}=await client.from('usuarios').select('id,nome,cnpj,usuario,perfil,ativo').eq('id',saved.id).eq('ativo',true).maybeSingle();if(error||!data){sessionStorage.removeItem('pampatto_user');return false}state.currentUser=data;exposeUser();return true}catch{return false}
}

async function loadProducts(){
 const {data,error}=await requireDb().from('produtos').select('*').eq('ativo',true);
 if(error)throw error;
 state.produtos=(data||[]).map((p,index)=>({
   ...p,
   id:p.id ?? p.produto_id ?? p.codigo ?? `produto-${index}`,
   nome:String(p.nome ?? p.produto_nome ?? p.titulo ?? p.descricao ?? 'Produto sem nome').trim(),
   tipo:String(p.tipo ?? p.categoria ?? p.grupo ?? 'Outros').trim(),
   imagem_url:p.imagem_url ?? p.imagem ?? p.foto_url ?? p.foto ?? '',
   valor:Number(p.valor ?? p.preco ?? p.valor_unitario ?? 0),
   quantidade:Number(p.quantidade ?? p.estoque ?? p.saldo ?? 0),
   ativo:p.ativo !== false
 })).sort((a,b)=>a.tipo.localeCompare(b.tipo,'pt-BR')||a.nome.localeCompare(b.nome,'pt-BR'));
}
async function loadUsers(){
 if(!isAdmin())return;const {data,error}=await requireDb().from('usuarios').select('id,nome,cnpj,usuario,perfil,ativo,created_at').order('nome');if(error)throw error;state.usuarios=data||[];
}
async function loadOrderMetrics(){
 const client=requireDb();let q=client.from('catalogo_pedidos').select('id,cliente_identificador,valor_total,created_at');if(!isAdmin())q=q.eq('cliente_identificador',state.currentUser.id);const {data,error}=await q;if(error)throw error;state.pedidos=data||[];
}

function catButtons(){return `<div class="category-buttons">${cats.map(c=>`<button class="cat-btn ${state.filtroTipo===c?'active':''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}</div>`}
function productCard(p){const nome=String(p.nome||'Produto sem nome').trim();return `<article class="product-card" data-product-id="${esc(p.id)}" data-product-name-value="${esc(nome)}"><img src="${esc(p.imagem_url||'assets/images/logo.jpg')}" alt="${esc(nome)}"><h4 class="product-name" data-product-name title="${esc(nome)}">${esc(nome)}</h4><div class="product-meta"><div class="price">${money(p.valor)}</div></div><div class="catalog-quantity-controls"><div class="catalog-stepper"><button type="button" data-q="minus">−</button><input type="number" min="1" max="999" value="1"><button type="button" data-q="plus">+</button></div><button type="button" class="btn" data-q="add">Incluir</button></div></article>`}
function renderProductArea(id){
 const root=$(id);if(!root)return;const input=id==='dashProducts'?$('buscaDash'):$('buscaProdutos');const termo=(input?.value||'').trim().toLowerCase();const base=state.produtos.filter(p=>(state.filtroTipo==='Todos'||p.tipo===state.filtroTipo)&&`${p.nome} ${p.tipo}`.toLowerCase().includes(termo));let html=catButtons();const groups=state.filtroTipo==='Todos'?Object.keys(categoryIcons):[state.filtroTipo];for(const cat of groups){const items=base.filter(p=>p.tipo===cat);if(items.length)html+=`<section class="product-section"><div class="section-title"><span>${categoryIcons[cat]||'•'}</span>${esc(cat)}</div><div class="product-grid">${items.map(productCard).join('')}</div></section>`}root.innerHTML=html||'<div class="empty">Nenhum produto encontrado.</div>';
}
function renderStock(){
 if(!isAdmin()||!$('tbody'))return;const termo=($('busca')?.value||'').toLowerCase();const list=state.produtos.filter(p=>`${p.nome} ${p.tipo}`.toLowerCase().includes(termo));$('tbody').innerHTML=list.map(p=>`<tr><td><img class="thumb" src="${esc(p.imagem_url||'assets/images/logo.jpg')}" alt="Produto"></td><td><strong>${esc(p.nome)}</strong><br><span class="muted">${esc(p.fabricante||'')}</span></td><td><span class="tag">${esc(p.tipo)}</span></td><td><input class="stock-edit" id="stock-price-${p.id}" type="number" min="0" step="0.01" value="${Number(p.valor||0).toFixed(2)}"></td><td><input class="stock-edit" id="stock-qty-${p.id}" type="number" min="0" step="0.01" value="${Number(p.quantidade||0)}"></td><td>${Number(p.quantidade||0)<=0?'<span class="low">Esgotado</span>':'Disponível'}</td><td><div class="actions"><button class="mini-btn" data-save-stock="${p.id}">Salvar quantidade e valor</button><button class="mini-btn" data-edit-product="${p.id}">Editar dados</button></div><span class="stock-save-ok" id="stock-ok-${p.id}"></span></td></tr>`).join('')||'<tr><td colspan="7" class="empty">Nenhum produto encontrado.</td></tr>';
}
function renderUsers(){
 if(!isAdmin()||!$('usersBody'))return;$('usersBody').innerHTML=state.usuarios.map(u=>`<tr><td>${esc(u.nome)}</td><td>${esc(u.cnpj||'—')}</td><td>${esc(u.usuario)}</td><td><span class="role-badge">${u.perfil==='admin'?'Administrador':'Cliente'}</span></td><td>${u.ativo?'Ativo':'Inativo'}</td><td>${u.usuario==='teste'?'<span class="muted">Acesso principal</span>':`<button class="mini-btn" data-toggle-user="${u.id}">${u.ativo?'Desativar':'Ativar'}</button><button class="mini-btn danger" data-delete-user="${u.id}">Excluir</button>`}</td></tr>`).join('');
}
function renderMetrics(){
 const month=new Date().toISOString().slice(0,7);const monthly=state.pedidos.filter(p=>String(p.created_at||'').slice(0,7)===month);if($('metricProducts'))$('metricProducts').textContent=state.produtos.length;if($('metricOrders'))$('metricOrders').textContent=state.pedidos.length;if(isAdmin()){if($('metricLow'))$('metricLow').textContent=state.produtos.filter(p=>Number(p.quantidade||0)<=0).length;if($('metricSales'))$('metricSales').textContent=money(monthly.reduce((s,p)=>s+Number(p.valor_total||0),0))}
}
function applyPermissions(){document.querySelectorAll('.admin-only').forEach(el=>el.style.display=isAdmin()?'':'none');if($('currentUserName'))$('currentUserName').textContent=state.currentUser.nome;if($('currentUserRole'))$('currentUserRole').textContent=isAdmin()?'Administrador':state.currentUser.usuario;if($('ordersMenuLabel'))$('ordersMenuLabel').textContent=isAdmin()?'Pedidos':'Meus pedidos';if($('acompanharListaMenu'))$('acompanharListaMenu').style.display=isAdmin()?'':'none'}
function renderReports(){
 const target=$('reportsContent');if(!target||!isAdmin())return;const month=new Date().toISOString().slice(0,7);target.innerHTML=`<div class="panel"><div class="panel-head"><div><h3>Relatórios</h3><p class="muted">Dados atualizados diretamente do Supabase.</p></div></div><div class="metrics"><div class="metric"><div><span class="muted">PEDIDOS NO MÊS</span><div class="big">${state.pedidos.filter(p=>String(p.created_at).slice(0,7)===month).length}</div></div></div><div class="metric"><div><span class="muted">VENDAS NO MÊS</span><div class="big small">${money(state.pedidos.filter(p=>String(p.created_at).slice(0,7)===month).reduce((s,p)=>s+Number(p.valor_total||0),0))}</div></div></div></div></div>`;
}
function renderAll(){applyPermissions();renderProductArea('dashProducts');renderProductArea('produtosView');renderStock();renderUsers();renderMetrics();renderReports();document.dispatchEvent(new CustomEvent('pampatto:data-ready'))}
async function refreshAll(){await Promise.all([loadProducts(),loadUsers(),loadOrderMetrics()]);renderAll()}

function openTab(tab){if(['estoque','empresa','relatorios','acompanhar-lista'].includes(tab)&&!isAdmin())return;document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));$('tab-'+tab)?.classList.add('active');document.querySelectorAll('.nav button').forEach(b=>b.classList.remove('active'));document.querySelector(`[data-tab="${tab}"]`)?.classList.add('active');document.dispatchEvent(new CustomEvent('pampatto:tab',{detail:{tab}}))}
window.openTab=openTab;

async function saveStock(id){const quantidade=Number($('stock-qty-'+id)?.value);const valor=Number($('stock-price-'+id)?.value);if(!Number.isFinite(quantidade)||quantidade<0||!Number.isFinite(valor)||valor<0)return alert('Informe quantidade e valor válidos.');const {error}=await requireDb().from('produtos').update({quantidade,valor,updated_at:new Date().toISOString()}).eq('id',id);if(error)return alert(error.message);await loadProducts();renderAll()}
function editProduct(id){const p=state.produtos.find(x=>sameId(x.id,id));if(!p)return;$('produtoId').value=p.id;$('nome').value=p.nome;$('fabricante').value=p.fabricante||'';$('quantidade').value=Number(p.quantidade||0);$('valor').value=Number(p.valor||0).toFixed(2);$('tipo').value=p.tipo;$('validade').value=p.validade||'';$('stockFormTitle').textContent='Editar produto';$('cancelProductEdit').style.display='block';openTab('estoque')}
async function fileToDataUrl(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file)})}
async function submitProduct(e){e.preventDefault();const id=$('produtoId').value;const file=$('imagem').files[0];const current=state.produtos.find(p=>sameId(p.id,id));const payload={nome:$('nome').value.trim(),fabricante:$('fabricante').value.trim()||'Empório Pampatto',quantidade:Number($('quantidade').value||0),valor:Number($('valor').value||0),tipo:$('tipo').value,validade:$('validade').value||null,imagem_url:file?await fileToDataUrl(file):(current?.imagem_url||'assets/images/logo.jpg'),ativo:true,updated_at:new Date().toISOString()};if(!payload.nome)return alert('Informe o nome do produto.');let result=id?await requireDb().from('produtos').update(payload).eq('id',id):await requireDb().from('produtos').insert(payload);if(result.error)return alert(result.error.message);e.target.reset();$('produtoId').value='';$('stockFormTitle').textContent='Cadastrar produto';$('cancelProductEdit').style.display='none';await loadProducts();renderAll()}
async function submitUser(e){e.preventDefault();const payload={p_nome:$('clienteNome').value.trim(),p_cnpj:$('clienteCnpj').value.trim(),p_usuario:$('clienteUsuario').value.trim(),p_senha:$('clienteSenha').value,p_perfil:$('clientePerfil').value};const {error}=await requireDb().rpc('cadastrar_usuario',payload);if(error)return alert(error.message);e.target.reset();await loadUsers();renderUsers();const n=$('userNotice');if(n){n.style.display='block';n.textContent='Cliente cadastrado com sucesso.';setTimeout(()=>n.style.display='none',2500)}}
async function toggleUser(id){const u=state.usuarios.find(x=>sameId(x.id,id));if(!u)return;const {error}=await requireDb().from('usuarios').update({ativo:!u.ativo}).eq('id',id);if(error)return alert(error.message);await loadUsers();renderUsers()}
async function deleteUser(id){if(!confirm('Excluir este usuário?'))return;const {error}=await requireDb().from('usuarios').delete().eq('id',id);if(error)return alert(error.message);await loadUsers();renderUsers()}

function bind(){
 document.querySelectorAll('.nav button[data-tab]').forEach(btn=>btn.addEventListener('click',()=>openTab(btn.dataset.tab)));
 document.querySelectorAll('[data-new-product]').forEach(b=>b.addEventListener('click',()=>openTab('estoque')));
 $('loginForm')?.addEventListener('submit',async e=>{e.preventDefault();if(state.busy)return;state.busy=true;hideError();setLoading(true,'ENTRANDO...');try{await login($('login').value.trim().toLowerCase(),$('senha').value);await refreshAll();$('loginPage').style.display='none';$('appPage').style.display='block';openTab('dashboard')}catch(err){showError(err.message||'Não foi possível entrar.')}finally{state.busy=false;setLoading(false)}});
 $('toggleSenha')?.addEventListener('click',()=>{$('senha').type=$('senha').type==='password'?'text':'password'});
 $('senha')?.addEventListener('keyup',e=>{$('capsAlert').style.display=e.getModifierState('CapsLock')?'block':'none'});
 $('logoutBtn')?.addEventListener('click',()=>{sessionStorage.removeItem('pampatto_user');state.currentUser=null;exposeUser();$('appPage').style.display='none';$('loginPage').style.display='flex';$('senha').value=''});
 $('busca')?.addEventListener('input',renderStock);$('buscaDash')?.addEventListener('input',()=>renderProductArea('dashProducts'));$('buscaProdutos')?.addEventListener('input',()=>renderProductArea('produtosView'));
 $('dashProducts')?.addEventListener('click',catalogClick);$('produtosView')?.addEventListener('click',catalogClick);
 $('tbody')?.addEventListener('click',e=>{const save=e.target.dataset.saveStock,edit=e.target.dataset.editProduct;if(save)saveStock(save);if(edit)editProduct(edit)});
 $('usersBody')?.addEventListener('click',e=>{if(e.target.dataset.toggleUser)toggleUser(e.target.dataset.toggleUser);if(e.target.dataset.deleteUser)deleteUser(e.target.dataset.deleteUser)});
 $('stockForm')?.addEventListener('submit',submitProduct);$('cancelProductEdit')?.addEventListener('click',()=>{$('stockForm').reset();$('produtoId').value='';$('stockFormTitle').textContent='Cadastrar produto';$('cancelProductEdit').style.display='none'});
 $('userForm')?.addEventListener('submit',submitUser);
 $('exportBtn')?.addEventListener('click',async()=>{const snapshot={produtos:state.produtos,usuarios:state.usuarios,pedidos:state.pedidos,exportado_em:new Date().toISOString()};const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(snapshot,null,2)],{type:'application/json'}));a.download='pampatto-supabase-backup.json';a.click();URL.revokeObjectURL(a.href)});
}
function catalogClick(e){const card=e.target.closest('[data-product-id]');if(!card)return;const input=card.querySelector('input[type=number]');const action=e.target.dataset.q;if(action==='minus')input.value=Math.max(1,Number(input.value||1)-1);if(action==='plus')input.value=Math.min(999,Number(input.value||1)+1);if(action==='add')document.dispatchEvent(new CustomEvent('pampatto:add-cart',{detail:{produtoId:card.dataset.productId,quantidade:Number(input.value||1)}}));const cat=e.target.dataset.cat;if(cat){state.filtroTipo=cat;renderProductArea('dashProducts');renderProductArea('produtosView')}}

async function init(){
 bind();const modal=$('orderSuccessModal');if(modal){modal.classList.remove('open');modal.style.display='none'}
 if(!db()){showError('Falha ao carregar o Supabase. Atualize a página.');return}
 const restored=await restoreSession();if(restored){try{await refreshAll();$('loginPage').style.display='none';$('appPage').style.display='block';openTab('dashboard')}catch(err){console.error(err);sessionStorage.removeItem('pampatto_user');showError('Não foi possível carregar os dados do banco: '+err.message)}}
}
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init):init();
})();
