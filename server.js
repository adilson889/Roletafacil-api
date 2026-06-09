// ─── server.js ───────────────────────────────────────────────────────────────
const express    = require('express')
const cors       = require('cors')
const helmet     = require('helmet')
const rateLimit  = require('express-rate-limit')

const authRoutes         = require('./routes/auth')
const gameRoutes = require('./routes/game')
const depositRoutes      = require('./routes/deposits')
const withdrawalRoutes   = require('./routes/withdrawals')
const referralRoutes = require('./routes/referral')
const notificationRoutes = require('./routes/notifications')
const adminRoutes        = require('./routes/admin')
const analyticsRoutes = require('./routes/analytics')
const rewardsRoutes   = require('./routes/rewards')

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
app.use('/game', gameRoutes)
app.use('/referral', referralRoutes)
app.use('/analytics', analyticsRoutes)
app.use('/rewards',   rewardsRoutes)

app.get('/health', (_, res) => res.json({ status: 'ok' }))

module.exports = app