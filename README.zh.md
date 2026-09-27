# dsh-background-by-model

<p align="center">
  <a href="https://github.com/HarmlessFunny/dsh-background-by-model"><img src="https://img.shields.io/github/stars/HarmlessFunny/dsh-background-by-model?style=social" alt="GitHub stars"></a>
  <a href="https://www.npmjs.com/package/dsh-background-by-model"><img src="https://img.shields.io/npm/v/dsh-background-by-model" alt="npm version"></a>
</p>

[English](README.md) | 中文

> 派生自 [`Tkingxiao/dsh-any-background`](https://github.com/Tkingxiao/dsh-any-background)，并重命名为 `dsh-background-by-model`。

一个 **DeepSeek Harness** 外观插件，核心是一份**有序的模型规则列表**：每条规则自带壁纸、主题色、布局模式、取景、透明度与模糊度，切换模型即切换背景。

> **v0.3.0 是破坏性更新**：视频背景、生成式背景与全局主题色均已被移除。详见 [CHANGELOG.zh.md 的 v0.3.0 条目](./CHANGELOG.zh.md#v030)。

---

## 模型规则如何工作

一条规则 = 一个**匹配串** + **一整套背景外观**。切换模型时，插件读取当前会话的模型名，自上而下扫描列表，使用**第一条**“匹配串出现在模型名里”的规则（忽略大小写）。如果一条都没命中，就使用**第 1 条**——规则 1 同时兼任兜底。

示例列表：

| # | 匹配串 | 背景图 |
| --- | --- | --- |
| 1 | `deepseek` | 图 1 |
| 2 | `flash` | 图 2 |
| 3 | `glm` | 图 3 |

| 当前模型 | 结果 | 原因 |
| --- | --- | --- |
| `DeepSeek-Flash` | 规则 1 → 图 1 | `deepseek` 先命中 |
| `GLM-Flash` | 规则 2 → 图 2 | `flash` 比 `glm` 更靠前 |
| `Qwen-Flash` | 规则 2 → 图 2 | `flash` 命中 |
| `GLM-Turbo` | 规则 3 → 图 3 | 只有 `glm` 命中 |
| `Kimi-K3` | 兜底 → 规则 1 → 图 1 | 都没有命中 |

说明：

- **顺序即优先级。** 先命中者胜，而不是最精确者胜——需要时拖动规则调整顺序。
- **匹配串留空**表示该规则不参与匹配、只作为兜底。因此单规则 + 空匹配串就是“一张图到处用”。
- 匹配串会同时比对 **provider、模型 id 与模型显示名**三者拼接出的字符串，三者任一都能用来选中规则。
- 当前模型取自**本会话的持久化模型选择**（`modelSelection` 投影，和输入框上的模型选择器读的是同一份值），因此会话内切换模型会立即生效。「模型背景」页顶部会显示当前读到的是哪个模型；如果只读到宿主全局默认模型（不是本会话的选择），会额外标注 **宿主默认**。

> 提醒：上面这张示例表里**没有 `kimi`**，所以切到 Kimi 会走到兜底 = 规则 1 = 图 1，看起来像“没反应”。想给 Kimi 单独配图，就加一条匹配串为 `kimi` 的规则。

## 截图

同一套界面、同一份配置，只因为当前模型不同：

<p align="center">
  <img src="example_img/wallpaper-deepseek.webp" alt="DeepSeek 下的外观" width="880">
  <br/>
  <em>DeepSeek V4.1 Flash · 命中匹配串含 <code>deepseek</code> 的规则：浅色壁纸 + 与图相配的主题色</em>
</p>

<p align="center">
  <img src="example_img/wallpaper-kimi.webp" alt="Kimi 下的外观" width="880">
  <br/>
  <em>Kimi K2.7 Code · 命中匹配串含 <code>kimi</code> 的规则：深色壁纸 + 深色主题，整个界面跟着换肤</em>
</p>

<p align="center">
  <img src="example_img/rule-editor.webp" alt="单条规则的编辑器" width="660">
  <br/>
  <em>「模型背景」页的单条规则 · 图片、布局模式、主题色（色轮 / HSL / RGB / 从本图提取 / 从图片取色）、背景透明度与背景模糊度，都是这一条规则自己的属性</em>
</p>

<p align="center">
  <sub>示例壁纸素材来源于 bilibili <a href="https://space.bilibili.com/4168597">ZipZipPipe</a></sub>
</p>

## 功能特性

### 模型规则

- **有序规则列表** — 可新增、删除、拖动排序并命名规则；每条规则用自己的匹配串参与匹配，先命中者生效，规则 1 兼任兜底。
- **实时状态提示** — 「模型背景」页顶部会显示当前状态，例如「当前模型 deepseek-flash → 命中 · 规则 1」，方便当场验证规则写对没有；检测不到当前模型时会给出提示。
- **外观随规则走** — 壁纸、主题色、布局模式、取景、透明度与模糊度都是每条规则自己的属性；除「界面」页外没有任何全局外观项。
- **导入 / 导出** — 一键把**每一条规则连同它的图片**导出为 `dsh-background-by-model-theme.json`（版本 3，图片以 base64 内联），可随时导入还原。
- **文件持久化** — 所有设置与图片保存到文件系统 `~/.dsh/.dsh-background-by-model-data/`，不依赖 `localStorage`。
- **自动迁移** — 旧版单壁纸配置在首次读取时自动升级，详见 [CHANGELOG.zh.md 的 v0.3.0 条目](./CHANGELOG.zh.md#v030)。
- **中英双语** — 完整的中英文界面，自动跟随语言设置。
- **主题守护** — 宿主重置主题后自动重新激活自定义主题。

### 每条规则自带的外观

- **背景图片** — 上传任意图片作为该规则的壁纸，每条规则一张独立图片文件。
- **主题色** — HSL 色轮 + 数值输入 + 灵感色板，支持「从本图提取」与吸管「从图片取色」；不设主题色时跟随系统主题。实时生成整套 CSS 设计令牌。跟随系统主题时，界面配色交还宿主，而壁纸与「界面」页的透明度、模糊照旧生效——表面颜色是从宿主自己的令牌读出来后套上你的透明度的，所以壁纸不会被一块不透明底板盖住。
- **布局模式** — 适应 / 填充 / 拉伸 / 平铺 / 居中。
- **取景** — 在视口比例的编辑器中拖动平移、滚轮缩放；**仅「适应」模式下可编辑**，提交的构图在窗口缩放、跨屏移动后保持一致。
- **背景透明度** — `0–100%`，作用于该规则的壁纸层。
- **背景模糊** — `0–60 px`，作用于壁纸层。

### 全局设置（「界面」页）

- **分部位界面透明度** — 主背景、左侧栏、右侧栏、卡片面板（含对话框周围的选项框/菜单）、输入框与控件（发送框、Cordis 插件面板）、设置面板与对话文本框各自独立滑块。与主题色无关：某条规则没有主题色时这些滑块同样生效。
- **分部位界面模糊度** — 每个界面部位可独立调整毛玻璃 `backdrop-filter` 模糊（`0–60 px`），并通过宿主的稳定选择器为发送框与 Cordis 面板提供真实背景模糊。
- **对话与轨迹页** — 消息列表自动包裹为半透明卡片，轨迹页可整页调节透明度与模糊，让壁纸从内容后方透出来。
- **右侧栏** — 点开文件后从右侧滑出的那一栏有了自己的卡片：透明度默认跟随「主背景」（拖动后本卡片接管），模糊则在主背景模糊之上再叠加；关闭时不占位置、无副作用。

## 设置界面

设置的 **「主题」** 分类下现在有三个选项卡：

| 选项卡 | 作用范围 | 内容 |
| --- | --- | --- |
| **界面** | 全局，所有模型共用 | 主背景、左侧栏、右侧栏、卡片面板、输入框与控件、设置面板、对话文本框、轨迹页的透明度与模糊度 |
| **模型背景** | 每条规则 | 有序规则列表、顶部实时状态，以及每条规则的壁纸、主题色、布局模式、取景、透明度与模糊度 |
| **配置** | — | 导入 / 导出整套规则（`dsh-background-by-model-theme.json`） |

原先的 **「色彩」** 选项卡已删除——主题色改为每条规则自己的属性；原 **「背景」** 选项卡已改造成 **「模型背景」**。

## 存储位置

数据目录：`~/.dsh/.dsh-background-by-model-data/`（Windows：`C:\Users\<你>\.dsh\.dsh-background-by-model-data\`）

| 文件 | 内容 |
| --- | --- |
| `theme-config.json` | 规则列表 + 全局「界面」设置 |
| `modelbg-<slot>` | 每条规则的图片，保存为原始字节，无扩展名 |

## 安装

### 方式一：npm 安装（推荐）

```sh
dsh plugin --profile web add dsh-background-by-model
# 或者直接从仓库安装：
dsh plugin --profile web add github:HarmlessFunny/dsh-background-by-model
```

装完需要重启 `dsh web`。

插件会出现在设置面板的 **“主题”** 分类中。

### 方式二：npx（无需全局安装）

```sh
npx @deepseek-ai/dsh plugin --profile web add github:HarmlessFunny/dsh-background-by-model
npx @deepseek-ai/dsh web
```

### 方式三：本地构建（开发）

`lib/` 目录已提交，安装后无需构建。修改 `src/` 后重新构建：

```sh
git clone https://github.com/HarmlessFunny/dsh-background-by-model.git
cd dsh-background-by-model
pnpm install
pnpm run bundle      # 产物在 lib/
pnpm run typecheck
```

本地开发挂载方式：在 profile 的 `package.json` 里加 `link:` 依赖并把它加进 `dsh.profile.bundles`：

```jsonc
{
  "dependencies": {
    "dsh-background-by-model": "link:E:/DeepSeek/dsh-background-by-model"
  },
  "dsh": {
    "profile": {
      "bundles": ["dsh-background-by-model"]
    }
  }
}
```

改完 `src/` 必须重新执行 `pnpm run bundle` 才会生效——挂载的 profile 加载的是 `lib/`。

`pnpm test` 会构建并做类型检查（`tsdown && tsc -p tsconfig.json`）。

## 常见问题

**所有模型看起来都一样，为什么？**
多半是第 1 条规则的匹配串是空的，它成了纯兜底、把整个列表兜住了。给规则 1 填一个匹配串，或把更具体的规则加到兜底规则**上面**。

**`GLM-Flash` 命中了不是我想用的规则。**
匹配是先命中者胜，而不是最精确者胜。把更具体的规则往上拖，或调整顺序让你想要的规则排在前面。

**图片存在哪？**
在 `~/.dsh/.dsh-background-by-model-data/`：每条规则一个 `modelbg-<slot>` 文件，外加 `theme-config.json`。

**能分享整套配置吗？**
可以，在 **「配置」** 页导出即可；导出的 JSON 会把每条规则的图片内联进去。

**支持视频或生成式背景吗？**
不支持。两者都在 0.3.0 中移除，每条规则使用一张静态图片。

**把主题色切回「系统主题」后，界面和设置弹窗为什么不是一套配色？**
这是已经修掉的旧行为：清空主题色时插件只撤掉了 `body` 上那套令牌，设置弹窗里那三个**没有宿主回退**的重定向（`--dsw-alias-bg-layer-*` → 插件私有变量）以及轨迹页、三栏的内联背景都还留着上一次的颜色，于是出现「深色界面 + 浅色弹窗、白底白字」。现在这些表面统一由一个调色板来源驱动：有主题色时用规则自己的令牌，没有时**读取宿主当前令牌**再套上你的透明度重发，切换时一并交还宿主。

**切回「系统主题」后一开始还是浅色，拖一下滑块才变深，为什么？**
同一个洞的另一半：插件在持有主题色时会**强改** `body[data-ds-dark-theme]`（深色调色板写标记、浅色调色板直接删掉），而宿主只在**主题快照变化时**才重写这个标记（它不监听属性）。于是浅色皮肤留下的「标记被删」会一直生效，插件在切回系统主题那一刻读到的就是宿主的浅色调色板，并且之后没有任何事件再去重读——直到你碰了某个滑块。现在：切换时同步交还标记（宿主深色就写成宿主的布尔形式），并把宿主解析出的配色方案（`ctx.theme` 的 `active.colorScheme`，过期则回退到 `html[data-ds-theme-source]` + `prefers-color-scheme`）推给渲染层；每秒的守护定时器在「无主题色」状态下也会重读一次宿主调色板，变了就重画。

**为什么「自定义颜色」点下去就有颜色了？**
因为按下它就等于离开「跟随系统主题」，必须给出一个起始色。它先跑一次「从本图提取」（和「从本图提取」按钮同一条链路），取不到鲜明颜色时才退回默认色，所以不会再出现「点一下就从浅色跳成一块跟壁纸无关的深蓝」。

## 近期优化

> 这里只列最近两个版本；更早的版本（v0.4.5 及以前）见 [CHANGELOG.zh.md](./CHANGELOG.zh.md)。

### v0.5.3

- **一次只用一个调色板：清空主题色不再留下上一次的皮肤** — 设置弹窗里那三段重定向（`--dsw-alias-bg-layer-*` → 插件私有变量）**没有宿主回退**，轨迹页与三栏的内联背景同理，而它们只在 teardown 时才清理。于是把主题色切回「系统主题」后会留下「深色界面 + 浅色弹窗、白底白字」。现在这些表面由一个调色板来源统一驱动：有主题色时用规则自己的令牌，没有时**读取宿主自己的令牌**再套上你的透明度，切换时一并交还；无回退的重定向用 `html[data-dab-themed]` 门控，只有变量确实写了才生效。
- **无主题色也保住壁纸与「界面」页的滑块** — 以前清空主题色会撤掉整套令牌，宿主的实心 `--dsw-alias-bg-base` 就把壁纸整块盖住，主背景 / 左侧栏 / 卡片 / 输入框 / 设置面板 / 轨迹页 / 右侧栏的透明度与模糊也全部失效。现在表面是宿主的颜色乘你的透明度，壁纸继续从背后透出来。
- **跟随系统主题会把宿主的深色标记交还回去** — 插件持有主题色时会强改 `body[data-ds-dark-theme]`（浅色皮肤直接删掉），而宿主只在**主题快照变化时**才重写它、并不监听这个属性。被删掉的标记因此会一直生效：切回系统主题时读到的是宿主的浅色调色板，界面要等你碰一下滑块才变深。现在切换时按宿主自己解析出的方案同步交还标记（`ctx.theme` 的 `active.colorScheme`，取不到则回退 `html[data-ds-theme-source]` + `prefers-color-scheme`），并且每秒的守护定时器在无主题色状态下也会重读一次宿主调色板；「交还」这一侧不再走 60ms 防抖，避免读到插件自己那套即将下线的皮肤。
- **无颜色状态下的按钮不再做相反的事** — 那个按钮的文案是「系统主题」，动作却是塞一个硬编码的深蓝 `#1D3463`（同一条文案在有颜色时表示「清空 → 跟随系统主题」）。现在它叫 **「自定义颜色」**，并且先跑一次「从本图提取」，取不到鲜明颜色才退回种子色。
- **令牌指纹只在样式表写入成功后记账** — 写入抛错时不再把指纹提前记下，避免界面卡在旧调色板上直到另一个 key 变化。
- **`package.json` 描述里的乱码破折号修正**（它直接显示在 npm 页面上）。

### v0.5.0

- **宿主自检整块删掉了。** 连同它的一切：设置页的 **「宿主自检」** 选项卡、约定表（`src/host-contracts.ts`）、浏览器探测（`src/client/judge.ts`）、安装目录扫描（`src/host-scan.ts`）、`hostCheck` RPC、`pnpm scan` 脚本以及它的测试。插件只留下它真正做的事：规则、壁纸、界面透明度与模糊。
- **`0.5.1` 与 `0.5.2` 的内容与 `0.5.0` 完全相同。** 这两个号是发布端的噪音：第一次 `npm publish` 返回的是 HTTP 202，版本要几分钟后才出现在 registry 上，被误当成失败又发了两遍。三个版本都在线上、代码逐字节一致（12 个文件），当时 `latest` 指向 `0.5.2`。装哪个都行；想按标签点名就固定 `0.5.2`。

## Star History

[![Star History Chart](https://api.star-history.com/chart?repos=HarmlessFunny/dsh-background-by-model&type=timeline&legend=bottom-right)](https://www.star-history.com/?repos=HarmlessFunny%2Fdsh-background-by-model&type=timeline&legend=bottom-right)

## 许可

MIT
