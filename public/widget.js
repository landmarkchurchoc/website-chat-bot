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
  var INPUT_SEL = (script && script.getAttribute("data-input")) || 'input[type="search"]';
  var TARGET_SEL = (script && script.getAttribute("data-target")) || "[data-ai-answer]";

  // Styled with the site's Lumos design tokens (falls back to the same values).
  var css =
    ".lai-card{font-family:var(--_typography---font--primary-family,Gotham,Arial,sans-serif);" +
    "padding:var(--_spacing---space--6,1.5rem);" +
    "margin:0 0 var(--_spacing---space--6,1.5rem);" +
    "background:var(--swatch--light-100,#fff);color:var(--swatch--dark-900,#070b12)}" +
    ".lai-label{display:flex;align-items:center;gap:.5rem;font-size:.75rem;letter-spacing:.08em;" +
    "text-transform:uppercase;color:var(--swatch--brand-500,#3083fd);" +
    "font-weight:var(--_typography---font--primary-medium,500);margin-bottom:var(--_spacing---space--3,.875rem)}" +
    ".lai-answer{font-size:var(--_typography---font-size--text-main,1rem);line-height:1.6;color:var(--swatch--dark-900,#070b12)}" +
    ".lai-answer p{margin:0 0 1rem}" +
    ".lai-answer p:last-child{margin-bottom:0}" +
    ".lai-answer a{color:var(--swatch--brand-500,#3083fd);text-decoration:underline}" +
    ".lai-answer b{font-weight:var(--_typography---font--primary-bold,700)}" +
    ".lai-sources{margin-top:var(--_spacing---space--4,1rem);padding-top:var(--_spacing---space--3,.875rem);" +
    "border-top:1px solid var(--swatch--dark-900-o20,rgba(7,11,18,.12));font-size:.875rem;color:#7c8494}" +
    ".lai-sources a{color:var(--swatch--brand-500,#3083fd);margin-right:.875rem;text-decoration:none}" +
    ".lai-sources a:hover{text-decoration:underline}" +
    ".lai-deeper{margin-top:.5rem;font-size:.875rem;color:#7c8494}" +
    ".lai-deeper a{color:var(--swatch--brand-500,#3083fd);text-decoration:none}" +
    ".lai-deeper a:hover{text-decoration:underline}" +
    ".lai-escalate{margin-top:var(--_spacing---space--4,1rem);padding:var(--_spacing---space--3,.875rem) var(--_spacing---space--4,1rem);" +
    "border-radius:var(--radius--xsmall,.5rem);background:var(--swatch--tan,#f6f4f1);" +
    "border:1px solid var(--swatch--dark-900-o20,rgba(7,11,18,.12));font-size:.9375rem}" +
    ".lai-escalate a{color:var(--swatch--brand-500,#3083fd)}" +
    ".lai-loading{display:flex;gap:.375rem;align-items:center;color:#7c8494;font-size:.9375rem}" +
    ".lai-dot{width:6px;height:6px;border-radius:50%;background:var(--swatch--brand-500,#3083fd);animation:laiPulse 1.2s infinite ease-in-out}" +
    ".lai-dot:nth-child(2){animation-delay:.2s}.lai-dot:nth-child(3){animation-delay:.4s}" +
    "@keyframes laiPulse{0%,80%,100%{opacity:.25}40%{opacity:1}}" +
    ".lai-answer ul{list-style:disc outside;margin:.25rem 0 .75rem;padding-left:1.25rem}" +
    ".lai-answer li{list-style:disc outside;display:list-item;margin:0 0 .375rem}" +
    ".lai-answer li::marker{color:var(--swatch--brand-500,#3083fd)}" +
    ".lai-quote{margin:.25rem 0 .75rem;padding:.25rem 0 .25rem .875rem;border-left:3px solid var(--swatch--brand-500,#3083fd);font-style:italic;color:var(--swatch--dark-700,#1b2f53)}" +
    ".lai-clamped{display:-webkit-box;-webkit-line-clamp:6;-webkit-box-orient:vertical;overflow:hidden}" +
    ".lai-more{margin-top:.5rem;background:none;border:none;padding:0;cursor:pointer;" +
    "font-family:inherit;font-size:.875rem;font-weight:var(--_typography---font--primary-medium,500);" +
    "color:var(--swatch--brand-500,#3083fd);text-transform:uppercase;letter-spacing:.05em}" +
    ".lai-more:hover{text-decoration:underline}" +
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
    // u-radius-small is the site's Lumos utility class for corner radius.
    card.className = "lai-card u-radius-small";
    if (target && target.parentNode) target.parentNode.insertBefore(card, target);
    else if (document.querySelector(INPUT_SEL)) {
      var input = document.querySelector(INPUT_SEL);
      input.parentNode.insertBefore(card, input.nextSibling);
    } else document.body.prepend(card);
    return card;
  }

  function render(card, html) {
    card.innerHTML = '<div class="lai-label">✦ Landmark Answer</div>' + html;
  }

  function ask(question) {
    if (!question || question.length < 8) return; // too short to be a question
    var card = getCard();
    render(card, '<div class="lai-loading"><span class="lai-dot"></span><span class="lai-dot"></span><span class="lai-dot"></span> Finding an answer…</div>');
    fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: question }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.error) { card.remove(); return; }
        if (data.confidence === "low" && !data.escalate) { card.remove(); return; } // honesty: no shaky summaries
        var html = '<div class="lai-answer lai-clamped">' + mdToHtml(data.answer) + "</div>" +
          '<button type="button" class="lai-more" hidden>See more</button>';
        if (data.escalate && data.careFormUrl) {
          html += '<div class="lai-escalate">💛 We’d love to walk with you personally. <a href="' + data.careFormUrl + '">Reach our care team here</a>.</div>';
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
        html += '<div class="lai-disclaimer">AI-generated summary. Always test everything against Scripture, and talk with our pastors any time.</div>';
        render(card, html);
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
      })
      .catch(function () { card.remove(); });
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
