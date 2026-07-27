(() => {
  'use strict';

  const STATUS = {
    pedido_realizado: 'Pedido realizado',
    pedido_em_andamento: 'Pedido em andamento',
    pedido_entregue: 'Pedido entregue'
  };

  const state = { listas: [], initialized: false };
  const $ = (id) => document.getElementById(id);
  const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[c]));

  function safeJson(value) {
    try { return JSON.parse(value); } catch (_) { return null; }
  }

  function getDb() {
    const candidates = [window.supabaseClient, window.supabaseDb, window.sb, window.db];
    for (const candidate of candidates) {
      if (candidate && typeof candidate.from === 'function') return candidate;
    }

    for (const key of Object.keys(window)) {
      try {
        const value = window[key];
        if (value && typeof value.from === 'function' && value !== window.supabase) return value;
      } catch (_) {}
    }
    return null;
  }

  function currentUser() {
    const name = $('currentUserName')?.textContent?.trim() || 'Cliente';
    const roleText = $('currentUserRole')?.textContent?.trim().toLowerCase() || '';
    const stored = safeJson(localStorage.getItem('currentUser'))
      || safeJson(sessionStorage.getItem('currentUser'))
      || {};
    const role = String(stored.perfil || stored.role || roleText).toLowerCase();

    return {
      id: String(stored.id || stored.user_id || stored.usuario || stored.login || name),
      name: String(stored.nome || stored.name || name),
      role: role.includes('admin') ? 'admin' : 'cliente'
    };
  }

  function notice(el, message, error = false) {
    if (!el) return;
    el.textContent = message;
    el.classList.toggle('error', error);
  }

  function ensureEditorHasRow() {
    const wrap = $('listaComprasItens');
    if (wrap && !wrap.querySelector('.shopping-list-row')) addRow();
  }

  function addRow(name = '', qty = 1) {
    const wrap = $('listaComprasItens');
    if (!wrap) return;

    const row = document.createElement('div');
    row.className = 'shopping-list-row';
    row.innerHTML = `
      <input class="shopping-item-name" maxlength="160" placeholder="Nome do produto" value="${escapeHtml(name)}" required>
      <select class="shopping-item-qty" aria-label="Quantidade">
        ${Array.from({ length: 10 }, (_, i) => `<option value="${i + 1}" ${i + 1 === Number(qty) ? 'selected' : ''}>${i + 1}</option>`).join('')}
      </select>
      <button type="button" class="outline-btn danger-outline remove-shopping-item" title="Remover item" aria-label="Remover item">×</button>`;

    wrap.appendChild(row);
    row.querySelector('.shopping-item-name')?.focus();
  }

  function removeRow(button) {
    const wrap = $('listaComprasItens');
    button.closest('.shopping-list-row')?.remove();
    if (wrap && !wrap.children.length) addRow();
  }

  function resetForm() {
    const wrap = $('listaComprasItens');
    if (wrap) {
      wrap.innerHTML = '';
      addRow();
    }
    notice($('listaComprasNotice'), '');
  }

  async function saveList(event) {
    event.preventDefault();
    const db = getDb();
    if (!db) {
      notice($('listaComprasNotice'), 'Não encontrei a conexão do Supabase. Confira o arquivo supabase-config.js.', true);
      return;
    }

    const items = [...document.querySelectorAll('#listaComprasItens .shopping-list-row')]
      .map((row) => ({
        nome_cliente: row.querySelector('.shopping-item-name')?.value.trim() || '',
        quantidade_cliente: Number(row.querySelector('.shopping-item-qty')?.value || 1)
      }))
      .filter((item) => item.nome_cliente);

    if (!items.length) {
      notice($('listaComprasNotice'), 'Inclua pelo menos um produto.', true);
      return;
    }

    const user = currentUser();
    notice($('listaComprasNotice'), 'Salvando lista...');

    const { data: list, error: listError } = await db
      .from('compras_listas')
      .insert({
        cliente_identificador: user.id,
        cliente_nome: user.name,
        status: 'pedido_realizado'
      })
      .select('id')
      .single();

    if (listError) {
      notice($('listaComprasNotice'), `Não foi possível salvar: ${listError.message}`, true);
      return;
    }

    const payload = items.map((item, index) => ({
      ...item,
      lista_id: list.id,
      ordem: index + 1
    }));

    const { error: itemError } = await db.from('compras_lista_itens').insert(payload);
    if (itemError) {
      await db.from('compras_listas').delete().eq('id', list.id);
      notice($('listaComprasNotice'), `Erro ao salvar os itens: ${itemError.message}`, true);
      return;
    }

    resetForm();
    if ($('acompanharListaMenu')) $('acompanharListaMenu').style.display = '';
    notice($('listaComprasNotice'), 'Lista salva com sucesso. Status: Pedido realizado.');
    await loadLists();
  }

  async function loadLists() {
    const target = $('acompanharListaConteudo');
    const db = getDb();
    if (!target || !db) return;

    const user = currentUser();
    notice($('acompanharListaNotice'), 'Carregando...');

    let query = db
      .from('compras_listas')
      .select('id,cliente_identificador,cliente_nome,status,created_at,updated_at,compras_lista_itens(id,nome_cliente,quantidade_cliente,nome_admin,quantidade_admin,ordem)')
      .order('created_at', { ascending: false });

    if (user.role !== 'admin') query = query.eq('cliente_identificador', user.id);

    const { data, error } = await query;
    if (error) {
      notice($('acompanharListaNotice'), error.message, true);
      return;
    }

    state.listas = data || [];
    notice($('acompanharListaNotice'), '');
    if ($('acompanharListaMenu')) $('acompanharListaMenu').style.display = state.listas.length ? '' : 'none';
    renderLists();
  }

  function renderLists() {
    const target = $('acompanharListaConteudo');
    if (!target) return;
    const user = currentUser();

    if (!state.listas.length) {
      target.innerHTML = '<div class="shopping-empty">Nenhuma lista encontrada.</div>';
      return;
    }

    target.innerHTML = state.listas.map((list) => {
      const items = (list.compras_lista_itens || []).sort((a, b) => a.ordem - b.ordem);
      const visibleItems = items.map((item) => ({
        name: user.role === 'admin' ? (item.nome_admin || item.nome_cliente) : item.nome_cliente,
        qty: user.role === 'admin' ? (item.quantidade_admin || item.quantidade_cliente) : item.quantidade_cliente,
        id: item.id
      }));

      return `<article class="shopping-list-card" data-list-id="${list.id}">
        <div class="shopping-list-card-head">
          <div>
            <strong>Lista de ${escapeHtml(list.cliente_nome)}</strong>
            <div class="shopping-list-meta">
              <span>${new Date(list.created_at).toLocaleString('pt-BR')}</span>
              <span class="shopping-status">${STATUS[list.status] || escapeHtml(list.status)}</span>
            </div>
          </div>
        </div>
        <ul class="shopping-list-items">
          ${visibleItems.map((item) => `<li><span>${escapeHtml(item.name)}</span><strong>${item.qty}</strong></li>`).join('')}
        </ul>
        ${user.role === 'admin' ? `
          <div class="shopping-admin-actions">
            <button type="button" class="outline-btn" data-action="edit">Editar internamente</button>
            ${list.status === 'pedido_realizado' ? '<button type="button" class="btn" data-status="pedido_em_andamento">Aceitar pedido</button>' : ''}
            ${list.status !== 'pedido_entregue' ? '<button type="button" class="btn" data-status="pedido_entregue">Marcar entregue</button>' : ''}
          </div>
          <div class="shopping-edit-grid" hidden>
            ${items.map((item) => `<div class="shopping-edit-row" data-item-id="${item.id}">
              <input value="${escapeHtml(item.nome_admin || item.nome_cliente)}">
              <select>${Array.from({ length: 10 }, (_, x) => `<option value="${x + 1}" ${(item.quantidade_admin || item.quantidade_cliente) === x + 1 ? 'selected' : ''}>${x + 1}</option>`).join('')}</select>
            </div>`).join('')}
            <div class="shopping-admin-actions">
              <button type="button" class="btn" data-action="save-edit">Salvar alterações internas</button>
              <button type="button" class="outline-btn" data-action="cancel-edit">Cancelar</button>
            </div>
          </div>` : ''}
      </article>`;
    }).join('');
  }

  async function handleListClick(event) {
    const card = event.target.closest('.shopping-list-card');
    if (!card) return;

    const listId = card.dataset.listId;
    const db = getDb();
    const status = event.target.closest('[data-status]')?.dataset.status;

    if (status) {
      const { error } = await db.from('compras_listas').update({ status }).eq('id', listId);
      if (error) {
        notice($('acompanharListaNotice'), error.message, true);
        return;
      }
      await loadLists();
      return;
    }

    const action = event.target.closest('[data-action]')?.dataset.action;
    const edit = card.querySelector('.shopping-edit-grid');

    if (action === 'edit' && edit) edit.hidden = false;
    if (action === 'cancel-edit' && edit) edit.hidden = true;

    if (action === 'save-edit' && edit) {
      const updates = [...edit.querySelectorAll('.shopping-edit-row')].map((row) => ({
        id: row.dataset.itemId,
        nome_admin: row.querySelector('input')?.value.trim() || '',
        quantidade_admin: Number(row.querySelector('select')?.value || 1)
      }));

      for (const item of updates) {
        const { error } = await db
          .from('compras_lista_itens')
          .update({ nome_admin: item.nome_admin, quantidade_admin: item.quantidade_admin })
          .eq('id', item.id);
        if (error) {
          notice($('acompanharListaNotice'), error.message, true);
          return;
        }
      }

      notice($('acompanharListaNotice'), 'Alterações internas salvas. O cliente continuará vendo a lista original.');
      await loadLists();
    }
  }

  function normalizeText(text) {
    return String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function isAvailabilityText(text) {
    const value = normalizeText(text);
    return value === 'esgotado'
      || value === 'fora de estoque'
      || value === 'indisponível'
      || value === 'indisponivel'
      || /^estoque\s*:\s*-?\d+(?:[.,]\d+)?$/.test(value)
      || /^estoque\s+-?\d+(?:[.,]\d+)?$/.test(value);
  }

  function hideStockAvailability() {
    const roots = [$('dashProducts'), $('produtosView')].filter(Boolean);

    roots.forEach((root) => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const textNodes = [];
      while (walker.nextNode()) textNodes.push(walker.currentNode);

      textNodes.forEach((node) => {
        if (!isAvailabilityText(node.nodeValue)) return;
        const parent = node.parentElement;
        if (!parent) return;

        /* Oculta apenas a linha do status, nunca o cartão inteiro. */
        if (isAvailabilityText(parent.textContent)) {
          parent.classList.add('shopping-hidden-stock');
          parent.setAttribute('data-shopping-stock-hidden', 'true');
        } else {
          node.nodeValue = '';
        }
      });

      root.querySelectorAll('*').forEach((element) => {
        if (element.children.length === 0 && isAvailabilityText(element.textContent)) {
          element.classList.add('shopping-hidden-stock');
          element.setAttribute('data-shopping-stock-hidden', 'true');
        }
      });
    });
  }

  function handleGlobalClick(event) {
    const addButton = event.target.closest('#adicionarItemLista');
    if (addButton) {
      event.preventDefault();
      event.stopPropagation();
      addRow();
      return;
    }

    const removeButton = event.target.closest('.remove-shopping-item');
    if (removeButton) {
      event.preventDefault();
      removeRow(removeButton);
      return;
    }

    const cancelButton = event.target.closest('#cancelarListaCompras');
    if (cancelButton) {
      event.preventDefault();
      resetForm();
      return;
    }

    const updateButton = event.target.closest('#atualizarListas');
    if (updateButton) {
      event.preventDefault();
      loadLists();
      return;
    }

    const tabButton = event.target.closest('[data-tab]');
    if (tabButton?.dataset.tab === 'lista-compras') {
      setTimeout(ensureEditorHasRow, 0);
    }
    if (tabButton?.dataset.tab === 'acompanhar-lista') {
      setTimeout(loadLists, 0);
    }
  }

  function init() {
    if (state.initialized) return;
    state.initialized = true;

    ensureEditorHasRow();

    /* Delegação global: continua funcionando mesmo se o app.js recriar elementos. */
    document.addEventListener('click', handleGlobalClick, true);
    $('listaComprasForm')?.addEventListener('submit', saveList);
    $('acompanharListaConteudo')?.addEventListener('click', handleListClick);

    let stockTimer = null;
    const scheduleStockCleanup = () => {
      clearTimeout(stockTimer);
      stockTimer = setTimeout(hideStockAvailability, 30);
    };

    hideStockAvailability();
    new MutationObserver(scheduleStockCleanup).observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });

    /* Reforço para renderizações tardias do catálogo. */
    setInterval(hideStockAvailability, 1200);
    setTimeout(loadLists, 800);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
