import { sendWelcomeEmail } from '../dist/src/services/ses.js'

process.env.SES_FROM_ADDRESS ||= 'noreply@certshack.com'
process.env.FRONTEND_ORIGIN ||= 'https://certshack.com'

await sendWelcomeEmail({
  to: 'gh94uk@gmail.com',
  name: 'Garin',
  userId: 'test-user',
})
console.log('sent')
