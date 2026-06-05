const router = require('express').Router()
const db     = require('../db')
const { authMiddleware } = require('../middleware/auth')

// GET /referral/me — ver código e estatísticas
router.get('/me', authMiddleware, async (req, res) => {
    const result = await db.query(
        `SELECT 
            u.referral_code,
            COUNT(i.id) AS total_indicados,
            COALESCE(SUM(i.balance), 0) AS saldo_indicados
         FROM users u
         LEFT JOIN users i ON i.referred_by = u.id
         WHERE u.id = $1
         GROUP BY u.referral_code`,
        [req.user.id]
    )
    res.json(result.rows[0])
})

// GET /referral/list — lista de indicados
router.get('/list', authMiddleware, async (req, res) => {
    const result = await db.query(
        `SELECT name, created_at FROM users 
         WHERE referred_by = $1 
         ORDER BY created_at DESC`,
        [req.user.id]
    )
    res.json(result.rows)
})

module.exports = router