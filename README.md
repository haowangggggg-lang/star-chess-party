# 星星棋友会

两个伙伴一起玩的国际象棋寻星小游戏。包含三个小岛、接力、撤回、提示与可关闭的音效。

使用标准棋子的走法进行合作探索，不是完整的国际象棋对局。

## 部署

静态网页位于 `dist/`。向 `main` 推送后，由 GitHub Actions 发布到 GitHub Pages。

本项目不使用 OpenAI Sites / ChatGPT Sites 托管，不要求玩家登录 ChatGPT，没有后端、广告、分析追踪或个人信息收集。

## 本地预览

```sh
python3 -m http.server 8080 --directory dist
```

在浏览器打开 `http://localhost:8080`。
