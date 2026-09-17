# 星棋派对 · 石台与棋盘贴合修复

final result: passed

验收日期：2026-09-17。本次通过仅指「棋盘/石台错位、切视角漂移、响应式变形及关联遮挡」的修复，不代表整套页面与原稿逐像素一致。上一报告把手填棋盘四角的自洽误认成与背景贴合，其“已消除两套透视”结论撤回，以本报告为准。

## 问题与修复

- P1：旧棋盘使用三套手填四角，独立于背景石台；桌面约向左偏20个源图像素，手机右后角越出台面。现在以 `design/stone-calibration.json` 的实际石台四角为唯一基准，在同一个8.8×8.8世界平面中居中嵌入8×8棋格。
- P1：旧相机只保留一个中心线，并用 `.997` 截断高度；窄长手机棋盘下沿偏短。现在用完整四角单应变换，保留上下中心差异，重建裁剪深度和投影逆矩阵。
- P1：切换俯视时旧代码独立改变棋盘四角，背景固定。现在两个视角共享同一底面，只改变棋子的观察仰角（48°/88°），并保持按石台宽比求出的相机距离。背景仍是已批准的插画资产；没有把整座岛重建成可旋转3D模型。
- P2：tablet旧底图前沿测量混入厚边，圆角内缩造成前沿偏窄；独立原像素复核更新为 TL(151,444)、TR(874,444)、BR(994,931)、BL(46,931)，人工测量不确定度约±5源图像素。
- P1：第一次修正截图中，企鹅挡住手机a8/b8棋头。最终将企鹅与兔子放到棋盘后方，画布未命中棋子时把背景按钮点击转交给原按钮；格子和棋子命中仍优先。没有裁剪棋子或移动玩法坐标。

## 源与截图证据

视觉真值：`design/approved-cloud-party.png`（1586×992）；桌面裁框 `[23,38,1112,639]`、手机裁框 `[1158,38,408,927]`。实际石台基准来自三张已存在背景原图，v2值见 `design/environment-v2.json`，tablet值独立按顶面直边延长线重测。未改原图、模型或字体。

所有最终页面截图来自真实Chrome设备尺寸工具；PNG为2×像素密度，比较图下采样到CSS像素。棋局使用既有合法存档（Nf3、…e6），原稿棋子布局为插画局面，未伪造规则以复制它。

| CSS视口 | 常规 / 俯视 PNG | 同尺寸并排 |
| --- | --- | --- |
| 1112×639 桌面 | `qa/stone-desktop-final.png` / `qa/stone-desktop-top-final.png` | `qa/stone-desktop-views.png` |
| 408×927 手机 | `qa/stone-phone-final.png` / `qa/stone-phone-top-final.png` | `qa/stone-phone-views.png` |
| 768×1024 平板 | `qa/stone-tablet-final.png` / `qa/stone-tablet-top-final.png` | `qa/stone-tablet-views.png` |
| 375×667 短屏 | `qa/stone-short-final.png` / `qa/stone-short-top-final.png` | `qa/stone-short-views.png` |
| 320×844 窄屏 | `qa/stone-narrow-final.png` / `qa/stone-narrow-top-final.png` | `qa/stone-narrow-views.png` |

- 原稿与实页：`qa/stone-desktop-reference.png`、`qa/stone-phone-reference.png`。
- 棋面四边放大：`qa/stone-desktop-edge-detail.png`、`qa/stone-phone-edge-detail.png`。
- 首轮发现与返修：`qa/stone-phone-v1.png` 可见a8/b8被挡；`qa/stone-phone-v2.png` 和最终截图已消除。
- 独立只读复核上述五组双视角截图：本缺陷范围通过；四边同透视、左右边距合理、两个视角没有明显位置漂移、后排棋头完整。

## 五个视觉验收面

- 字体：沿用已发布字体与字号；坐标现在随同一投影落在石台留边上，未被裁切。
- 布局：棋面完整位于石台顶面内，前沿未越到厚边或草地；普通、窄、短屏和两种观察视角都复核。
- 颜色：棋子/棋格材质、背景调色未改变；当前材质与原稿的差别不在本次修复范围。
- 图像：复用原有已批准方向的环境和角色文件；不生成替代插画、不嵌入设计稿；企鹅后置后不遮挡棋头。
- 内容：所有用户文案、玩法入口和结算内容未改变。标题、城堡、模型细节等与原稿仍有差异，不将此次通过扩大成全稿复刻验收。

## 操作与工程验证

- Chrome手机视口物理点击企鹅脸部，打开原「一起想想」弹窗；关闭后点击f3马的头部（屏幕上覆盖f4位置），正确选中f3并显示合法落点。
- 实际落子 Nf3-g5，电脑 Qd8xg5 正常回应；点击悔棋后恢复Nf3与黑后d8，刷新重新读到同一棋局。
- 两种观察视角均可切换，底面稳定；缩放、手机/平板/桌面换图时按浏览器实际 `currentSrc` 与计算后的 `object-fit/object-position` 标定，图片load后重新计算。
- `src/main.mjs`、`src/game.mjs`、`src/computer.mjs`、`src/storage.mjs`、`src/sound.mjs`、原始背景、GLB均与ef8432e一致。
- 29项测试通过，包括原有18项规则/引擎测试、四角中线和窄屏回归、64格射线、深度次序，以及真实六类GLB在13视口×双视角×64格及跳跃包络的屏内检查。
- 生产构建通过，42个运行文件约5.43MiB；Three.js单包大小提示仍存在。标定JSON纳入可下载源码包，保留独立构建能力。
- 浏览器控制台可见MetaMask扩展contentscript告警，未见本游戏的新运行异常。实际iPhone/iPad设备GPU与触摸尚未测；设备尺寸截图不等同真机验收。

## 发布

目标仍为用户自己的GitHub Pages：`https://haowangggggg-lang.github.io/star-chess-party/`。正式版本与线上回读将在发布后补充。
