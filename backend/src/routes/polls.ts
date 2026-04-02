import { FastifyInstance, FastifyPluginOptions } from 'fastify'
import { getActivePoll, getPollVote, putPollVote } from '../services/interactions.js'

export default async function (server: FastifyInstance, _opts: FastifyPluginOptions) {
  // GET /polls/active — returns active poll + calling user's existing vote
  // Requires authentication (visitors cannot vote)
  server.get('/active', {
    preHandler: [server.authenticate],
    config: { rateLimit: { max: 100, timeWindow: '1 minute' } }, // codeql[js/missing-rate-limiting]
  }, async (request, reply) => {
    if (!request.user) return reply.code(401).send({ message: 'Unauthorized' })

    const poll = await getActivePoll()
    if (!poll) return { poll: null, myVote: null }

    const myVote = await getPollVote(request.user.sub, poll.pollId)
    return { poll, myVote }
  })

  // POST /polls/:pollId/vote
  // Requires authentication; upserts user's vote
  server.post<{ Params: { pollId: string }; Body: { selectedOptions: string[]; otherText?: string } }>(
    '/:pollId/vote',
    { preHandler: [server.authenticate], config: { rateLimit: { max: 100, timeWindow: '1 minute' } } }, // codeql[js/missing-rate-limiting]
    async (request, reply) => {
      if (!request.user) return reply.code(401).send({ message: 'Unauthorized' })

      const { pollId } = request.params
      const { selectedOptions, otherText } = request.body as any

      if (!Array.isArray(selectedOptions) || selectedOptions.length === 0) {
        return reply.code(400).send({ message: 'selectedOptions must be a non-empty array' })
      }

      const poll = await getActivePoll()
      if (!poll || poll.pollId !== pollId) {
        return reply.code(404).send({ message: 'Poll not found or not active' })
      }

      // Validate all selected option ids exist in the poll
      const validIds = new Set(poll.options.map((o) => o.id))
      if (!selectedOptions.every((id: string) => validIds.has(id))) {
        return reply.code(400).send({ message: 'Invalid option id(s)' })
      }

      const now = new Date().toISOString()
      const existing = await getPollVote(request.user.sub, pollId)

      const trimmedComment = typeof otherText === 'string' ? otherText.trim().slice(0, 500) : undefined

      await putPollVote({
        userId: request.user.sub,
        SK: `POLL#${pollId}`,
        interactionType: 'POLL_VOTE',
        pollId,
        selectedOptions,
        ...(trimmedComment && { otherText: trimmedComment }),
        userEmail: (request.user as any).email,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      })

      return { ok: true }
    }
  )
}
