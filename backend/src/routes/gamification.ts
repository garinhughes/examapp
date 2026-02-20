import { FastifyInstance, FastifyPluginOptions } from 'fastify'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { getUserBySub } from '../services/dynamo.js'

// When `GAM_TABLE` is set in the environment we are running in prod and
// there is no local <-> prod gamification sync. In that case we must not
// attempt to create `/app/dist/data` (causes EACCES in container).
const USE_LOCAL_GAM = !(process.env.GAM_TABLE && process.env.GAM_TABLE.length > 0)

const dataDir = fileURLToPath(new URL('../../data', import.meta.url))
const gamificationFile = path.join(dataDir, 'gamification.json')

interface GamificationRecord {
  userId: string
  xp: number
  level: number
  streak: number
  leaderboardOptIn: boolean
  displayName: string
  updatedAt: string
}

interface GamificationDb {
  users: GamificationRecord[]
}

async function loadDb(): Promise<GamificationDb> {
  try {
    const raw = await fs.readFile(gamificationFile, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return { users: [] }
  }
}

async function saveDb(db: GamificationDb) {
  await fs.mkdir(dataDir, { recursive: true })
  await fs.writeFile(gamificationFile, JSON.stringify(db, null, 2))
}

export default async function (server: FastifyInstance, _opts: FastifyPluginOptions) {
  // Sync gamification state from client — enabled only in local/dev mode.
  server.post('/sync', { preHandler: [server.authenticate] }, async (request, reply) => {
    if (!USE_LOCAL_GAM) {
      return reply.status(501).send({ message: 'gamification sync disabled in production' })
    }

    const body = request.body as any
    const userId = request.user?.sub
    if (!userId) return reply.status(401).send({ message: 'unauthorized' })

    const db = await loadDb()
    const idx = db.users.findIndex((u) => u.userId === userId)
    const record: GamificationRecord = {
      userId,
      xp: Number(body.xp) || 0,
      level: Number(body.level) || 0,
      streak: Number(body.streak) || 0,
      leaderboardOptIn: !!body.leaderboardOptIn,
      displayName: String(body.displayName || request.user?.name || 'Anonymous'),
      updatedAt: new Date().toISOString(),
    }

    if (idx >= 0) {
      db.users[idx] = record
    } else {
      db.users.push(record)
    }
    await saveDb(db)
    return { ok: true }
  })

  // Get leaderboard (public entries only)
  server.get('/leaderboard', { preHandler: [server.authenticate] }, async (request, reply) => {
    // In production there is no local gam db — return empty leaderboard.
    if (!USE_LOCAL_GAM) return { entries: [] }

    const db = await loadDb()
    const userId = request.user?.sub

    const optedIn = db.users.filter((u) => u.leaderboardOptIn)
    // sort by XP desc
    optedIn.sort((a, b) => b.xp - a.xp)

    // Look up usernames from DynamoDB for each opted-in user
    const entries = await Promise.all(
      optedIn.map(async (u, i) => {
        let username: string | null = null
        try {
          const dbUser = await getUserBySub(u.userId)
          username = dbUser?.username ?? null
        } catch {}
        return {
          rank: i + 1,
          name: username || u.displayName,
          username: username ?? undefined,
          xp: u.xp,
          level: u.level,
          streak: u.streak,
          isYou: u.userId === userId,
        }
      })
    )

    return { entries }
  })

  // Get own gamification data from server
  server.get('/me', { preHandler: [server.authenticate] }, async (request, reply) => {
    if (!USE_LOCAL_GAM) return reply.status(404).send({ message: 'gamification data not available in production' })
    const db = await loadDb()
    const userId = request.user?.sub
    const record = db.users.find((u) => u.userId === userId)
    if (!record) return reply.status(404).send({ message: 'no gamification data' })
    return record
  })
}
