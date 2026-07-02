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

  var css =
    ".lai-card{font-family:inherit;border:1px solid #e2e2e2;border-radius:12px;padding:20px 22px;margin:0 0 24px;background:#fafaf8;box-shadow:0 1px 4px rgba(0,0,0,.05)}" +
    ".lai-label{display:flex;align-items:center;gap:8px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#8a7350;font-weight:600;margin-bottom:10px}" +
    ".lai-answer{font-size:15px;line-height:1.65;color:#222}" +
    ".lai-answer p{margin:0 0 10px}" +
    ".lai-answer a{color:#8a5a2b;text-decoration:underline}" +
    ".lai-sources{margin-top:12px;padding-top:10px;border-top:1px dashed #ddd;font-size:13px;color:#555}" +
    ".lai-sources a{color:#8a5a2b;margin-right:12px;text-decoration:none}" +
    ".lai-sources a:hover{text-decoration:underline}" +
    ".lai-deeper{margin-top:8px;font-size:13px;color:#555}" +
    ".lai-escalate{margin-top:12px;padding:12px 14px;border-radius:8px;background:#fdf3e7;border:1px solid #eddcc3;font-size:14px}" +
    ".lai-loading{display:flex;gap:6px;align-items:center;color:#777;font-size:14px}" +
    ".lai-dot{width:6px;height:6px;border-radius:50%;background:#b09468;animation:laiPulse 1.2s infinite ease-in-out}" +
    ".lai-dot:nth-child(2){animation-delay:.2s}.lai-dot:nth-child(3){animation-delay:.4s}" +
    "@keyframes laiPulse{0%,80%,100%{opacity:.25}40%{opacity:1}}" +
    ".lai-disclaimer{margin-top:10px;font-size:11px;color:#999}";
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
    card.innerHTML =
      '<div class="lai-label">✦ Answer from The Landmark Church</div>' + html;
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
