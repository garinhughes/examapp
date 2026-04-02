import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const s3 = new S3Client({ region: process.env.AWS_REGION ?? 'eu-west-1' })
const BUCKET = process.env.IMAGES_S3_BUCKET ?? 'examapp-images-809472479011'
const CONFIG_KEY = 'carousel/_config.json'

export interface CarouselSlide {
  id: string
  key: string    // S3 key e.g. "carousel/abc123.png"
  alt: string    // display / caption text
  order: number
}

export async function getCarouselSlides(): Promise<CarouselSlide[]> {
  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: CONFIG_KEY }))
    const body = await res.Body?.transformToString()
    if (!body) return []
    const data = JSON.parse(body)
    const slides: CarouselSlide[] = Array.isArray(data.slides) ? data.slides : []
    return slides.sort((a, b) => a.order - b.order)
  } catch (err: any) {
    if (err?.name === 'NoSuchKey' || err?.Code === 'NoSuchKey') return []
    throw err
  }
}

export async function saveCarouselSlides(slides: CarouselSlide[]): Promise<void> {
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: CONFIG_KEY,
    Body: JSON.stringify({ slides }),
    ContentType: 'application/json',
  }))
}

export async function getUploadPresignedUrl(key: string): Promise<string> {
  const command = new PutObjectCommand({ Bucket: BUCKET, Key: key })
  return getSignedUrl(s3 as any, command, { expiresIn: 300 })
}
