const router = require('express').Router()
const db     = require('../db')
const { authMiddleware } = require('../middleware/auth')

// Calcular nível com base no total apostado
function calcularNivel(total_wagered) {
  if (total_wagered >= 500000) return 'diamante'
  if (total_wagered >= 100000) return 'ouro'
  if (total_wagered >= 30000)  return 'prata'
  return 'bronze'
}

// Garantir que o perfil existe
async function garantirPerfil(user_id) {
  await db.query(
    `INSERT INTO user_profile (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
    [user_id]
  )
}

// POST /analytics/track
router.post('/track', authMiddleware, async (req, res) => {
  const { event, metadata = {} } = req.body
  const eventos_validos = ['login', 'logout', 'game_start', 'game_end', 'deposit', 'withdraw', 'page_view']

  if (!event || !eventos_validos.includes(event))
    return res.status(400).json({ error: 'Evento invalido' })

  try {
    await garantirPerfil(req.user.id)

    await db.query(
      `INSERT INTO user_events (user_id, event, metadata) VALUES ($1, $2, $3)`,
      [req.user.id, event, JSON.stringify(metadata)]
    )

    // Actualizar ultimo_login e streak no login
    if (event === 'login') {
      const perfil = await db.query(
        `SELECT ultimo_login, streak_dias FROM user_profile WHERE user_id = $1`,
        [req.user.id]
      )
      const p = perfil.rows[0]
      const hoje = new Date().toISOString().slice(0, 10)
      const ontem = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
      const ultimo = p.ultimo_login ? p.ultimo_login.toISOString().slice(0, 10) : null

      let novo_streak = 1
      if (ultimo === ontem) novo_streak = (p.streak_dias || 0) + 1
      else if (ultimo === hoje) novo_streak = p.streak_dias || 1

      await db.query(
        `UPDATE user_profile SET ultimo_login = $1, streak_dias = $2 WHERE user_id = $3`,
        [hoje, novo_streak, req.user.id]
      )
    }

    // Actualizar jogo favorito no game_end
    if (event === 'game_end' && metadata.jogo) {
      const contagem = await db.query(
        `SELECT metadata->>'jogo' AS jogo, COUNT(*) AS total
         FROM user_events
         WHERE user_id = $1 AND event = 'game_end'
         GROUP BY metadata->>'jogo'
         ORDER BY total DESC LIMIT 1`,
        [req.user.id]
      )
      if (contagem.rows.length > 0) {
        await db.query(
          `UPDATE user_profile SET jogo_favorito = $1 WHERE user_id = $2`,
          [contagem.rows[0].jogo, req.user.id]
        )
      }
    }

    // Actualizar nível com base no total_wagered
    const user = await db.query(
      `SELECT total_wagered FROM users WHERE id = $1`, [req.user.id]
    )
    const nivel = calcularNivel(parseInt(user.rows[0].total_wagered || 0))
    await db.query(
      `UPDATE user_profile SET nivel = $1, updated_at = NOW() WHERE user_id = $2`,
      [nivel, req.user.id]
    )

    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: 'Erro interno' })
  }
})

// GET /analytics/profile
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    await garantirPerfil(req.user.id)

    const [perfil, user, eventos] = await Promise.all([
      db.query(`SELECT * FROM user_profile WHERE user_id = $1`, [req.user.id]),
      db.query(`SELECT total_wagered, total_deposited, created_at FROM users WHERE id = $1`, [req.user.id]),
      db.query(
        `SELECT event, COUNT(*) AS total FROM user_events
         WHERE user_id = $1 AND created_at > NOW() - INTERVAL '30 days'
         GROUP BY event`,
        [req.user.id]
      )
    ])

    const p = perfil.rows[0]
    const u = user.rows[0]
    const total_wagered = parseInt(u.total_wagered || 0)

    // Calcular risco de churn
    const ultimo_login = p.ultimo_login ? new Date(p.ultimo_login) : null
    const dias_inativo = ultimo_login
      ? Math.floor((Date.now() - ultimo_login.getTime()) / 86400000)
      : 999
    const churn_risk = dias_inativo >= 7 ? 'alto' : dias_inativo >= 3 ? 'medio' : 'baixo'

    // Próximo nível
    const niveis = { bronze: 30000, prata: 100000, ouro: 500000, diamante: null }
    const proximo_threshold = niveis[p.nivel]
    const progresso_nivel = proximo_threshold
      ? Math.min(100, Math.floor((total_wagered / proximo_threshold) * 100))
      : 100

    res.json({
      nivel:            p.nivel,
      streak_dias:      p.streak_dias || 0,
      jogo_favorito:    p.jogo_favorito || null,
      ultimo_login:     p.ultimo_login,
      ultimo_bonus:     p.ultimo_bonus,
      churn_risk,
      dias_inativo,
      total_wagered,
      progresso_nivel,
      proximo_nivel:    proximo_threshold ? `${proximo_threshold.toLocaleString()} KZ` : null,
      membro_desde:     u.created_at,
      eventos_30d:      eventos.rows
    })
  } catch (e) {
    res.status(500).json({ error: 'Erro interno' })
  }
})

module.exports = router