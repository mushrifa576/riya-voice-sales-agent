# Riya: AI voice sales agent (FlowDesk)

Live voice call with Riya, an AI sales agent: captions and transcript, typed replies, call recording, AI summary, automatic sales status, call history. Languages: English, Hindi, Telugu, Malayalam.

Free stack: Google Gemini (AI), browser speech (listening and speaking), Netlify (hosting), GitHub (code).
The Gemini key stays on the server (a Netlify Function), never in the page.

## Folder layout (keep it exactly like this)

```
public/index.html              The whole website
netlify/functions/gemini.mjs   Server function that holds the API key and calls Gemini
netlify.toml                   Tells Netlify where the site and function are
```

## Deploy

1. Get a key at https://aistudio.google.com/apikey. It may start with `AQ.` or `AIza`; both work.
2. Create a GitHub repo and upload everything in this folder, keeping the folders.
3. In Netlify: **Add new site -> Import an existing project -> GitHub**, pick the repo, leave build settings empty, deploy. Do not use Netlify Drop (it does not run functions).
4. In Netlify: **Site configuration -> Environment variables -> Add** `GEMINI_API_KEY` = your key (Functions scope included).
5. **Deploys -> Trigger deploy -> Deploy site** (the key only applies after a new deploy).

## Check it works

Open the site in Chrome, tick the consent box, press **Start call**, allow the microphone.

Server check (Windows Command Prompt, replace the URL):

```
curl -X POST https://your-site.netlify.app/api/gemini -d "{\"ping\":true,\"test\":true}"
```

`"ok":true` and `"status":200` means Gemini accepts your key. Anything else shows Google's exact error.

If something fails, press F12 in the browser: lines starting with `[Riya]` in the Console show the error. Netlify -> Logs -> Functions -> `gemini` shows the server side.

## Notes

- Voice input works best in Chrome and Edge. Typing works everywhere.
- Netlify's free plan uses monthly credits; when they run out, new deploys are blocked until reset.
- Call history is stored in each visitor's own browser.
- Models are tried in order (`CONFIG.MODELS` in `public/index.html`). If Google renames them, put a current Flash model name first.
- On the free tier Google may use conversations to improve its models. Fine for a demo, not for real customer data.
