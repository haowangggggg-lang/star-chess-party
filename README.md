# 星棋派对

孩子和伙伴一起商量、执白对弈的完整国际象棋游戏。对手是本机运行的 Stockfish 19 Lite；无需账号、服务器推理或 API 密钥，没有广告或分析追踪。

## 玩法与画面

- 默认从标准 32 子初始棋局开始。点击棋子，再点合法落点；支持王车易位、吃过路兵、四种升变、将死与和棋。三次重复和五十步条件在本游戏中自动结束为和棋。
- 三个短残局是后车合力、双车收网、小兵升变，均按真实国际象棋规则判断，接受所有合法将死解法。不是走法寻星游戏。
- 伙伴可以指出建议，由执白的玩家决定是否采用。可调电脑难度、悔回上一个白方回合、切换视角、暂停及关闭声音。“轻松”是可调的产品设置，不代表经过标定的儿童 Elo。
- 采用团团重新选定的第二种「星舰双人指挥室」视觉方向：桌面与手机独立星空舷窗场景、悬浮棋桌和圆球机器人小轨道。原稿与素材清单分别在 `design/approved-starship.png`、`design/starship-assets.json`。独立 WebP 背景与角色素材，Three.js 真正渲染棋盘和六类 GLB 棋子；DOM 棋盘命中层提供键盘与触控操作。没有把整张设计图作为棋盘，也没有用图标代替 3D 棋子。

## 本地运行

需要 Node.js 22 和 npm。锁定依赖在 `package-lock.json`。

```sh
npm ci
npm test
npm run dev
```

开发入口由 Vite 输出；常驻预览占用 8797 时可用 `npm run dev -- --port 8798 --strictPort`，在独立端口验收以保留日常棋局。需要验证正式静态包时：

```sh
npm run build
npm run preview
```

`build/` 是发布目录；旧版可从 Git 历史取回。`npm run build` 会生成资源版本和 `sw.js`，同时把许可证与对应源码放入 `build/legal/`。可以把整个 `build/` 放到其他获授权的静态服务器；不要用 `file://` 打开。WASM 应以 `application/wasm` 返回。

macOS 本机常驻预览使用同一个入口 `http://127.0.0.1:8797/`：

```sh
npm run build
python3 scripts/preview-service.py install
python3 scripts/preview-service.py status
```

它通过用户 LaunchAgent 独立运行 `vite preview`，读取 `build/`，登录时启动、进程退出后自动恢复；仅监听本机。改源码后需重新构建。需要用同端口开发或关闭常驻预览时，先运行 `python3 scripts/preview-service.py stop`。日志位于 `logs/`。

## 存档与离线缓存

棋局自动保存在当前浏览器的 IndexedDB，并以 localStorage 备份；保存完整走棋历史，恢复时重新验证每一步及最终局面，因此三次重复判断不会因刷新丢失。设置里的“带走棋局 / 打开棋局”用于导出和导入 JSON。存档不跨设备自动同步；浏览器清理、隐私模式或存储配额都可能使本机存档失效，重要棋局请导出。

正式构建在 HTTPS 或 localhost 上注册 Service Worker。第一次联网打开并成功安装缓存后，再次打开可离线使用。安装按 SHA-256 核对本次构建的 HTML、CSS、JS、WASM、GLB、WebP 和 SVG；原始 PNG、素材记录、许可证及源码包不进入游戏缓存。代码不会缓存外部请求，也不会清理别的站点或路径的缓存。

新版在后台准备完整缓存后等待：**关闭这个游戏的所有标签页，再打开，才会启用新版本**。不强制接管进行中的棋局，不把旧 HTML 与新脚本、WASM 混在一起。离线导航可回到首页；法务文件与源码下载仍需联网。若浏览器回收缓存、设备空间不足或首次下载未完成，不能保证离线可用。清除网站数据会同时删除存档与缓存。

Stockfish 在独立 Worker 中运行，离开或取消搜索时会终止旧 Worker。Lite 的下载体积小，初始 WASM 线性内存仍约为 128 MiB；真实手机的内存、帧率和难度体验需要持续验证。

## 自有 GitHub Pages 部署

使用团队自己的 [GitHub 仓库](https://github.com/haowangggggg-lang/star-chess-party)。仓库 Settings → Pages 中将 Source 设为 GitHub Actions。`.github/workflows/pages.yml` 在 `main` 更新或手动触发时依次运行 `npm ci`、`npm test`、`npm run build`，只上传 `build/`，再发布 GitHub Pages。

Vite 的相对资源基址支持仓库子路径。自托管需保留完整目录结构，并让 `sw.js` 可以从游戏根目录读取；不要把丢失的 JS/WASM 请求改写成 HTML。发布后仍需实测实际网址的棋盘、电脑走棋、存档恢复和离线打开。

禁止部署到 OpenAI Sites、ChatGPT Sites 或 `chatgpt.site`；没有相关平台依赖或托管文件。

## 源代码与许可

本项目自己的程序代码按 GNU GPL 第 3 版发布，完整条款见 [LICENSE](LICENSE)。发布包的 `legal/index.html` 汇集所有下载入口，构建后本地路径是 `build/legal/index.html`。

- `build/legal/star-chess-party-source.tar.gz` 是该次构建随附的应用源码包，包含 `src/`、`scripts/`、`tests/`、`public/`、`licenses/`、GitHub 工作流、页面源文件、依赖锁及构建配置。解压后可用上述 npm 命令构建。
- `licenses/stockfish/` 保留 Stockfish.js 的确切上游源码归档、NNUE 输入、作者、GPL、构建说明和校验值；正式发布时原样复制到 `build/legal/stockfish/`，可直接下载。对应提交为 `54fde71d90c7c403964f6cacef48f7bbec495df1`，网络为 `nn-61e7af4bb97d.nnue`。
- Stockfish 上游源码与运行文件没有本地修改。来源和校验值已经核对，但没有声称完成逐字节可复现重编译；具体工具链说明见 [Stockfish README](licenses/stockfish/README.md)。
- Three.js、chess.js 与 Phosphor 图标分别保留 MIT、BSD-2-Clause 与 MIT 许可，见 `licenses/`。本项目制作的 3D 模型生成脚本在 `scripts/build-models.mjs`，美术原图与生成记录保留在 `public/art/`；第三方声明不被根 GPL 文本替代。
