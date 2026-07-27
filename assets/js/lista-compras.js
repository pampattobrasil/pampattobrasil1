(()=>{
  const STORAGE='pampattoShoppingListsV2';
  const $=id=>document.getElementById(id);
  const isAdmin=()=>document.getElementById('currentUserRole')?.textContent==='Administrador';
  const getUser=()=>document.getElementById('currentUserName')?.textContent||'Usuário';
  let lists=[];
  try{lists=JSON.parse(localStorage.getItem(STORAGE)||'[]')}catch{lists=[]}
  const save=()=>localStorage.setItem(STORAGE,JSON.stringify(lists));
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
  const statuses=['Pedido realizado','Pedido em andamento','Pedido entregue'];

  function addRow(name='',qty=1){
    const box=$('listaComprasItens');if(!box)return;
    const row=document.createElement('div');row.className='shopping-list-row';
    row.innerHTML=`<input class="shopping-product" placeholder="Nome do produto" value="${esc(name)}" required><select class="shopping-qty">${Array.from({length:10},(_,i)=>`<option ${i+1===qty?'selected':''}>${i+1}</option>`).join('')}</select><button type="button" class="shopping-remove" title="Remover">×</button>`;
    row.querySelector('.shopping-remove').onclick=()=>{row.remove();if(!box.children.length)addRow();};box.appendChild(row);
  }
  function reset(){const box=$('listaComprasItens');if(!box)return;box.innerHTML='';addRow();}
  function render(){
    const box=$('acompanharListaConteudo'),menu=$('acompanharListaMenu');if(!box)return;
    const user=getUser();const visible=isAdmin()?lists:lists.filter(l=>l.client===user);
    if(menu)menu.style.display=visible.length?'':'none';
    box.innerHTML=visible.length?visible.slice().reverse().map(l=>`<div class="shopping-order-card"><div class="shopping-order-head"><div><strong>Lista #${esc(l.number)}</strong><br><span class="muted">${new Date(l.createdAt).toLocaleString('pt-BR')} · ${esc(l.client)}</span></div>${isAdmin()?`<select class="shopping-status" data-id="${l.id}">${statuses.map(s=>`<option ${s===l.status?'selected':''}>${s}</option>`).join('')}</select>`:`<span class="role-badge">${esc(l.status)}</span>`}</div><div class="shopping-items">${l.items.map(i=>`<div>${esc(i.name)} <strong>× ${i.qty}</strong></div>`).join('')}</div></div>`).join(''):'<div class="empty">Nenhuma lista salva.</div>';
    box.querySelectorAll('.shopping-status').forEach(select=>select.onchange=()=>{const l=lists.find(x=>x.id===select.dataset.id);if(l){l.status=select.value;save();render();}});
  }
  $('adicionarItemLista')?.addEventListener('click',()=>addRow());
  $('cancelarListaCompras')?.addEventListener('click',reset);
  $('listaComprasForm')?.addEventListener('submit',e=>{e.preventDefault();const items=[...document.querySelectorAll('.shopping-list-row')].map(r=>({name:r.querySelector('.shopping-product').value.trim(),qty:Number(r.querySelector('.shopping-qty').value)})).filter(i=>i.name);if(!items.length)return alert('Inclua pelo menos um produto.');lists.push({id:crypto.randomUUID(),number:3000+lists.length,client:getUser(),createdAt:new Date().toISOString(),status:'Pedido realizado',items,adminItems:structuredClone(items)});save();reset();render();$('acompanharListaMenu').style.display='';alert('Lista salva com sucesso.');});
  $('atualizarListas')?.addEventListener('click',render);
  document.querySelector('[data-tab="acompanhar-lista"]')?.addEventListener('click',render);
  reset();render();
})();
