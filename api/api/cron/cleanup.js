// ─── api/cron/cleanup.js ─────────────────────────────────────────────────────
const { v2: cloudinary } = require('cloudinary')
const db = require('../../db')

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key:    process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
})

module.exports = async (req, res) => {
    try {
        const result = await db.query(`
            SELECT id, receipt_url FROM deposits
            WHERE status IN ('approved', 'rejected')
            AND receipt_url IS NOT NULL
            AND resolved_at < NOW() - INTERVAL '1 day'
        `)

        let cleaned = 0
        for (const row of result.rows) {
            try {
                const parts   = row.receipt_url.split('/')
                const file    = parts[parts.length - 1].split('.')[0]
                const publicId = `roletafacil/receipts/${file}`
                await cloudinary.uploader.destroy(publicId)
                await db.query(`UPDATE deposits SET receipt_url = NULL WHERE id = $1`, [row.id])
                cleaned++
            } catch {}
        }

        res.json({ ok: true, cleaned })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
}