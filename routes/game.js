const router = require('express').Router()
const db     = require('../db')
const { authMiddleware } = require('../middleware/auth')

const VERMELHO = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]
const PRETO    = [2,4,6,8,10,11,13,15,17,20,22,24,26,28,29,31,33,35]

function calcPayoutRoleta(numero, tipo, aposta) {
  if (tipo === 'verm')   return VERMELHO.includes(numero) ? Math.floor(aposta * 1.90) : 0
  if (tipo === 'preto')  return PRETO.includes(numero)    ? Math.floor(aposta * 1.90) : 0
  if (tipo === 'verde')  return numero === 0               ? Math.floor(aposta * 30)   : 0
  if (tipo === 'par')    return numero > 0 && numero % 2 === 0 ? Math.floor(aposta * 1.90) : 0
  if (tipo === 'impar')  return numero > 0 && numero % 2 !== 0 ? Math.floor(aposta * 1.90) : 0
  if (tipo === '1-18')   return numero >= 1  && numero <= 18 ? Math.floor(aposta * 1.90) : 0
  if (tipo === '19-36')  return numero >= 19 && numero <= 36 ? Math.floor(aposta * 1.90) : 0
  if (tipo === 'dez1')   return numero >= 1  && numero <= 12 ? Math.floor(aposta * 2.85) : 0
  if (tipo === 'dez2')   return numero >= 13 && numero <= 24 ? Math.floor(aposta * 2.85) : 0
  if (tipo === 'dez3')   return numero >= 25 && numero <= 36 ? Math.floor(aposta * 2.85) : 0
  if (tipo === 'exacto') return numero === parseInt(tipo.split(':')[1]) ? Math.floor(aposta * 34) : 0
  return 0
}

router.post('/roleta/spin', authMiddleware, async (req, res) => {
  const { aposta, tipo, numero_exacto } = req.body

  if (!aposta || aposta < 10)
    return res.status(400).json({ error: 'Aposta minima 10 KZ' })
  if (aposta > 500)
    return res.status(400).json({ error: 'Aposta maxima 500 KZ' })
  if (!tipo)
    return res.status(400).json({ error: 'Tipo de aposta em falta' })

  const tiposValidos = ['verm','preto','verde','par','impar','1-18','19-36','dez1','dez2','dez3','exacto']
  if (!tiposValidos.includes(tipo))
    return res.status(400).json({ error: 'Tipo de aposta invalido' })

  const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [req.user.id])
  const user = rows[0]
  if (!user)           return res.status(404).json({ error: 'Utilizador nao encontrado' })
  if (user.is_blocked) return res.status(403).json({ error: 'Conta bloqueada' })
  if (user.balance < aposta) return res.status(400).json({ error: 'Saldo insuficiente' })

  const numero = Math.floor(Math.random() * 37)

  let payout = 0
  if (tipo === 'exacto') {
    if (!numero_exacto && numero_exacto !== 0)
      return res.status(400).json({ error: 'Numero exacto em falta' })
    payout = numero === parseInt(numero_exacto) ? Math.floor(aposta * 34) : 0
  } else {
    payout = calcPayoutRoleta(numero, tipo, aposta)
  }

  const delta     = payout - aposta
  const novoSaldo = user.balance + delta

  await db.query(
    'UPDATE users SET balance = $1, total_wagered = COALESCE(total_wagered,0) + $2 WHERE id = $3',
    [novoSaldo, aposta, req.user.id]
  )
  await db.query(
    `INSERT INTO game_sessions (user_id, bet_amount, bet_type, result, payout, jogo, status)
     VALUES ($1,$2,$3,$4,$5,'roleta','closed')`,
    [req.user.id, aposta, tipo, numero, payout]
  )
  await db.query(
    `INSERT INTO game_history (user_id, jogo, delta, saldo_depois) VALUES ($1,'roleta',$2,$3)`,
    [req.user.id, delta, novoSaldo]
  )
  await actualizarTorneio(req.user.id, delta)

  res.json({ numero, payout, delta, balance: novoSaldo })
})

function calcMultiMines(abertas, nMinas) {
  if (abertas === 0) return 1
  const total = 25, seg = total - nMinas
  let prob = 1
  for (let i = 0; i < abertas; i++) prob *= (seg - i) / (total - i)
  return parseFloat((0.95 / prob).toFixed(2))
}

router.post('/mines/start', authMiddleware, async (req, res) => {
  const { aposta, n_minas } = req.body

  if (!aposta || aposta < 30)  return res.status(400).json({ error: 'Aposta minima 30 KZ' })
  if (aposta > 500)            return res.status(400).json({ error: 'Aposta maxima 500 KZ' })
  if (!n_minas || n_minas < 10 || n_minas > 24)
    return res.status(400).json({ error: 'Minas: 10 a 24' })

  const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [req.user.id])
  const user = rows[0]
  if (!user)           return res.status(404).json({ error: 'Utilizador nao encontrado' })
  if (user.is_blocked) return res.status(403).json({ error: 'Conta bloqueada' })
  if (user.balance < aposta) return res.status(400).json({ error: 'Saldo insuficiente' })

  await db.query(
    `UPDATE game_sessions SET status='abandoned'
     WHERE user_id=$1 AND jogo='mines' AND status='open'`,
    [req.user.id]
  )

  const minasSet = new Set()
  while (minasSet.size < n_minas) minasSet.add(Math.floor(Math.random() * 25))
  const minasPos = Array.from(minasSet)

  const novoSaldo = user.balance - aposta
  await db.query(
    'UPDATE users SET balance=$1, total_wagered=COALESCE(total_wagered,0)+$2 WHERE id=$3',
    [novoSaldo, aposta, req.user.id]
  )

  const sessao = await db.query(
    `INSERT INTO game_sessions
       (user_id, bet_amount, bet_type, result, payout, jogo, mines_pos, mines_abertas, n_minas, status)
     VALUES ($1,$2,'mines',0,0,'mines',$3,$4,$5,'open') RETURNING id`,
    [req.user.id, aposta, minasPos, [], n_minas]
  )

  res.json({ session_id: sessao.rows[0].id, balance: novoSaldo })
})

router.post('/mines/reveal', authMiddleware, async (req, res) => {
  const { session_id, celula } = req.body

  if (celula === undefined || celula < 0 || celula > 24)
    return res.status(400).json({ error: 'Celula invalida' })

  const { rows } = await db.query(
    `SELECT * FROM game_sessions WHERE id=$1 AND user_id=$2 AND status='open'`,
    [session_id, req.user.id]
  )
  const sessao = rows[0]
  if (!sessao) return res.status(404).json({ error: 'Sessao nao encontrada' })

  const abertas = sessao.mines_abertas || []
  if (abertas.includes(celula))
    return res.status(400).json({ error: 'Celula ja aberta' })

  const ehMina = sessao.mines_pos.includes(celula)

  if (ehMina) {
    await db.query(
      `UPDATE game_sessions SET status='lost', mines_abertas=$1 WHERE id=$2`,
      [[...abertas, celula], session_id]
    )
    const userR = await db.query('SELECT balance FROM users WHERE id=$1', [req.user.id])
    await db.query(
      `INSERT INTO game_history (user_id, jogo, delta, saldo_depois) VALUES ($1,'mines',$2,$3)`,
      [req.user.id, -sessao.bet_amount, userR.rows[0].balance]
    )
    await actualizarTorneio(req.user.id, -sessao.bet_amount)
    return res.json({
      mina: true,
      mines_pos: sessao.mines_pos,
      balance: userR.rows[0].balance
    })
  }

  const novasAbertas = [...abertas, celula]
  const multi        = calcMultiMines(novasAbertas.length, sessao.n_minas)
  const potencial    = Math.floor(sessao.bet_amount * multi)
  const seguras      = 25 - sessao.n_minas

  await db.query(
    `UPDATE game_sessions SET mines_abertas=$1 WHERE id=$2`,
    [novasAbertas, session_id]
  )

  if (novasAbertas.length === seguras) {
    const userR     = await db.query('SELECT balance FROM users WHERE id=$1', [req.user.id])
    const novoSaldo = userR.rows[0].balance + potencial
    await db.query('UPDATE users SET balance=$1 WHERE id=$2', [novoSaldo, req.user.id])
    await db.query(
      `UPDATE game_sessions SET status='won', payout=$1 WHERE id=$2`,
      [potencial, session_id]
    )
    await db.query(
      `INSERT INTO game_history (user_id, jogo, delta, saldo_depois) VALUES ($1,'mines',$2,$3)`,
      [req.user.id, potencial - sessao.bet_amount, novoSaldo]
    )
    await actualizarTorneio(req.user.id, potencial - sessao.bet_amount)
    return res.json({
      mina: false, auto_cashout: true,
      multi, potencial, balance: novoSaldo,
      abertas: novasAbertas
    })
  }

  res.json({ mina: false, multi, potencial, abertas: novasAbertas })
})

router.post('/mines/cashout', authMiddleware, async (req, res) => {
  const { session_id } = req.body

  const { rows } = await db.query(
    `SELECT * FROM game_sessions WHERE id=$1 AND user_id=$2 AND status='open'`,
    [session_id, req.user.id]
  )
  const sessao = rows[0]
  if (!sessao) return res.status(404).json({ error: 'Sessao nao encontrada' })

  const abertas = sessao.mines_abertas || []
  if (abertas.length === 0)
    return res.status(400).json({ error: 'Abre pelo menos uma casa' })

  const multi     = calcMultiMines(abertas.length, sessao.n_minas)
  const retorno   = Math.floor(sessao.bet_amount * multi)
  const delta     = retorno - sessao.bet_amount

  const userR     = await db.query('SELECT balance FROM users WHERE id=$1', [req.user.id])
  const novoSaldo = userR.rows[0].balance + retorno

  await db.query('UPDATE users SET balance=$1 WHERE id=$2', [novoSaldo, req.user.id])
  await db.query(
    `UPDATE game_sessions SET status='won', payout=$1 WHERE id=$2`,
    [retorno, session_id]
  )
  await db.query(
    `INSERT INTO game_history (user_id, jogo, delta, saldo_depois) VALUES ($1,'mines',$2,$3)`,
    [req.user.id, delta, novoSaldo]
  )
  await actualizarTorneio(req.user.id, delta)

  res.json({ retorno, delta, balance: novoSaldo, mines_pos: sessao.mines_pos })
})

router.get('/history', authMiddleware, async (req, res) => {
  const result = await db.query(
    `SELECT jogo, delta, saldo_depois, created_at FROM game_history
     WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`,
    [req.user.id]
  )
  res.json(result.rows)
})

router.get('/recent-wins', authMiddleware, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT
         u.name,
         u.public_id,
         gh.jogo,
         gh.delta,
         gh.created_at
       FROM game_history gh
       JOIN users u ON u.id = gh.user_id
       WHERE gh.delta > 0
         AND gh.user_id != $1
       ORDER BY gh.created_at DESC
       LIMIT 20`,
      [req.user.id]
    )
    res.json(rows)
  } catch (e) {
    res.status(500).json({ error: 'Erro interno' })
  }
})

async function actualizarTorneio(user_id, delta) {
  try {
    const t = await db.query(
      `SELECT id FROM tournaments WHERE status = 'active' ORDER BY iniciado_em DESC LIMIT 1`
    )
    if (!t.rows[0]) return
    const tid = t.rows[0].id

    await db.query(
      `INSERT INTO tournament_entries (tournament_id, user_id, lucro_total, partidas, updated_at)
       VALUES ($1, $2, $3, 1, NOW())
       ON CONFLICT (tournament_id, user_id)
       DO UPDATE SET
         lucro_total = tournament_entries.lucro_total + $3,
         partidas    = tournament_entries.partidas + 1,
         updated_at  = NOW()`,
      [tid, user_id, delta]
    )
  } catch (e) {}
}

module.exports = router