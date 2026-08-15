import { BaseSideService } from '@zeppos/zml/base-side'
import { settingsLib } from '@zeppos/zml/base-side'

const VERCEL_BASE = 'https://whatsapp-ai-nikhil.vercel.app'

function getSettings() {
  const hash = settingsLib.getItem('hash') || ''
  const base = settingsLib.getItem('vercelBase') || VERCEL_BASE
  return { hash, base }
}

function isGrantOption(option) {
  return option !== 'Deny'
}

async function fetchPending() {
  const { hash, base } = getSettings()
  if (!hash) return null
  const response = await fetch({
    url: `${base}/api/polls/pending?hash=${hash}`,
    method: 'GET'
  })
  const body = typeof response.body === 'string' ? JSON.parse(response.body) : response.body
  return body.poll || null
}

async function submitVote(pollId, option) {
  const { hash, base } = getSettings()
  if (!hash) return null
  const response = await fetch({
    url: `${base}/api/polls/${pollId}?hash=${hash}`,
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

    onSettingsChange({ key }) {
      if (key === 'hash' || key === 'vercelBase') {
        this.call({
          result: { type: 'settings', settings: getSettings() }
        })
      }
    },

    onRun() {},

    onDestroy() {}
  })
)
