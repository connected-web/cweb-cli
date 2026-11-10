export const loginSuccessPage = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Connected Web Login Complete</title>
    <style>
      :root {
        --cw-blue-900: #0b2f6b;
        --cw-blue-700: #1f5fc4;
        --cw-blue-500: #2f80ed;
        --cw-blue-100: #eaf2ff;
        --cw-slate-900: #102036;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        display: flex;
        justify-content: center;
        align-items: flex-start;
        padding-top: clamp(48px, 10vh, 110px);
        font-family: "Segoe UI", "Inter", Arial, sans-serif;
        color: var(--cw-slate-900);
        background:
          radial-gradient(1200px 500px at -10% -20%, #8fc1ff55 0%, transparent 60%),
          radial-gradient(1000px 450px at 110% 120%, #2f80ed33 0%, transparent 65%),
          linear-gradient(165deg, #f7fbff 0%, #edf4ff 100%);
      }
      .card {
        width: min(92vw, 560px);
        background: #fff;
        border: 1px solid #d7e5ff;
        border-radius: 16px;
        padding: 28px 26px;
        box-shadow: 0 14px 40px #0f3d8420;
      }
      .brand {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 18px;
      }
      .mark {
        width: 36px;
        height: 36px;
        border-radius: 10px;
        display: grid;
        place-items: center;
        font-weight: 700;
        color: #fff;
        background: linear-gradient(135deg, var(--cw-blue-700), var(--cw-blue-500));
        box-shadow: 0 6px 16px #2f80ed55;
      }
      h1 {
        margin: 0;
        font-size: 1.28rem;
        line-height: 1.2;
        color: var(--cw-blue-900);
      }
      p {
        margin: 0;
        font-size: 1rem;
        line-height: 1.55;
      }
      .status {
        margin-top: 16px;
        padding: 12px 14px;
        border-radius: 10px;
        color: var(--cw-blue-900);
        background: var(--cw-blue-100);
        border: 1px solid #c7dcff;
      }
    </style>
  </head>
  <body>
    <main class="card">
      <div class="brand">
        <div class="mark">CW</div>
        <h1>Connected Web login complete</h1>
      </div>
      <p>Your authentication was successful. You can return to your terminal.</p>
      <p class="status">It is now safe to close this browser tab.</p>
    </main>
  </body>
</html>`
