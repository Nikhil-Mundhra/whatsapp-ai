import { BaseSideService } from '@zeppos/zml/base-side'

const VERCEL_BASE = 'https://your-project.vercel.app'

function isGrantOption(option) {
  return option !== 'Deny'
}

async function fetchPending() {
  const response = await fetch({
    url: `${VERCEL_BASE}/api/polls/pending`,
    method: 'GET'
  })
  const body = typeof response.body === 'string' ? JSON.parse(response.body) : response.body
  return body.poll || null
}

async function submitVote(pollId, option) {
  const response = await fetch({
    url: `${VERCEL_BASE}/api/polls/${pollId}`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      option,
      source: 'watch'
    })
  })
  const body = typeof response.body === 'string' ? JSON.parse(response.body) : response.body
  return body.poll || null
}

AppSideService(
  BaseSideService({
    onInit() {},

    onRequest(req, res) {
      if (req.method === 'GET_POLL') {
        fetchPending()
          .then((poll) => res(null, { poll }))
          .catch(() => res(null, { poll: null }))
      } else if (req.method === 'VOTE') {
        const { pollId, option } = req.params
        submitVote(pollId, option)
          .then((poll) => {
            if (!poll) return res(null, { vote: 'deny' })
            res(null, {
              vote: isGrantOption(option) ? 'grant' : 'deny',
              poll
            })
          })
          .catch(() => res(null, { vote: 'deny' }))
      } else {
        res(null, {})
      }
    },

    onRun() {},

    onDestroy() {}
  })
)
