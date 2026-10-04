export const NS = 'settings.anyBg'

export const zh: Record<string, string> = {
  nav: '模型背景', brandTag: '按模型换背景',
  pageInterface: '界面', pageModelBg: '模型背景', pageProfile: '配置',
  descInterface: '为主界面的各个区域单独调节透明度与模糊，营造空间层次感。这里的设置对所有模型生效',
  descModelBg: '每条规则 = 一个匹配串 + 一组背景图与外观。切换模型时，从上往下找第一条匹配串出现在模型名里的规则；都没中就使用第 1 条。一条规则可以放多张图，按你设的节奏轮换',
  descProfile: '调整壁纸切换效果，并把当前全部规则连同图片导出备份，或从文件一键恢复',

  uiTitle: '主界面',
  uiOpacity: '透明度', uiBlur: '模糊度',
  uiOpacityBg: '主背景', uiOpacitySide: '左侧栏', uiOpacityCard: '卡片与菜单面板', uiOpacityCode: '代码块', uiOpacityInput: '输入框与控件',
  uiSop: '设置界面透明度', uiChatRegion: '对话文本框', uiTrajectory: '轨迹页',
  uiPreview: '右侧栏',

  // Only the diagnostics survive: the model/rule readout they used to sit under
  // is gone (the match tester at the top of the page answers the same question).
  statusUnknownHint: '检测不到时一律使用第 1 条可用规则；切换一次模型或稍等片刻会自动重试',
  statusSourceDefaultHint: '只读到宿主默认模型，它不是本会话当前选择的模型；本会话的模型选择可用后会自动纠正',
  statusNoteNoService: '仍未拿到会话服务（会话控制器晚于本插件加载），正在自动重试',
  statusNoteNoSession: '会话服务已就绪，但还没有当前会话 id',
  statusNoteNoProjection: '拿不到本会话的模型选择投影（binding / projections 不可用）',
  statusNoteEmptySelection: '本会话的模型选择投影还没有值（切一次模型即可写入）',

  // Shown only when the running host process predates multi-image: the panel works
  // but holds its writes, and the user has to restart DSH to make them land.
  hostStaleHint: '检测到 DSH 主进程仍在运行旧版插件：新版配置格式它还读不懂，为避免丢规则，本次只改界面不写入配置。重启 DSH 后多图与轮换即可正常保存',
  tryoutTitle: '匹配试跑',
  tryoutPlaceholder: '输入模型名，如 deepseek-flash',
  tryoutUseCurrent: '填入当前模型',
  tryoutHit: '命中规则',
  tryoutFallback: '无匹配 · 走兜底规则',
  tryoutNone: '没有可用规则（规则需要启用，并且有图片或主题色）',
  tryoutEmpty: '输入模型名即可试跑',
  autoExtract: '选图后自动取主题色',
  ruleAdd: '新增规则',
  ruleFallbackBadge: '兜底',
  ruleMatchPlaceholder: '如 flash / glm（忽略大小写，留空则不参与匹配）',
  ruleEnabled: '启用',
  ruleUp: '上移', ruleDown: '下移', ruleRemove: '删除规则',
  ruleNoImage: '尚未选择图片',
  ruleFromUrl: '从网址', ruleUrlPlaceholder: '粘贴图片网址 https://…',
  ruleUrlApply: '应用', ruleUrlCancel: '取消', ruleUrlApplying: '加载中…',
  ruleUrlBadHttp: '仅支持 http/https 图片网址', ruleUrlFail: '获取图片失败',
  ruleImageRemove: '移除',
  ruleEmptyHint: '这条规则还没有图片，也没有自己的主题色：没有可显示的内容，匹配和兜底都会跳过它',
  // The other no-image state — the rule kept its own color, so it DOES paint.
  ruleColorOnlyHint: '这条规则还没有图片：不会铺壁纸，界面只用这个主题色',
  // Images exist but the selected one has no bytes (deleted outside DSH, or still
  // being read): saying "this rule has no image" there was simply wrong.
  ruleImagePendingHint: '这张图片还没有取到内容，稍后会自己出现（也可以直接替换它）',
  ruleColor: '主题色',
  ruleColorNone: '跟随系统主题',
  ruleColorNoneHint: '未设颜色时跟随系统主题：界面用宿主的配色，壁纸与各部位的透明度、模糊照旧生效',
  // Shown where a rule has NO color yet: pressing it picks a color, which is the
  // opposite of what the button above does, so it must not borrow that label.
  ruleColorPick: '自定义颜色',
  ruleColorPickHint: '优先从本图取色，取不到就用默认色',
  // Same button, but there is no image to extract from: promising an extraction
  // next to a disabled "extract" button is the one thing this hint cannot say.
  ruleColorNoImageHint: '这条规则还没有图片，取不到色：选一个颜色可以只铺主题色，或先添加图片',
  // …and its sibling: there IS an image, it just has no bytes yet. Saying "this
  // rule has no image" here would contradict the strip right above it.
  ruleColorPendingImageHint: '这张图片还没有取到内容，暂时取不了色：可以直接选一个颜色，或等它加载完',
  ruleColorExtract: '从本图提取',
  // Which of the two things the color controls below edit. A theme color belongs
  // to an image, so the same wheel means different things depending on the strip,
  // and a section that silently retargets is how "I changed it and nothing
  // happened" starts.
  ruleColorTargetImage: '作用于选中的图片：',
  ruleColorTargetRule: '作用于本规则（它还没有图片）',
  ruleLayout: '布局模式',
  ruleFramingEdit: '编辑位置',
  ruleOpacity: '背景透明度',
  ruleBlur: '背景模糊',
  ruleBlurHint: '背景模糊作用于壁纸层；界面页里的模糊作用于界面各区域，两者互不影响',

  // ── 多图轮换 ──────────────────────────────────────────────────────────────
  // 默认关闭：轮换会真的花流量、内存和电，不能靠"默认"偷偷替用户做主。
  rotTitle: '多图轮换',
  rotEnable: '轮换这组图',
  rotNeedTwo: '至少两张图才能轮换',
  rotEvery: '每张停留',
  rotCustom: '自定义秒数',
  rotSeconds: '秒',
  rotOrder: '换图顺序',
  rotOrderSeq: '按顺序',
  rotOrderShuffle: '随机',
  rotOnSwitch: '切换模型时也换一张',
  rotNext: '下一张',
  rotNextInactive: '只有正在生效的规则能换画面上的图',
  rotPos: '第',
  rotShowing: '正在显示',
  rotAddImage: '添加',
  // Replacing keeps the image's position in the rotation, so it is a different
  // action from adding and must not borrow that label.
  rotReplaceImage: '替换',
  rotDragHint: '拖动排序',
  rotDblHint: '双击切换',
  rotEvery10s: '10 秒', rotEvery30s: '30 秒', rotEvery1m: '1 分钟',
  rotEvery5m: '5 分钟', rotEvery30m: '30 分钟', rotEvery1h: '1 小时',


  bgModeFit: '适应', bgModeFill: '填充', bgModeStretch: '拉伸', bgModeTile: '平铺', bgModeCenter: '居中',
  editorTitle: '背景编辑器', editorHint: '拖动移动画面，滚轮缩放大小',
  editorCommit: '确认', editorCancel: '取消', editorReset: '重置',

  extracting: '取色中…',
  extractDone: '已应用图片配色',
  extractFail: '未在这张图里找到鲜明的颜色，请换一张',
  eyedropper: '从图片取色',
  pickerTitle: '从图片取色',
  pickerHint: '移动鼠标预览颜色，点击图片选取为主题色',
  pickerClose: '关闭',

  crashTitle: '界面渲染出错',
  crashDesc: '设置面板遇到问题，点击下方按钮重置后重试',
  crashReset: '重置面板',

  exportTheme: '导出配置', importTheme: '导入配置',
  exportCardTitle: '导出配置',
  exportCardDesc: '把全部规则、每条规则的颜色/布局/透明度/模糊与图片打包为 dsh-background-by-model-theme.json',
  importCardTitle: '导入配置',
  importCardDesc: '从之前导出的 JSON 文件一键恢复全部规则（会覆盖当前规则与图片）',
  toastExportDone: '配置文件已开始下载',
  importDone: '已导入配置',
  importFail: '导入失败，文件格式不正确',
  footerTag: '按模型换背景插件',
  repoLink: '在 GitHub 上打开仓库',

  // ── 节日特殊背景（默认开启；界面上只有一行开关）───────────────────────────
  holidayTitle: '节日特殊背景',
  holidayEnable: '启用节日特殊背景（中秋当天、国庆 10 月 1–7 日）',

  // ── 切换效果（全局；配置页）───────────────────────────────────────────────
  // 效果与缓动是全局的（规则没有"效果"这个概念），时长默认仍由每条规则决定。
  trTitle: '切换效果',
  trEffect: '切换方式',
  trEffectFade: '淡入淡出',
  trEffectNone: '直接切换',
  trEffectZoom: '缩放淡入',
  trEffectSlide: '平移推入',
  trEasing: '缓动',
  trEasingEase: '标准',
  trEasingLinear: '匀速',
  trEasingOut: '先快后慢',
  trEasingInOut: '两端慢',
  trDuration: '切换时长',
  trPreview: '试放',
  trHint: '效果对所有换图生效：切模型、轮换、手动下一张、节日。「直接切换」和 0 秒一样是硬切',
  trReducedHint: '系统开启了「减少动态效果」，实际切换不会播放动画',
}

export const en: Record<string, string> = {
  nav: 'Model background', brandTag: 'Per-model wallpaper',
  pageInterface: 'Interface', pageModelBg: 'Model background', pageProfile: 'Profile',
  descInterface: 'Tune opacity and blur per surface to build depth. These settings are global and apply to every model',
  descModelBg: 'Each rule is a match string plus a set of wallpapers and one look. On a model switch the list is scanned top-down for the first match string contained in the model name; if nothing hits, rule 1 is used. A rule can hold several images and rotate through them on a rhythm you set',
  descProfile: 'Tune how the wallpaper switches, and back up every rule together with its image — or restore one from a file',

  uiTitle: 'Interface',
  uiOpacity: 'Opacity', uiBlur: 'Blur',
  uiOpacityBg: 'Main background', uiOpacitySide: 'Left panel', uiOpacityCard: 'Cards & menus', uiOpacityCode: 'Code blocks', uiOpacityInput: 'Input & controls',
  uiSop: 'Settings interface opacity', uiChatRegion: 'Conversation text frame', uiTrajectory: 'Trajectory view',
  uiPreview: 'Right panel',

  // Only the diagnostics survive: the model/rule readout they used to sit under
  // is gone (the match tester at the top of the page answers the same question).
  statusUnknownHint: 'Without a detected model rule 1 is always used; switching the model once or waiting a moment retries automatically',
  statusSourceDefaultHint: 'Only the host-wide default model could be read — that is not necessarily this session\'s selection. It self-corrects once this session\'s model selection is available.',
  statusNoteNoService: 'The sessions service is not available yet (the session controller loads after this plugin); retrying automatically',
  statusNoteNoSession: 'The sessions service is up but reports no current session yet',
  statusNoteNoProjection: 'This session\'s model-selection projection is unreachable (no binding / projections)',
  statusNoteEmptySelection: 'The model-selection projection exists but carries no value yet (selecting a model once writes it)',

  // Shown only when the running host process predates multi-image: the panel works
  // but holds its writes, and the user has to restart DSH to make them land.
  hostStaleHint: 'The DSH host process is still running the older plugin, which cannot read the new config shape. To avoid dropping rules, this session changes the interface but holds every config write — restart DSH and multi-image plus rotation will save normally',
  tryoutTitle: 'Match test',
  tryoutPlaceholder: 'Type a model name, e.g. deepseek-flash',
  tryoutUseCurrent: 'Use current model',
  tryoutHit: 'matches rule',
  tryoutFallback: 'no match · fallback rule',
  tryoutNone: 'No usable rule (a rule needs to be enabled and carry an image or a theme color)',
  tryoutEmpty: 'Type a model name to test the list',
  autoExtract: 'Extract the theme color when an image is chosen',
  ruleAdd: 'Add rule',
  ruleFallbackBadge: 'fallback',
  ruleMatchPlaceholder: 'e.g. flash / glm (case-insensitive, empty never matches)',
  ruleEnabled: 'Enabled',
  ruleUp: 'Move up', ruleDown: 'Move down', ruleRemove: 'Remove rule',
  ruleNoImage: 'No image yet',
  ruleFromUrl: 'From URL', ruleUrlPlaceholder: 'Paste an image URL https://…',
  ruleUrlApply: 'Apply', ruleUrlCancel: 'Cancel', ruleUrlApplying: 'Loading…',
  ruleUrlBadHttp: 'Only http/https image URLs are supported', ruleUrlFail: 'Could not fetch the image',
  ruleImageRemove: 'Remove',
  ruleEmptyHint: 'This rule has no image and no theme color of its own: it has nothing to show, so matching and the fallback both skip it',
  // The other no-image state — the rule kept its own color, so it DOES paint.
  ruleColorOnlyHint: 'No image in this rule yet: no wallpaper is shown, and the interface is painted from this theme color alone',
  // Images exist but the selected one has no bytes (deleted outside DSH, or still
  // being read): saying "this rule has no image" there was simply wrong.
  ruleImagePendingHint: 'This image has no content yet — it appears once it loads; you can also replace it',
  ruleColor: 'Theme color',
  ruleColorNone: 'Follow system theme',
  ruleColorNoneHint: 'Without a color this rule follows the system theme: the host palette paints the interface while the wallpaper and every opacity/blur slider keep working',
  // Shown where a rule has NO color yet: pressing it picks a color, which is the
  // opposite of what the button above does, so it must not borrow that label.
  ruleColorPick: 'Custom color',
  ruleColorPickHint: 'Extracts from this image when it can, otherwise uses a default color',
  // Same button, but there is no image to extract from: promising an extraction
  // next to a disabled "extract" button is the one thing this hint cannot say.
  ruleColorNoImageHint: 'This rule has no image to take a color from: pick a color to tint the interface alone, or add an image first',
  // …and its sibling: there IS an image, it just has no bytes yet. Saying "this
  // rule has no image" here would contradict the strip right above it.
  ruleColorPendingImageHint: 'This image has no content yet, so there is nothing to extract from: pick a color directly, or wait for it to load',
  ruleColorTargetImage: 'Applies to the selected image:',
  ruleColorTargetRule: 'Applies to this rule (it has no image yet)',
  ruleColorExtract: 'Extract from image',
  ruleLayout: 'Layout mode',
  ruleFramingEdit: 'Edit position',
  ruleOpacity: 'Background opacity',
  ruleBlur: 'Background blur',
  ruleBlurHint: 'Background blur affects the wallpaper layer; the blur on the Interface page affects interface surfaces — they are independent',

  // ── Multi-image rotation ──────────────────────────────────────────────────
  // Off by default: rotating really does spend bandwidth, memory and battery,
  // and no default should quietly decide that for the user.
  rotTitle: 'Image rotation',
  rotEnable: 'Rotate these images',
  rotNeedTwo: 'At least two images are needed to rotate',
  rotEvery: 'Dwell time per image',
  rotCustom: 'Custom seconds',
  rotSeconds: 's',
  rotOrder: 'Order',
  rotOrderSeq: 'In order',
  rotOrderShuffle: 'Shuffle',
  rotOnSwitch: 'Also step on a model switch',
  rotNext: 'Next image',
  rotNextInactive: 'Only the active rule can step the background',
  rotPos: 'Image',
  rotShowing: 'On screen',
  rotAddImage: 'Add',
  // Replacing keeps the image's position in the rotation, so it is a different
  // action from adding and must not borrow that label.
  rotReplaceImage: 'Replace',
  rotDragHint: 'drag to reorder',
  rotDblHint: 'double-click to show',
  rotEvery10s: '10 s', rotEvery30s: '30 s', rotEvery1m: '1 min',
  rotEvery5m: '5 min', rotEvery30m: '30 min', rotEvery1h: '1 h',


  bgModeFit: 'Fit', bgModeFill: 'Fill', bgModeStretch: 'Stretch', bgModeTile: 'Tile', bgModeCenter: 'Center',
  editorTitle: 'Background editor', editorHint: 'Drag to move, scroll to zoom',
  editorCommit: 'Confirm', editorCancel: 'Cancel', editorReset: 'Reset',

  extracting: 'Extracting…',
  extractDone: 'Image colors applied',
  extractFail: 'No vivid color found in this image, try another',
  eyedropper: 'Eyedropper',
  pickerTitle: 'Pick from image',
  pickerHint: 'Hover to preview, click to pick as the theme color',
  pickerClose: 'Close',

  crashTitle: 'Section crashed',
  crashDesc: 'The panel hit an error. Reset below to recover.',
  crashReset: 'Reset panel',

  exportTheme: 'Export', importTheme: 'Import',
  exportCardTitle: 'Export profile',
  exportCardDesc: 'Bundle every rule — color, layout, opacity, blur — and its image into dsh-background-by-model-theme.json',
  importCardTitle: 'Import profile',
  importCardDesc: 'Restore every rule and image from a previously exported JSON file (replaces the current set)',
  toastExportDone: 'Export started',
  importDone: 'Profile imported',
  importFail: 'Import failed — invalid file',
  footerTag: 'Per-model wallpaper plugin',
  repoLink: 'Open the repository on GitHub',

  // ── Holiday overrides (on by default; one switch, no cards) ───────────────
  holidayTitle: 'Holiday backgrounds',
  holidayEnable: 'Enable holiday backgrounds (Mid-Autumn day, Oct 1–7)',

  // ── Switch effect (global; the Config page) ───────────────────────────────
  // The effect and the easing are global — a rule has no notion of one — while
  // the duration stays each rule's own unless it is unified here.
  trTitle: 'Switch effect',
  trEffect: 'Transition',
  trEffectFade: 'Cross-fade',
  trEffectNone: 'Instant',
  trEffectZoom: 'Zoom in',
  trEffectSlide: 'Slide in',
  trEasing: 'Easing',
  trEasingEase: 'Standard',
  trEasingLinear: 'Linear',
  trEasingOut: 'Ease out',
  trEasingInOut: 'Ease in-out',
  trDuration: 'Duration',
  trPreview: 'Preview',
  trHint: 'The effect applies to every change: model switch, rotation, manual next, holidays. “Instant” and 0 s are the same hard cut',
  trReducedHint: 'Your system asks for reduced motion, so a real switch will not animate',
}
