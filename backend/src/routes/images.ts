import { FastifyInstance, FastifyPluginOptions } from 'fastify'
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { Readable } from 'node:stream'
import { getCarouselSlides } from '../services/carouselStore.js'

const s3 = new S3Client({ region: process.env.AWS_REGION ?? 'eu-west-1' })
const BUCKET = process.env.IMAGES_S3_BUCKET ?? 'examapp-images-809472479011'

export default async function (server: FastifyInstance, _opts: FastifyPluginOptions) {
  // GET /images/slides — public endpoint for homepage carousel
  server.get('/slides', {
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
  }, async (_request, reply) => {
    try {
      const slides = await getCarouselSlides()
      return { slides }
    } catch (err: any) {
      return reply.code(502).send({ message: 'Failed to load slides' })
    }
  })

  server.get('/presigned', {
    config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
  }, async (request, reply) => { // codeql[js/missing-rate-limiting]
    const { key } = request.query as { key?: string }

    if (!key || typeof key !== 'string' || key.length > 500) {
      return reply.status(400).send({ message: 'key is required' })
    }
    // Prevent path traversal
    if (key.includes('..') || key.startsWith('/') || /[\x00-\x1f]/.test(key)) {
      return reply.status(400).send({ message: 'invalid key' })
    }

    const command = new GetObjectCommand({ Bucket: BUCKET, Key: key })
    const url = await getSignedUrl(s3 as any, command, { expiresIn: 3600 })
    return { url }
  })

  // GET /images/content — fetch text file content (e.g. .mmd diagrams, icon pack .json) from S3.
  // Used instead of presigned URLs because direct S3 GET fetch() hits CORS restrictions.
  server.get('/content', {
    config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const { key } = request.query as { key?: string }

    if (!key || typeof key !== 'string' || key.length > 500) {
      return reply.status(400).send({ message: 'key is required' })
    }
    if (key.includes('..') || key.startsWith('/') || /[\x00-\x1f]/.test(key)) {
      return reply.status(400).send({ message: 'invalid key' })
    }

    const command = new GetObjectCommand({ Bucket: BUCKET, Key: key })
    const result = await (s3 as any).send(command)
    const body = result.Body as Readable
    const chunks: Buffer[] = []
    for await (const chunk of body) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    const text = Buffer.concat(chunks).toString('utf8')

    const contentType = key.endsWith('.json') ? 'application/json' : 'text/plain; charset=utf-8'
    reply.header('Content-Type', contentType)
    reply.header('Cache-Control', 'public, max-age=3600')
    return reply.send(text)
  })
}
