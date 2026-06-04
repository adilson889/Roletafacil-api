const router = require('express').Router()
const db     = require('../db')
const { authMiddleware } = require('../middleware/auth')

// POST /game/result — registar resultado de jogo
// body: { delta: Number }  (positivo = ganhou, negativo = perdeu)
router.post('/result', authMiddleware, async (req, res) => {
    const { delta } = req.body

    if (delta === undefined || typeof delta !== 'number' || !isFinite(delta))
        return res.status(400).json({ error: 'Delta invalido' })

    // Impedir saldo negativo
    const userResult = await db.query(
        'SELECT balance FROM users WHERE id = $1',
        [req.user.id]
    )
    const user = userResult.rows[0]
    if (!user) return res.status(404).json({ error: 'Utilizador nao encontrado' })

    const novoSaldo = user.balance + delta
    if (novoSaldo < 0)
        return res.status(400).json({ error: 'Saldo insuficiente' })

    const updated = await db.query(
        'UPDATE users SET balance = $1 WHERE id = $2 RETURNING balance',
        [novoSaldo, req.user.id]
    )

    res.json({ balance: updated.rows[0].balance })
})

module.exports = router