-- ─── schema.sql ──────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
    id           SERIAL PRIMARY KEY,
    public_id    VARCHAR(10)  UNIQUE NOT NULL,  -- RF-00042
    name         VARCHAR(100) NOT NULL,
    password     VARCHAR(255) NOT NULL,          -- bcrypt
    phone        VARCHAR(20),                    -- opcional
    pin_hash     VARCHAR(255),                   -- bcrypt PIN saque 6 digitos
    balance      INTEGER      NOT NULL DEFAULT 0,
    is_admin     BOOLEAN      NOT NULL DEFAULT false,
    is_blocked   BOOLEAN      NOT NULL DEFAULT false,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE deposits (
    id           SERIAL PRIMARY KEY,
    user_id      INTEGER REFERENCES users(id),
    amount       INTEGER NOT NULL,
    status       VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending|approved|rejected
    reference    VARCHAR(50),
    notes        TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at  TIMESTAMPTZ
);

CREATE TABLE withdrawals (
    id           SERIAL PRIMARY KEY,
    user_id      INTEGER REFERENCES users(id),
    amount       INTEGER NOT NULL,
    status       VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending|approved|rejected
    phone        VARCHAR(20) NOT NULL,
    expires_at   TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '5 hours',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at  TIMESTAMPTZ
);

CREATE TABLE notifications (
    id           SERIAL PRIMARY KEY,
    user_id      INTEGER REFERENCES users(id),  -- NULL = broadcast para todos
    title        VARCHAR(100) NOT NULL,
    body         TEXT NOT NULL,
    type         VARCHAR(30) NOT NULL DEFAULT 'info', -- info|success|warning|promo
    is_read      BOOLEAN NOT NULL DEFAULT false,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE game_sessions (
    id           SERIAL PRIMARY KEY,
    user_id      INTEGER REFERENCES users(id),
    bet_amount   INTEGER NOT NULL,
    bet_type     VARCHAR(50) NOT NULL,
    result       INTEGER NOT NULL,
    payout       INTEGER NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_users_public_id      ON users(public_id);
CREATE INDEX idx_deposits_user        ON deposits(user_id);
CREATE INDEX idx_withdrawals_user     ON withdrawals(user_id);
CREATE INDEX idx_notifications_user   ON notifications(user_id);
CREATE INDEX idx_notifications_unread ON notifications(user_id, is_read);