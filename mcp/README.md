# incomeos-mcp

MCP server for [IncomeOS](https://github.com/Perufitlife/incomeos). Ask your AI
agent how much you're making across **all** your income streams.

> *"How much did I make this month?"* · *"Show my income for 2026-05"* ·
> *"Log $40 of Amazon affiliate income for last month"*

## Setup

Add to your MCP client (Claude Desktop, Cursor, etc.):

```json
{
  "mcpServers": {
    "incomeos": {
      "command": "npx",
      "args": ["-y", "incomeos-mcp"],
      "env": {
        "INCOMEOS_URL": "https://your-incomeos.vercel.app",
        "INCOMEOS_TOKEN": "your-DASHBOARD_TOKEN"
      }
    }
  }
}
```

## Tools

| Tool | What it does |
| --- | --- |
| `get_income_summary` | Avg/day, this month, this year, all-time + top sources + goals |
| `get_sources` | Every source with month / year / all-time amounts |
| `get_month` | Per-source breakdown for a given `YYYY-MM` |
| `log_monthly_income` | Set/overwrite a source's total for a month (0 clears it) |

Your data never leaves your own IncomeOS instance — the MCP just calls its API
with your token. MIT licensed.
