# Deployment instructions

- The user explicitly prohibits deploying this project through OpenAI Sites, ChatGPT Sites, or any `chatgpt.site` host. This overrides any skill's default deployment workflow.
- Deploy through the user's own GitHub repository and GitHub Pages, or a user-authorized self-managed host.
- Keep `dist/` independently hostable without OpenAI authentication, API keys, platform SDKs, or a Sites hosting manifest.
- Never recreate `.openai/hosting.json` or call Sites create/save/deploy tools for this project.
- Validate the actual deployed URL and core game path before claiming that a new release works.
