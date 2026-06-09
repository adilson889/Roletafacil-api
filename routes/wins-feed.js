// ─── wins-feed.js ────────────────────────────────────────────────────────────
// Injeta o feed de vitórias em tempo real no lobby do app.html
// Uso: <script src="wins-feed.js"></script> (já depois do widgets.js)

;(function () {
  const API   = 'https://roletafacil-api.vercel.app'
  const TOKEN = localStorage.getItem('rf_token')
  if (!TOKEN) return

  // ── Estilos ────────────────────────────────────────────────────────────────
  const style = document.createElement('style')
  style.textContent = `
    #rf-wins-feed {
      margin: 0 0 0;
      overflow: hidden;
      position: relative;
      background: linear-gradient(90deg, #020C1B 0%, transparent 8%, transparent 92%, #020C1B 100%);
      z-index: 10;
    }

    #rf-wins-feed::before,
    #rf-wins-feed::after {
      content: '';
      position: absolute;
      top: 0; bottom: 0;
      width: 32px;
      z-index: 2;
      pointer-events: none;
    }
    #rf-wins-feed::before {
      left: 0;
      background: linear-gradient(90deg, #020C1B, transparent);
    }
    #rf-wins-feed::after {
      right: 0;
      background: linear-gradient(270deg, #020C1B, transparent);
    }

    .rf-wins-track {
      display: flex;
      gap: 0;
      animation: rfWinsScroll linear infinite;
      width: max-content;
      padding: 10px 0;
    }

    @keyframes rfWinsScroll {
      0%   { transform: translateX(0) }
      100% { transform: translateX(-50%) }
    }

    .rf-win-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 16px 6px 12px;
      margin-right: 8px;
      background: linear-gradient(135deg, #0A1E35, #061526);
      border: 1px solid rgba(255, 215, 0, 0.12);
      border-radius: 40px;
      white-space: nowrap;
      flex-shrink: 0;
    }

    .rf-win-avatar {
      width: 26px;
      height: 26px;
      border-radius: 50%;
      background: radial-gradient(circle at 40% 35%, #0A2A50, #020C1B);
      border: 1.5px solid rgba(255, 215, 0, 0.4);
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Outfit', sans-serif;
      font-size: 11px;
      font-weight: 900;
      color: #FFD700;
      flex-shrink: 0;
    }

    .rf-win-nome {
      font-family: 'Space Grotesk', sans-serif;
      font-size: 12px;
      font-weight: 600;
      color: rgba(232, 240, 255, 0.85);
      max-width: 80px;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .rf-win-sep {
      font-size: 10px;
      color: rgba(232, 240, 255, 0.2);
    }

    .rf-win-jogo {
      font-family: 'Space Grotesk', sans-serif;
      font-size: 10px;
      color: rgba(232, 240, 255, 0.4);
      text-transform: capitalize;
    }

    .rf-win-valor {
      font-family: 'DM Mono', monospace;
      font-size: 12px;
      font-weight: 700;
      color: #FFD700;
      text-shadow: 0 0 12px rgba(255, 215, 0, 0.4);
    }

    .rf-wins-header {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 0 16px 4px;
    }

    .rf-wins-header-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #00BB44;
      box-shadow: 0 0 6px #00BB44;
      animation: rfPulse 1.5s ease-in-out infinite;
    }

    @keyframes rfPulse {
      0%, 100% { opacity: 1; transform: scale(1) }
      50%       { opacity: 0.5; transform: scale(0.8) }
    }

    .rf-wins-header-label {
      font-family: 'Space Grotesk', sans-serif;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.3em;
      color: rgba(232, 240, 255, 0.25);
      text-transform: uppercase;
    }
  `
  document.head.appendChild(style)

  // ── Utilitários ────────────────────────────────────────────────────────────
  function fmtKZ(n) { return Number(n || 0).toLocaleString('pt-PT') }

  function primeiraLetra(nome) {
    return (nome || '?').trim().charAt(0).toUpperCase()
  }

  function primeiroNome(nome) {
    return (nome || 'Jogador').trim().split(' ')[0]
  }

  // ── Construir item do feed ─────────────────────────────────────────────────
  function criarItem(win) {
    const el = document.createElement('div')
    el.className = 'rf-win-item'
    el.innerHTML = `
      <div class="rf-win-avatar">${primeiraLetra(win.name)}</div>
      <div class="rf-win-nome">${primeiroNome(win.name)}</div>
      <div class="rf-win-sep">·</div>
      <div class="rf-win-jogo">${win.jogo}</div>
      <div class="rf-win-sep">·</div>
      <div class="rf-win-valor">+${fmtKZ(win.delta)} KZ</div>
    `
    return el
  }

  // ── Renderizar feed ────────────────────────────────────────────────────────
  function renderFeed(wins) {
    if (!wins || wins.length === 0) return

    // Encontrar âncora: logo abaixo do hero-saldo, antes dos widgets
    const ancora = document.querySelector('.lobby-hero')
    if (!ancora || document.getElementById('rf-wins-feed')) return

    const wrapper = document.createElement('div')
    wrapper.id = 'rf-wins-feed'

    // Header "ao vivo"
    const header = document.createElement('div')
    header.className = 'rf-wins-header'
    header.innerHTML = `
      <div class="rf-wins-header-dot"></div>
      <div class="rf-wins-header-label">Vitórias ao vivo</div>
    `

    // Track com itens duplicados para loop contínuo
    const track = document.createElement('div')
    track.className = 'rf-wins-track'

    // Duplicar para criar ilusão de loop infinito
    const todosItens = [...wins, ...wins]
    todosItens.forEach(win => track.appendChild(criarItem(win)))

    wrapper.appendChild(header)
    wrapper.appendChild(track)

    // Inserir depois do lobby-hero
    ancora.insertAdjacentElement('afterend', wrapper)

    // Calcular duração da animação com base no número de itens
    // ~60px por item, velocidade de ~40px/s
    const larguraTotal = wins.length * 180
    const duracao = Math.max(15, larguraTotal / 40)
    track.style.animationDuration = `${duracao}s`
  }

  // ── Buscar dados da API ────────────────────────────────────────────────────
  async function carregarWins() {
    try {
      const r = await fetch(`${API}/game/recent-wins`, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${TOKEN}`
        }
      })
      if (!r.ok) return
      const wins = await r.json()
      renderFeed(wins)
    } catch (e) {
      // Silencioso — feed é opcional
    }
  }

  // ── Inicializar quando o DOM estiver pronto ────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', carregarWins)
  } else {
    carregarWins()
  }

})()