(() => {
  'use strict';

  if (window.__PAMPATTO_LISTA_COMPRAS_CARREGADO__) {
    console.warn('lista-compras.js já foi carregado. A segunda execução foi ignorada.');
    return;
  }
  window.__PAMPATTO_LISTA_COMPRAS_CARREGADO__ = true;

  const STATUS = {
    pedido_realizado: 'Pedido realizado',
    em_separacao: 'Em separação',
    separado: 'Separado',
    entregue: 'Entregue'
  };

  const $ = id => document.getElementById(id);
  const esc = (v='') => String(v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const money = v => Number(v || 0).toLocaleString('pt-BR', {style:'currency', currency:'BRL'});
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const state = { cart: [], orders: [], realtime: [], initialized: false, busy: false };

  function db() {
    return window.supabaseClient || window.supabaseDb || window.sb || window.db || null;
  }

  function currentUser() {
    const exposed = window.PAMPATTO_CURRENT_USER || window.currentUser || {};
    const name = exposed.nome || exposed.name || $('currentUserName')?.textContent?.trim() || 'Cliente';
    const roleText = exposed.perfil || exposed.role || $('currentUserRole')?.textContent?.trim() || '';
    const role = String(roleText).toLowerCase().includes('admin') ? 'admin' : 'cliente';
    const login = exposed.usuario || exposed.login || (role === 'cliente' ? roleText : '') || name;
    return {
      id: String(exposed.id || exposed.usuario_id || login || name),
      name: String(name),
      login: String(login),
      role
    };
  }

  function notice(message, error=false) {
    const el = $('cartNotice');
    if (!el) return;
    el.className = error ? 'notice error' : 'notice';
    el.textContent = message;
  }

  function orderButton() {
    return document.querySelector('[data-tab="pedidos"]');
  }

  function ensureOrderBadge() {
    const btn = orderButton();
    if (!btn) return null;
    let badge = $('orderUpdateBadge');
    if (!badge) {
      badge = document.createElement('span');
      badge.id = 'orderUpdateBadge';
      badge.className = 'badge order-update-badge';
      badge.textContent = '★';
      badge.title = 'Há atualização em pedido';
      badge.style.display = 'none';
      btn.appendChild(badge);
    }
    return badge;
  }

  function showOrderBadge(show) {
    const badge = ensureOrderBadge();
    if (badge) badge.style.display = show ? 'grid' : 'none';
  }

  function productFromCard(card) {
    const img = card.querySelector('img');
    const nameEl = card.querySelector('[data-product-name],.product-name,.produto-nome,h4,h5,h3,strong');
    const name = nameEl?.textContent?.trim() || img?.alt?.trim() || 'Produto';
    const priceMatch = (card.textContent || '').match(/R\$\s*([\d.]+(?:,\d{1,2})?)/i);
    const value = priceMatch ? Number(priceMatch[1].replace(/\./g,'').replace(',','.')) : 0;
    const id = String(card.dataset.productId || card.dataset.produtoId || card.dataset.id || name);
    return { id, name, value, image: img?.getAttribute('src') || '' };
  }

  function findCards(root) {
    const explicit = [...root.querySelectorAll('.product-card,.produto-card,.product-item,.produto-item,[data-product-id],[data-produto-id]')];
    return explicit.length ? explicit : [...root.querySelectorAll('article')];
  }

  async function loadCart() {
    const client = db(), user = currentUser();
    if (!client || !user.id) return;
    const { data, error } = await client
      .from('catalogo_carrinho_itens')
      .select('id,produto_id,produto_nome,imagem_url,quantidade,valor_unitario,subtotal')
      .eq('cliente_identificador', user.id)
      .order('created_at', {ascending:true});
    if (error) {
      console.error(error);
      notice(`Erro ao carregar o carrinho: ${error.message}`, true);
      return;
    }
    state.cart = data || [];
    renderCart();
  }

  function updateCartBadge() {
    const total = state.cart.reduce((s, i) => s + Number(i.quantidade || 0), 0);
    const badge = $('cartBadge');
    if (!badge) return;
    badge.textContent = total;
    badge.style.display = total ? 'grid' : 'none';
  }

  function renderCart() {
    const target = $('cartView');
    updateCartBadge();
    if (!target) return;
    if (!state.cart.length) {
      target.innerHTML = '<div class="shopping-empty muted">Seu carrinho está vazio.</div>';
      return;
    }
    const total = state.cart.reduce((s, i) => s + Number(i.subtotal ?? Number(i.quantidade)*Number(i.valor_unitario)), 0);
    target.innerHTML = `<div class="cart-items-list">${state.cart.map(item => `
      <article class="cart-item-row" data-cart-id="${esc(item.id)}">
        <div class="cart-item-main">
          ${item.imagem_url ? `<img src="${esc(item.imagem_url)}" alt="${esc(item.produto_nome)}">` : ''}
          <div><strong>${esc(item.produto_nome)}</strong><span>${money(item.valor_unitario)} cada</span></div>
        </div>
        <div class="catalog-stepper cart-stepper">
          <button type="button" data-cart-action="minus">−</button>
          <input type="number" min="1" max="999" value="${Number(item.quantidade)}">
          <button type="button" data-cart-action="plus">+</button>
        </div>
        <strong>${money(item.subtotal)}</strong>
        <button type="button" class="outline-btn danger-outline cart-remove" data-cart-action="remove">Remover</button>
      </article>`).join('')}</div>
      <div class="cart-total"><span>Total do pedido</span><strong>${money(total)}</strong></div>`;
  }

  async function addToCart(product, quantity) {
    const client = db(), user = currentUser();
    if (!client) return alert('Supabase não configurado.');
    const qty = Math.max(1, Math.min(999, Number(quantity) || 1));
    const { error } = await client.rpc('adicionar_item_carrinho', {
      p_cliente_identificador: user.id,
      p_cliente_nome: user.name,
      p_produto_id: product.id,
      p_produto_nome: product.name,
      p_imagem_url: product.image || null,
      p_quantidade: qty,
      p_valor_unitario: product.value
    });
    if (error) return alert(`Não foi possível adicionar: ${error.message}`);
    await loadCart();
    catalogToast(`“${product.name}” incluído no carrinho.`);
  }

  function catalogToast(message) {
    let box = $('catalogCartFeedback');
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

  function injectControls() {
    ['dashProducts','produtosView'].forEach(id => {
      const root = $(id);
      if (!root) return;
      findCards(root).forEach(card => {
        card.querySelectorAll('.buy-box,.catalog-quantity-controls').forEach(el => el.remove());
        const product = productFromCard(card);
        const controls = document.createElement('div');
        controls.className = 'catalog-quantity-controls';
        controls.innerHTML = `<div class="catalog-stepper">
          <button type="button" data-q="minus">−</button>
          <input type="number" min="1" max="999" value="1">
          <button type="button" data-q="plus">+</button>
        </div><button type="button" class="btn" data-q="add">Incluir</button>`;
        const input = controls.querySelector('input');
        controls.addEventListener('click', e => {
          e.stopPropagation();
          const action = e.target.dataset.q;
          if (action === 'minus') input.value = Math.max(1, Number(input.value || 1) - 1);
          if (action === 'plus') input.value = Math.min(999, Number(input.value || 1) + 1);
          if (action === 'add') addToCart(product, input.value);
        });
        card.appendChild(controls);
      });
    });
  }

  async function changeCartItem(id, quantity) {
    const client = db();
    const qty = Number(quantity);
    if (qty <= 0) {
      const { error } = await client.from('catalogo_carrinho_itens').delete().eq('id', id);
      if (error) return notice(error.message, true);
    } else {
      const { error } = await client.from('catalogo_carrinho_itens').update({quantidade: qty}).eq('id', id);
      if (error) return notice(error.message, true);
    }
    await loadCart();
  }

  async function clearCart() {
    const client = db(), user = currentUser();
    if (!state.cart.length) {
      updateCartBadge();
      return notice('O carrinho já está vazio.');
    }
    if (!confirm('Deseja cancelar e esvaziar o carrinho?')) return;
    const { error } = await client.from('catalogo_carrinho_itens').delete().eq('cliente_identificador', user.id);
    if (error) return notice(error.message, true);
    state.cart = [];
    renderCart();
    notice('Pedido cancelado e carrinho esvaziado.');
  }

  function showSuccess(number) {
    const modal = $('orderSuccessModal');
    const numberEl = $('completedOrderNumber');
    if (numberEl) numberEl.textContent = number || '—';
    if (modal) {
      modal.classList.add('open');
      modal.setAttribute('aria-hidden', 'false');
      modal.style.display = 'grid';
    } else {
      alert(`Pedido ${number || ''} enviado com sucesso.`);
    }
  }

  async function finishOrder() {
    if (state.busy) return;
    const client = db(), user = currentUser();
    if (!state.cart.length) return notice('Inclua pelo menos um produto no carrinho.', true);
    state.busy = true;
    const btn = $('finishCartBtn');
    if (btn) btn.disabled = true;
    notice('Enviando pedido...');
    const { data, error } = await client.rpc('finalizar_carrinho_catalogo', {
      p_cliente_identificador: user.id,
      p_cliente_nome: user.name
    });
    state.busy = false;
    if (btn) btn.disabled = false;
    if (error) return notice(`Não foi possível finalizar: ${error.message}`, true);
    state.cart = [];
    renderCart();
    notice('Pedido enviado com sucesso.');
    showSuccess(data?.numero_pedido || data?.[0]?.numero_pedido || '');
    await loadOrders(false);
  }

  function timeline(status) {
    const keys = Object.keys(STATUS);
    const current = Math.max(0, keys.indexOf(status));
    return `<div class="order-timeline">${keys.map((key, index) =>
      `<div class="order-stage ${index <= current ? 'done' : ''} ${index === current ? 'current' : ''}">
        <span>${index + 1}</span><small>${STATUS[key]}</small>
      </div>`).join('')}</div>`;
  }

  async function loadOrders(markSeen=true) {
    const client = db(), user = currentUser(), target = $('ordersContent');
    if (!client || !target) return;
    let query = client.from('catalogo_pedidos')
      .select('id,numero_pedido,cliente_identificador,cliente_nome,status,status_versao,valor_total,created_at,updated_at,catalogo_pedido_itens(id,produto_nome,quantidade,valor_unitario,subtotal,ordem)')
      .order('created_at', {ascending:false});
    if (user.role !== 'admin') query = query.eq('cliente_identificador', user.id);
    const { data, error } = await query;
    if (error) {
      target.innerHTML = `<div class="panel"><div class="notice error">${esc(error.message)}</div></div>`;
      return;
    }
    state.orders = data || [];
    renderOrders();
    if (markSeen && user.role !== 'admin') await markOrdersSeen();
  }

  function renderOrders() {
    const target = $('ordersContent'), user = currentUser();
    if (!target) return;
    target.innerHTML = `<div class="panel">
      <div class="panel-head"><div><h3>${user.role === 'admin' ? 'Pedidos' : 'Meus pedidos'}</h3>
      <p class="muted">Acompanhe o andamento dos pedidos realizados.</p></div>
      <button type="button" class="outline-btn" id="refreshOrdersBtn">Atualizar</button></div>
      <div class="orders-list">${state.orders.length ? state.orders.map(order => {
        const items = (order.catalogo_pedido_itens || []).sort((a,b)=>Number(a.ordem)-Number(b.ordem));
        return `<article class="order-card" data-order-id="${esc(order.id)}">
          <div class="order-card-head"><div><strong>Pedido nº ${esc(order.numero_pedido)}</strong>
          <div class="shopping-list-meta"><span>${new Date(order.created_at).toLocaleString('pt-BR')}</span>
          ${user.role === 'admin' ? `<span>Cliente: ${esc(order.cliente_nome)}</span>` : ''}</div></div>
          <strong>${money(order.valor_total)}</strong></div>
          ${timeline(order.status)}
          <div class="order-items">${items.map(item =>
            `<div><span>${Number(item.quantidade)}× ${esc(item.produto_nome)}</span><strong>${money(item.subtotal)}</strong></div>`
          ).join('')}</div>
          ${user.role === 'admin' ? `<div class="order-admin-status">
            <label>Alterar status</label>
            <select data-order-status>${Object.entries(STATUS).map(([key,label]) =>
              `<option value="${key}" ${order.status===key?'selected':''}>${label}</option>`).join('')}</select>
            <button type="button" class="btn" data-action="save-order-status">Salvar status</button>
          </div>` : ''}
        </article>`;
      }).join('') : '<div class="shopping-empty muted">Nenhum pedido encontrado.</div>'}</div>
    </div>`;
    $('refreshOrdersBtn')?.addEventListener('click', () => loadOrders(true));
  }

  async function saveOrderStatus(card, button) {
    const client = db(), status = card.querySelector('[data-order-status]').value;
    button.disabled = true;
    const { error } = await client.rpc('atualizar_status_pedido', {
      p_pedido_id: card.dataset.orderId,
      p_novo_status: status
    });
    button.disabled = false;
    if (error) return alert(error.message);
    await loadOrders(false);
  }

  async function checkUnread() {
    const client = db(), user = currentUser();
    if (!client || user.role === 'admin') return showOrderBadge(false);
    const { data, error } = await client.rpc('cliente_tem_atualizacao_pedido', {
      p_cliente_identificador: user.id
    });
    if (!error) showOrderBadge(Boolean(data));
  }

  async function markOrdersSeen() {
    const client = db(), user = currentUser();
    const { error } = await client.rpc('marcar_pedidos_visualizados', {
      p_cliente_identificador: user.id
    });
    if (!error) showOrderBadge(false);
  }

  function bind() {
    $('cartView')?.addEventListener('click', async e => {
      const row = e.target.closest('.cart-item-row');
      const action = e.target.dataset.cartAction;
      if (!row || !action) return;
      const item = state.cart.find(i => String(i.id) === String(row.dataset.cartId));
      if (!item) return;
      if (action === 'remove') return changeCartItem(item.id, 0);
      if (action === 'minus') return changeCartItem(item.id, Math.max(1, Number(item.quantidade)-1));
      if (action === 'plus') return changeCartItem(item.id, Number(item.quantidade)+1);
    });
    $('cartView')?.addEventListener('change', e => {
      if (!e.target.matches('.cart-item-row input[type=number]')) return;
      const row = e.target.closest('.cart-item-row');
      changeCartItem(row.dataset.cartId, Math.max(1, Number(e.target.value)||1));
    });

    const replace = (id, handler) => {
      const old = $(id);
      if (!old) return;
      const fresh = old.cloneNode(true);
      old.replaceWith(fresh);
      fresh.addEventListener('click', e => { e.preventDefault(); e.stopImmediatePropagation(); handler(); }, true);
    };
    replace('clearCartBtn', clearCart);
    replace('finishCartBtn', finishOrder);

    $('ordersContent')?.addEventListener('click', e => {
      if (e.target.dataset.action === 'save-order-status') {
        const card = e.target.closest('.order-card');
        saveOrderStatus(card, e.target);
      }
    });

    $('closeOrderSuccessModal')?.addEventListener('click', () => {
      const modal = $('orderSuccessModal');
      modal?.classList.remove('open');
      if (modal) { modal.style.display='none'; modal.setAttribute('aria-hidden','true'); }
      document.querySelector('[data-tab="pedidos"]')?.click();
    });

    document.querySelectorAll('[data-tab]').forEach(btn => btn.addEventListener('click', () => {
      if (btn.dataset.tab === 'carrinho') loadCart();
      if (btn.dataset.tab === 'pedidos') loadOrders(true);
      if (btn.dataset.tab === 'dashboard' || btn.dataset.tab === 'produtos') setTimeout(injectControls, 50);
    }, true));
  }

  function realtime() {
    const client = db(), user = currentUser();
    if (!client?.channel) return;
    state.realtime.forEach(ch => client.removeChannel(ch));
    state.realtime = [];
    const cartChannel = client.channel(`cart-${user.id}`)
      .on('postgres_changes', {event:'*', schema:'public', table:'catalogo_carrinho_itens', filter:`cliente_identificador=eq.${user.id}`}, loadCart)
      .subscribe();
    const orderChannel = client.channel(`orders-${user.id}`)
      .on('postgres_changes', {event:'*', schema:'public', table:'catalogo_pedidos'}, async payload => {
        await loadOrders(false);
        await checkUnread();
      }).subscribe();
    state.realtime.push(cartChannel, orderChannel);
  }

  async function init() {
    if (state.initialized) return;
    state.initialized = true;
    ensureOrderBadge();
    bind();
    const observer = new MutationObserver(() => injectControls());
    observer.observe(document.body, {childList:true, subtree:true});
    await sleep(250);
    injectControls();
    await loadCart();
    await loadOrders(false);
    await checkUnread();
    realtime();
    setInterval(() => { loadCart(); checkUnread(); }, 15000);
  }

  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init();
})();
