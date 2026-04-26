// @ts-check
// DOM ID 常量 + localStorage 键名常量。集中管理避免散落字符串字面量。

export const DOM = /** @type {const} */ ({
  modalBg:        'modalBg',
  selectedChips:  'selectedChips',
  cityList:       'cityList',
  settingsBtn:    'settingsBtn',
  wpCityBtn:      'wpCityBtn',
  modalDone:      'modalDone',
  mapPanel:       'mapPanel',
  mapSvg:         'mapSvg',
  timelinePanel:  'timelinePanel',
  localClock:     'localClock',
  wpclockTime:    'wpclock-time',
  wpclockDate:    'wpclock-date',
  worldClock:     'worldClock',
});

export const STORAGE = /** @type {const} */ ({
  selected: 'selectedCityIds',
  pinned:   'pinnedCityIds',
  map:      'mapState',
});
