(() => {
  'use strict';

  const LIST_STATUS = {
    pedido_realizado: 'Pedido realizado',
    pedido_em_andamento: 'Pedido em andamento',
    pedido_entregue: 'Pedido entregue'
  };

  const ORDER_STATUS = {
    pedido_realizado: 'Pedido realizado',
    em_separacao: 'Em separação',
    separado: 'Separado',
    entregue: 'Entregue'
  };

  const state = { listas: [], pedidos: [], initialized: false, productObserver: null };
  const $ = (id) => document.getElementById(id);
  const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const safeJson = (value) => { try { return JSON.parse(value); } catch (_) { return null; } };

  function getDb() {
    const candidates = [window.supabaseClient, window.supabaseDb, window.sb, window.db];
    for (const candidate of candidates) if (candidate && typeof candidate.from === 'function') return candidate;
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
    const storedKeys = ['currentUser', 'usuarioLogado', 'loggedUser', 'user'];
    let stored = {};
    for (const key of storedKeys) {
      stored = safeJson(localStorage.getItem(key)) || safeJson(sessionStorage.getItem(key)) || stored;
      if (Object.keys(stored).length) break;
    }
    const role = String(stored.perfil || stored.role || stored.tipo || roleText).toLowerCase();
    return {
      id: String(stored.id || stored.user_id || stored.usuario || stored.login || stored.cnpj || name),
      name: String(stored.nome || stored.name || stored.razao_social || name),
      role: role.includes('admin') ? 'admin' : 'cliente'
    };
  }

  function notice(el, message, error = false) {
    if (!el) return;
    el.textContent = message;
    el.classList.toggle('error', error);
  }

  /* ========================= LISTA DE COMPRAS LIVRE ========================= */
  function addListRow(name = '', qty = 1) {
    const wrap = $('listaComprasItens');
    if (!wrap) return;
    const row = document.createElement('div');
    row.className = 'shopping-list-row';
    row.innerHTML = `<input class="shopping-item-name" maxlength="160" placeholder="Nome do produto" value="${escapeHtml(name)}" required>
      <select class="shopping-item-qty" aria-label="Quantidade">${Array.from({length:10},(_,i)=>`<option value="${i+1}" ${i+1===Number(qty)?'selected':''}>${i+1}</option>`).join('')}</select>
      <button type="button" class="outline-btn danger-outline remove-shopping-item" title="Remover item">×</button>`;
    row.querySelector('.remove-shopping-item').addEventListener('click', () => {
      row.remove();
      if (!wrap.children.length) addListRow();
    });
    wrap.appendChild(row);
  }

  function resetListForm() {
    const wrap = $('listaComprasItens');
    if (wrap) { wrap.innerHTML = ''; addListRow(); }
    notice($('listaComprasNotice'), '');
  }

  async function saveList(event) {
    event.preventDefault();
    const db = getDb();
    if (!db) return notice($('listaComprasNotice'), 'Não encontrei a conexão do Supabase.', true);
    const items = [...document.querySelectorAll('.shopping-list-row')]
      .map(row => ({
        nome_cliente: row.querySelector('.shopping-item-name').value.trim(),
        quantidade_cliente: Number(row.querySelector('.shopping-item-qty').value)
      }))
      .filter(item => item.nome_cliente);
    if (!items.length) return notice($('listaComprasNotice'), 'Inclua pelo menos um produto.', true);

    const user = currentUser();
    notice($('listaComprasNotice'), 'Salvando...');
    const { data: list, error: listError } = await db.from('compras_listas')
      .insert({ cliente_identificador: user.id, cliente_nome: user.name, status: 'pedido_realizado' })
      .select('id').single();
    if (listError) return notice($('listaComprasNotice'), `Não foi possível salvar: ${listError.message}`, true);

    const payload = items.map((item, index) => ({ ...item, lista_id: list.id, ordem: index + 1 }));
    const { error: itemError } = await db.from('compras_lista_itens').insert(payload);
    if (itemError) {
      await db.from('compras_listas').delete().eq('id', list.id);
      return notice($('listaComprasNotice'), `Erro nos itens: ${itemError.message}`, true);
    }
    resetListForm();
    if ($('acompanharListaMenu')) $('acompanharListaMenu').style.display = '';
    notice($('listaComprasNotice'), 'Lista salva com sucesso.');
    await loadLists();
  }

  async function loadLists() {
    const target = $('acompanharListaConteudo'), db = getDb();
    if (!target || !db) return;
    const user = currentUser();
    notice($('acompanharListaNotice'), 'Carregando...');
    let query = db.from('compras_listas')
      .select('id,cliente_identificador,cliente_nome,status,created_at,updated_at,compras_lista_itens(id,nome_cliente,quantidade_cliente,nome_admin,quantidade_admin,ordem)')
      .order('created_at', { ascending: false });
    if (user.role !== 'admin') query = query.eq('cliente_identificador', user.id);
    const { data, error } = await query;
    if (error) return notice($('acompanharListaNotice'), error.message, true);
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
      target.innerHTML = '<div class="shopping-empty muted">Nenhuma lista encontrada.</div>';
      return;
    }
    target.innerHTML = state.listas.map(list => {
      const items = (list.compras_lista_itens || []).sort((a,b) => a.ordem - b.ordem);
      const visibleItems = items.map(item => ({
        name: user.role === 'admin' ? (item.nome_admin || item.nome_cliente) : item.nome_cliente,
        qty: user.role === 'admin' ? (item.quantidade_admin || item.quantidade_cliente) : item.quantidade_cliente,
        id: item.id
      }));
      return `<article class="shopping-list-card" data-list-id="${list.id}">
        <div class="shopping-list-card-head"><div><strong>Lista de ${escapeHtml(list.cliente_nome)}</strong>
        <div class="shopping-list-meta"><span>${new Date(list.created_at).toLocaleString('pt-BR')}</span><span class="shopping-status">${LIST_STATUS[list.status] || list.status}</span></div></div></div>
        <ul class="shopping-list-items">${visibleItems.map(item => `<li><span>${escapeHtml(item.name)}</span><strong>${item.qty}</strong></li>`).join('')}</ul>
        ${user.role === 'admin' ? `<div class="shopping-admin-actions"><button class="outline-btn" data-action="edit-list">Editar internamente</button>${list.status === 'pedido_realizado' ? '<button class="btn" data-list-status="pedido_em_andamento">Aceitar pedido</button>' : ''}${list.status !== 'pedido_entregue' ? '<button class="btn" data-list-status="pedido_entregue">Marcar entregue</button>' : ''}</div>
        <div class="shopping-edit-grid" hidden>${items.map(item => `<div class="shopping-edit-row" data-item-id="${item.id}"><input value="${escapeHtml(item.nome_admin || item.nome_cliente)}"><select>${Array.from({length:10},(_,x)=>`<option value="${x+1}" ${(item.quantidade_admin || item.quantidade_cliente) === x+1 ? 'selected' : ''}>${x+1}</option>`).join('')}</select></div>`).join('')}<div class="shopping-admin-actions"><button class="btn" data-action="save-list-edit">Salvar alterações internas</button><button class="outline-btn" data-action="cancel-list-edit">Cancelar</button></div></div>` : ''}
      </article>`;
    }).join('');
  }

  async function handleListClick(event) {
    const card = event.target.closest('.shopping-list-card');
    if (!card) return;
    const listId = card.dataset.listId, db = getDb();
    const status = event.target.dataset.listStatus;
    if (status) {
      const { error } = await db.from('compras_listas').update({ status }).eq('id', listId);
      if (error) return notice($('acompanharListaNotice'), error.message, true);
      return loadLists();
    }
    const action = event.target.dataset.action, edit = card.querySelector('.shopping-edit-grid');
    if (action === 'edit-list') edit.hidden = false;
    if (action === 'cancel-list-edit') edit.hidden = true;
    if (action === 'save-list-edit') {
      const updates = [...edit.querySelectorAll('.shopping-edit-row')].map(row => ({
        id: row.dataset.itemId,
        nome_admin: row.querySelector('input').value.trim(),
        quantidade_admin: Number(row.querySelector('select').value)
      }));
      for (const item of updates) {
        const { error } = await db.from('compras_lista_itens').update(item).eq('id', item.id);
        if (error) return notice($('acompanharListaNotice'), error.message, true);
      }
      notice($('acompanharListaNotice'), 'Alterações internas salvas.');
      await loadLists();
    }
  }

  /* ========================= CATÁLOGO, CARRINHO E PEDIDOS ========================= */
  const APP_STATE_KEY = 'pampattoStateV4';

  function getAppState() {
    const appState = safeJson(localStorage.getItem(APP_STATE_KEY));
    return appState && typeof appState === 'object' ? appState : { produtos: [], carrinhos: {}, usuarios: [] };
  }

  function resolveCartUserId(appState = getAppState()) {
    const user = currentUser();
    const users = Array.isArray(appState.usuarios) ? appState.usuarios : [];
    const byExactId = users.find(item => String(item.id) === String(user.id));
    if (byExactId) return String(byExactId.id);
    const byName = users.find(item => String(item.nome || '').trim().toLowerCase() === String(user.name || '').trim().toLowerCase());
    if (byName) return String(byName.id);
    if (user.role === 'admin') {
      const admin = users.find(item => String(item.perfil || item.role || '').toLowerCase() === 'admin');
      if (admin) return String(admin.id);
    }
    return String(user.id || user.name || 'cliente');
  }

  function legacyCartKey() { return `emporio_cart_${currentUser().id}`; }

  function normalizeCartItem(item, appState, index = 0) {
    const productId = item?.produtoId ?? item?.produto_id ?? item?.productId ?? item?.id ?? '';
    const products = Array.isArray(appState.produtos) ? appState.produtos : [];
    const product = products.find(p => String(p.id) === String(productId))
      || products.find(p => String(p.nome || '').trim().toLowerCase() === String(item?.nome || '').trim().toLowerCase());
    return {
      produto_id: String(product?.id ?? productId ?? index),
      nome: String(item?.nome ?? product?.nome ?? 'Produto'),
      valor_unitario: Number(item?.valor_unitario ?? item?.valorUnitario ?? item?.valor ?? product?.valor ?? 0) || 0,
      imagem: String(item?.imagem ?? product?.imagem ?? ''),
      quantidade: Math.max(1, Number(item?.quantidade ?? item?.qtd ?? 1) || 1)
    };
  }

  function getCart() {
    const appState = getAppState();
    appState.carrinhos = appState.carrinhos && typeof appState.carrinhos === 'object' ? appState.carrinhos : {};
    const userId = resolveCartUserId(appState);
    let raw = Array.isArray(appState.carrinhos[userId]) ? appState.carrinhos[userId] : [];

    // Migra automaticamente itens salvos pela versão anterior do carrinho.
    const legacy = safeJson(localStorage.getItem(legacyCartKey()));
    if (!raw.length && Array.isArray(legacy) && legacy.length) {
      raw = legacy;
      appState.carrinhos[userId] = raw.map((item, index) => {
        const normalized = normalizeCartItem(item, appState, index);
        return { produtoId: normalized.produto_id, nome: normalized.nome, valor: normalized.valor_unitario, imagem: normalized.imagem, quantidade: normalized.quantidade };
      });
      localStorage.setItem(APP_STATE_KEY, JSON.stringify(appState));
      localStorage.removeItem(legacyCartKey());
    }

    return raw.map((item, index) => normalizeCartItem(item, appState, index));
  }

  function setCart(items) {
    const appState = getAppState();
    appState.carrinhos = appState.carrinhos && typeof appState.carrinhos === 'object' ? appState.carrinhos : {};
    const userId = resolveCartUserId(appState);
    appState.carrinhos[userId] = (Array.isArray(items) ? items : []).map((item, index) => {
      const normalized = normalizeCartItem(item, appState, index);
      return {
        produtoId: normalized.produto_id,
        nome: normalized.nome,
        valor: normalized.valor_unitario,
        imagem: normalized.imagem,
        quantidade: normalized.quantidade
      };
    });
    localStorage.setItem(APP_STATE_KEY, JSON.stringify(appState));
    localStorage.removeItem(legacyCartKey());
    updateCartBadge();
    renderCart();
  }

  function updateCartBadge() {
    const total = getCart().reduce((sum, item) => sum + Number(item.quantidade || 0), 0);
    const badge = $('cartBadge');
    if (!badge) return;
    badge.textContent = total;
    badge.style.display = total ? '' : 'none';
  }

  function parseMoney(text = '') {
    const match = String(text).match(/R\$\s*([\d.]+(?:,\d{1,2})?)/i);
    if (!match) return 0;
    return Number(match[1].replace(/\./g, '').replace(',', '.')) || 0;
  }

  function formatMoney(value) {
    return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function slug(value = '') {
    return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  function findProductCards(container) {
    const explicit = [...container.querySelectorAll('.product-card,.produto-card,.product-item,.produto-item,[data-product-id],[data-produto-id]')];
    const candidates = explicit.length ? explicit : [...container.querySelectorAll('article,li,.card,div')].filter(el => {
      if (el.closest('.catalog-quantity-controls')) return false;
      const text = el.textContent || '';
      const hasPrice = /R\$\s*[\d.,]+/i.test(text);
      const hasImage = !!el.querySelector('img');
      const nestedPriceBlocks = [...el.children].filter(child => /R\$\s*[\d.,]+/i.test(child.textContent || '') && child.querySelector('img')).length;
      return hasPrice && hasImage && nestedPriceBlocks === 0 && el.getBoundingClientRect().width < 420;
    });
    return [...new Set(candidates)];
  }

  function productData(card) {
    const nameEl = card.querySelector('[data-product-name],[data-produto-nome],.product-name,.produto-nome,h4,h5,h3,strong');
    const img = card.querySelector('img');
    let name = nameEl?.textContent?.trim() || img?.alt?.trim() || '';
    if (!name || /^R\$/i.test(name)) {
      const texts = [...card.querySelectorAll('*')].filter(el => el.children.length === 0).map(el => el.textContent.trim()).filter(Boolean);
      name = texts.find(text => !/^R\$/i.test(text) && !/estoque|esgotado|indisponível/i.test(text) && text.length > 2) || 'Produto';
    }
    const price = parseMoney(card.textContent);
    const id = String(card.dataset.productId || card.dataset.produtoId || card.dataset.id || slug(`${name}-${price}`));
    return { id, nome: name, valor: price, imagem: img?.src || '' };
  }

  function addToCart(product, quantity) {
    const qty = Math.max(1, Math.min(999, Number(quantity) || 1));
    const cart = getCart();
    const existing = cart.find(item => String(item.produto_id) === String(product.id));
    if (existing) existing.quantidade += qty;
    else cart.push({ produto_id: product.id, nome: product.nome, valor_unitario: product.valor, imagem: product.imagem, quantidade: qty });
    setCart(cart);
    showCatalogFeedback(`“${product.nome}” incluído no carrinho.`);
  }

  function showCatalogFeedback(message) {
    let box = document.getElementById('catalogCartFeedback');
    if (!box) {
      box = document.createElement('div');
      box.id = 'catalogCartFeedback';
      box.className = 'catalog-cart-feedback';
      document.body.appendChild(box);
    }
    box.textContent = message;
    box.classList.add('show');
    clearTimeout(box._timer);
    box._timer = setTimeout(() => box.classList.remove('show'), 2200);
  }

  function injectQuantityControls() {
    const user = currentUser();
    document.body.classList.toggle('shopping-admin-profile', user.role === 'admin');
    ['dashProducts', 'produtosView'].forEach(id => {
      const container = $(id);
      if (!container) return;
      findProductCards(container).forEach(card => {
        hideAvailabilityInside(card);
        if (card.querySelector('.catalog-quantity-controls')) return;
        const product = productData(card);
        if (!product.nome) return;
        const controls = document.createElement('div');
        controls.className = 'catalog-quantity-controls client-catalog-control';
        controls.innerHTML = `<div class="catalog-stepper"><button type="button" class="catalog-minus" aria-label="Diminuir quantidade">−</button><input type="number" min="1" max="999" step="1" value="1" aria-label="Quantidade de ${escapeHtml(product.nome)}"><button type="button" class="catalog-plus" aria-label="Aumentar quantidade">+</button></div><button type="button" class="btn catalog-include">Incluir</button>`;
        const input = controls.querySelector('input');
        controls.addEventListener('click', event => event.stopPropagation());
        controls.querySelector('.catalog-minus').addEventListener('click', () => input.value = Math.max(1, Number(input.value || 1) - 1));
        controls.querySelector('.catalog-plus').addEventListener('click', () => input.value = Math.min(999, Number(input.value || 1) + 1));
        input.addEventListener('change', () => input.value = Math.max(1, Math.min(999, Number(input.value) || 1)));
        controls.querySelector('.catalog-include').addEventListener('click', () => addToCart(product, input.value));
        card.appendChild(controls);
      });
    });
  }

  function hideAvailabilityInside(root) {
    root.querySelectorAll('*').forEach(el => {
      if (el.children.length) return;
      const text = el.textContent.trim();
      if (/^(esgotado|fora de estoque|indisponível)$/i.test(text) || /^estoque\s*:\s*[\d.,]+$/i.test(text)) {
        el.classList.add('shopping-hidden-stock');
      }
    });
  }

  function observeProducts() {
    const run = () => {
      document.querySelectorAll('#dashProducts,#produtosView').forEach(hideAvailabilityInside);
      injectQuantityControls();
    };
    run();
    state.productObserver = new MutationObserver(() => requestAnimationFrame(run));
    state.productObserver.observe(document.body, { childList: true, subtree: true });
  }

  function renderCart() {
    const target = $('cartView');
    if (!target) return;
    const cart = getCart();
    if (!cart.length) {
      target.innerHTML = '<div class="shopping-empty muted">Seu carrinho está vazio.</div>';
      return;
    }
    const total = cart.reduce((sum, item) => sum + item.valor_unitario * item.quantidade, 0);
    target.innerHTML = `<div class="cart-items-list">${cart.map((item,index) => `<article class="cart-item-row" data-cart-index="${index}">
      <div class="cart-item-main">${item.imagem ? `<img src="${escapeHtml(item.imagem)}" alt="">` : ''}<div><strong>${escapeHtml(item.nome)}</strong><span>${formatMoney(item.valor_unitario)} cada</span></div></div>
      <div class="catalog-stepper cart-stepper"><button type="button" data-cart-action="minus">−</button><input type="number" min="1" max="999" value="${item.quantidade}"><button type="button" data-cart-action="plus">+</button></div>
      <strong>${formatMoney(item.valor_unitario * item.quantidade)}</strong>
      <button type="button" class="outline-btn danger-outline cart-remove" data-cart-action="remove">Remover</button>
    </article>`).join('')}</div><div class="cart-total"><span>Total do pedido</span><strong>${formatMoney(total)}</strong></div>`;
  }

  function handleCartClick(event) {
    const row = event.target.closest('.cart-item-row');
    if (!row) return;
    const index = Number(row.dataset.cartIndex), action = event.target.dataset.cartAction;
    if (!action) return;
    const cart = getCart();
    if (!cart[index]) return;
    if (action === 'minus') cart[index].quantidade = Math.max(1, cart[index].quantidade - 1);
    if (action === 'plus') cart[index].quantidade = Math.min(999, cart[index].quantidade + 1);
    if (action === 'remove') cart.splice(index, 1);
    setCart(cart);
  }

  function handleCartInput(event) {
    if (!event.target.matches('.cart-item-row input[type="number"]')) return;
    const row = event.target.closest('.cart-item-row'), index = Number(row.dataset.cartIndex);
    const cart = getCart();
    if (!cart[index]) return;
    cart[index].quantidade = Math.max(1, Math.min(999, Number(event.target.value) || 1));
    setCart(cart);
  }

  async function finishOrder() {
    const db = getDb(), cart = getCart(), user = currentUser();
    if (!cart.length) return notice($('cartNotice'), 'Inclua pelo menos um produto no carrinho.', true);
    if (!db) return notice($('cartNotice'), 'Não encontrei a conexão do Supabase.', true);
    notice($('cartNotice'), 'Finalizando pedido...');
    const payload = cart.map((item, index) => ({
      produto_id: item.produto_id,
      produto_nome: item.nome,
      imagem_url: item.imagem || null,
      quantidade: item.quantidade,
      valor_unitario: item.valor_unitario,
      ordem: index + 1
    }));
    const { data, error } = await db.rpc('criar_pedido_catalogo', {
      p_cliente_identificador: user.id,
      p_cliente_nome: user.name,
      p_itens: payload
    });
    if (error) return notice($('cartNotice'), `Não foi possível finalizar: ${error.message}`, true);
    setCart([]);
    document.querySelectorAll('[id="cartBadge"]').forEach(badge => { badge.textContent = '0'; badge.style.display = 'none'; });
    notice($('cartNotice'), `Pedido ${data?.numero_pedido || ''} realizado com sucesso.`);
    await loadOrders();
    setTimeout(() => document.querySelector('[data-tab="pedidos"]')?.click(), 500);
  }

  function clearCart() {
    if (!getCart().length || window.confirm('Deseja cancelar e esvaziar o carrinho?')) {
      setCart([]);
      document.querySelectorAll('[id="cartBadge"]').forEach(badge => {
        badge.textContent = '0';
        badge.style.display = 'none';
      });
      notice($('cartNotice'), 'Pedido cancelado e carrinho esvaziado.');
    }
  }

  async function loadOrders() {
    const target = $('ordersContent'), db = getDb();
    if (!target || !db) return;
    const user = currentUser();
    target.innerHTML = '<div class="panel"><div class="shopping-empty muted">Carregando pedidos...</div></div>';
    let query = db.from('catalogo_pedidos')
      .select('id,numero_pedido,cliente_identificador,cliente_nome,status,valor_total,created_at,catalogo_pedido_itens(id,produto_nome,quantidade,valor_unitario,subtotal,ordem)')
      .order('created_at', { ascending: false });
    if (user.role !== 'admin') query = query.eq('cliente_identificador', user.id);
    const { data, error } = await query;
    if (error) {
      target.innerHTML = `<div class="panel"><div class="notice error">${escapeHtml(error.message)}</div></div>`;
      return;
    }
    state.pedidos = data || [];
    renderOrders();
  }

  function statusIndex(status) {
    return ['pedido_realizado','em_separacao','separado','entregue'].indexOf(status);
  }

  function orderTimeline(status) {
    const current = statusIndex(status);
    return `<div class="order-timeline">${Object.entries(ORDER_STATUS).map(([key,label], index) => `<div class="order-stage ${index <= current ? 'done' : ''} ${index === current ? 'current' : ''}"><span>${index + 1}</span><small>${label}</small></div>`).join('')}</div>`;
  }

  function renderOrders() {
    const target = $('ordersContent');
    if (!target) return;
    const user = currentUser();
    target.innerHTML = `<div class="panel"><div class="panel-head"><div><h3>Pedidos</h3><p class="muted">Acompanhe o andamento dos pedidos realizados.</p></div><button type="button" class="outline-btn" id="refreshOrdersBtn">Atualizar</button></div>
      <div class="orders-list">${state.pedidos.length ? state.pedidos.map(order => {
        const items = (order.catalogo_pedido_itens || []).sort((a,b)=>a.ordem-b.ordem);
        return `<article class="order-card" data-order-id="${order.id}"><div class="order-card-head"><div><strong>Pedido nº ${escapeHtml(order.numero_pedido)}</strong><div class="shopping-list-meta"><span>${new Date(order.created_at).toLocaleString('pt-BR')}</span>${user.role === 'admin' ? `<span>Cliente: ${escapeHtml(order.cliente_nome)}</span>` : ''}</div></div><strong>${formatMoney(order.valor_total)}</strong></div>
        ${orderTimeline(order.status)}
        <div class="order-items">${items.map(item => `<div><span>${item.quantidade}× ${escapeHtml(item.produto_nome)}</span><strong>${formatMoney(item.subtotal)}</strong></div>`).join('')}</div>
        ${user.role === 'admin' ? `<div class="order-admin-status"><label>Alterar status</label><select data-order-status>${Object.entries(ORDER_STATUS).map(([key,label])=>`<option value="${key}" ${order.status===key?'selected':''}>${label}</option>`).join('')}</select><button type="button" class="btn" data-action="save-order-status">Salvar status</button></div>` : ''}</article>`;
      }).join('') : '<div class="shopping-empty muted">Nenhum pedido encontrado.</div>'}</div></div>`;
    $('refreshOrdersBtn')?.addEventListener('click', loadOrders);
  }

  async function handleOrdersClick(event) {
    if (event.target.dataset.action !== 'save-order-status') return;
    if (currentUser().role !== 'admin') return;
    const card = event.target.closest('.order-card'), db = getDb();
    const status = card.querySelector('[data-order-status]').value;
    event.target.disabled = true;
    const { error } = await db.from('catalogo_pedidos').update({ status }).eq('id', card.dataset.orderId);
    event.target.disabled = false;
    if (error) return window.alert(error.message);
    await loadOrders();
  }

  /* ========================= APARÊNCIA E NAVEGAÇÃO ========================= */
  function fixUserHeader() {
    const text = document.querySelector('.top-user-text');
    if (text) text.style.display = 'flex';
  }

  function enhanceNavigation() {
    document.querySelectorAll('[data-tab]').forEach(btn => btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      if (tab === 'acompanhar-lista') loadLists();
      if (tab === 'carrinho') renderCart();
      if (tab === 'pedidos') setTimeout(loadOrders, 0);
      if (tab === 'dashboard' || tab === 'produtos') setTimeout(injectQuantityControls, 50);
    }));
  }

  function replaceButtonAndBind(id, handler) {
    const oldButton = $(id);
    if (!oldButton) return null;
    const button = oldButton.cloneNode(true);
    oldButton.replaceWith(button);
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      handler(event);
    }, true);
    return button;
  }

  function init() {
    if (state.initialized) return;
    state.initialized = true;
    addListRow();
    $('adicionarItemLista')?.addEventListener('click', () => addListRow());
    $('cancelarListaCompras')?.addEventListener('click', resetListForm);
    $('listaComprasForm')?.addEventListener('submit', saveList);
    $('atualizarListas')?.addEventListener('click', loadLists);
    $('acompanharListaConteudo')?.addEventListener('click', handleListClick);
    $('cartView')?.addEventListener('click', handleCartClick);
    $('cartView')?.addEventListener('change', handleCartInput);
    replaceButtonAndBind('clearCartBtn', clearCart);
    replaceButtonAndBind('finishCartBtn', finishOrder);
    $('ordersContent')?.addEventListener('click', handleOrdersClick);
    enhanceNavigation();
    fixUserHeader();
    observeProducts();
    updateCartBadge();
    renderCart();
    setTimeout(() => { loadLists(); injectQuantityControls(); }, 900);
  }

  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init();
})();
