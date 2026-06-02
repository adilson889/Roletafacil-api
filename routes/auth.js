// ─── middleware/auth.js ───────────────────────────────────────────────────────
const jwt = require('jsonwebtoken')

function authMiddleware(req, res, next) {
    const header = req.headers.authorization
    if (!header?.startsWith('Bearer '))
        return res.status(401).json({ error: 'Token em falta' })

    try {
        req.user = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET)
        next()
    } catch {
        res.status(401).json({ error: 'Token invalido ou expirado' })
    }
}

function adminMiddleware(req, res, next) {
    authMiddleware(req, res, () => {
        if (!req.user.is_admin)
            return res.status(403).json({ error: 'Acesso negado' })
        next()
    })
}

module.exports = { authMiddleware, adminMiddleware }
