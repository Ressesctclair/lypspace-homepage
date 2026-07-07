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
    if (items.length > 0) {
      _renderPayments();
      _loadStripe(_initStripeExpress);
      _updateStripeAmount();
    }
  }

  function _esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function openCart() {
    var sidebar = document.getElementById('_crt-sidebar');
    document.getElementById('_crt-overlay').classList.add('open');
    document.body.style.overflow = 'hidden';
    if (window.Cart.count() > 0) {
      _renderPayments();
      _updateStripeAmount();
    }
    sidebar.classList.remove('preloading');
    void sidebar.offsetWidth;
    sidebar.classList.add('open');
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

    document.getElementById('_crt-footer').style.display = 'block';
    document.getElementById('_crt-total').textContent = '$' + window.Cart.total().toFixed(2) + ' USD';
  }

  function _init() {
    var style = document.createElement('style');
    style.textContent =
      '#_crt-overlay{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1998;opacity:0;pointer-events:none;transition:opacity .25s;}' +
      '#_crt-overlay.open{opacity:1;pointer-events:all;}' +
      '#_crt-sidebar{position:fixed;top:0;right:0;width:400px;max-width:100vw;height:100vh;height:100dvh;background:#fff;z-index:1999;transform:translateX(100%);transition:transform .3s cubic-bezier(.4,0,.2,1);display:flex;flex-direction:column;overflow:hidden;box-shadow:-4px 0 20px rgba(0,0,0,.1);}' +
      '#_crt-sidebar.open{transform:translateX(0);}' +
      '#_crt-sidebar.preloading{transform:none!important;opacity:0!important;pointer-events:none!important;z-index:-1!important;transition:none!important;}' +
      '#_crt-items{flex:1;min-height:0;overflow-y:auto;padding:0 24px;}' +
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
        '<div style="margin-top:12px;">' +
          '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">' +
            '<div style="flex:1;border-top:1px solid #e0e0e0;"></div>' +
            '<span style="font-size:11px;color:#999;letter-spacing:.06em;">OR</span>' +
            '<div style="flex:1;border-top:1px solid #e0e0e0;"></div>' +
          '</div>' +
          '<div id="_crt-paypal"></div>' +
          '<div id="_crt-stripe" style="margin-top:8px;"></div>' +
        '</div>' +
      '</div>';
    sidebar.classList.add('preloading');
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
    _loadStripe(function () {});  // preload SDK early so it's ready when first item is added
    _loadPayPal(function () {});
    if (window.Cart.count() > 0) {
      _renderPayments();
      _loadStripe(_initStripeExpress);  // returning visitor: items already in cart, init now
    }
  }

  var _lastPaymentTotal = -1;

  function _renderPayments() {
    var total = window.Cart.total();
    if (total <= 0) return;
    if (total === _lastPaymentTotal) return;
    _lastPaymentTotal = total;
    _renderPayPal();
    // Stripe Express Checkout is rendered separately in openCart() so it mounts
    // in a visible container — mounting while sidebar is off-screen (translateX 100%)
    // causes Stripe to fail detecting Apple Pay / Link / Amazon Pay.
  }

  var _paypalLoaded = false;
  var _paypalLoading = false;

  function _loadPayPal(cb) {
    if (_paypalLoaded) { cb(); return; }
    if (_paypalLoading) { document.addEventListener('_crt-paypal-ready', cb, { once: true }); return; }
    _paypalLoading = true;
    var s = document.createElement('script');
    s.src = 'https://www.paypal.com/sdk/js?client-id=AbzZAwXFIFXZejrP_WdyL92tc2UUciabwIaRwqh9LJcUQKESNg_-QfVQ9nHnf4bfbGScrH6Iv_6CGhk_&currency=USD';
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

  var _stripeLoaded = false;
  var _stripeLoading = false;

  function _loadStripe(cb) {
    if (_stripeLoaded) { cb(); return; }
    if (_stripeLoading) { document.addEventListener('_crt-stripe-ready', cb, { once: true }); return; }
    _stripeLoading = true;
    var s = document.createElement('script');
    s.src = 'https://js.stripe.com/v3/';
    s.onload = function () {
      _stripeLoaded = true;
      _stripeLoading = false;
      document.dispatchEvent(new Event('_crt-stripe-ready'));
      cb();
    };
    document.head.appendChild(s);
  }

  var _stripeInstance = null;
  var _stripeElements = null;
  var _stripeExpressAmount = -1;

  function _initStripeExpress() {
    if (_stripeElements) return;
    var container = document.getElementById('_crt-stripe');
    if (!container) return;
    var initAmount = Math.max(Math.round(window.Cart.total() * 100), 100);
    _stripeInstance = Stripe('pk_live_51SV6CM4IZcEaiWjkmNbTeM0bdf5FBh1upPyZOcns3jMR78rmUMnGroBhD1jzQzHJpS3B5oaaSKaagynJsEaGZWFT00fEX6D4sF');
    _stripeElements = _stripeInstance.elements({ mode: 'payment', amount: initAmount, currency: 'usd' });
    var expressEl = _stripeElements.create('expressCheckout', { buttonHeight: 44 });
    expressEl.mount('#_crt-stripe');
    _stripeExpressAmount = initAmount;
    expressEl.on('confirm', function () {
      var currentAmount = window.Cart.total();
      _stripeElements.submit().then(function (result) {
        if (result.error) { console.error(result.error); return; }
        fetch('https://pro.lypspace.digital/api/payment-intent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount: currentAmount }),
        })
          .then(function (r) { return r.json(); })
          .then(function (data) {
            return _stripeInstance.confirmPayment({
              elements: _stripeElements,
              clientSecret: data.clientSecret,
              confirmParams: { return_url: window.location.origin + '/?payment=success' },
            });
          })
          .then(function (result) {
            if (result && result.error) console.error(result.error);
          })
          .catch(function (err) { console.error('Stripe error', err); });
      });
    });
  }

  function _updateStripeAmount() {
    if (!_stripeElements) return;
    var amount = Math.round(window.Cart.total() * 100);
    if (amount <= 0 || amount === _stripeExpressAmount) return;
    _stripeExpressAmount = amount;
    _stripeElements.update({ amount: amount });
  }

  window.Cart = {
    add: function (item) {
      var items = getItems();
      var key = item.price_id + '||' + item.name;
      var idx = items.findIndex(function (i) { return i._key === key; });
      if (idx >= 0) {
        items[idx].qty += (item.qty || 1);
        items[idx].price = item.price;
        items[idx].handle = item.handle;
      } else {
        items.push({ price_id: item.price_id, handle: item.handle, name: item.name, price: item.price, qty: item.qty || 1, _key: key });
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

  function _initInstagramBanner() {
    if (!/Instagram|YouTube|FBAN|FB_IAB|TikTok|Twitter/i.test(navigator.userAgent)) return;
    if (sessionStorage.getItem('_igb_dismissed')) return;

    var banner = document.createElement('div');
    banner.id = '_igb-banner';
    banner.style.cssText =
      'position:fixed;bottom:0;left:0;right:0;background:#111;color:#fff;' +
      'padding:14px 16px;z-index:9999;display:flex;align-items:center;gap:12px;' +
      'font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:13px;' +
      'box-shadow:0 -2px 12px rgba(0,0,0,.3);';
    banner.innerHTML =
      '<div style="flex:1;line-height:1.5;">Apple Pay · Link · Amazon Pay 需要在 <strong>Safari</strong> 中使用</div>' +
      '<button id="_igb-open" style="background:#fff;color:#111;border:none;padding:9px 14px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;border-radius:4px;font-family:inherit;">在 Safari 打开</button>' +
      '<button id="_igb-close" style="background:none;border:none;color:#aaa;font-size:22px;cursor:pointer;padding:0 4px;line-height:1;font-family:inherit;">×</button>';
    document.body.appendChild(banner);

    document.getElementById('_igb-open').addEventListener('click', function () {
      var url = window.location.href;
      window.location = url.replace(/^https:\/\//, 'x-safari-https://').replace(/^http:\/\//, 'x-safari-http://');
    });
    document.getElementById('_igb-close').addEventListener('click', function () {
      banner.remove();
      sessionStorage.setItem('_igb_dismissed', '1');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { _init(); _initInstagramBanner(); });
  } else {
    _init();
    _initInstagramBanner();
  }
})();
