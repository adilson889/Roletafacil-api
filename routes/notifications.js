const router = require('express').Router()
const db     = require('../db')
const { authMiddleware, adminMiddleware } = require('../middleware/auth')

router.get('/', authMiddleware, async (req, res) => {
    try {
        const result = await db.query(
            `SELECT * FROM notifications
             WHERE (user_id = $1 OR user_id IS NULL)
             ORDER BY created_at DESC LIMIT 50`,
            [req.user.id]
        )
        res.json(result.rows)
    } catch(e) {
        console.error('notifications/get error:', e.message)
        res.status(500).json({ error: e.message })
    }
})

router.get('/promos', authMiddleware, async (req, res) => {
    try {
        const result = await db.query(
            `SELECT * FROM notifications
             WHERE type = 'promo' AND (user_id IS NULL)
             ORDER BY created_at DESC LIMIT 10`
        )
        res.json(result.rows)
    } catch(e) {
        console.error('notifications/promos error:', e.message)
        res.status(500).json({ error: e.message })
    }
})

router.get('/unread-count', authMiddleware, async (req, res) => {
    try {
        const result = await db.query(
            `SELECT COUNT(*) FROM notifications
             WHERE (user_id = $1 OR user_id IS NULL) AND is_read = false`,
            [req.user.id]
        )
        res.json({ count: parseInt(result.rows[0].count) })
    } catch(e) {
        console.error('notifications/unread-count error:', e.message)
        res.status(500).json({ error: e.message })
    }
})

router.patch('/read-all', authMiddleware, async (req, res) => {
    try {
        await db.query(
            `UPDATE notifications SET is_read = true
             WHERE (user_id = $1 OR user_id IS NULL) AND is_read = false`,
            [req.user.id]
        )
        res.json({ ok: true })
    } catch(e) {
        console.error('notifications/read-all error:', e.message)
        res.status(500).json({ error: e.message })
    }
})

router.patch('/:id/read', authMiddleware, async (req, res) => {
    try {
        await db.query(
            `UPDATE notifications SET is_read = true
             WHERE id = $1 AND (user_id = $2 OR user_id IS NULL)`,
            [req.params.id, req.user.id]
        )
        res.json({ ok: true })
    } catch(e) {
        console.error('notifications/read error:', e.message)
        res.status(500).json({ error: e.message })
    }
})

router.post('/broadcast', adminMiddleware, async (req, res) => {
    try {
        const { title, body, type, image_url } = req.body
        if (!title || !body)
            return res.status(400).json({ error: 'Titulo e corpo obrigatorios' })

        const result = await db.query(
            `INSERT INTO notifications (user_id, title, body, type, image_url)
             VALUES (NULL, $1, $2, $3, $4) RETURNING *`,
            [title, body, type || 'info', image_url || null]
        )
        res.status(201).json(result.rows[0])
    } catch(e) {
        console.error('notifications/broadcast error:', e.message)
        res.status(500).json({ error: e.message })
    }
})

module.exports = router