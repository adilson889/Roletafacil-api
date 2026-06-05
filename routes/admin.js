const router = require('express').Router()
const db     = require('../db')
const { adminMiddleware } = require('../middleware/auth')

// ── GET /admin/dashboard ─────────────────────────────────────────────────
router.get('/dashboard', adminMiddleware, async (req, res) => {
    const [users, deposits, withdrawals, games] = await Promise.all([
        db.query('SELECT COUNT(*) FROM users WHERE is_admin = false'),
        db.query(`SELECT COUNT(*), SUM(amount) FROM deposits WHERE status = 'approved'`),
        db.query(`SELECT COUNT(*), SUM(amount) FROM withdrawals WHERE status = 'approved'`),
        db.query(`SELECT COUNT(*), COALESCE(SUM(CASE WHEN delta > 0 THEN delta ELSE 0 END), 0) AS total_payout
                  FROM game_history`)
    ])

    res.json({
        total_users:             parseInt(users.rows[0].count),
        approved_deposits:       parseInt(deposits.rows[0].count),
        approved_deposits_kz:    parseInt(deposits.rows[0].sum || 0),
        approved_withdrawals:    parseInt(withdrawals.rows[0].count),
        approved_withdrawals_kz: parseInt(withdrawals.rows[0].sum || 0),
        total_games:             parseInt(games.rows[0].count),
        total_payout_kz:         parseInt(games.rows[0].total_payout || 0)
    })
})

// ── GET /admin/stats/overview ─────────────────────────────────────────────
// Receita líquida, apostas totais, lucro bruto por jogo — últimos N dias
router.get('/stats/overview', adminMiddleware, async (req, res) => {
    const days = Math.min(parseInt(req.query.days) || 30, 90)

    const [jogos, financeiro, porJogo, pendentes] = await Promise.all([

        // Lucro diário da casa (delta negativo = jogador perdeu = receita da casa)
        db.query(`
            SELECT
                DATE_TRUNC('day', created_at AT TIME ZONE 'UTC') AS dia,
                jogo,
                COUNT(*)                                          AS partidas,
                SUM(ABS(CASE WHEN delta < 0 THEN delta ELSE 0 END))  AS receita_casa,
                SUM(CASE WHEN delta > 0 THEN delta ELSE 0 END)        AS pago_jogadores,
                SUM(ABS(delta))                                        AS volume_total,
                SUM(-delta)                                            AS lucro_liquido
            FROM game_history
            WHERE created_at >= NOW() - ($1 || ' days')::INTERVAL
            GROUP BY dia, jogo
            ORDER BY dia ASC
        `, [days]),

        // Depósitos e saques por dia
        db.query(`
            SELECT
                DATE_TRUNC('day', created_at AT TIME ZONE 'UTC') AS dia,
                'deposito' AS tipo,
                SUM(amount) AS total,
                COUNT(*)    AS qtd
            FROM deposits
            WHERE status = 'approved'
              AND created_at >= NOW() - ($1 || ' days')::INTERVAL
            GROUP BY dia

            UNION ALL

            SELECT
                DATE_TRUNC('day', created_at AT TIME ZONE 'UTC') AS dia,
                'saque' AS tipo,
                SUM(amount) AS total,
                COUNT(*)    AS qtd
            FROM withdrawals
            WHERE status = 'approved'
              AND created_at >= NOW() - ($1 || ' days')::INTERVAL
            GROUP BY dia
            ORDER BY dia ASC
        `, [days]),

        // Receita total agrupada por jogo (all-time)
        db.query(`
            SELECT
                jogo,
                COUNT(*)                                               AS partidas,
                SUM(ABS(CASE WHEN delta < 0 THEN delta ELSE 0 END))   AS receita_casa,
                SUM(CASE WHEN delta > 0 THEN delta ELSE 0 END)         AS pago_jogadores,
                ROUND(
                    100.0 * SUM(ABS(CASE WHEN delta < 0 THEN delta ELSE 0 END))
                    / NULLIF(SUM(ABS(delta)), 0), 2
                )                                                       AS margem_pct
            FROM game_history
            GROUP BY jogo
        `),

        // Contagem de pendentes (depósitos + saques)
        db.query(`
            SELECT
                (SELECT COUNT(*) FROM deposits    WHERE status = 'pending') AS dep_pendentes,
                (SELECT COUNT(*) FROM withdrawals WHERE status = 'pending') AS saque_pendentes
        `)
    ])

    // Montar série diária unificada
    const diasMap = {}

    for (const r of jogos.rows) {
        const k = r.dia.toISOString().slice(0, 10)
        if (!diasMap[k]) diasMap[k] = { dia: k, receita_jogos: 0, pago_jogadores: 0, partidas: 0, depositos: 0, saques: 0 }
        diasMap[k].receita_jogos  += parseInt(r.receita_casa)
        diasMap[k].pago_jogadores += parseInt(r.pago_jogadores)
        diasMap[k].partidas       += parseInt(r.partidas)
    }

    for (const r of financeiro.rows) {
        const k = r.dia.toISOString().slice(0, 10)
        if (!diasMap[k]) diasMap[k] = { dia: k, receita_jogos: 0, pago_jogadores: 0, partidas: 0, depositos: 0, saques: 0 }
        if (r.tipo === 'deposito') diasMap[k].depositos = parseInt(r.total)
        if (r.tipo === 'saque')    diasMap[k].saques    = parseInt(r.total)
    }

    const serie = Object.values(diasMap).sort((a, b) => a.dia.localeCompare(b.dia))

    res.json({
        serie,
        por_jogo:   porJogo.rows,
        pendentes:  pendentes.rows[0],
        periodo_dias: days
    })
})

// ── GET /admin/stats/top-players ─────────────────────────────────────────
// Top jogadores por volume apostado e por lucro gerado para a casa
router.get('/stats/top-players', adminMiddleware, async (req, res) => {
    const result = await db.query(`
        SELECT
            u.name,
            u.public_id,
            u.balance,
            COUNT(g.id)                                               AS partidas,
            SUM(ABS(g.delta))                                          AS volume_apostado,
            SUM(ABS(CASE WHEN g.delta < 0 THEN g.delta ELSE 0 END))   AS receita_gerada,
            SUM(CASE WHEN g.delta > 0 THEN g.delta ELSE 0 END)         AS ganhos_do_jogador
        FROM game_history g
        JOIN users u ON u.id = g.user_id
        GROUP BY u.id, u.name, u.public_id, u.balance
        ORDER BY receita_gerada DESC
        LIMIT 20
    `)
    res.json(result.rows)
})

// ── GET /admin/deposits?status=pending ───────────────────────────────────
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

// ── PATCH /admin/deposits/:id ─────────────────────────────────────────────
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

// ── GET /admin/withdrawals?status=pending ─────────────────────────────────
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

// ── PATCH /admin/withdrawals/:id ──────────────────────────────────────────
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

// ── GET /admin/users ──────────────────────────────────────────────────────
router.get('/users', adminMiddleware, async (req, res) => {
    const result = await db.query(
        `SELECT id, public_id, name, phone, balance, is_blocked, created_at
         FROM users WHERE is_admin = false ORDER BY created_at DESC`
    )
    res.json(result.rows)
})

// ── PATCH /admin/users/:id/block ──────────────────────────────────────────
router.patch('/users/:id/block', adminMiddleware, async (req, res) => {
    const { blocked } = req.body
    await db.query('UPDATE users SET is_blocked = $1 WHERE id = $2', [blocked, req.params.id])
    res.json({ ok: true })
})

module.exports = router
