const router = require('express').Router()
const db     = require('../db')
const { authMiddleware } = require('../middleware/auth')

// POST /game/result — registar resultado
router.post('/result', authMiddleware, async (req, res) => {
    const { delta, jogo } = req.body

    if (delta === undefined || typeof delta !== 'number' || !isFinite(delta))
        return res.status(400).json({ error: 'Delta invalido' })

    if (!jogo || !['roleta', 'mines'].includes(jogo))
        return res.status(400).json({ error: 'Jogo invalido' })

    const userResult = await db.query(
        'SELECT balance FROM users WHERE id = $1', [req.user.id]
    )
    const user = userResult.rows[0]
    if (!user) return res.status(404).json({ error: 'Utilizador nao encontrado' })

    const novoSaldo = user.balance + delta
    if (novoSaldo < 0)
        return res.status(400).json({ error: 'Saldo insuficiente' })

    await db.query(
        'UPDATE users SET balance = $1 WHERE id = $2', [novoSaldo, req.user.id]
    )

    await db.query(
        `INSERT INTO game_history (user_id, jogo, delta, saldo_depois)
         VALUES ($1, $2, $3, $4)`,
        [req.user.id, jogo, delta, novoSaldo]
    )

    res.json({ balance: novoSaldo })
})

// GET /game/history — historico de jogadas
router.get('/history', authMiddleware, async (req, res) => {
    const result = await db.query(
        `SELECT jogo, delta, saldo_depois, created_at
         FROM game_history
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 50`,
        [req.user.id]
    )
    res.json(result.rows)
})

module.exports = router