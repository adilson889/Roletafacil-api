// ─── routes/auth.js ──────────────────────────────────────────────────────────
const router  = require('express').Router()
const bcrypt  = require('bcrypt')
const jwt     = require('jsonwebtoken')
const db      = require('../db')

function gerarPublicId(id) {
    return 'RF-' + String(id).padStart(5, '0')
}

// POST /auth/register
router.post('/register', async (req, res) => {
    const { name, password, phone } = req.body

    if (!name?.trim() || !password)
        return res.status(400).json({ error: 'Nome e senha obrigatorios' })
    if (password.length < 6)
        return res.status(400).json({ error: 'Senha minima 6 caracteres' })

    try {
        const hash = await bcrypt.hash(password, 12)

        // Inserir com public_id temporario, depois actualizar com o ID real
        const result = await db.query(
            `INSERT INTO users (name, password, phone, public_id)
             VALUES ($1, $2, $3, 'RF-TMP') RETURNING id`,
            [name.trim(), hash, phone?.trim() || null]
        )

        const userId   = result.rows[0].id
        const publicId = gerarPublicId(userId)

        await db.query(
            'UPDATE users SET public_id = $1 WHERE id = $2',
            [publicId, userId]
        )

        const token = jwt.sign(
            { id: userId, public_id: publicId, is_admin: false },
            process.env.JWT_SECRET,
            { expiresIn: '30d' }
        )

        res.status(201).json({
            token,
            user: { id: userId, public_id: publicId, name: name.trim(), phone: phone || null, balance: 0 }
        })
    } catch (err) {
        if (err.code === '23505')
            return res.status(409).json({ error: 'Utilizador ja existe' })
        res.status(500).json({ error: 'Erro interno' })
    }
})

// POST /auth/login
router.post('/login', async (req, res) => {
    const { name, password } = req.body

    if (!name?.trim() || !password)
        return res.status(400).json({ error: 'Nome e senha obrigatorios' })

    try {
        const result = await db.query(
            'SELECT * FROM users WHERE LOWER(name) = LOWER($1)',
            [name.trim()]
        )

        const user = result.rows[0]
        if (!user) return res.status(401).json({ error: 'Credenciais invalidas' })
        if (user.is_blocked) return res.status(403).json({ error: 'Conta bloqueada' })

        const match = await bcrypt.compare(password, user.password)
        if (!match) return res.status(401).json({ error: 'Credenciais invalidas' })

        const token = jwt.sign(
            { id: user.id, public_id: user.public_id, is_admin: user.is_admin },
            process.env.JWT_SECRET,
            { expiresIn: '30d' }
        )

        res.json({
            token,
            user: {
                id:        user.id,
                public_id: user.public_id,
                name:      user.name,
                phone:     user.phone,
                balance:   user.balance
            }
        })
    } catch {
        res.status(500).json({ error: 'Erro interno' })
    }
})

// POST /auth/set-pin
router.post('/set-pin', require('../middleware/auth').authMiddleware, async (req, res) => {
    const { pin } = req.body
    if (!pin || !/^\d{6}$/.test(pin))
        return res.status(400).json({ error: 'PIN deve ter exactamente 6 digitos' })

    const hash = await bcrypt.hash(pin, 12)
    await db.query('UPDATE users SET pin_hash = $1 WHERE id = $2', [hash, req.user.id])
    res.json({ ok: true })
})

// GET /auth/me
router.get('/me', require('../middleware/auth').authMiddleware, async (req, res) => {
    const result = await db.query(
        'SELECT id, public_id, name, phone, balance, created_at FROM users WHERE id = $1',
        [req.user.id]
    )
    res.json(result.rows[0])
})

module.exports = router