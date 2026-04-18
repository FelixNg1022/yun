# 运

**An iMessage oracle that does the real Chinese numerology math, then interprets it in your language — and tracks whether it was right.**

Text it a question. It casts a hexagram from the exact moment your message arrived (梅花易数), runs it against your 八字 birth chart, interprets the result — and 5 days later, checks back to ask whether it played out.

> _[demo.gif — 60s screen recording]_

## Why this, why iMessage

I practice 易经 divination weekly. It's already a blue-bubble-native ritual for me: text a friend, ask them to cast, wait. Building it into iMessage collapses the loop to one bubble.

The three example prompts in Photon's brief (briefing bot, restaurant picker, accountability agent) are all utility-as-chore. 运 is a _ritual_. That's the part agents are weirdly good at: they're always there, they don't get sick of the question, and they don't judge you for asking the same thing three different ways.

## The one thing that's different: the math is real

Most AI-divination apps are LLM vibes with hexagram-shaped decoration. 运 has a deterministic kernel:

- **梅花易数** — hexagrams computed from the lunar timestamp of your message (year-branch + month + day + hour-branch → upper/lower trigrams + changing line, traditional 先天 1-8 mapping)
- **小六壬** — three-palace cast (大安 / 留连 / 速喜 / 赤口 / 小吉 / 空亡) from lunar month / day / hour-branch
- **八字** — your four pillars, computed once at onboarding via `lunar-typescript`

The LLM _never picks_ the hexagram. It only interprets the structured kernel output. You see the raw cast in every reply:

```text
🎴 梅花易数 · 2026-04-18 15:37 PDT
lunar: 丙午年 月3 日2 申时
upper: (7+3+2) mod 8 = 4 → 震
lower: (+9) mod 8 = 5 → 巽
line:  21 mod 6 = 3 → line 3 changing
→ 恆 (32), changing to 解 (40)
```

This also means it's falsifiable. After each reading, 运 schedules a check-in; reply `yes` / `no` / `mixed` (in English or Chinese) when it asks. `/stats` computes your running hit rate.

## Stack

- **Photon** `@photon-ai/imessage-kit` (the whole reason this submission exists)
- **Bun** + TypeScript — zero-config, fast startup, native `.env`, built-in SQLite
- **Claude Sonnet 4** via `@anthropic-ai/sdk` for interpretation
- **bun:sqlite** for `users` / `readings` / `outcomes`
- **lunar-typescript** for Gregorian → lunar → 干支 conversion

No Express. No Next.js. No Docker. No dashboard. Single process on a Mac.

## Architecture

```text
┌────────────────────────────────────────────────────────────────┐
│                         iMessage                               │
└───────────────┬──────────────────────────────▲─────────────────┘
                │ inbound                      │ outbound
                ▼                              │
       ┌──────────────────────────────────────────────┐
       │     Photon imessage-kit (watcher + sender)   │
       └──────────────────┬───────────────────────────┘
                          ▼
       ┌──────────────────────────────────────────────┐
       │                   Router                     │
       │   (command?  outcome reply?  query?)         │
       └──┬────────────────┬──────────────┬───────────┘
          ▼                ▼              ▼
     ┌─────────┐    ┌─────────────┐  ┌────────────────┐
     │Commands │    │  Outcome    │  │ Query pipeline │
     │/help    │    │  parser     │  │                │
     │/stats   │    │  (yes/no/   │  │                │
     │/history │    │   mixed)    │  │                │
     │/methods │    └─────────────┘  │                │
     │/lang    │                     │                │
     │/setup   │                     │                │
     └─────────┘                     └──┬─────────────┘
                                        ▼
                    ┌───────────────────────────────────┐
                    │   DETERMINISTIC KERNEL            │
                    │   ┌─────────────────────────────┐ │
                    │   │ meihua  (time-cast)         │ │
                    │   │ liuren  (6-palace)          │ │
                    │   │ bazi    (user context)      │ │
                    │   │ hexagrams.json (64, 周易)   │ │
                    │   └─────────────────────────────┘ │
                    └───────────────┬───────────────────┘
                                    ▼
                    ┌───────────────────────────────────┐
                    │      LLM Interpreter              │
                    │      claude-sonnet-4 (Anthropic)  │
                    │      kernel + 八字 + past readings │
                    └───────────────┬───────────────────┘
                                    ▼
                    ┌───────────────────────────────────┐
                    │      SQLite (bun:sqlite)          │
                    │      users / readings / outcomes  │
                    └───────────────┬───────────────────┘
                                    ▼
                               send reply

    ┌──────────────────────────────────────────┐
    │ Follow-up Scheduler (independent loop)   │
    │ every 60s: readings where follow_up_at   │
    │ <= now and followed_up = 0 → send DM     │
    └──────────────────────────────────────────┘
```

## Run it

```bash
git clone https://github.com/FelixNg1022/yun.git
cd yun
bun install
cp .env.example .env    # fill in ANTHROPIC_API_KEY, OWNER_PHONE, OWNER_BIRTH
# Grant Terminal (or your IDE's terminal) Full Disk Access in
# System Settings → Privacy & Security → Full Disk Access
# Then open Messages.app and keep it running in the background.
bun start
```

`.env` keys:

| Key | Required | Notes |
|-----|----------|-------|
| `ANTHROPIC_API_KEY` | yes | Workspace with credits |
| `OWNER_PHONE` | yes | E.164; CSV if you self-test from multiple devices |
| `OWNER_BIRTH` | yes | ISO 8601 with TZ offset, e.g. `2002-10-22T18:00:00+08:00` |
| `TRUSTED_PHONES` | no | Extra allowlist of senders |
| `FOLLOW_UP_DAYS` | no | default `5` |
| `SCHEDULER_INTERVAL_SECONDS` | no | default `60` |

## Commands

Any text that doesn't start with `/` is treated as a question. Default method is 梅花易数; include `小六壬` or `liuren` in the message to switch.

| Command | Effect |
|---------|--------|
| `/help` | list commands (in your language) |
| `/history` | last 5 readings with hexagram shorthand |
| `/stats` | total count + hit rate (yes/no/mixed) |
| `/methods` | one-line intro to each method |
| `/lang en\|zh` | switch language |
| `/setup <ISO>` | recompute your 八字 from a new birth time |

## Tests

```bash
bun test
```

78 tests, deterministic: trigram math, hexagram integrity (all 64 King Wen, binaries unique and composed correctly from trigrams), meihua math invariants (including the canonical 邵雍 老人 example → 澤火革 #49, 初九 changing), 八字 computation for a known birth, liuren palace math for known lunar dates, DB round-trips, outcome parsing (en + zh), scheduler tick behaviour.

## What's next

- Multi-user via group chats / opt-in via a passphrase
- Weekly 八字 forecast (unsolicited, opt-in)
- Calendar integration: cast before major meetings automatically
- Manual coin-toss I Ching (`throw coins 111010`) for when you want to cast off-timestamp

## Note

Built in one day for Photon Residency 2. The SDK is excellent. — Felix

MIT License.
