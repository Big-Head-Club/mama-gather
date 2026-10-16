/* The pad. One line in a game's <head> and a PlayStation controller plays it — including the
 * games that were written for a mouse and have never heard of a gamepad.
 *
 *   <script src="https://hundred-carts-production.up.railway.app/pad.js"></script>
 *
 * Same delivery as the tray: these are twenty-odd separate codebases and the only change that
 * lands in all of them is a change that is one script tag. So this file assumes nothing about
 * the game it drops into. It does not look for a canvas, a framework or an event bus. It
 * pretends to be the two input devices every one of those games already handles — a keyboard
 * and a mouse — and lets the game carry on believing that is what is plugged in.
 *
 *   d-pad / left stick  ->  arrow keys, with a real keyboard's auto-repeat
 *                           if the game does not take the arrows, WASD
 *                           if it does not take those either, walk the buttons on screen
 *   right stick         ->  a cursor, drawn on top, that hovers and clicks like a mouse
 *   cross              ->  press the focused thing, or click under the cursor
 *   circle             ->  Escape
 *
 * The fallback chain is the whole trick, and it is per keypress rather than decided once:
 * the arrow is dispatched first and `defaultPrevented` says whether the game wanted it. A game
 * that steers with arrows never sees the cursor; a daily puzzle made of <button>s gets focus
 * navigation it never wrote; a canvas that only listens for clicks gets a mouse. Nobody had to
 * be told apart by name.
 *
 * DualSense reports itself as "standard" mapping over USB and Bluetooth in Chrome, Edge and
 * Safari, so the indices below are the spec's, not Sony's, and a DualShock 4 or an Xbox pad
 * works the same. The PS button is claimed by macOS, so it is not bound to anything.
 *
 * Options, all on the script tag:
 *   data-keys="auto|arrows|wasd|none"   default auto: arrows, then WASD if the arrows fell through
 *   data-cursor="auto|on|off"           default auto: right stick always, left stick as last resort
 *   data-focus="auto|off"               default auto: walk focusable elements when keys fall through
 *   data-toast="off"                    do not say "controller connected"
 *   data-map='{"square":"z","l1":"q"}'  override the keys the face and shoulder buttons send
 *
 * And window.pad for a game that wants the stick itself: pad.stick('left') -> {x,y},
 * pad.button('r2') -> {pressed, value}, pad.on('press', fn), pad.rumble(strong, weak, ms).
 */
(function () {
  if (window.pad) return;

  var me = document.currentScript || document.querySelector('script[src*="pad.js"]');
  var opt = (me && me.dataset) || {};
  var MODE_KEYS = opt.keys || 'auto';
  var MODE_CURSOR = opt.cursor || 'auto';
  var MODE_FOCUS = opt.focus || 'auto';
  var BRAND = '#f2812f';

  // Standard mapping. Names are Sony's because that is the pad in the room, but index 0 is
  // "the bottom face button" on every pad the API calls standard.
  var BUTTONS = ['cross', 'circle', 'square', 'triangle', 'l1', 'r1', 'l2', 'r2',
                 'create', 'options', 'l3', 'r3', 'up', 'down', 'left', 'right', 'ps', 'touchpad'];

  // What a face or shoulder button types. Cross and circle are handled apart from this table
  // because they mean press and back, which is more than a keystroke. The rest are guesses that
  // suit an action game, and a game that disagrees passes data-map.
  var KEYMAP = { square: 'z', triangle: 'x', l1: 'q', r1: 'e', l2: 'Shift', r2: 'Control',
                 options: 'Escape', create: 'Tab' };
  try { if (opt.map) { var m = JSON.parse(opt.map); for (var k in m) KEYMAP[k] = m[k]; } } catch (e) {}

  var KEYS = {
    ArrowUp:    ['ArrowUp', 38, 'w', 87], ArrowDown:  ['ArrowDown', 40, 's', 83],
    ArrowLeft:  ['ArrowLeft', 37, 'a', 65], ArrowRight: ['ArrowRight', 39, 'd', 68],
  };
  var CODE = { z: 'KeyZ', x: 'KeyX', q: 'KeyQ', e: 'KeyE', w: 'KeyW', a: 'KeyA', s: 'KeyS',
               d: 'KeyD', Shift: 'ShiftLeft', Control: 'ControlLeft', Escape: 'Escape',
               Enter: 'Enter', Tab: 'Tab', ' ': 'Space' };
  var KEYCODE = { z: 90, x: 88, q: 81, e: 69, Shift: 16, Control: 17, Escape: 27, Enter: 13,
                  Tab: 9, ' ': 32 };

  var DEAD = 0.28;        // anything under this is the stick resting crooked, which they all do
  var PUSH = 0.55, LET_GO = 0.35;   // hysteresis, or a diagonal chatters between two directions
  var REPEAT_FIRST = 380, REPEAT_NEXT = 120;   // a keyboard's own auto-repeat, roughly
  var CURSOR_SPEED = 1000;          // px/s at full tilt, squared response for fine aim

  // ---- the parts that are drawn -------------------------------------------------------------
  // Shadow root, for the same reason the tray uses one: twenty stylesheets, and inheriting any
  // of them is breaking somewhere. pointer-events:none throughout — this layer is never a
  // target, it only ever points at the game underneath.
  var host = document.createElement('div');
  host.id = 'pad-layer';
  var root = host.attachShadow({ mode: 'open' });
  root.innerHTML =
    '<style>' +
    ':host{all:initial}' +
    '.layer{position:fixed;inset:0;z-index:2147483001;pointer-events:none;' +
      'font:400 11px/1 ui-monospace,"SF Mono",Menlo,Consolas,monospace;letter-spacing:.18em}' +
    /* The cursor is a ring rather than an arrow: it sits over other people's art and a ring
       shows what is under it. White outside, brand inside, so it holds on light and dark. */
    '.cur{position:absolute;left:0;top:0;width:26px;height:26px;margin:-13px 0 0 -13px;' +
      'border-radius:50%;border:2px solid #fff;background:' + BRAND + '55;' +
      'box-shadow:0 0 0 1.5px rgba(0,0,0,.55),0 2px 10px rgba(0,0,0,.45);' +
      'opacity:0;transition:opacity .12s ease,transform .09s ease}' +
    '.cur::after{content:"";position:absolute;left:50%;top:50%;width:4px;height:4px;' +
      'margin:-2px 0 0 -2px;border-radius:50%;background:#fff}' +
    '.cur.on{opacity:1}' +
    '.cur.hit{transform:scale(.72)}' +
    /* Games style their own :focus, or forget to. Drawing the ring here means the highlight
       looks the same in all of them and none of them had to add a rule. */
    '.ring{position:absolute;border-radius:10px;border:2px solid ' + BRAND + ';' +
      'box-shadow:0 0 0 2px rgba(0,0,0,.5),0 0 14px ' + BRAND + '99;' +
      'opacity:0;transition:opacity .12s ease,left .09s ease,top .09s ease,' +
      'width .09s ease,height .09s ease}' +
    '.ring.on{opacity:1}' +
    '.toast{position:absolute;left:50%;bottom:26px;transform:translateX(-50%);' +
      'padding:9px 14px;border-radius:999px;color:#ded6cb;' +
      'background:rgba(14,12,10,.78);border-left:2px solid ' + BRAND + ';' +
      '-webkit-backdrop-filter:blur(9px);backdrop-filter:blur(9px);' +
      'opacity:0;transition:opacity .3s ease}' +
    '.toast.on{opacity:1}' +
    '@media (prefers-reduced-motion:reduce){.cur,.ring,.toast{transition:none}}' +
    '</style>' +
    '<div class="layer"><div class="cur"></div><div class="ring"></div><div class="toast"></div></div>';
  var elCur = root.querySelector('.cur'), elRing = root.querySelector('.ring'),
      elToast = root.querySelector('.toast');

  function mount() { (document.body || document.documentElement).appendChild(host); }
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);

  var toastTimer;
  function toast(msg) {
    if (opt.toast === 'off') return;
    elToast.textContent = msg;
    elToast.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { elToast.classList.remove('on'); }, 2200);
  }

  // ---- synthetic keyboard -------------------------------------------------------------------
  // keyCode is dead and half these games read it anyway, so it gets defined on the way out.
  function keyEvent(type, key, code, kc, repeat) {
    var e = new KeyboardEvent(type, { key: key, code: code, bubbles: true, cancelable: true,
                                      composed: true, view: window, repeat: !!repeat });
    try {
      Object.defineProperty(e, 'keyCode', { get: function () { return kc; } });
      Object.defineProperty(e, 'which', { get: function () { return kc; } });
    } catch (err) {}
    return e;
  }

  function target() {
    var a = document.activeElement;
    return (a && a !== document.body && a.isConnected) ? a : (document.body || document.documentElement);
  }

  // true if something took it
  function sendKey(type, key, repeat) {
    var code = CODE[key] || ('Key' + key.toUpperCase());
    var kc = KEYCODE[key] != null ? KEYCODE[key] : key.toUpperCase().charCodeAt(0);
    if (KEYS[key]) { code = key; kc = KEYS[key][1]; }
    var e = keyEvent(type, key, code, kc, repeat);
    target().dispatchEvent(e);
    return e.defaultPrevented;
  }

  function typing() {
    var a = document.activeElement;
    if (!a) return false;
    var t = (a.tagName || '').toLowerCase();
    return t === 'input' || t === 'textarea' || t === 'select' || a.isContentEditable;
  }

  // ---- focus navigation ---------------------------------------------------------------------
  var FOCUSABLE = 'a[href],button,input,select,textarea,summary,[tabindex],[role="button"],' +
                  '[role="link"],[role="tab"],[role="option"],[role="menuitem"],[role="checkbox"]';

  function candidates() {
    var out = [], all = document.querySelectorAll(FOCUSABLE);
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (el.disabled || el.getAttribute('aria-hidden') === 'true') continue;
      if (el.getAttribute('tabindex') === '-1') continue;
      var r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) continue;
      // off screen by more than a screen in any direction is a different page, not a neighbour
      if (r.bottom < -innerHeight || r.top > innerHeight * 2) continue;
      var cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) continue;
      var mx = r.left + r.width / 2, my = r.top + r.height / 2;
      // A sheet over the board does not hide what is under it from querySelectorAll, and these
      // games are full of sheets — the result screen, the rules, the crew. Walking the focus
      // onto a button behind one presses a thing the player cannot see. Whatever is actually on
      // top at the middle of the element has to be the element, or part of it.
      if (mx >= 0 && my >= 0 && mx <= innerWidth && my <= innerHeight) {
        var top = document.elementFromPoint(mx, my);
        if (top && top !== el && !el.contains(top) && !top.contains(el)) continue;
      }
      out.push({ el: el, r: r, cx: mx, cy: my });
    }
    return out;
  }

  // Spatial navigation: of everything in the direction pressed, the nearest, with sideways
  // drift counted double so a straight-ahead neighbour beats a closer one off to the side.
  function navigate(dir) {
    var list = candidates();
    if (!list.length) return false;
    var a = document.activeElement, from = null;
    for (var i = 0; i < list.length; i++) if (list[i].el === a) from = list[i];
    if (!from) {   // nothing focused yet: start at whatever is nearest the middle of the screen
      var best = null, bd = Infinity;
      for (var j = 0; j < list.length; j++) {
        var d = Math.abs(list[j].cy - innerHeight / 2) + Math.abs(list[j].cx - innerWidth / 2);
        if (d < bd) { bd = d; best = list[j]; }
      }
      return focusOn(best);
    }
    var ax = { ArrowLeft: -1, ArrowRight: 1 }[dir] || 0;
    var ay = { ArrowUp: -1, ArrowDown: 1 }[dir] || 0;
    var pick = null, score = Infinity;
    for (var n = 0; n < list.length; n++) {
      var c = list[n];
      if (c === from) continue;
      var dx = c.cx - from.cx, dy = c.cy - from.cy;
      var along = dx * ax + dy * ay, across = Math.abs(dx * ay + dy * ax);
      if (along <= 2) continue;                       // behind us or level: not in this direction
      var s = along + across * 2;
      if (s < score) { score = s; pick = c; }
    }
    return pick ? focusOn(pick) : false;
  }

  function focusOn(c) {
    if (!c) return false;
    // Walking the focus is a different device from pointing, and whichever was used last is the
    // one the player means. Leave the cursor up and cross goes on clicking whatever happens to
    // be under it, which is not the button they just walked to.
    showCursor(false);
    try { c.el.focus({ preventScroll: true }); } catch (e) { try { c.el.focus(); } catch (e2) {} }
    if (document.activeElement !== c.el) {           // not focusable, so remember it ourselves
      manual = c.el;
    } else manual = null;
    var r = c.el.getBoundingClientRect();
    if (r.top < 8 || r.bottom > innerHeight - 8) {
      c.el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    padActive(true);
    return true;
  }

  var manual = null;     // focused-by-us element that the DOM refused to focus
  function focused() {
    var a = document.activeElement;
    if (a && a !== document.body && a.isConnected) return a;
    return manual && manual.isConnected ? manual : null;
  }

  function paintRing() {
    var el = focused();
    if (!el || !usingPad) { elRing.classList.remove('on'); return; }
    var r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) { elRing.classList.remove('on'); return; }
    elRing.style.left = (r.left - 3) + 'px';
    elRing.style.top = (r.top - 3) + 'px';
    elRing.style.width = (r.width + 6) + 'px';
    elRing.style.height = (r.height + 6) + 'px';
    elRing.classList.add('on');
  }

  // ---- synthetic mouse ----------------------------------------------------------------------
  var cx = innerWidth / 2, cy = innerHeight / 2, curOn = false, hovered = null;

  function showCursor(on) {
    curOn = on && MODE_CURSOR !== 'off';
    elCur.classList.toggle('on', curOn);
  }

  function placeCursor() {
    elCur.style.transform = 'translate(' + cx + 'px,' + cy + 'px)';
  }

  function mouseInit(type, extra) {
    var o = { bubbles: true, cancelable: true, composed: true, view: window,
              clientX: cx, clientY: cy, screenX: cx, screenY: cy, button: 0, buttons: 0,
              pointerId: 1, pointerType: 'mouse', isPrimary: true, width: 1, height: 1,
              pressure: 0, detail: 1 };
    for (var k in extra) o[k] = extra[k];
    return o;
  }
  function pointer(type, el, extra) {
    if (!el) return;
    var init = mouseInit(type, extra);
    el.dispatchEvent(window.PointerEvent ? new PointerEvent(type, init) : new MouseEvent(type, init));
  }
  function mouse(type, el, extra) {
    if (!el) return;
    el.dispatchEvent(new MouseEvent(type, mouseInit(type, extra)));
  }

  function under() { return document.elementFromPoint(cx, cy); }

  // Hover has to be maintained by hand: a page that lights a tile up on mouseover is a page
  // where nothing happens if we only ever send clicks.
  function hover() {
    var el = under();
    if (el === hovered) { if (el) { pointer('pointermove', el); mouse('mousemove', el); } return; }
    if (hovered && hovered.isConnected) {
      pointer('pointerout', hovered); pointer('pointerleave', hovered);
      mouse('mouseout', hovered); mouse('mouseleave', hovered);
    }
    hovered = el;
    if (el) {
      pointer('pointerover', el); pointer('pointerenter', el);
      mouse('mouseover', el); mouse('mouseenter', el);
      pointer('pointermove', el); mouse('mousemove', el);
    }
  }

  // The order a real mouse fires in. Games listen at every one of these points — some on
  // pointerdown for the snap, some on click — so all of them go out.
  function clickAt() {
    var el = under();
    if (!el) return false;
    elCur.classList.add('hit');
    setTimeout(function () { elCur.classList.remove('hit'); }, 100);
    pointer('pointerdown', el, { pressure: 0.5, buttons: 1 });
    mouse('mousedown', el, { buttons: 1 });
    try { if (el.focus) el.focus({ preventScroll: true }); } catch (e) {}
    pointer('pointerup', el, { buttons: 0 });
    mouse('mouseup', el);
    mouse('click', el);
    return true;
  }

  // ---- what a direction means, in order -----------------------------------------------------
  function press(dir, repeat) {
    if (MODE_KEYS === 'none') return moveByStep(dir);
    if (sendKey('keydown', dir, repeat)) return;                   // the game steers with arrows
    if (typing()) return;                                          // a text field owns the keys
    if (MODE_KEYS === 'auto' || MODE_KEYS === 'wasd') {
      if (sendKey('keydown', KEYS[dir][2], repeat)) return;        // ...or with WASD
    }
    if (MODE_FOCUS !== 'off' && navigate(dir)) return;             // ...or it is a page of buttons
    // Pushing past the last button in a row is not a request for a mouse. Handing over to the
    // cursor here is worse than doing nothing, because the cursor then owns cross and the
    // button the player is sitting on stops responding to it.
    if (focused()) return;
    moveByStep(dir);                                               // ...or there is nothing to do
  }

  function release(dir) {
    if (MODE_KEYS === 'none') return;
    sendKey('keyup', dir);
    if (MODE_KEYS === 'auto' || MODE_KEYS === 'wasd') sendKey('keyup', KEYS[dir][2]);
  }

  // Last resort for a canvas game with no buttons and no keys: nudge the cursor, so the stick
  // is never simply dead.
  function moveByStep(dir) {
    if (MODE_CURSOR === 'off') return;
    var step = 40;
    cx = clamp(cx + ({ ArrowLeft: -step, ArrowRight: step }[dir] || 0), 2, innerWidth - 2);
    cy = clamp(cy + ({ ArrowUp: -step, ArrowDown: step }[dir] || 0), 2, innerHeight - 2);
    showCursor(true); placeCursor(); hover();
  }

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  // ---- the loop -------------------------------------------------------------------------------
  var held = {};            // direction -> {next: when the next auto-repeat is due}
  var down = {};            // button name -> true
  var pad = null, usingPad = false, last = 0, listeners = {};

  function emit(name, a, b) {
    var l = listeners[name];
    if (l) for (var i = 0; i < l.length; i++) { try { l[i](a, b); } catch (e) {} }
  }

  function padActive(on) {
    if (usingPad === on) return;
    usingPad = on;
    if (!on) { showCursor(false); elRing.classList.remove('on'); }
  }

  // A real mouse arriving wins: the drawn cursor gets out of the way rather than leaving two
  // pointers on screen, and comes back the moment a stick moves.
  addEventListener('mousemove', function (e) {
    if (e.isTrusted) { padActive(false); }
  }, true);

  function current() {
    var list = navigator.getGamepads ? navigator.getGamepads() : [];
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].connected) return list[i];
    return null;
  }

  function axis(g, i) { var v = g.axes[i] || 0; return Math.abs(v) < DEAD ? 0 : v; }

  function frame(t) {
    requestAnimationFrame(frame);
    var g = current();
    pad = g;
    if (!g) return;
    var dt = Math.min(0.05, (t - last) / 1000 || 0); last = t;

    // --- directions: d-pad or left stick, whichever is further over
    var lx = axis(g, 0), ly = axis(g, 1);
    var bx = btn(g, 15) - btn(g, 14), by = btn(g, 13) - btn(g, 12);
    var dx = Math.abs(bx) > Math.abs(lx) ? bx : lx;
    var dy = Math.abs(by) > Math.abs(ly) ? by : ly;
    step('ArrowLeft', -dx, t); step('ArrowRight', dx, t);
    step('ArrowUp', -dy, t); step('ArrowDown', dy, t);

    // --- the cursor: right stick, always, squared for fine aim near the middle
    var rx = axis(g, 2), ry = axis(g, 3);
    if (MODE_CURSOR !== 'off' && (rx || ry)) {
      padActive(true); showCursor(true);
      cx = clamp(cx + Math.sign(rx) * rx * rx * CURSOR_SPEED * dt, 2, innerWidth - 2);
      cy = clamp(cy + Math.sign(ry) * ry * ry * CURSOR_SPEED * dt, 2, innerHeight - 2);
      placeCursor(); hover();
      // a long page is unreachable otherwise: push into the edge and it scrolls
      if (cy > innerHeight - 40 && ry > 0) scrollBy(0, 12);
      if (cy < 40 && ry < 0) scrollBy(0, -12);
    }

    // --- buttons
    for (var i = 0; i < BUTTONS.length; i++) {
      var name = BUTTONS[i], on = btn(g, i) > 0.5;
      if (on === !!down[name]) continue;
      down[name] = on;
      padActive(true);
      emit(on ? 'press' : 'release', name, g.buttons[i] ? g.buttons[i].value : (on ? 1 : 0));
      if (on) buttonDown(name); else buttonUp(name);
    }
    paintRing();
  }

  function btn(g, i) { var b = g.buttons[i]; return b ? (b.value || (b.pressed ? 1 : 0)) : 0; }

  function step(dir, v, t) {
    var h = held[dir];
    if (v >= PUSH) {
      if (!h) { held[dir] = { next: t + REPEAT_FIRST }; padActive(true); press(dir, false); }
      else if (t >= h.next) { h.next = t + REPEAT_NEXT; press(dir, true); }
    } else if (h && v < LET_GO) {
      held[dir] = null; release(dir);
    }
  }

  function buttonDown(name) {
    if (name === 'cross') return confirm_();
    if (name === 'circle') { sendKey('keydown', 'Escape'); return; }
    if (name === 'ps') return;                      // macOS takes this one
    var key = KEYMAP[name];
    if (key) sendKey('keydown', key);
  }

  function buttonUp(name) {
    if (name === 'cross') { sendKey('keyup', 'Enter'); sendKey('keyup', ' '); return; }
    if (name === 'circle') { sendKey('keyup', 'Escape'); return; }
    var key = KEYMAP[name];
    if (key) sendKey('keyup', key);
  }

  // Cross is "do the thing in front of me", and what that is depends on which of the three
  // modes the game put us in. Cursor showing: click under it. Something focused: press it.
  // Neither: send the keys and let the game decide.
  function confirm_() {
    if (curOn) { clickAt(); return; }
    var el = focused();
    if (el) {
      if (sendKey('keydown', 'Enter')) return;
      if (el.tagName === 'INPUT' || el.tagName === 'BUTTON' || el.tagName === 'A' ||
          el.getAttribute('role') === 'button' || el.onclick || typeof el.click === 'function') {
        try { el.click(); return; } catch (e) {}
      }
    }
    if (sendKey('keydown', 'Enter')) return;
    sendKey('keydown', ' ');
  }

  addEventListener('gamepadconnected', function (e) {
    var id = (e.gamepad && e.gamepad.id) || '';
    toast(/dualsense|054c|sony|dualshock|wireless controller/i.test(id) ? 'DualSense connected'
                                                                       : 'Controller connected');
    padActive(true);
    emit('connect', e.gamepad);
  });
  addEventListener('gamepaddisconnected', function (e) {
    for (var d in held) if (held[d]) { held[d] = null; release(d); }
    for (var b in down) if (down[b]) { down[b] = false; buttonUp(b); }
    padActive(false);
    emit('disconnect', e.gamepad);
  });
  addEventListener('resize', function () {
    cx = clamp(cx, 2, innerWidth - 2); cy = clamp(cy, 2, innerHeight - 2); placeCursor();
  });

  placeCursor();
  requestAnimationFrame(frame);

  // ---- for a game that wants the stick itself -------------------------------------------------
  window.pad = {
    get connected() { return !!current(); },
    get id() { var g = current(); return g ? g.id : null; },
    stick: function (which) {
      var g = current(); if (!g) return { x: 0, y: 0 };
      var i = which === 'right' ? 2 : 0;
      return { x: axis(g, i), y: axis(g, i + 1) };
    },
    button: function (name) {
      var g = current(), i = BUTTONS.indexOf(name);
      if (!g || i < 0 || !g.buttons[i]) return { pressed: false, value: 0 };
      return { pressed: g.buttons[i].pressed, value: g.buttons[i].value };
    },
    buttons: BUTTONS,
    on: function (evt, fn) { (listeners[evt] = listeners[evt] || []).push(fn); return this; },
    off: function (evt, fn) {
      var l = listeners[evt]; if (!l) return this;
      listeners[evt] = l.filter(function (f) { return f !== fn; }); return this;
    },
    // DualSense rumble is the plain dual-rumble effect in Chrome; Safari has no actuator, so
    // this is a no-op there rather than a throw.
    rumble: function (strong, weak, ms) {
      var g = current(), a = g && (g.vibrationActuator || (g.hapticActuators || [])[0]);
      if (!a || !a.playEffect) return Promise.resolve(false);
      return a.playEffect('dual-rumble', {
        duration: ms || 200, strongMagnitude: strong == null ? 0.6 : strong,
        weakMagnitude: weak == null ? 0.3 : weak, startDelay: 0,
      }).then(function () { return true; }, function () { return false; });
    },
    cursor: {
      // a game that draws its own pointer wants to know whether ours is up
      get visible() { return curOn; },
      at: function () { return { x: cx, y: cy }; },
      show: function () { padActive(true); showCursor(true); placeCursor(); },
      hide: function () { showCursor(false); },
      move: function (x, y) { cx = clamp(x, 2, innerWidth - 2); cy = clamp(y, 2, innerHeight - 2); placeCursor(); },
    },
    map: function (o) { for (var k in o) KEYMAP[k] = o[k]; return this; },
  };
})();
