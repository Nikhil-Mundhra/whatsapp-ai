import { gettext } from 'i18n'

const DEFAULT_BASE = 'https://whatsapp-ai-nikhil.vercel.app'

AppSettingsPage({
  state: {
    hash: '',
    vercelBase: DEFAULT_BASE,
    props: {}
  },
  setState(props) {
    this.state.props = props
    this.state.hash = props.settingsStorage.getItem('hash') || ''
    this.state.vercelBase =
      props.settingsStorage.getItem('vercelBase') || DEFAULT_BASE
    console.log('TakeOver settings loaded', this.state.hash, this.state.vercelBase)
  },
  build(props) {
    this.setState(props)
    return View(
      {
        style: {
          padding: '12px 20px'
        }
      },
      [
        View(
          { style: { marginBottom: '8px' } },
          [
            TextInput({
              label: 'Connection hash',
              value: this.state.hash,
              placeholder: 'e.g. ABC123',
              subStyle: { color: '#333', fontSize: '14px' },
              maxLength: 12,
              onChange: (val) => {
                const v = (val || '').trim().toUpperCase()
                this.state.hash = v
                this.state.props.settingsStorage.setItem('hash', v)
                console.log('hash set', v)
              }
            })
          ]
        ),
        View(
          { style: { marginBottom: '12px' } },
          [
            TextInput({
              label: 'Server URL',
              value: this.state.vercelBase,
              placeholder: DEFAULT_BASE,
              subStyle: { color: '#333', fontSize: '14px' },
              maxLength: 120,
              onChange: (val) => {
                const v = (val || '').trim()
                this.state.vercelBase = v || DEFAULT_BASE
                this.state.props.settingsStorage.setItem('vercelBase', v)
                console.log('base set', v)
              }
            })
          ]
        ),
        View(
          {
            style: {
              color: '#888', fontSize: '12px', marginBottom: '8px'
            }
          },
          [Text({ text: gettext('settingsHint') })]
        )
      ]
    )
  }
})
