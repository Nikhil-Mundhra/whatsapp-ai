import * as hmUI from '@zos/ui'
import { getText } from '@zos/i18n'
import { getDeviceInfo } from '@zos/device'
import { log as Logger } from '@zos/utils'

import { BasePage } from '@zeppos/zml/base-page'
import {
  TITLE_TEXT_STYLE,
  SUB_TEXT_STYLE,
  STATUS_TEXT_STYLE,
  OPTION_BUTTONS
} from 'zosLoader:./index.page.[pf].layout.js'

const logger = Logger.getLogger('takeover-page')

Page(
  BasePage({
    state: {
      title: null,
      sub: null,
      status: null,
      optionButtons: [],
      pendingPollId: null,
      pollActive: false
    },
    onInit() {
      logger.debug('page onInit invoked')
      this.createUI()
      this.refresh()
    },
    build() {
      logger.debug('page build invoked')
    },
    onDestroy() {
      logger.debug('page onDestroy invoked')
    },
    onCall(req) {
      const { result } = req
      logger.log('companion call', result)
      if (result && result.type === 'poll') {
        this.showPoll(result.poll)
      } else if (result && result.type === 'vote-result') {
        this.setStatus(getText(result.vote === 'grant' ? 'voteGranted' : 'voteDenied'))
      }
    },
    createUI() {
      const { width } = getDeviceInfo()
      this.state.title = hmUI.createWidget(hmUI.widget.TEXT, {
        ...TITLE_TEXT_STYLE
      })
      this.state.sub = hmUI.createWidget(hmUI.widget.TEXT, {
        ...SUB_TEXT_STYLE
      })
      this.state.status = hmUI.createWidget(hmUI.widget.TEXT, {
        ...STATUS_TEXT_STYLE
      })

      OPTION_BUTTONS.forEach((cfg) => {
        const btn = hmUI.createWidget(hmUI.widget.BUTTON, {
          ...cfg,
          click_func: () => {
            if (this.state.pollActive) {
              this.vote(cfg.key)
            }
          }
        })
        this.state.optionButtons.push(btn)
      })
    },
    refresh() {
      this.request({ method: 'GET_POLL' })
        .then(({ result }) => {
          logger.log('GET_POLL result', result)
          if (result && result.poll) {
            this.showPoll(result.poll)
          } else {
            this.showIdle()
          }
        })
        .catch((err) => {
          logger.log('GET_POLL error', err)
          this.showIdle()
        })
    },
    showIdle() {
      this.state.pollActive = false
      this.state.pendingPollId = null
      this.state.sub.setProperty(hmUI.prop.TEXT, getText('noPending'))
      this.state.status.setProperty(hmUI.prop.VISIBLE, false)
      this.state.optionButtons.forEach((b) => b.setProperty(hmUI.prop.VISIBLE, false))
    },
    showPoll(poll) {
      this.state.pollActive = true
      this.state.pendingPollId = poll.id
      this.state.sub.setProperty(hmUI.prop.TEXT, `${poll.contactDisplay}:\n${poll.question}`)
      this.state.status.setProperty(hmUI.prop.VISIBLE, true)
      this.state.status.setProperty(hmUI.prop.TEXT, getText('tapToVote'))
      poll.options.forEach((opt, i) => {
        const btn = this.state.optionButtons[i]
        if (btn) {
          btn.setProperty(hmUI.prop.TEXT, opt)
          btn.setProperty(hmUI.prop.VISIBLE, true)
        }
      })
    },
    vote(option) {
      this.state.pollActive = false
      this.setStatus(getText('sending'))
      const pollId = this.state.pendingPollId
      this.request({ method: 'VOTE', params: { pollId, option } })
        .then(({ result }) => {
          logger.log('VOTE result', result)
          if (result && result.vote === 'grant') {
            this.setStatus(getText('voteGranted'))
          } else if (result && result.vote === 'deny') {
            this.setStatus(getText('voteDenied'))
          } else {
            this.setStatus(getText('voteFailed'))
          }
          setTimeout(() => this.refresh(), 3000)
        })
        .catch(() => {
          this.setStatus(getText('voteFailed'))
          this.state.pollActive = true
        })
    },
    setStatus(text) {
      this.state.status.setProperty(hmUI.prop.TEXT, text)
      this.state.status.setProperty(hmUI.prop.VISIBLE, true)
    }
  })
)
