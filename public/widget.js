/*
 * Landmark AI Answer widget.
 * Embed on Webflow (Site settings -> Custom code -> Footer):
 *
 *   <script src="https://YOUR-APP.vercel.app/widget.js" defer
 *     data-endpoint="https://YOUR-APP.vercel.app/api/ask"
 *     data-input="input[type=search], .search-input"
 *     data-target=".search-results, [data-ai-answer]"></script>
 *
 * data-input : CSS selector for the search box to listen to.
 * data-target: CSS selector for the element the answer card is inserted BEFORE.
 * Also exposed as window.LandmarkAI.ask(question) for custom wiring.
 */
(function () {
  var script = document.currentScript;
  var ENDPOINT = (script && script.getAttribute("data-endpoint")) || "/api/ask";
  var STREAM_ENDPOINT = ENDPOINT.replace(/\/+$/, "") + "/stream";
  var INPUT_SEL = (script && script.getAttribute("data-input")) || 'input[type="search"]';
  var TARGET_SEL = (script && script.getAttribute("data-target")) || "[data-ai-answer]";

  // Styled with the site's Lumos design tokens (falls back to the same values).
  var css =
    ".lai-card{font-family:var(--_typography---font--primary-family,Gotham,Arial,sans-serif);" +
    "padding:var(--_spacing---space--6,1.5rem);" +
    "margin:0 0 var(--_spacing---space--6,1.5rem);" +
    "background:var(--swatch--brand-100,#d6e6ff);color:var(--swatch--dark-900,#070b12);position:relative}" +
    ".lai-topright{position:absolute;top:var(--_spacing---space--6,1.5rem);right:var(--_spacing---space--6,1.5rem)}" +
    ".lai-topright button{background:none;border:none;padding:.25rem 0;cursor:pointer;font-family:inherit;font-size:.7rem;" +
    "letter-spacing:.06em;text-transform:uppercase;color:#7c8494;transition:color .2s}" +
    ".lai-topright button:hover{color:var(--swatch--dark-700,#1b2f53)}" +
    ".lai-card.lai-collapsed .lai-topright{top:50%;transform:translateY(-50%)}" +
    ".lai-body{display:grid;grid-template-rows:1fr;transition:grid-template-rows .45s ease}" +
    ".lai-body-inner{overflow:hidden;min-height:0}" +
    ".lai-card.lai-collapsed .lai-body{grid-template-rows:0fr}" +
    ".lai-fb{margin-top:var(--_spacing---space--4,1rem)}" +
    ".lai-fb textarea{width:100%;box-sizing:border-box;min-height:5rem;padding:.75rem;border:1px solid var(--swatch--dark-900-o20,rgba(7,11,18,.2));" +
    "border-radius:var(--radius--xsmall,.5rem);font-family:inherit;font-size:.9375rem;color:var(--swatch--dark-900,#070b12);background:var(--swatch--light-100,#fff);resize:vertical}" +
    ".lai-fb-row{display:flex;gap:.75rem;margin-top:.625rem;align-items:center}" +
    ".lai-fb-note{font-size:.8125rem;color:#7c8494}" +
    ".lai-card.lai-collapsed .lai-label{margin-bottom:0}" +
    ".lai-footer{display:flex;justify-content:space-between;align-items:baseline;gap:1rem;flex-wrap:wrap;" +
    "margin-top:var(--_spacing---space--3,.875rem);font-size:.75rem;color:#7c8494}" +
    ".lai-footer .lai-feedback{background:none;border:none;padding:0;cursor:pointer;font-family:inherit;" +
    "font-size:.75rem;letter-spacing:.04em;text-transform:uppercase;color:var(--swatch--brand-500,#3083fd);" +
    "white-space:nowrap;transition:color .2s}" +
    ".lai-footer .lai-feedback:hover{color:var(--swatch--dark-700,#1b2f53);text-decoration:underline}" +
    ".lai-label{display:flex;align-items:center;gap:.5rem;font-size:.75rem;letter-spacing:.08em;" +
    "text-transform:uppercase;color:var(--swatch--brand-500,#3083fd);" +
    "font-weight:var(--_typography---font--primary-medium,500);margin-bottom:var(--_spacing---space--3,.875rem)}" +
    ".lai-answer{font-size:var(--_typography---font-size--text-main,1rem);line-height:1.6;color:var(--swatch--dark-900,#070b12)}" +
    ".lai-answer p{margin:0 0 1.25rem}" +
    ".lai-answer p:last-child{margin-bottom:0}" +
    ".lai-answer a{color:var(--swatch--brand-500,#3083fd);text-decoration:underline;transition:color .2s}" +
    ".lai-answer a:hover{color:var(--swatch--dark-700,#1b2f53)}" +
    ".lai-answer b{font-weight:var(--_typography---font--primary-bold,700)}" +
    ".lai-sources{margin-top:var(--_spacing---space--4,1rem);padding-top:var(--_spacing---space--3,.875rem);" +
    "border-top:1px solid var(--swatch--dark-900-o20,rgba(7,11,18,.12));font-size:.875rem;color:#7c8494}" +
    ".lai-sources a{color:var(--swatch--brand-500,#3083fd);margin-right:.875rem;text-decoration:none;transition:color .2s}" +
    ".lai-sources a:hover{color:var(--swatch--dark-700,#1b2f53);text-decoration:underline}" +
    ".lai-deeper{margin-top:.5rem;font-size:.875rem;color:#7c8494}" +
    ".lai-deeper a{color:var(--swatch--brand-500,#3083fd);text-decoration:none;transition:color .2s}" +
    ".lai-deeper a:hover{color:var(--swatch--dark-700,#1b2f53);text-decoration:underline}" +
    ".lai-actions{display:flex;flex-wrap:wrap;gap:var(--_spacing---space--3,.875rem);align-items:flex-start;margin-top:var(--_spacing---space--4,1rem)}" +
    ".lai-btn{display:inline-flex;align-items:center;gap:.5rem;background:var(--swatch--brand-500,#3083fd);" +
    "color:var(--swatch--light-100,#fff);text-decoration:none;padding:.625rem 1.125rem;" +
    "border-radius:var(--radius--small,.75rem);font-size:.8125rem;font-weight:var(--_typography---font--primary-medium,500);" +
    "letter-spacing:.05em;text-transform:uppercase;transition:background-color .2s}" +
    ".lai-btn:hover{background:var(--swatch--dark-700,#1b2f53);color:var(--swatch--light-100,#fff)}" +
    ".lai-btn2{display:inline-flex;align-items:center;justify-content:center;background:transparent;" +
    "border:1px solid var(--swatch--dark-900-o20,rgba(7,11,18,.2));color:var(--swatch--dark-900,#070b12);" +
    "text-decoration:none;padding:.625rem 1.125rem;border-radius:var(--radius--small,.75rem);font-size:.8125rem;" +
    "font-weight:var(--_typography---font--primary-medium,500);letter-spacing:.05em;text-transform:uppercase;transition:all .2s}" +
    ".lai-btn2:hover{background:var(--swatch--dark-900,#070b12);color:var(--swatch--light-100,#fff);border-color:var(--swatch--dark-900,#070b12)}" +
    ".lai-actions-sub{display:flex;flex-wrap:wrap;gap:.75rem;margin-top:.75rem}" +
    ".lai-actions-sub .lai-btn2{width:16rem;max-width:100%}" +
    ".lai-media{display:block;width:16rem;max-width:100%;text-decoration:none;border-radius:var(--radius--small,.75rem);" +
    "overflow:hidden;background:var(--swatch--light-100,#fff);transition:transform .2s;box-shadow:0 2px 12px #00000014}" +
    ".lai-media:hover{transform:translateY(-2px)}" +
    // Keep each thumbnail's native aspect ratio (16:9 sermon art, 1:1 team
    // headshots, etc.) instead of forcing a crop.
    ".lai-media img{display:block;width:100%;height:auto}" +
    ".lai-media span{display:flex;align-items:center;gap:.375rem;padding:.625rem .875rem;font-size:.8125rem;" +
    "font-weight:var(--_typography---font--primary-medium,500);letter-spacing:.05em;text-transform:uppercase;" +
    "color:var(--swatch--brand-500,#3083fd)}" +
    ".lai-media:hover span{color:var(--swatch--dark-700,#1b2f53)}" +
    ".lai-escalate{margin-top:var(--_spacing---space--4,1rem);padding:var(--_spacing---space--3,.875rem) var(--_spacing---space--4,1rem);" +
    "border-radius:var(--radius--xsmall,.5rem);background:var(--swatch--light-100,#fff);font-size:.9375rem}" +
    ".lai-escalate a{color:var(--swatch--brand-500,#3083fd)}" +
    ".lai-loading{display:flex;gap:.375rem;align-items:center;color:#7c8494;font-size:.9375rem}" +
    ".lai-dot{width:6px;height:6px;border-radius:50%;background:var(--swatch--brand-500,#3083fd);animation:laiPulse 1.2s infinite ease-in-out}" +
    ".lai-dot:nth-child(2){animation-delay:.2s}.lai-dot:nth-child(3){animation-delay:.4s}" +
    "@keyframes laiPulse{0%,80%,100%{opacity:.25}40%{opacity:1}}" +
    ".lai-answer ul{list-style:disc outside;margin:.25rem 0 1.25rem;padding-left:1.25rem}" +
    ".lai-answer ul:last-child{margin-bottom:0}" +
    ".lai-answer li{list-style:disc outside;display:list-item;margin:0 0 .375rem}" +
    ".lai-answer li::marker{color:var(--swatch--brand-500,#3083fd)}" +
    ".lai-quote{margin:.25rem 0 .75rem;padding:.25rem 0 .25rem .875rem;border-left:3px solid var(--swatch--brand-500,#3083fd);font-style:italic;color:var(--swatch--dark-700,#1b2f53)}" +
    ".lai-clamped{display:-webkit-box;-webkit-line-clamp:6;-webkit-box-orient:vertical;overflow:hidden}" +
    ".lai-more{margin-top:.5rem;background:none;border:none;padding:0;cursor:pointer;" +
    "font-family:inherit;font-size:.875rem;font-weight:var(--_typography---font--primary-medium,500);" +
    "color:var(--swatch--brand-500,#3083fd);text-transform:uppercase;letter-spacing:.05em;transition:color .2s}" +
    ".lai-more:hover{color:var(--swatch--dark-700,#1b2f53);text-decoration:underline}" +
    ".lai-disclaimer{margin-top:var(--_spacing---space--3,.875rem);font-size:.75rem;color:#7c8494}";
  var style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  function inlineMd(s) {
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    return s.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/\*([^*]+)\*/g, "<i>$1</i>");
  }

  function mdToHtml(md) {
    // Minimal, safe Markdown: escape HTML first, then walk line by line.
    // Consecutive bullet lines group into a list, consecutive "> " lines into
    // a blockquote, and every other non-empty line is its own paragraph (so
    // single newlines still read as paragraph breaks).
    var esc = md.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    var html = "", listBuf = [], quoteBuf = [];
    function flush() {
      if (listBuf.length) {
        html += "<ul>" + listBuf.map(function (t) { return "<li>" + inlineMd(t) + "</li>"; }).join("") + "</ul>";
        listBuf = [];
      }
      if (quoteBuf.length) {
        html += '<blockquote class="lai-quote">' + inlineMd(quoteBuf.join(" ")) + "</blockquote>";
        quoteBuf = [];
      }
    }
    esc.split("\n").forEach(function (line) {
      var t = line.trim();
      if (!t) { flush(); return; }
      if (/^[-*•]\s+/.test(t)) {
        if (quoteBuf.length) flush();
        listBuf.push(t.replace(/^[-*•]\s+/, ""));
      } else if (/^&gt;\s?/.test(t)) {
        if (listBuf.length) flush();
        quoteBuf.push(t.replace(/^&gt;\s?/, ""));
      } else {
        flush();
        html += "<p>" + inlineMd(t) + "</p>";
      }
    });
    flush();
    return html;
  }

  function getCard() {
    var card = document.querySelector(".lai-card");
    if (card) return card;
    var target = document.querySelector(TARGET_SEL);
    card = document.createElement("div");
    // Same Lumos utilities the site's cards use (card_primary_group pairs
    // var(--radius--main) with u-shadow-main).
    card.className = "lai-card u-radius-main u-shadow-main";
    if (target && target.parentNode) target.parentNode.insertBefore(card, target);
    else if (document.querySelector(INPUT_SEL)) {
      var input = document.querySelector(INPUT_SEL);
      input.parentNode.insertBefore(card, input.nextSibling);
    } else document.body.prepend(card);
    return card;
  }

  function escAttr(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  }

  var lastQuestion = "";

  function render(card, html, withControls) {
    card.classList.remove("lai-collapsed");
    if (!withControls) {
      card.innerHTML = '<div class="lai-label">✦ Landmark Answer</div>' + html;
      return;
    }
    card.innerHTML =
      '<div class="lai-label">✦ Landmark Answer</div>' +
      '<div class="lai-topright"><button type="button" class="lai-toggle" title="Collapse this AI summary">&minus;&nbsp;&nbsp;Collapse</button></div>' +
      '<div class="lai-body"><div class="lai-body-inner">' +
      html +
      '<div class="lai-footer">' +
      "<span>AI-generated summary. Always test everything against Scripture, and talk with our pastors any time.</span>" +
      '<button type="button" class="lai-feedback" title="Tell us about your experience">Give Feedback</button>' +
      "</div></div></div>";
    var toggle = card.querySelector(".lai-toggle");
    toggle.addEventListener("click", function () {
      var collapsed = card.classList.toggle("lai-collapsed");
      toggle.innerHTML = collapsed ? "+&nbsp;&nbsp;Show" : "&minus;&nbsp;&nbsp;Collapse";
    });
    var fb = card.querySelector(".lai-feedback");
    fb.addEventListener("click", function () { openFeedback(card); });
  }

  function openFeedback(card) {
    if (card.querySelector(".lai-fb")) return;
    var host = card.querySelector(".lai-body-inner") || card;
    var box = document.createElement("div");
    box.className = "lai-fb";
    box.innerHTML =
      '<textarea maxlength="3000" placeholder="Tell us what was helpful, wrong, or missing…"></textarea>' +
      '<div class="lai-fb-row">' +
      '<button type="button" class="lai-btn lai-fb-send">Send</button>' +
      '<button type="button" class="lai-btn2 lai-fb-cancel">Cancel</button>' +
      "</div>";
    host.appendChild(box);
    var ta = box.querySelector("textarea");
    ta.focus();
    box.querySelector(".lai-fb-cancel").addEventListener("click", function () { box.remove(); });
    box.querySelector(".lai-fb-send").addEventListener("click", function () {
      var msg = ta.value.trim();
      if (!msg) return;
      box.innerHTML = '<div class="lai-fb-note">Sending…</div>';
      fetch(ENDPOINT.replace(/\/ask\/?$/, "/feedback"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, question: lastQuestion, page: location.href }),
      })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          box.innerHTML = '<div class="lai-fb-note">' +
            (d.ok ? "Thank you! Your feedback helps us make this better. 💛" : "Sorry, something went wrong sending that. Please try again later.") +
            "</div>";
          setTimeout(function () { box.remove(); }, 5000);
        })
        .catch(function () {
          box.innerHTML = '<div class="lai-fb-note">Sorry, something went wrong sending that.</div>';
          setTimeout(function () { box.remove(); }, 5000);
        });
    });
  }

  var LOADING =
    '<div class="lai-loading"><span class="lai-dot"></span><span class="lai-dot"></span><span class="lai-dot"></span> Finding an answer…</div>';

  function ask(question) {
    if (!question || question.length < 8) return; // too short to be a question
    lastQuestion = question;
    var card = getCard();
    render(card, LOADING);
    // Stream first for the fastest possible first paint; on any streaming
    // problem fall back to the plain JSON endpoint so an answer still appears.
    askStream(question, card).catch(function () { askJson(question, card); });
  }

  // Plain request/response path (also the fallback if streaming fails).
  function askJson(question, card) {
    fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: question }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) { renderFromData(card, data); })
      .catch(function () { card.remove(); });
  }

  // Streamed path: reads newline-delimited events and types the answer in as
  // the model produces it. Returns a promise that rejects on any failure so
  // ask() can fall back cleanly.
  function askStream(question, card) {
    return fetch(STREAM_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: question }),
    }).then(function (res) {
      if (!res.ok || !res.body || !res.body.getReader) throw new Error("no stream");
      var reader = res.body.getReader();
      var dec = new TextDecoder();
      var buf = "", prose = "", started = false, finished = false;

      function shell() {
        if (started) return;
        started = true;
        render(card, '<div class="lai-answer"></div>', true);
      }
      function handle(ev) {
        if (ev.t === "delta") {
          shell();
          prose += ev.v;
          var a = card.querySelector(".lai-answer");
          if (a) a.innerHTML = mdToHtml(prose);
        } else if (ev.t === "done") {
          finished = true;
          renderFromData(card, ev.data); // authoritative: replaces streamed prose
        } else if (ev.t === "suppress") {
          finished = true;
          card.remove();
        } else if (ev.t === "error") {
          throw new Error("stream error");
        }
      }
      function pump() {
        return reader.read().then(function (r) {
          if (r.done) {
            if (!finished) throw new Error("stream ended early");
            return;
          }
          buf += dec.decode(r.value, { stream: true });
          var parts = buf.split("\n");
          buf = parts.pop();
          for (var i = 0; i < parts.length; i++) {
            var line = parts[i].trim();
            if (!line) continue;
            var ev;
            try { ev = JSON.parse(line); } catch (e) { continue; }
            handle(ev);
          }
          return pump();
        });
      }
      return pump();
    });
  }

  // Render a finished answer payload into the card (used by both paths).
  function renderFromData(card, data) {
    if (!data || data.error) { card.remove(); return; }
    if (data.confidence === "low" && !data.escalate) { card.remove(); return; } // honesty: no shaky summaries
    var html = '<div class="lai-answer lai-clamped">' + mdToHtml(data.answer) + "</div>" +
      '<button type="button" class="lai-more" hidden>See more</button>';
    if (data.escalate && data.careFormUrl) {
      html += '<div class="lai-escalate">💛 We’d love to walk with you personally. <a href="' + data.careFormUrl + '">Reach our care team here</a>.</div>';
    }
    if (data.actions && data.actions.length) {
      var media = data.actions.filter(function (a) { return a.thumbnail; });
      var plain = data.actions.filter(function (a) { return !a.thumbnail; });
      if (media.length) {
        html += '<div class="lai-actions">' + media.map(function (a) {
          return '<a class="lai-media" href="' + escAttr(a.url) + '"><img src="' + escAttr(a.thumbnail) + '" alt="" loading="lazy"/><span>' + escAttr(a.label) + ' ›</span></a>';
        }).join("") + "</div>";
        // Secondary links sit as quiet outline buttons under the thumbnail.
        if (plain.length) {
          html += '<div class="lai-actions-sub">' + plain.map(function (a) {
            return '<a class="lai-btn2" href="' + escAttr(a.url) + '">' + escAttr(a.label) + '</a>';
          }).join("") + "</div>";
        }
      } else if (plain.length) {
        html += '<div class="lai-actions">' + plain.map(function (a) {
          return '<a class="lai-btn" href="' + escAttr(a.url) + '">' + escAttr(a.label) + '</a>';
        }).join("") + "</div>";
      }
    }
    if (data.sources && data.sources.length) {
      html += '<div class="lai-sources"><b>Sources:</b> ' + data.sources.map(function (s) {
        return '<a href="' + s.url + '" target="_blank" rel="noopener">' + s.title + "</a>";
      }).join("") + "</div>";
    }
    if (data.goDeeper && data.goDeeper.length) {
      html += '<div class="lai-deeper"><b>Go deeper:</b> ' + data.goDeeper.map(function (g) {
        return '<a href="' + g.url + '" target="_blank" rel="noopener">' + g.title + " (" + g.source + ")</a>";
      }).join(" · ") + "</div>";
    }
    render(card, html, true);
    // Show "See more" only when clamping actually hides content:
    // compare the real unclamped height against the clamped height
    // (scrollHeight alone is fooled by paragraph margins).
    var ans = card.querySelector(".lai-answer");
    var btn = card.querySelector(".lai-more");
    if (ans && btn) {
      ans.classList.remove("lai-clamped");
      var fullH = ans.getBoundingClientRect().height;
      ans.classList.add("lai-clamped");
      var clampedH = ans.getBoundingClientRect().height;
      if (fullH > clampedH + 8) {
        btn.hidden = false;
        btn.addEventListener("click", function () {
          var nowClamped = ans.classList.toggle("lai-clamped");
          btn.textContent = nowClamped ? "See more" : "See less";
        });
      } else {
        ans.classList.remove("lai-clamped");
      }
    }
  }

  function wire() {
    // Only run on the search results page: the answer card should never
    // appear inside the nav search dropdown on other pages.
    var target = document.querySelector(TARGET_SEL);
    if (!target) return;
    // Every search loads this page with ?query=, so that is the only trigger
    // needed. Submitting a new search reloads the page and re-fires this.
    var params = new URLSearchParams(location.search);
    var q = params.get("query") || params.get("q");
    if (q) ask(q.trim());
  }

  window.LandmarkAI = { ask: ask };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire);
  else wire();
})();
