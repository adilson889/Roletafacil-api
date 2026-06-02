// ─── routes/deposits.js ──────────────────────────────────────────────────────
const router = require('express').Router()
const db     = require('../db')
const { authMiddleware } = require('../middleware/auth')

// POST /deposits — utilizador pede deposito
router.post('/', authMiddleware, async (req, res) => {
    const { amount, reference } = req.body
    if (!amount || amount < 100)
        return res.status(400).json({ error: 'Deposito minimo 100 KZ' })

    const result = await db.query(
        `INSERT INTO deposits (user_id, amount, reference)
         VALUES ($1, $2, $3) RETURNING *`,
        [req.user.id, amount, reference || null]
    )

    // Notificar o proprio utilizador
    await db.query(
        `INSERT INTO notifications (user_id, title, body, type)
         VALUES ($1, $2, $3, 'info')`,
        [req.user.id, 'Deposito recebido', `Pedido de ${amount} KZ em analise.`]
    )

    res.status(201).json(result.rows[0])
})

// GET /deposits — historico do utilizador
router.get('/', authMiddleware, async (req, res) => {
    const result = await db.query(
        'SELECT * FROM deposits WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
        [req.user.id]
    )
    res.json(result.rows)
})

module.exports = router