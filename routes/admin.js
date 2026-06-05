const router = require('express').Router()
const db     = require('../db')
const { adminMiddleware } = require('../middleware/auth')

// GET /admin/dashboard
router.get('/dashboard', adminMiddleware, async (req, res) => {
    const [users, deposits, withdrawals, games] = await Promise.all([
        db.query('SELECT COUNT(*) FROM users WHERE is_admin = false'),
        db.query(`SELECT COUNT(*), SUM(amount) FROM deposits WHERE status = 'approved'`),
        db.query(`SELECT COUNT(*), SUM(amount) FROM withdrawals WHERE status = 'approved'`),
        db.query('SELECT COUNT(*), SUM(payout) FROM game_sessions')
    ])

    res.json({
        total_users:             parseInt(users.rows[0].count),
        approved_deposits:       parseInt(deposits.rows[0].count),
        approved_deposits_kz:    parseInt(deposits.rows[0].sum || 0),
        approved_withdrawals:    parseInt(withdrawals.rows[0].count),
        approved_withdrawals_kz: parseInt(withdrawals.rows[0].sum || 0),
        total_games:             parseInt(games.rows[0].count),
        total_payout_kz:         parseInt(games.rows[0].sum || 0)
    })
})

// GET /admin/deposits?status=pending
router.get('/deposits', adminMiddleware, async (req, res) => {
    const status = req.query.status || 'pending'
    const result = await db.query(
        `SELECT d.*, u.name, u.public_id FROM deposits d
         JOIN users u ON u.id = d.user_id
         WHERE d.status = $1 ORDER BY d.created_at ASC`,
        [status]
    )
    res.json(result.rows)
})

// PATCH /admin/deposits/:id — aprovar ou rejeitar
router.patch('/deposits/:id', adminMiddleware, async (req, res) => {
    const { action, notes } = req.body
    if (!['approve', 'reject'].includes(action))
        return res.status(400).json({ error: 'Acao invalida' })

    const dep = await db.query('SELECT * FROM deposits WHERE id = $1', [req.params.id])
    if (!dep.rows[0]) return res.status(404).json({ error: 'Deposito nao encontrado' })

    const deposit = dep.rows[0]
    const status  = action === 'approve' ? 'approved' : 'rejected'

    await db.query(
        `UPDATE deposits SET status = $1, notes = $2, resolved_at = NOW() WHERE id = $3`,
        [status, notes || null, deposit.id]
    )

    if (action === 'approve') {
        await db.query(
            'UPDATE users SET balance = balance + $1 WHERE id = $2',
            [deposit.amount, deposit.user_id]
        )
        await db.query(
            `INSERT INTO notifications (user_id, title, body, type)
             VALUES ($1, $2, $3, 'success')`,
            [deposit.user_id, 'Deposito aprovado', `${deposit.amount} KZ adicionados ao seu saldo.`]
        )

        // Bonus de referido
        const userResult = await db.query(
            'SELECT referred_by FROM users WHERE id = $1',
            [deposit.user_id]
        )
        const referredBy = userResult.rows[0]?.referred_by

        if (referredBy) {
            const depositosAprovados = await db.query(
                `SELECT COUNT(*) FROM deposits WHERE user_id = $1 AND status = 'approved'`,
                [deposit.user_id]
            )
            const totalDepositos = parseInt(depositosAprovados.rows[0].count)

            const bonus3pct  = Math.floor(deposit.amount * 0.03)
            const bonus100   = totalDepositos === 1 ? 100 : 0
            const totalBonus = bonus3pct + bonus100

            if (totalBonus > 0) {
                await db.query(
                    'UPDATE users SET balance = balance + $1 WHERE id = $2',
                    [totalBonus, referredBy]
                )
                await db.query(
                    `INSERT INTO notifications (user_id, title, body, type)
                     VALUES ($1, 'Bonus de indicacao', $2, 'info')`,
                    [referredBy, `Recebeste ${totalBonus} KZ pelo deposito do teu indicado.`]
                )
            }
        }

    } else {
        await db.query(
            `INSERT INTO notifications (user_id, title, body, type)
             VALUES ($1, $2, $3, 'warning')`,
            [deposit.user_id, 'Deposito rejeitado', notes || 'Contacte o suporte para mais informacoes.']
        )
    }

    res.json({ ok: true, status })
})

// GET /admin/withdrawals?status=pending
router.get('/withdrawals', adminMiddleware, async (req, res) => {
    const status = req.query.status || 'pending'
    const result = await db.query(
        `SELECT w.*, u.name, u.public_id FROM withdrawals w
         JOIN users u ON u.id = w.user_id
         WHERE w.status = $1 ORDER BY w.created_at ASC`,
        [status]
    )
    res.json(result.rows)
})

// PATCH /admin/withdrawals/:id
router.patch('/withdrawals/:id', adminMiddleware, async (req, res) => {
    const { action, notes } = req.body

    if (!['approve', 'reject'].includes(action))
        return res.status(400).json({ error: 'Acao invalida' })

    const wd = await db.query('SELECT * FROM withdrawals WHERE id = $1', [req.params.id])
    if (!wd.rows[0]) return res.status(404).json({ error: 'Saque nao encontrado' })

    const withdrawal = wd.rows[0]

    if (action === 'approve' && new Date() > new Date(withdrawal.expires_at)) {
        await db.query(
            `UPDATE withdrawals SET status = 'rejected', resolved_at = NOW() WHERE id = $1`,
            [withdrawal.id]
        )
        await db.query(
            'UPDATE users SET balance = balance + $1 WHERE id = $2',
            [withdrawal.amount, withdrawal.user_id]
        )
        await db.query(
            `INSERT INTO notifications (user_id, title, body, type)
             VALUES ($1, 'Saque expirado', 'O prazo de 5h expirou. Saldo devolvido.', 'warning')`,
            [withdrawal.user_id]
        )
        return res.status(410).json({ error: 'Saque expirado — saldo devolvido ao utilizador' })
    }

    const status = action === 'approve' ? 'approved' : 'rejected'
    await db.query(
        `UPDATE withdrawals SET status = $1, resolved_at = NOW() WHERE id = $2`,
        [status, withdrawal.id]
    )

    if (action === 'reject') {
        await db.query(
            'UPDATE users SET balance = balance + $1 WHERE id = $2',
            [withdrawal.amount, withdrawal.user_id]
        )
        await db.query(
            `INSERT INTO notifications (user_id, title, body, type)
             VALUES ($1, 'Saque rejeitado', $2, 'warning')`,
            [withdrawal.user_id, notes || 'Saque nao aprovado. Saldo devolvido.']
        )
    } else {
        await db.query(
            `INSERT INTO notifications (user_id, title, body, type)
             VALUES ($1, 'Saque aprovado', $2, 'success')`,
            [withdrawal.user_id, `Saque de ${withdrawal.amount} KZ processado com sucesso.`]
        )
    }

    res.json({ ok: true, status })
})

// GET /admin/users
router.get('/users', adminMiddleware, async (req, res) => {
    const result = await db.query(
        `SELECT id, public_id, name, phone, balance, is_blocked, created_at
         FROM users WHERE is_admin = false ORDER BY created_at DESC`
    )
    res.json(result.rows)
})

// PATCH /admin/users/:id/block
router.patch('/users/:id/block', adminMiddleware, async (req, res) => {
    const { blocked } = req.body
    await db.query('UPDATE users SET is_blocked = $1 WHERE id = $2', [blocked, req.params.id])
    res.json({ ok: true })
})

module.exports = router