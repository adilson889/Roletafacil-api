// ─── routes/deposits.js ──────────────────────────────────────────────────────
const router   = require('express').Router()
const db       = require('../db')
const multer   = require('multer')
const { v2: cloudinary } = require('cloudinary')
const { Readable } = require('stream')
const { authMiddleware } = require('../middleware/auth')

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key:    process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
})

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/webp']
        cb(null, allowed.includes(file.mimetype))
    }
})

function uploadToCloudinary(buffer) {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            { folder: 'roletafacil/receipts', transformation: [{ quality: 'auto', fetch_format: 'webp' }] },
            (err, result) => err ? reject(err) : resolve(result.secure_url)
        )
        Readable.from(buffer).pipe(stream)
    })
}

// POST /deposits
router.post('/', authMiddleware, upload.single('receipt'), async (req, res) => {
    const amount = parseInt(req.body.amount)
    if (!amount || amount < 100)
        return res.status(400).json({ error: 'Deposito minimo 100 KZ' })

    let receipt_url = null
    if (req.file) {
        try {
            receipt_url = await uploadToCloudinary(req.file.buffer)
        } catch {
            return res.status(500).json({ error: 'Erro ao enviar comprovativo' })
        }
    }

    const result = await db.query(
        `INSERT INTO deposits (user_id, amount, receipt_url)
         VALUES ($1, $2, $3) RETURNING *`,
        [req.user.id, amount, receipt_url]
    )

    await db.query(
        `INSERT INTO notifications (user_id, title, body, type)
         VALUES ($1, $2, $3, 'info')`,
        [req.user.id, 'Deposito recebido', `Pedido de ${amount} KZ em analise.`]
    )

    res.status(201).json(result.rows[0])
})

// GET /deposits
router.get('/', authMiddleware, async (req, res) => {
    const result = await db.query(
        'SELECT * FROM deposits WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
        [req.user.id]
    )
    res.json(result.rows)
})

module.exports = router