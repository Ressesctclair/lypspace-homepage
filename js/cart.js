(function () {
  'use strict';

  const STORAGE_KEY = 'lypspace_cart';

  function getItems() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
    catch { return []; }
  }

  function setItems(items) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    _render();
  }

  function _esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function openCart() {
    document.getElementById('_crt-sidebar').classList.add('open');
    document.getElementById('_crt-overlay').classList.add('open');
    document.body.style.overflow = 'hidden';
    // Render PayPal after cart animation completes so element is visible
    setTimeout(function () {
      if (window.Cart.count() > 0) _renderPayPal();
    }, 350);
  }

  function closeCart() {
    document.getElementById('_crt-sidebar').classList.remove('open');
    document.getElementById('_crt-overlay').classList.remove('open');
    document.body.style.overflow = '';
  }

  function goCheckout() {
    if (!getItems().length) return;
    closeCart();
    location.href = '/checkout?cart=1';
  }

  function _render() {
    const n = window.Cart.count();
    document.querySelectorAll('._crt-badge').forEach(function (el) {
      el.textContent = n > 0 ? n : '';
      el.style.display = n > 0 ? 'inline-flex' : 'none';
    });

    const list = document.getElementById('_crt-items');
    if (!list) return;
    const items = getItems();

    if (!items.length) {
      list.innerHTML = '<p style="text-align:center;color:#6b6b6b;font-size:13px;padding:56px 0;">Your cart is empty</p>';
      document.getElementById('_crt-footer').style.display = 'none';
      return;
    }

    list.innerHTML = items.map(function (item, i) {
      return '<div style="display:flex;justify-content:space-between;align-items:flex-start;padding:16px 0;border-bottom:1px solid #e0e0e0;">' +
        '<div style="flex:1;min-width:0;padding-right:12px;">' +
          '<p style="font-size:13px;line-height:1.5;margin-bottom:4px;">' + _esc(item.name) + '</p>' +
          '<p style="font-size:13px;color:#6b6b6b;">$' + item.price.toFixed(2) + ' USD</p>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">' +
          '<button onclick="Cart.updateQty(' + i + ',' + (item.qty - 1) + ')" style="width:28px;height:28px;border:1px solid #e0e0e0;background:#fff;cursor:pointer;font-size:15px;line-height:1;font-family:inherit;">−</button>' +
          '<span style="font-size:13px;width:20px;text-align:center;">' + item.qty + '</span>' +
          '<button onclick="Cart.updateQty(' + i + ',' + (item.qty + 1) + ')" style="width:28px;height:28px;border:1px solid #e0e0e0;background:#fff;cursor:pointer;font-size:15px;line-height:1;font-family:inherit;">+</button>' +
          '<button onclick="Cart.remove(' + i + ')" style="width:28px;height:28px;border:none;background:none;cursor:pointer;color:#999;font-size:18px;line-height:1;margin-left:2px;font-family:inherit;">×</button>' +
        '</div>' +
      '</div>';
    }).join('');

    // Append OR + PayPal at bottom of items area
    list.innerHTML +=
      '<div style="padding:16px 0 8px;">' +
        '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">' +
          '<div style="flex:1;border-top:1px solid #e0e0e0;"></div>' +
          '<span style="font-size:11px;color:#999;letter-spacing:.06em;">OR</span>' +
          '<div style="flex:1;border-top:1px solid #e0e0e0;"></div>' +
        '</div>' +
        '<div id="_crt-paypal"></div>' +
      '</div>';

    document.getElementById('_crt-footer').style.display = 'block';
    document.getElementById('_crt-total').textContent = '$' + window.Cart.total().toFixed(2) + ' USD';
  }

  function _init() {
    var style = document.createElement('style');
    style.textContent =
      '#_crt-overlay{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1998;opacity:0;pointer-events:none;transition:opacity .25s;}' +
      '#_crt-overlay.open{opacity:1;pointer-events:all;}' +
      '#_crt-sidebar{position:fixed;top:0;right:0;width:400px;max-width:100vw;height:100%;background:#fff;z-index:1999;transform:translateX(100%);transition:transform .3s cubic-bezier(.4,0,.2,1);display:flex;flex-direction:column;box-shadow:-4px 0 20px rgba(0,0,0,.1);}' +
      '#_crt-sidebar.open{transform:translateX(0);}' +
      '#_crt-items{flex:1;overflow-y:auto;padding:0 24px;}' +
      '._crt-badge{background:#111;color:#fff;font-size:10px;border-radius:50%;width:17px;height:17px;display:none;align-items:center;justify-content:center;margin-left:4px;vertical-align:middle;font-weight:600;line-height:1;}';
    document.head.appendChild(style);

    var overlay = document.createElement('div');
    overlay.id = '_crt-overlay';
    overlay.addEventListener('click', closeCart);
    document.body.appendChild(overlay);

    var sidebar = document.createElement('div');
    sidebar.id = '_crt-sidebar';
    sidebar.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;padding:20px 24px;border-bottom:1px solid #e0e0e0;flex-shrink:0;">' +
        '<span style="font-size:12px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;">Cart</span>' +
        '<button onclick="Cart.close()" style="background:none;border:none;cursor:pointer;font-size:24px;color:#111;line-height:1;padding:0;font-family:inherit;">×</button>' +
      '</div>' +
      '<div id="_crt-items" style="flex:1;overflow-y:auto;padding:0 24px;"></div>' +
      '<div id="_crt-footer" style="padding:20px 24px;border-top:1px solid #e0e0e0;flex-shrink:0;display:none;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;font-size:13px;margin-bottom:16px;">' +
          '<span style="letter-spacing:.06em;text-transform:uppercase;">Total</span>' +
          '<span id="_crt-total" style="font-weight:600;font-size:15px;"></span>' +
        '</div>' +
        '<button onclick="Cart.goCheckout()" style="display:block;width:100%;padding:15px;background:#111;color:#fff;border:none;font-size:12px;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;font-family:inherit;transition:background .2s;" onmouseover="this.style.background=\'#333\'" onmouseout="this.style.background=\'#111\'">Checkout</button>' +
      '</div>';
    document.body.appendChild(sidebar);

    // Inject cart button into header
    var headerIcons = document.querySelector('.header-icons');
    if (headerIcons) {
      // Remove existing non-functional static cart button if any
      headerIcons.querySelectorAll('button').forEach(function (btn) {
        if (/cart/i.test(btn.textContent)) btn.remove();
      });
      var cartBtn = document.createElement('button');
      cartBtn.style.cssText = 'background:none;border:none;cursor:pointer;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#111;font-family:inherit;display:inline-flex;align-items:center;';
      cartBtn.innerHTML = 'Cart<span class="_crt-badge"></span>';
      cartBtn.addEventListener('click', openCart);
      headerIcons.appendChild(cartBtn);
    }

    _render();
  }

  var _paypalLoaded = false;
  var _paypalLoading = false;

  function _loadPayPal(cb) {
    if (_paypalLoaded) { cb(); return; }
    if (_paypalLoading) { document.addEventListener('_crt-paypal-ready', cb, { once: true }); return; }
    _paypalLoading = true;
    var s = document.createElement('script');
    s.src = 'https://www.paypal.com/sdk/js?client-id=AUmkFmI5PLrqaiashs6HaXJIj8aKsWWIcA18GvKpBXTmngf7-zs-qI8pbbb9IxuZgMwAqXuVhATx8O7-&currency=USD';
    s.onload = function () {
      _paypalLoaded = true;
      _paypalLoading = false;
      document.dispatchEvent(new Event('_crt-paypal-ready'));
      cb();
    };
    document.head.appendChild(s);
  }

  function _renderPayPal() {
    var container = document.getElementById('_crt-paypal');
    if (!container) return;
    container.innerHTML = '';
    _loadPayPal(function () {
      if (typeof paypal === 'undefined') return;
      paypal.Buttons({
        style: { layout: 'horizontal', color: 'gold', shape: 'rect', label: 'paypal', height: 45 },
        createOrder: function (data, actions) {
          var amount = window.Cart.total().toFixed(2);
          if (parseFloat(amount) <= 0) return;
          return actions.order.create({
            purchase_units: [{ amount: { value: amount, currency_code: 'USD' } }],
            application_context: { shipping_preference: 'NO_SHIPPING' },
          });
        },
        onApprove: function (data, actions) {
          return actions.order.capture().then(function (details) {
            window.Cart.clear();
            closeCart();
            var name = (details.payer && details.payer.name && details.payer.name.given_name) || '';
            alert('Payment successful! Thank you' + (name ? ', ' + name : '') + '.');
            location.href = '/?paypal=success';
          });
        },
        onError: function (err) {
          console.error('PayPal error', err);
          alert('PayPal payment failed, please try again.');
        },
      }).render('#_crt-paypal');
    });
  }

  window.Cart = {
    add: function (item) {
      var items = getItems();
      var key = item.price_id + '||' + item.name;
      var idx = items.findIndex(function (i) { return i._key === key; });
      if (idx >= 0) {
        items[idx].qty += (item.qty || 1);
      } else {
        items.push({ price_id: item.price_id, name: item.name, price: item.price, qty: item.qty || 1, _key: key });
      }
      setItems(items);
      openCart();
    },
    remove: function (idx) {
      var items = getItems();
      items.splice(idx, 1);
      setItems(items);
    },
    updateQty: function (idx, qty) {
      var items = getItems();
      if (qty < 1) { items.splice(idx, 1); }
      else { items[idx].qty = qty; }
      setItems(items);
    },
    count: function () {
      return getItems().reduce(function (s, i) { return s + i.qty; }, 0);
    },
    total: function () {
      return getItems().reduce(function (s, i) { return s + i.price * i.qty; }, 0);
    },
    getItems: getItems,
    clear: function () { setItems([]); },
    open: openCart,
    close: closeCart,
    goCheckout: goCheckout,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    _init();
  }
})();
