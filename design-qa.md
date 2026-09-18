# 星棋派对 · 第二种星舰方向

final result: visual QA passed; production verification pending

验收日期：2026-09-18。团团重新选择的是原来按顺序展示的第二种「星舰双人指挥室」。该原稿同时含桌面和手机图。本次改画面，不改变国际象棋规则、电脑难度算法、残局、存档格式或已有合作流程；不部署到 ChatGPT Sites。

## 原稿与资产

原稿：`design/approved-starship.png`，1536×1024；桌面区域 `[21,46,1075,700]`，手机区域 `[1123,47,396,876]`。独立环境、圆球机器人、小女孩虚构头像、标准图标在前端编辑前完成；资产尺寸、焦点、来源与哈希见 `design/starship-assets.json` 和 `design/orbit-character-assets.json`。环境不含棋格、棋子或界面，页面未嵌入完整设计稿。

背景原图上的空白棋台四角继续作为真实 Three.js 棋面的投影基准；手机独立构图，平板适配同一竖屏环境。沿用六类 GLB 模型和命中方式。夜间材质采用奶油白/深紫棋子、紫灰棋格、暖舱灯与蓝色选中提示。修正棋子材质没有显式 envMap、导致独立反光强度被 scene 参数覆盖的问题。

## 实际截图与修正

真实 Codex 浏览器截图，独立开发端口 8798，未覆盖常用预览 8797 或线上浏览器的棋局。

| CSS 视口 / 状态 | 本地截图 |
| --- | --- |
| 1075×700 桌面 | `qa/starship/desktop-final.png` |
| 396×876 手机选中态 / 俯视 | `qa/starship/phone-final.png` / `qa/starship/phone-top.png` |
| 768×1024 平板 | `qa/starship/tablet-final.png` |
| 375×667 短屏 | `qa/starship/short-final.png` |
| 320×844 窄屏 | `qa/starship/narrow-final.png` |
| 伙伴建议 | `qa/starship/phone-hint-dialog.png` / `qa/starship/phone-suggestion-final.png` |
| 窄屏设置、升变、胜利 | `qa/starship/narrow-settings.png` / `qa/starship/narrow-promotion.png` / `qa/starship/narrow-result.png` |

- 已修：手机视角/设置按钮重叠、对手名字折行、合作说明尾部截断。
- 已修：状态信息恢复自动换行，长建议说明完整显示。
- 独立复核发现建议条曾遮住 a–h 坐标；已移到桌面左侧、手机顶部，手机视角/设置并排置于棋桌下。最终桌面、手机、短屏建议截图复核无新增 P1/P2。
- 已修：手机背景大于场景后，关闭弹窗的焦点恢复导致 hidden 容器向上滚动 74px。场景改为 overflow:clip，同流程回读 scrollTop=0。
- 画面对照：桌面和手机保留深蓝舷窗、悬浮棋桌、奶油/紫色棋面、圆球机器人和蓝色控制区；棋面四角随环境缩放定位。手机和桌面界面分别排版，角色不占可操作格子。
- 差异边界：沿用真实六类棋子模型，头部造型、远近体量及陶瓷光影与 AI 原稿仍有差异；原稿局面并非严格标准棋局。背景道具没有原稿杯子/书本上的装饰文字；品牌和合作符号使用标准矢量图标。未将此次方向切换宣称为逐像素复刻。

## 功能与工程检查

- 实际点击 e2-e4，电脑回应 e7-e6；重载后同一局面恢复；悔棋退回整轮初始局面。
- 伙伴选 g1-f3 后只显示建议，棋子仍在 g1；团团可拒绝建议。建议弹窗、设置入口和视角切换实际可用。
- 实际开始「小兵的变身」，f7-f8 后选择升变为后，进入合法将死结算；窄屏结算按钮完整可见。
- HTML 55 个 ID 无重复或缺失绑定；main 改动限于角色文案和头像路径；game/computer/storage/sound 未改，现有棋局格式和存储键未改。
- 29 项测试通过，含新背景布局下模型可见性、棋盘四角、命中、视角及原有规则/引擎用例。
- 正式构建通过：40 个离线运行文件，约 4.93 MiB。四张新原始 PNG 和八张无运行引用的旧 WebP 不进入运行目录，源码包保留原始美术。Three.js 单包大小提示仍存在。
- 浏览器截至当前未见游戏 error 日志。视口验收不等同真实 iPhone/iPad GPU、帧率或触摸测试。

## 发布

发布目标仍为自己的 GitHub Pages，正式部署和实际网址验证完成后补录。
