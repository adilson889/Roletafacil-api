// ─── routes/notifications.js ─────────────────────────────────────────────────
const router = require('express').Router()
const db     = require('../db')
const { authMiddleware, adminMiddleware } = require('../middleware/auth')

// GET /notifications — listar as do utilizador + broadcasts
router.get('/', authMiddleware, async (req, res) => {
    const result = await db.query(
        `SELECT * FROM notifications
         WHERE (user_id = $1 OR user_id IS NULL)
         ORDER BY created_at DESC LIMIT 50`,
        [req.user.id]
    )
    res.json(result.rows)
})

// GET /notifications/unread-count
router.get('/unread-count', authMiddleware, async (req, res) => {
    const result = await db.query(
        `SELECT COUNT(*) FROM notifications
         WHERE (user_id = $1 OR user_id IS NULL) AND is_read = false`,
        [req.user.id]
    )
    res.json({ count: parseInt(result.rows[0].count) })
})

// PATCH /notifications/:id/read
router.patch('/:id/read', authMiddleware, async (req, res) => {
    await db.query(
        `UPDATE notifications SET is_read = true
         WHERE id = $1 AND (user_id = $2 OR user_id IS NULL)`,
        [req.params.id, req.user.id]
    )
    res.json({ ok: true })
})

// PATCH /notifications/read-all
router.patch('/read-all', authMiddleware, async (req, res) => {
    await db.query(
        `UPDATE notifications SET is_read = true
         WHERE (user_id = $1 OR user_id IS NULL) AND is_read = false`,
        [req.user.id]
    )
    res.json({ ok: true })
})

// POST /notifications/broadcast — admin envia para todos
router.post('/broadcast', adminMiddleware, async (req, res) => {
    const { title, body, type } = req.body
    if (!title || !body)
        return res.status(400).json({ error: 'Titulo e corpo obrigatorios' })

    const result = await db.query(
        `INSERT INTO notifications (user_id, title, body, type)
         VALUES (NULL, $1, $2, $3) RETURNING *`,
        [title, body, type || 'info']
    )
    res.status(201).json(result.rows[0])
})

module.exports = router