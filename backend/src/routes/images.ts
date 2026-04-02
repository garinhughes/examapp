import { FastifyInstance, FastifyPluginOptions } from 'fastify'
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
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
}
