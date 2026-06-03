// ─── server.js ───────────────────────────────────────────────────────────────
const express    = require('express')
const cors       = require('cors')
const helmet     = require('helmet')
const rateLimit  = require('express-rate-limit')

const authRoutes         = require('./routes/auth')
const depositRoutes      = require('./routes/deposits')
const withdrawalRoutes   = require('./routes/withdrawals')
const notificationRoutes = require('./routes/notifications')
const adminRoutes        = require('./routes/admin')
const userRoutes = require('./routes/users')

const app = express()

app.use(helmet())
app.use(cors({ origin: '*' }))
app.use(express.json())
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }))

app.use('/auth',          authRoutes)
app.use('/deposits',      depositRoutes)
app.use('/withdrawals',   withdrawalRoutes)
app.use('/notifications', notificationRoutes)
app.use('/admin',         adminRoutes)
app.use('/users', userRoutes)

app.get('/health', (_, res) => res.json({ status: 'ok' }))

module.exports = app