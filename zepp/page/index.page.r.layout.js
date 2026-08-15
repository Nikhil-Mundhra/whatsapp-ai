import * as hmUI from '@zos/ui'
import { getText } from '@zos/i18n'
import { getDeviceInfo } from '@zos/device'
import { px } from '@zos/utils'

export const { width: DEVICE_WIDTH, height: DEVICE_HEIGHT } = getDeviceInfo()

export const TITLE_TEXT_STYLE = {
  text: getText('title'),
  x: px(60),
  y: px(30),
  w: DEVICE_WIDTH - px(120),
  h: px(48),
  color: 0xffffff,
  text_size: 30,
  align_h: hmUI.align.CENTER_H,
  text_style: hmUI.text_style.WRAP
}

export const SUB_TEXT_STYLE = {
  text: getText('loading'),
  x: px(40),
  y: px(80),
  w: DEVICE_WIDTH - px(80),
  h: px(90),
  color: 0xcccccc,
  text_size: 24,
  align_h: hmUI.align.CENTER_H,
  text_style: hmUI.text_style.WRAP
}

export const STATUS_TEXT_STYLE = {
  text: '',
  x: px(60),
  y: px(16),
  w: DEVICE_WIDTH - px(120),
  h: px(40),
  color: 0x7cfc00,
  text_size: 22,
  align_h: hmUI.align.CENTER_H,
  text_style: hmUI.text_style.WRAP,
  visible: false
}

export const OPTION_BUTTONS = [
  {
    key: 'Send 1 text',
    x: px(30),
    y: px(180),
    w: px(200),
    h: px(64),
    radius: px(20),
    normal_color: 0x2b6cb0,
    press_color: 0x1a365d,
    text_color: 0xffffff,
    text_size: 22
  },
  {
    key: '5 minutes',
    x: px(250),
    y: px(180),
    w: px(200),
    h: px(64),
    radius: px(20),
    normal_color: 0x2b6cb0,
    press_color: 0x1a365d,
    text_color: 0xffffff,
    text_size: 22
  },
  {
    key: '2 hours',
    x: px(30),
    y: px(258),
    w: px(200),
    h: px(64),
    radius: px(20),
    normal_color: 0x38a169,
    press_color: 0x22543d,
    text_color: 0xffffff,
    text_size: 22
  },
  {
    key: 'Deny',
    x: px(250),
    y: px(258),
    w: px(200),
    h: px(64),
    radius: px(20),
    normal_color: 0xc53030,
    press_color: 0x742a2a,
    text_color: 0xffffff,
    text_size: 22
  }
]
