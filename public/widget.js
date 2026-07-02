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
    "border:1px solid var(--swatch--dark-900-o20,rgba(7,11,18,.2));" +
    "border-radius:var(--radius--small,.75rem);" +
    "padding:var(--_spacing---space--6,1.5rem);" +
    "margin:0 0 var(--_spacing---space--6,1.5rem);" +
    "background:var(--swatch--light-100,#fff);color:var(--swatch--dark-900,#070b12)}" +
    ".lai-label{display:flex;align-items:center;gap:.5rem;font-size:.75rem;letter-spacing:.08em;" +
    "text-transform:uppercase;color:var(--swatch--brand-500,#3083fd);" +
    "font-weight:var(--_typography---font--primary-medium,500);margin-bottom:var(--_spacing---space--3,.875rem)}" +
    ".lai-answer{font-size:var(--_typography---font-size--text-main,1rem);line-height:1.6;color:var(--swatch--dark-900,#070b12)}" +
    ".lai-answer p{margin:0 0 .75rem}" +
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
    ".lai-disclaimer{margin-top:var(--_spacing---space--3,.875rem);font-size:.75rem;color:#7c8494}";
  var style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  function mdToHtml(md) {
    // Minimal, safe Markdown: escape HTML first, then bold/italics/links/paragraphs.
    var esc = md.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    esc = esc.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    esc = esc.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/\*([^*]+)\*/g, "<i>$1</i>");
    return esc.split(/\n{2,}/).map(function (p) { return "<p>" + p.replace(/\n/g, "<br/>") + "</p>"; }).join("");
  }

  function getCard() {
    var card = document.querySelector(".lai-card");
    if (card) return card;
    var target = document.querySelector(TARGET_SEL);
    card = document.createElement("div");
    card.className = "lai-card";
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
        var html = '<div class="lai-answer">' + mdToHtml(data.answer) + "</div>";
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
        html += '<div class="lai-disclaimer">AI-generated summary — always test everything against Scripture. Talk with our pastors any time.</div>';
        render(card, html);
      })
      .catch(function () { card.remove(); });
  }

  function wire() {
    var input = document.querySelector(INPUT_SEL);
    if (!input) return;
    var timer = null;
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { clearTimeout(timer); ask(input.value.trim()); }
    });
    var form = input.closest("form");
    if (form) form.addEventListener("submit", function () { ask(input.value.trim()); });
    // If the page loaded with a ?query= param (Webflow search results page), answer it.
    var params = new URLSearchParams(location.search);
    var q = params.get("query") || params.get("q");
    if (q) ask(q.trim());
  }

  window.LandmarkAI = { ask: ask };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire);
  else wire();
})();
