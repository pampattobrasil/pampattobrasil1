(() => {
  'use strict';

  const STATUS = {
    pedido_realizado: 'Pedido realizado',
    pedido_em_andamento: 'Pedido em andamento',
    pedido_entregue: 'Pedido entregue'
  };

  const state = { listas: [], initialized: false };
  const $ = (id) => document.getElementById(id);
  const escapeHtml = (value='') => String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

  function getDb() {
    const candidates = [window.supabaseClient, window.supabaseDb, window.sb, window.db];
    for (const candidate of candidates) if (candidate && typeof candidate.from === 'function') return candidate;
    for (const key of Object.keys(window)) {
      try { const value = window[key]; if (value && typeof value.from === 'function' && value !== window.supabase) return value; } catch (_) {}
    }
    return null;
  }

  function currentUser() {
    const name = $('currentUserName')?.textContent?.trim() || 'Cliente';
    const roleText = $('currentUserRole')?.textContent?.trim().toLowerCase() || '';
    const stored = safeJson(localStorage.getItem('currentUser')) || safeJson(sessionStorage.getItem('currentUser')) || {};
    const role = String(stored.perfil || stored.role || roleText).toLowerCase();
    return {
      id: String(stored.id || stored.user_id || stored.usuario || stored.login || name),
      name: String(stored.nome || stored.name || name),
      role: role.includes('admin') ? 'admin' : 'cliente'
    };
  }

  function safeJson(value) { try { return JSON.parse(value); } catch (_) { return null; } }
  function notice(el, message, error=false) { if (!el) return; el.textContent = message; el.classList.toggle('error', error); }

  function addRow(name='', qty=1) {
    const wrap = $('listaComprasItens'); if (!wrap) return;
    const row = document.createElement('div'); row.className = 'shopping-list-row';
    row.innerHTML = `<input class="shopping-item-name" maxlength="160" placeholder="Nome do produto" value="${escapeHtml(name)}" required>
      <select class="shopping-item-qty" aria-label="Quantidade">${Array.from({length:10},(_,i)=>`<option value="${i+1}" ${i+1===Number(qty)?'selected':''}>${i+1}</option>`).join('')}</select>
      <button type="button" class="outline-btn danger-outline remove-shopping-item" title="Remover item">×</button>`;
    row.querySelector('.remove-shopping-item').addEventListener('click', () => { row.remove(); if (!wrap.children.length) addRow(); });
    wrap.appendChild(row);
  }

  function resetForm() { const wrap=$('listaComprasItens'); if(wrap){wrap.innerHTML=''; addRow();} notice($('listaComprasNotice'),''); }

  async function saveList(event) {
    event.preventDefault(); const db=getDb();
    if (!db) return notice($('listaComprasNotice'),'Não encontrei a conexão do Supabase. Confira o nome do cliente em supabase-config.js.',true);
    const items = [...document.querySelectorAll('.shopping-list-row')].map(row => ({ nome_cliente: row.querySelector('.shopping-item-name').value.trim(), quantidade_cliente: Number(row.querySelector('.shopping-item-qty').value) })).filter(i=>i.nome_cliente);
    if (!items.length) return notice($('listaComprasNotice'),'Inclua pelo menos um produto.',true);
    const user=currentUser(); notice($('listaComprasNotice'),'Salvando...');
    const { data:list, error:listError } = await db.from('compras_listas').insert({ cliente_identificador:user.id, cliente_nome:user.name, status:'pedido_realizado' }).select('id').single();
    if (listError) return notice($('listaComprasNotice'),`Não foi possível salvar: ${listError.message}`,true);
    const payload=items.map((item,index)=>({...item,lista_id:list.id,ordem:index+1}));
    const { error:itemError }=await db.from('compras_lista_itens').insert(payload);
    if(itemError){ await db.from('compras_listas').delete().eq('id',list.id); return notice($('listaComprasNotice'),`Erro nos itens: ${itemError.message}`,true); }
    resetForm(); $('acompanharListaMenu').style.display=''; notice($('listaComprasNotice'),'Lista salva com sucesso. Status: Pedido realizado.'); await loadLists();
  }

  async function loadLists() {
    const target=$('acompanharListaConteudo'), db=getDb(); if(!target||!db) return;
    const user=currentUser(); notice($('acompanharListaNotice'),'Carregando...');
    let query=db.from('compras_listas').select('id,cliente_identificador,cliente_nome,status,created_at,updated_at,compras_lista_itens(id,nome_cliente,quantidade_cliente,nome_admin,quantidade_admin,ordem)').order('created_at',{ascending:false});
    if(user.role!=='admin') query=query.eq('cliente_identificador',user.id);
    const {data,error}=await query;
    if(error){notice($('acompanharListaNotice'),error.message,true);return;}
    state.listas=data||[]; notice($('acompanharListaNotice'),''); $('acompanharListaMenu').style.display=state.listas.length?'':'none'; renderLists();
  }

  function renderLists() {
    const target=$('acompanharListaConteudo'); if(!target)return; const user=currentUser();
    if(!state.listas.length){target.innerHTML='<div class="shopping-empty muted">Nenhuma lista encontrada.</div>';return;}
    target.innerHTML=state.listas.map(list=>{
      const items=(list.compras_lista_itens||[]).sort((a,b)=>a.ordem-b.ordem);
      const visibleItems=items.map(i=>({name:user.role==='admin'?(i.nome_admin||i.nome_cliente):i.nome_cliente,qty:user.role==='admin'?(i.quantidade_admin||i.quantidade_cliente):i.quantidade_cliente,id:i.id}));
      return `<article class="shopping-list-card" data-list-id="${list.id}"><div class="shopping-list-card-head"><div><strong>Lista de ${escapeHtml(list.cliente_nome)}</strong><div class="shopping-list-meta"><span>${new Date(list.created_at).toLocaleString('pt-BR')}</span><span class="shopping-status">${STATUS[list.status]||list.status}</span></div></div></div>
      <ul class="shopping-list-items">${visibleItems.map(i=>`<li><span>${escapeHtml(i.name)}</span><strong>${i.qty}</strong></li>`).join('')}</ul>
      ${user.role==='admin'?`<div class="shopping-admin-actions"><button class="outline-btn" data-action="edit">Editar internamente</button>${list.status==='pedido_realizado'?'<button class="btn" data-status="pedido_em_andamento">Aceitar pedido</button>':''}${list.status!=='pedido_entregue'?'<button class="btn" data-status="pedido_entregue">Marcar entregue</button>':''}</div><div class="shopping-edit-grid" hidden>${items.map(i=>`<div class="shopping-edit-row" data-item-id="${i.id}"><input value="${escapeHtml(i.nome_admin||i.nome_cliente)}"><select>${Array.from({length:10},(_,x)=>`<option value="${x+1}" ${(i.quantidade_admin||i.quantidade_cliente)==x+1?'selected':''}>${x+1}</option>`).join('')}</select></div>`).join('')}<div class="shopping-admin-actions"><button class="btn" data-action="save-edit">Salvar alterações internas</button><button class="outline-btn" data-action="cancel-edit">Cancelar</button></div></div>`:''}</article>`;
    }).join('');
  }

  async function handleListClick(event){
    const card=event.target.closest('.shopping-list-card'); if(!card)return; const listId=card.dataset.listId, db=getDb();
    const status=event.target.dataset.status;
    if(status){const {error}=await db.from('compras_listas').update({status}).eq('id',listId); if(error)return notice($('acompanharListaNotice'),error.message,true); return loadLists();}
    const action=event.target.dataset.action, edit=card.querySelector('.shopping-edit-grid');
    if(action==='edit'){edit.hidden=false;} if(action==='cancel-edit'){edit.hidden=true;}
    if(action==='save-edit'){
      const updates=[...edit.querySelectorAll('.shopping-edit-row')].map(row=>({id:row.dataset.itemId,nome_admin:row.querySelector('input').value.trim(),quantidade_admin:Number(row.querySelector('select').value)}));
      for(const item of updates){const {error}=await db.from('compras_lista_itens').update({nome_admin:item.nome_admin,quantidade_admin:item.quantidade_admin}).eq('id',item.id);if(error)return notice($('acompanharListaNotice'),error.message,true);}
      notice($('acompanharListaNotice'),'Alterações internas salvas. O cliente continuará vendo a lista original.'); await loadLists();
    }
  }

  function hideStockAvailability() {
    const hide = () => {
      document.querySelectorAll('#dashProducts *,#produtosView *').forEach(el=>{
        if(el.children.length===0 && /^(estoque\s*:?|esgotado|fora de estoque|indisponível)$/i.test(el.textContent.trim())) el.classList.add('shopping-hidden-stock');
        if(el.children.length===0 && /estoque\s*:\s*\d+/i.test(el.textContent.trim())) el.classList.add('shopping-hidden-stock');
      });
    };
    hide(); new MutationObserver(hide).observe(document.body,{childList:true,subtree:true});
  }

  function enhanceNavigation(){
    document.querySelectorAll('[data-tab]').forEach(btn=>btn.addEventListener('click',()=>{if(btn.dataset.tab==='acompanhar-lista')loadLists();}));
  }

  function init(){if(state.initialized)return;state.initialized=true;addRow();$('adicionarItemLista')?.addEventListener('click',()=>addRow());$('cancelarListaCompras')?.addEventListener('click',resetForm);$('listaComprasForm')?.addEventListener('submit',saveList);$('atualizarListas')?.addEventListener('click',loadLists);$('acompanharListaConteudo')?.addEventListener('click',handleListClick);enhanceNavigation();hideStockAvailability();setTimeout(loadLists,800);}
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init):init();
})();
