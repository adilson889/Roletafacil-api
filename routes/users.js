// ─── routes/users.js ─────────────────────────────────────────────────────────
const router = require('express').Router()
const bcrypt = require('bcrypt')
const db     = require('../db')
const { authMiddleware } = require('../middleware/auth')

// GET /users/me — perfil do utilizador autenticado
router.get('/me', authMiddleware, async (req, res) => {
    const result = await db.query(
        'SELECT id, public_id, name, phone, balance, pin_hash IS NOT NULL AS has_pin FROM users WHERE id = $1',
        [req.user.id]
    )
    res.json(result.rows[0])
})

// PATCH /users/pin — definir ou alterar PIN de saque
router.patch('/pin', authMiddleware, async (req, res) => {
    const { pin, password } = req.body

    if (!pin || !/^\d{6}$/.test(pin))
        return res.status(400).json({ error: 'PIN deve ter exactamente 6 digitos' })
    if (!password)
        return res.status(400).json({ error: 'Confirma com a tua senha' })

    const result = await db.query('SELECT * FROM users WHERE id = $1', [req.user.id])
    const user   = result.rows[0]

    const senhaOk = await bcrypt.compare(password, user.password)
    if (!senhaOk) return res.status(401).json({ error: 'Senha incorreta' })

    const pin_hash = await bcrypt.hash(pin, 10)
    await db.query('UPDATE users SET pin_hash = $1 WHERE id = $2', [pin_hash, req.user.id])

    res.json({ ok: true })
})

module.exports = router