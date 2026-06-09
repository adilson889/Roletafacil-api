const router = require('express').Router()
const db     = require('../db')
const { authMiddleware } = require('../middleware/auth')

const BONUS_DIARIO = { bronze: 50, prata: 100, ouro: 200, diamante: 500 }

const NIVEIS_CONFIG = {
  bronze:   { min: 0,      label: 'Bronze',   cor: '#CD7F32' },
  prata:    { min: 30000,  label: 'Prata',    cor: '#C0C0C0' },
  ouro:     { min: 100000, label: 'Ouro',     cor: '#FFD700' },
  diamante: { min: 500000, label: 'Diamante', cor: '#00CFFF' }
}

async function garantirPerfil(user_id) {
  await db.query(
    `INSERT INTO user_profile (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
    [user_id]
  )
}

// GET /rewards/check
router.get('/check', authMiddleware, async (req, res) => {
  try {
    await garantirPerfil(req.user.id)

    const [perfil, user] = await Promise.all([
      db.query(`SELECT * FROM user_profile WHERE user_id = $1`, [req.user.id]),
      db.query(`SELECT balance, total_wagered, name FROM users WHERE id = $1`, [req.user.id])
    ])

    const p = perfil.rows[0]
    const u = user.rows[0]
    const hoje = new Date().toISOString().slice(0, 10)
    const ultimo_bonus = p.ultimo_bonus ? p.ultimo_bonus.toISOString().slice(0, 10) : null
    const bonus_disponivel = ultimo_bonus !== hoje
    const valor_bonus = BONUS_DIARIO[p.nivel] || 50

    // Verificar se é utilizador novo (menos de 10 min desde registo)
    const minutos_desde_registo = (Date.now() - new Date(u.created_at || 0).getTime()) / 60000
    const mostrar_boas_vindas = minutos_desde_registo < 10 && parseInt(u.balance) === 0

    // Mensagem personalizada baseada no comportamento
    let mensagem = null
    const dias_inativo = p.ultimo_login
      ? Math.floor((Date.now() - new Date(p.ultimo_login).getTime()) / 86400000)
      : 0

    if (dias_inativo >= 3) {
      mensagem = { tipo: 'churn', texto: `Sentimos a tua falta, ${u.name.split(' ')[0]}! Temos um bónus para ti.` }
    } else if (p.streak_dias >= 3) {
      mensagem = { tipo: 'streak', texto: `${p.streak_dias} dias seguidos! Continua assim.` }
    } else if (bonus_disponivel) {
      mensagem = { tipo: 'bonus', texto: `O teu bónus diário de ${valor_bonus} KZ está disponível!` }
    }

    res.json({
      bonus_diario: {
        disponivel:  bonus_disponivel,
        valor:       valor_bonus,
        ultimo:      ultimo_bonus
      },
      nivel: {
        atual:  p.nivel,
        label:  NIVEIS_CONFIG[p.nivel].label,
        cor:    NIVEIS_CONFIG[p.nivel].cor
      },
      streak_dias:      p.streak_dias || 0,
      mostrar_boas_vindas,
      mensagem
    })
  } catch (e) {
    res.status(500).json({ error: 'Erro interno' })
  }
})

// POST /rewards/claim
router.post('/claim', authMiddleware, async (req, res) => {
  const { type } = req.body
  if (!['daily_bonus'].includes(type))
    return res.status(400).json({ error: 'Tipo de recompensa invalido' })

  try {
    await garantirPerfil(req.user.id)

    const perfil = await db.query(
      `SELECT nivel, ultimo_bonus FROM user_profile WHERE user_id = $1`,
      [req.user.id]
    )
    const p = perfil.rows[0]
    const hoje = new Date().toISOString().slice(0, 10)
    const ultimo_bonus = p.ultimo_bonus ? p.ultimo_bonus.toISOString().slice(0, 10) : null

    if (ultimo_bonus === hoje)
      return res.status(400).json({ error: 'Bonus ja reclamado hoje' })

    const valor = BONUS_DIARIO[p.nivel] || 50

    await db.query(`UPDATE users SET balance = balance + $1 WHERE id = $2`, [valor, req.user.id])
    await db.query(`UPDATE user_profile SET ultimo_bonus = $1 WHERE user_id = $2`, [hoje, req.user.id])
    await db.query(
      `INSERT INTO rewards (user_id, type, amount) VALUES ($1, $2, $3)`,
      [req.user.id, type, valor]
    )
    await db.query(
      `INSERT INTO notifications (user_id, title, body, type) VALUES ($1, $2, $3, 'success')`,
      [req.user.id, 'Bonus diario creditado!', `+${valor} KZ adicionados ao teu saldo.`]
    )

    const novo_saldo = await db.query(`SELECT balance FROM users WHERE id = $1`, [req.user.id])

    res.json({ ok: true, valor, balance: novo_saldo.rows[0].balance })
  } catch (e) {
    res.status(500).json({ error: 'Erro interno' })
  }
})

module.exports = router