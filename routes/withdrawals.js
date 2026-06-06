const router = require('express').Router()
const bcrypt = require('bcrypt')
const db     = require('../db')
const { authMiddleware } = require('../middleware/auth')

router.post('/', authMiddleware, async (req, res) => {
    const { amount, phone, pin } = req.body

    if (!amount || amount < 500)
        return res.status(400).json({ error: 'Saque minimo 500 KZ' })
    if (!phone?.trim())
        return res.status(400).json({ error: 'Numero de telefone obrigatorio' })
    if (!pin || !/^\d{6}$/.test(pin))
        return res.status(400).json({ error: 'PIN invalido' })

    const userResult = await db.query('SELECT * FROM users WHERE id = $1', [req.user.id])
    const user = userResult.rows[0]

    if (!user.pin_hash)
        return res.status(400).json({ error: 'Defina um PIN de saque primeiro' })

    const pinOk = await bcrypt.compare(pin, user.pin_hash)
    if (!pinOk) return res.status(401).json({ error: 'PIN incorreto' })

    if (user.balance < amount)
        return res.status(400).json({ error: 'Saldo insuficiente' })

    // ── Regra: tem de jogar pelo menos o valor total depositado ──
    const totalDep = parseInt(user.total_deposited || 0)
    const totalWag = parseInt(user.total_wagered   || 0)
    if (totalWag < totalDep) {
        const falta = totalDep - totalWag
        return res.status(400).json({
            error: `Tens de jogar mais ${falta} KZ antes de poder sacar`
        })
    }

    await db.query('UPDATE users SET balance = balance - $1 WHERE id = $2', [amount, user.id])

    const result = await db.query(
        `INSERT INTO withdrawals (user_id, amount, phone) VALUES ($1, $2, $3) RETURNING *`,
        [user.id, amount, phone.trim()]
    )

    await db.query(
        `INSERT INTO notifications (user_id, title, body, type) VALUES ($1, $2, $3, 'info')`,
        [user.id, 'Saque solicitado', `Saque de ${amount} KZ em processamento. Prazo maximo: 5 horas.`]
    )

    res.status(201).json(result.rows[0])
})

router.get('/', authMiddleware, async (req, res) => {
    const result = await db.query(
        'SELECT * FROM withdrawals WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
        [req.user.id]
    )
    res.json(result.rows)
})

router.patch('/pin', authMiddleware, async (req, res) => {
    const { pin, password } = req.body

    if (!pin || !/^\d{6}$/.test(pin))
        return res.status(400).json({ error: 'PIN deve ter exactamente 6 digitos' })
    if (!password)
        return res.status(400).json({ error: 'Confirma com a tua senha' })

    const result = await db.query('SELECT * FROM users WHERE id = $1', [req.user.id])
    const user = result.rows[0]

    const senhaOk = await bcrypt.compare(password, user.password)
    if (!senhaOk) return res.status(401).json({ error: 'Senha incorreta' })

    const pin_hash = await bcrypt.hash(pin, 10)
    await db.query('UPDATE users SET pin_hash = $1 WHERE id = $2', [pin_hash, req.user.id])

    res.json({ ok: true })
})

module.exports = router