/* =========================================================
   magusCar — main.js
   Interações da página única (sem framework, sem backend)
   1. Barra fixa e botão "voltar ao topo"
   2. Menu lateral (drawer) no mobile
   3. Revelação dos blocos ao rolar
   4. Vitrine: busca, filtros, ordenação e contagem
   5. Modal de ficha técnica
   6. Formulário de contato (validação no navegador)
   7. Destaque do dia na tabela de horário
   ========================================================= */

(function () {
  "use strict";

  var $ = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  var $$ = function (sel, ctx) {
    return Array.prototype.slice.call((ctx || document).querySelectorAll(sel));
  };

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Formatação ---------- */
  var brl = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0
  });
  var numero = new Intl.NumberFormat("pt-BR");

  /* =======================================================
     1. Barra fixa + voltar ao topo
     ======================================================= */
  function initHeader() {
    var chrome = $(".site-chrome");
    var toTop = $(".to-top");
    var hero = $(".hero");
    var ultima = window.scrollY;

    if (!chrome) return;

    function alturaChrome() {
      var h = chrome.offsetHeight;
      document.documentElement.style.setProperty("--chrome-h", h + "px");
    }

    function aoRolar() {
      var y = window.scrollY;

      // some a barra quando desce, volta quando sobe
      if (chrome) {
        if (y > 260 && y > ultima) chrome.classList.add("is-hidden");
        else chrome.classList.remove("is-hidden");
      }
      if (chrome && y > 24) chrome.classList.add("is-stuck");
      else if (chrome) chrome.classList.remove("is-stuck");

      if (toTop) toTop.classList.toggle("is-visible", y > 620);

      // parallax bem sutil no fundo do hero
      if (hero && !reduceMotion && y < hero.offsetHeight) {
        var bg = $(".hero__bg", hero);
        if (bg) bg.style.transform = "translate3d(0," + y * 0.22 + "px,0)";
      }

      ultima = y;
    }

    alturaChrome();
    window.addEventListener("scroll", aoRolar, { passive: true });
    window.addEventListener("resize", function () {
      alturaChrome();
      aoRolar();
    });
    aoRolar();

    if (toTop) {
      toTop.addEventListener("click", function () {
        window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
      });
    }
  }

  /* =======================================================
     2. Menu lateral (drawer)
     ======================================================= */
  function initDrawer() {
    var toggle = $(".nav-toggle");
    var drawer = $(".drawer");
    var backdrop = $(".backdrop");
    var close = $(".drawer__close");

    if (!toggle || !drawer) return;

    function abrir(estado) {
      drawer.classList.toggle("is-open", estado);
      if (backdrop) backdrop.classList.toggle("is-open", estado);
      toggle.setAttribute("aria-expanded", estado ? "true" : "false");
      drawer.setAttribute("aria-hidden", estado ? "false" : "true");
      document.documentElement.style.overflow = estado ? "hidden" : "";
    }

    toggle.addEventListener("click", function () {
      abrir(toggle.getAttribute("aria-expanded") !== "true");
    });
    if (backdrop) backdrop.addEventListener("click", function () { abrir(false); });
    if (close) close.addEventListener("click", function () { abrir(false); });
    $$(".drawer__link", drawer).forEach(function (link) {
      link.addEventListener("click", function () { abrir(false); });
    });
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") abrir(false);
    });
  }

  /* =======================================================
     3. Revelação dos blocos ao rolar
     ======================================================= */
  function initReveal() {
    var alvos = $$("[data-reveal]");
    if (!alvos.length) return;

    if (reduceMotion || !("IntersectionObserver" in window)) {
      alvos.forEach(function (el) { el.classList.add("is-visible"); });
      return;
    }

    var obs = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add("is-visible");
        obs.unobserve(e.target);
      });
    }, { rootMargin: "0px 0px -12% 0px", threshold: 0.08 });

    alvos.forEach(function (el, i) {
      // cascata suave dentro do mesmo grupo
      var grupo = el.closest("[data-reveal-group]");
      if (grupo) {
        var irmaos = $$("[data-reveal]", grupo);
        el.style.setProperty("--reveal-delay", Math.min(irmaos.indexOf(el), 6) * 0.075 + "s");
      }
      obs.observe(el);
    });
  }

  /* =======================================================
     4. Vitrine: busca, filtros e ordenação
     ======================================================= */
  function initVitrine() {
    var grid = $(".vitrine-grid");
    if (!grid) return;

    var cards = $$(".vehicle-card", grid);
    var vazio = $(".vitrine-empty");
    var contador = $("[data-results-count]");

    var campoBusca = $("#filtro-busca");
    var selMarca = $("#filtro-marca");
    var selCategoria = $("#filtro-categoria");
    var selPreco = $("#filtro-preco");
    var selOrdem = $("#filtro-ordem");
    var chips = $$("[data-chip]");

    var estado = { busca: "", marca: "", categoria: "", preco: "", ordem: "relevancia" };

    function normalizar(txt) {
      return (txt || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
    }

    function precoDoCard(card) {
      return parseFloat(card.dataset.price || "0");
    }

    function combina(card) {
      var d = card.dataset;

      if (estado.busca) {
        var alvo = normalizar(
          [d.name, d.brand, d.cat, d.fuel, d.body, d.year].join(" ")
        );
        if (alvo.indexOf(estado.busca) === -1) return false;
      }
      if (estado.marca && normalizar(d.brand) !== normalizar(estado.marca)) return false;
      if (estado.categoria && normalizar(d.cat) !== normalizar(estado.categoria)) return false;
      if (estado.preco) {
        var p = precoDoCard(card);
        var faixa = estado.preco;
        if (faixa === "a60" && p > 60000) return false;
        if (faixa === "60a80" && (p < 60000 || p > 80000)) return false;
        if (faixa === "80a100" && (p < 80000 || p > 100000)) return false;
        if (faixa === "acima100" && p <= 100000) return false;
      }
      return true;
    }

    var ordenadores = {
      relevancia: function (a, b) { return 0; },
      menor: function (a, b) { return precoDoCard(a) - precoDoCard(b); },
      maior: function (a, b) { return precoDoCard(b) - precoDoCard(a); },
      novos: function (a, b) { return (b.dataset.year || 0) - (a.dataset.year || 0); },
      km: function (a, b) { return (a.dataset.km || 0) - (b.dataset.km || 0); }
    };

    function aplicar() {
      var visiveis = [];

      cards.forEach(function (card) {
        if (combina(card)) {
          card.classList.remove("is-hidden");
          visiveis.push(card);
        } else {
          card.classList.add("is-hidden");
        }
      });

      if (estado.ordem !== "relevancia" && ordenadores[estado.ordem]) {
        visiveis.sort(ordenadores[estado.ordem]);
        visiveis.forEach(function (card) { grid.appendChild(card); });
      }

      if (vazio) vazio.classList.toggle("hidden", visiveis.length > 0);
      if (contador) contador.textContent = visiveis.length;
    }

    if (campoBusca) {
      var t = null;
      campoBusca.addEventListener("input", function () {
        clearTimeout(t);
        t = setTimeout(function () {
          estado.busca = normalizar(campoBusca.value.trim());
          aplicar();
        }, 160);
      });
    }

    function ligarSelect(el, chave, formatar) {
      if (!el) return;
      el.addEventListener("change", function () {
        var v = el.value;
        estado[chave] = v && v !== "todos" ? (formatar ? formatar(v) : v) : "";
        aplicar();
      });
    }

    ligarSelect(selMarca, "marca");
    ligarSelect(selCategoria, "categoria");
    ligarSelect(selPreco, "preco");
    ligarSelect(selOrdem, "ordem");

    chips.forEach(function (chip) {
      chip.addEventListener("click", function () {
        var valor = chip.dataset.chip;
        chips.forEach(function (c) { c.classList.remove("is-active"); });
        chip.classList.add("is-active");

        estado.categoria = valor === "todas" ? "" : valor;
        if (selCategoria) selCategoria.value = valor === "todas" ? "todos" : valor;
        aplicar();
      });
    });

    // abre/fecha cardões com duplo clique no card
    $$(".card-open", grid).forEach(function (botao) {
      botao.addEventListener("click", function (ev) {
        ev.preventDefault();
        abrirFicha(botao.closest(".vehicle-card"));
      });
    });
    $$(".vehicle-card", grid).forEach(function (card) {
      card.addEventListener("dblclick", function () { abrirFicha(card); });
    });

    aplicar();
  }

  /* =======================================================
     5. Modal de ficha técnica
     ======================================================= */
  var modalAberto = null;

  function abrirFicha(card) {
    var modal = $(".modal");
    if (!modal || !card) return;

    var d = card.dataset;
    var img = $(".vehicle-card__media img", card);

    function preencher(sel, valor) {
      var el = $(sel, modal);
      if (el) el.textContent = valor || "—";
    }

    var foto = $("[data-modal-img]", modal);
    if (foto && img) {
      foto.src = img.getAttribute("src");
      foto.alt = (d.brand || "") + " " + (d.name || "");
    }

    preencher("[data-modal-brand]", d.brand);
    preencher("[data-modal-name]", d.name);
    preencher("[data-modal-price]", brl.format(precoDoCard(card)));
    preencher("[data-modal-ano]", d.year);
    preencher("[data-modal-km]", numero.format(parseInt(d.km || "0", 10)) + " km");
    preencher("[data-modal-fuel]", d.fuel);
    preencher("[data-modal-gear]", d.gear);
    preencher("[data-modal-motor]", d.motor);
    preencher("[data-modal-power]", d.power);
    preencher("[data-modal-body]", d.body);
    preencher("[data-modal-color]", d.color);
    preencher("[data-modal-origin]", d.origin);
    preencher("[data-modal-plate]", d.plate);
    preencher("[data-modal-desc]", d.desc);

    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    document.documentElement.style.overflow = "hidden";
    modalAberto = card;

    var fechar = $(".modal__close", modal);
    if (fechar) fechar.focus();
  }

  function fecharFicha() {
    var modal = $(".modal");
    if (!modal) return;
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    document.documentElement.style.overflow = "";
    if (modalAberto) {
      var b = $(".card-open", modalAberto);
      if (b) b.focus();
    }
    modalAberto = null;
  }

  function initModal() {
    var modal = $(".modal");
    if (!modal) return;

    $(".modal__close", modal).addEventListener("click", fecharFicha);
    $(".modal__backdrop", modal).addEventListener("click", fecharFicha);
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape" && modal.classList.contains("is-open")) fecharFicha();
    });
  }

  /* =======================================================
     6. Formulário de contato
     ======================================================= */
  function initForm() {
    var form = $("#form-contato");
    if (!form) return;

    var status = $(".form-status", form);

    function marcar(campo, valido) {
      campo.classList.toggle("control--invalid", !valido);
      campo.setAttribute("aria-invalid", valido ? "false" : "true");
      return valido;
    }

    $$(".control", form).forEach(function (campo) {
      campo.addEventListener("input", function () {
        if (campo.classList.contains("control--invalid")) marcar(campo, campo.value.trim() !== "");
      });
    });

    form.addEventListener("submit", function (ev) {
      ev.preventDefault(); // site estático: nada é enviado

      var nome = $("#ct-nome", form);
      var telefone = $("#ct-telefone", form);
      var email = $("#ct-email", form);
      var veiculo = $("#ct-veiculo", form);
      var ok = true;

      ok = marcar(nome, nome.value.trim().length >= 3) && ok;
      ok = marcar(telefone, telefone.value.replace(/\D/g, "").length >= 10) && ok;
      ok = marcar(email, /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.value.trim())) && ok;
      ok = marcar(veiculo, veiculo.value.trim() !== "") && ok;

      if (!ok) {
        var primeiro = $(".control--invalid", form);
        if (primeiro) primeiro.focus();
        if (status) {
          status.textContent = "Confira os campos destacados antes de enviar.";
          status.classList.add("is-visible");
        }
        return;
      }

      var primeiroNome = nome.value.trim().split(/\s+/)[0];
      if (status) {
        status.textContent =
          "Obrigado, " + primeiroNome + "! Nossa equipe entra em contato em até 1 dia útil. " +
          "(Site de demonstração: nenhuma mensagem foi enviada.)";
        status.classList.add("is-visible");
      }
      form.reset();
    });
  }

  /* =======================================================
     7. Horário: destaque do dia
     ======================================================= */
  function initHorario() {
    var linhas = $$("[data-dia]");
    if (!linhas.length) return;

    var hoje = new Date().getDay(); // 0 = domingo
    linhas.forEach(function (linha) {
      var dias = linha.dataset.dia.split(",").map(Number);
      if (dias.indexOf(hoje) !== -1) linha.classList.add("is-today");
    });
  }

  /* ---------- Ano no rodapé ---------- */
  function initAno() {
    $$("[data-ano]").forEach(function (el) {
      el.textContent = new Date().getFullYear();
    });
  }

  /* ---------- Duplica a faixa de marques para o loop do marquee ---------- */
  function initMarquee() {
    $$(".marquee").forEach(function (m) {
      var grupo = $(".marquee__group", m);
      if (!grupo || grupo.dataset.cloned === "1") return;
      var clone = grupo.cloneNode(true);
      clone.setAttribute("aria-hidden", "true");
      clone.dataset.cloned = "1";
      grupo.parentNode.appendChild(clone);
    });
  }

  /* ---------- Navegação ativa conforme a seção visível ---------- */
  function initScrollSpy() {
    var links = $$(".nav-link[href^='#']");
    if (!links.length || !("IntersectionObserver" in window)) return;

    var mapa = {};
    var secoes = [];

    links.forEach(function (link) {
      var alvo = document.getElementById(link.getAttribute("href").slice(1));
      if (!alvo) return;
      mapa[alvo.id] = link;
      secoes.push(alvo);
    });

    var visiveis = new Set();

    var obs = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (e) {
        if (e.isIntersecting) visiveis.add(e.target.id);
        else visiveis.delete(e.target.id);
      });

      var alvo = null;
      for (var i = 0; i < secoes.length; i++) {
        if (visiveis.has(secoes[i].id)) { alvo = secoes[i].id; break; }
      }
      if (!alvo && visiveis.size) alvo = Array.from(visiveis)[0];

      links.forEach(function (l) { l.classList.remove("is-active"); });
      if (alvo && mapa[alvo]) mapa[alvo].classList.add("is-active");
    }, { rootMargin: "-45% 0px -45% 0px", threshold: 0 });

    secoes.forEach(function (s) { obs.observe(s); });
  }

  /* ---------- Máscara simples de telefone ---------- */
  function initMascaras() {
    var tel = $("#ct-telefone");
    if (!tel) return;
    tel.addEventListener("input", function () {
      var v = tel.value.replace(/\D/g, "").slice(0, 11);
      if (v.length > 6) v = "(" + v.slice(0, 2) + ") " + v.slice(2, 7) + "-" + v.slice(7);
      else if (v.length > 2) v = "(" + v.slice(0, 2) + ") " + v.slice(2);
      else if (v.length > 0) v = "(" + v;
      tel.value = v;
    });
  }

  /* ---------- Início ---------- */
  function init() {
    initMarquee();
    initHeader();
    initDrawer();
    initReveal();
    initVitrine();
    initModal();
    initForm();
    initHorario();
    initMascaras();
    initScrollSpy();
    initAno();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
